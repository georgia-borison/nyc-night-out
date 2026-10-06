import Anthropic from "@anthropic-ai/sdk";
import type {
  BetaContentBlockParam,
  BetaMessageParam,
  BetaTool,
  BetaToolUnion,
} from "@anthropic-ai/sdk/resources/beta/messages/messages";
import type { z } from "zod";
import { SYSTEM_PROMPT } from "./prompt";

const MODEL = "claude-sonnet-5";
const SUBMIT_TOOL = "submit";
const MAX_TURNS = 4;

// Claude Sonnet 5 list prices, USD per token, used for the cost readout.
const PRICE = {
  input: 2 / 1e6,
  output: 10 / 1e6,
  cacheWrite: 2.5 / 1e6,
  cacheRead: 0.2 / 1e6,
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
 *
 * Optional hooks report progress while it runs: each web search query, and
 * the partially written answer (parsed as far as it goes) as it streams in.
 */
export async function askClaude<T>(opts: {
  prompt: string;
  schema: z.ZodType<T>;
  jsonSchema: Record<string, unknown>;
  submitDescription: string;
  webSearch: boolean;
  maxSearches?: number;
  /** Skip thinking for a faster answer (default: think briefly). */
  think?: boolean;
  /** Give up after this long, across all turns. */
  timeoutMs?: number;
  onSearch?: (query: string) => void;
  onPartial?: (input: unknown) => void;
  /** Content check beyond the schema; return a problem to send back to Claude, or null if it's fine. */
  check?: (data: T) => string | null;
}): Promise<{ data: T; costUsd: number }> {
  const anthropic = getClient();

  const tools: BetaToolUnion[] = [
    {
      name: SUBMIT_TOOL,
      description: opts.submitDescription,
      strict: true,
      input_schema: opts.jsonSchema as BetaTool["input_schema"],
      // Stream the answer as it is written so the page can fill in early.
      // The finished input is still validated with zod below.
      ...(opts.onPartial ? { eager_input_streaming: true } : {}),
    },
  ];
  if (opts.webSearch) {
    tools.push({
      // The basic search tool. The newer one runs searches from generated code,
      // which is slower and, once out of searches, could loop (even sleeping) for minutes.
      type: "web_search_20250305",
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
  const signal = opts.timeoutMs ? AbortSignal.timeout(opts.timeoutMs) : undefined;

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    let message;
    try {
      const stream = anthropic.beta.messages.stream({
        model: MODEL,
        max_tokens: 16000,
        thinking: opts.think === false ? { type: "disabled" } : { type: "adaptive" },
        // Low effort keeps thinking short and tool calls few, which is most of the cost.
        output_config: { effort: "low" },
        system: SYSTEM_PROMPT,
        tools,
        messages,
      }, { signal });
      const { onSearch, onPartial } = opts;
      if (onSearch) {
        stream.on("contentBlock", (block) => {
          if (block.type !== "server_tool_use") return;
          // Searches arrive either as a direct web_search call ({ query }) or,
          // with dynamic filtering, inside generated code that calls web_search.
          const input = (block.input ?? {}) as { query?: unknown; code?: unknown };
          if (typeof input.query === "string") return onSearch(input.query);
          const code = typeof input.code === "string" ? input.code : "";
          const queries = [...code.matchAll(/web_search\(\s*(?:query\s*=\s*)?["'`]([^"'`]+)["'`]/g)].map((m) => m[1]);
          if (queries.length) queries.forEach(onSearch);
          else console.log(`[claude] server tool ${block.name}`, JSON.stringify(input).slice(0, 300));
        });
      }
      if (onPartial) {
        stream.on("streamEvent", (event, snapshot) => {
          if (event.type !== "content_block_delta" || event.delta.type !== "input_json_delta") return;
          const block = snapshot.content[event.index];
          if (block?.type !== "tool_use" || block.name !== SUBMIT_TOOL) return;
          try {
            onPartial(block.input);
          } catch {
            // Not parseable yet; the next delta will be.
          }
        });
      }
      message = await stream.finalMessage();
    } catch (err) {
      if (signal?.aborted) throw new PlannerError("Claude took too long to finish. Please try again.", 504);
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
      const problem = parsed.success ? (opts.check?.(parsed.data) ?? null) : null;
      if (parsed.success && problem) {
        // Tell Claude what's wrong in the same conversation and let it resubmit.
        console.warn(`[claude] submit rejected: ${problem}`);
        messages.push(
          { role: "assistant", content: message.content as BetaContentBlockParam[] },
          {
            role: "user",
            content: [{ type: "tool_result", tool_use_id: submit.id, is_error: true, content: problem }],
          },
        );
        continue;
      }
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

/**
 * One tiny call for a playful plan title, used when the itinerary came back
 * without one. Returns null on any failure so the caller can use a template.
 */
export async function quickTitle(description: string): Promise<{ title: string; costUsd: number } | null> {
  try {
    const message = await getClient().messages.create({
      model: MODEL,
      max_tokens: 60,
      // A few words don't need reasoning; this keeps the call to a fraction of a cent.
      thinking: { type: "disabled" },
      messages: [
        {
          role: "user",
          content: `Write a playful 2-6 word title for this night out in New York, like "Rain Check? Never." or "Uptown Low & Slow". Reply with only the title.\n\n${description}`,
        },
      ],
    });
    const text = message.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
    const title = text.trim().replace(/^["'“”]+|["'“”]+$/g, "").split("\n")[0].trim();
    if (!title || title.length > 60) return null;
    return { title, costUsd: costOf(message.usage) };
  } catch (err) {
    console.error("[claude] title fallback failed", err);
    return null;
  }
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

export function describeError(err: unknown) {
  const e = toPlannerError(err);
  if (!(err instanceof PlannerError)) console.error(err);
  return { message: e.message, status: e.status };
}

export function errorResponse(err: unknown) {
  const { message, status } = describeError(err);
  return Response.json({ error: message }, { status });
}
