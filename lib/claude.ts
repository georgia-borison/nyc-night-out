import Anthropic from "@anthropic-ai/sdk";
import type {
  BetaContentBlockParam,
  BetaMessageParam,
  BetaTool,
  BetaToolUnion,
} from "@anthropic-ai/sdk/resources/beta/messages/messages";
import type { z } from "zod";
import { SYSTEM_PROMPT } from "./prompt";

const MODEL = "claude-opus-5";
const SUBMIT_TOOL = "submit";
const MAX_TURNS = 4;

// Claude Opus 5 list prices, USD per token, used for the cost readout.
const PRICE = {
  input: 5 / 1e6,
  output: 25 / 1e6,
  cacheWrite: 6.25 / 1e6,
  cacheRead: 0.5 / 1e6,
  webSearch: 10 / 1000,
};

type Usage = {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
  server_tool_use?: { web_search_requests?: number | null } | null;
};

function costOf(u: Usage) {
  return (
    u.input_tokens * PRICE.input +
    u.output_tokens * PRICE.output +
    (u.cache_creation_input_tokens ?? 0) * PRICE.cacheWrite +
    (u.cache_read_input_tokens ?? 0) * PRICE.cacheRead +
    (u.server_tool_use?.web_search_requests ?? 0) * PRICE.webSearch
  );
}

let client: Anthropic | null = null;
function getClient() {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new PlannerError(
      "No Anthropic API key found. Add ANTHROPIC_API_KEY to .env.local and restart the dev server.",
      500,
    );
  }
  // Keys that aren't scoped to a workspace must name one on every request.
  const workspaceId = process.env.ANTHROPIC_WORKSPACE_ID?.trim();
  client ??= new Anthropic({
    defaultHeaders: workspaceId ? { "anthropic-workspace-id": workspaceId } : undefined,
  });
  return client;
}

export class PlannerError extends Error {
  constructor(
    message: string,
    public status = 500,
  ) {
    super(message);
  }
}

/**
 * Ask Claude for structured JSON, optionally letting it search the web first.
 * The answer arrives as the input of a strict "submit" tool, then gets
 * validated with zod. Also returns the approximate cost of the call.
 */
export async function askClaude<T>(opts: {
  prompt: string;
  schema: z.ZodType<T>;
  jsonSchema: Record<string, unknown>;
  submitDescription: string;
  webSearch: boolean;
  maxSearches?: number;
}): Promise<{ data: T; costUsd: number }> {
  const anthropic = getClient();

  const tools: BetaToolUnion[] = [
    {
      name: SUBMIT_TOOL,
      description: opts.submitDescription,
      strict: true,
      input_schema: opts.jsonSchema as BetaTool["input_schema"],
    },
  ];
  if (opts.webSearch) {
    tools.push({
      type: "web_search_20260209",
      name: "web_search",
      max_uses: opts.maxSearches ?? 2,
      user_location: {
        type: "approximate",
        city: "New York",
        region: "New York",
        country: "US",
        timezone: "America/New_York",
      },
    });
  }

  const messages: BetaMessageParam[] = [{ role: "user", content: opts.prompt }];
  let costUsd = 0;
  let searches = 0;

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    let message;
    try {
      message = await anthropic.beta.messages
        .stream({
          model: MODEL,
          max_tokens: 16000,
          thinking: { type: "adaptive" },
          // Low effort keeps thinking short and tool calls few, which is most of the cost.
          output_config: { effort: "low" },
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
          system: SYSTEM_PROMPT,
          tools,
          messages,
        })
        .finalMessage();
    } catch (err) {
      console.error("[claude]", err);
      throw toPlannerError(err);
    }

    costUsd += costOf(message.usage);
    searches += message.usage.server_tool_use?.web_search_requests ?? 0;

    if (message.stop_reason === "refusal") {
      throw new PlannerError("Claude declined this request. Try rewording your vibe description.", 422);
    }

    const submit = message.content.find(
      (b) => b.type === "tool_use" && b.name === SUBMIT_TOOL,
    );
    if (submit && submit.type === "tool_use") {
      if (message.stop_reason === "max_tokens") {
        throw new PlannerError("The response was cut off. Please try again.", 502);
      }
      const parsed = opts.schema.safeParse(submit.input);
      if (parsed.success) {
        console.log(`[claude] ${searches} searches, ~${costUsd.toFixed(3)}`);
        return { data: parsed.data, costUsd };
      }
      throw new PlannerError("Claude returned results in an unexpected shape. Please try again.", 502);
    }

    const assistantTurn: BetaMessageParam = {
      role: "assistant",
      content: message.content as BetaContentBlockParam[],
    };

    if (message.stop_reason === "pause_turn") {
      // A long server-side search turn paused. Send it back so Claude can continue.
      messages.push(assistantTurn);
      continue;
    }

    if (message.stop_reason === "end_turn") {
      // Claude answered in prose instead of calling the tool. Ask it to submit.
      messages.push(assistantTurn, {
        role: "user",
        content: `Please call the ${SUBMIT_TOOL} tool now with your final answer.`,
      });
      continue;
    }

    throw new PlannerError(`Unexpected stop (${message.stop_reason}). Please try again.`, 502);
  }

  throw new PlannerError("Claude took too long to finish. Please try again.", 504);
}

// The human-readable message inside an API error body, e.g. {"error":{"message":"..."}}.
function apiMessage(err: InstanceType<typeof Anthropic.APIError>): string {
  const body = err.error as { error?: { message?: unknown } } | undefined;
  return typeof body?.error?.message === "string" ? body.error.message : "";
}

const OUT_OF_CREDITS =
  "Your Anthropic account is out of credits. Add more at console.anthropic.com (Billing), then hit Try again.";

function toPlannerError(err: unknown): PlannerError {
  if (err instanceof PlannerError) return err;
  // Low credit comes back as a generic 400 (or a mid-stream error), so the message is the only signal.
  if (err instanceof Anthropic.APIError && /credit balance/i.test(apiMessage(err))) {
    return new PlannerError(OUT_OF_CREDITS, 402);
  }
  if (err instanceof Anthropic.AuthenticationError) {
    return new PlannerError("Your Anthropic API key was rejected. Check ANTHROPIC_API_KEY in .env.local.", 401);
  }
  if (err instanceof Anthropic.RateLimitError) {
    return new PlannerError("Rate limited by the Anthropic API. Wait a moment and try again.", 429);
  }
  if (err instanceof Anthropic.BadRequestError) {
    return new PlannerError(`The request was rejected: ${apiMessage(err) || "bad request"}`, 400);
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return new PlannerError("Couldn't reach the Anthropic API. Check your internet connection.", 503);
  }
  if (err instanceof Anthropic.APIError) {
    if (err.status === undefined) {
      return new PlannerError("The connection to Claude dropped partway through. Please try again.", 502);
    }
    return new PlannerError(`Anthropic API error (${err.status}). Please try again.`, 502);
  }
  return new PlannerError("Something went wrong. Please try again.", 500);
}

export function errorResponse(err: unknown) {
  const e = toPlannerError(err);
  if (!(err instanceof PlannerError)) console.error(err);
  return Response.json({ error: e.message }, { status: e.status });
}
