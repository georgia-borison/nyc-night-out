import { askClaude, describeError } from "@/lib/claude";
import { nightPrompt } from "@/lib/prompt";
import {
  NIGHT_JSON_SCHEMA,
  NightRequestSchema,
  NightResultSchema,
  SectionSchema,
  cleanOptions,
  type NightEvent,
  type PieceId,
} from "@/lib/schema";

export const maxDuration = 300;

// The first search: all selected parts of the night in one call, sharing a
// small search budget. Streams newline-delimited JSON events so the page can
// show each search and fill in each section as soon as it's written.
export async function POST(request: Request) {
  const parsed = NightRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }
  const { pieces, ...trip } = parsed.data;

  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: NightEvent) => controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      const sent = new Set<PieceId>();
      const searched = new Set<string>();

      const sendSection = (section: unknown) => {
        const s = SectionSchema.safeParse(section);
        if (!s.success || sent.has(s.data.piece) || !pieces.includes(s.data.piece)) return;
        sent.add(s.data.piece);
        send({ type: "section", piece: s.data.piece, options: cleanOptions(s.data.options) });
      };

      try {
        const { data, costUsd } = await askClaude({
          prompt: nightPrompt(trip, pieces),
          schema: NightResultSchema,
          jsonSchema: NIGHT_JSON_SCHEMA,
          submitDescription: "Submit the options for every part of the night.",
          webSearch: true,
          // Events can't come from memory, so they get one extra search.
          maxSearches: pieces.includes("events") ? 3 : 2,
          // The same search can surface twice (in generated code, then as the call itself).
          onSearch: (query) => {
            if (searched.has(query)) return;
            searched.add(query);
            send({ type: "search", query });
          },
          onPartial: (input) => {
            // Once a later section has started, every earlier one is complete.
            const sections = (input as { sections?: unknown[] } | null)?.sections;
            if (!Array.isArray(sections)) return;
            for (const section of sections.slice(0, -1)) sendSection(section);
          },
        });
        for (const section of data.sections) sendSection(section);
        // Parts Claude skipped still resolve, so the page doesn't spin forever.
        for (const piece of pieces) if (!sent.has(piece)) send({ type: "section", piece, options: [] });
        send({ type: "done", costUsd });
      } catch (err) {
        send({ type: "error", error: describeError(err).message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(body, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache" },
  });
}
