import { askClaude, describeError } from "@/lib/claude";
import { candidateCount, nightPrompt, suggestPrompt } from "@/lib/prompt";
import {
  NIGHT_JSON_SCHEMA,
  NightRequestSchema,
  NightResultSchema,
  OPTIONS_JSON_SCHEMA,
  OptionsResultSchema,
  SectionSchema,
  cleanOptions,
  pieceLabel,
  type NightEvent,
  type Option,
  type PieceId,
} from "@/lib/schema";
import { SHOW, choose, vetOptions, type Vetted } from "@/lib/vetOptions";

export const maxDuration = 300;

// The first search: all selected parts of the night in one call, sharing a
// small search budget. Each finished section is vetted (real, open, close
// enough) before it's streamed to the page as newline-delimited JSON.
export async function POST(request: Request) {
  const parsed = NightRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }
  const { pieces, ...trip } = parsed.data;
  const want = candidateCount(trip);

  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: NightEvent) => {
        try {
          controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
        } catch {
          // Stream already closed (e.g. after an error); a late update is harmless to drop.
        }
      };
      const started = Date.now();
      const secs = () => ((Date.now() - started) / 1000).toFixed(1);
      const searched = new Set<string>();
      let costUsd = 0;

      // Per part: how many candidates the latest vetting started from, and its work.
      const handled = new Map<PieceId, { candidates: number; work: Promise<void> }>();
      const allNames = new Set<string>();
      // What each section currently shows, so the same place never appears in two.
      const shown = new Map<PieceId, string[]>();
      const shownElsewhere = (piece: PieceId) =>
        new Set([...shown].filter(([p]) => p !== piece).flatMap(([, names]) => names.map((n) => n.trim().toLowerCase())));
      const sendSection = (piece: PieceId, pick: { options: Option[]; note?: string }) => {
        shown.set(piece, pick.options.map((o) => o.name));
        send({ type: "section", piece, ...pick });
      };

      // Too few good options: ask Claude for this part again, excluding everything seen.
      const topUp = async (piece: PieceId, rounds: Vetted[]) => {
        send({ type: "topup", piece });
        console.log(`[night] ${piece}: topping up at ${secs()}s`);
        try {
          const extra = await askClaude({
            prompt: suggestPrompt({
              ...trip,
              piece,
              otherPieces: pieces,
              exclude: [...allNames],
              hint: `Only suggest places inside the area boundaries${trip.rides ? "" : ", a short walk from each other"}.`,
            }),
            schema: OptionsResultSchema,
            jsonSchema: OPTIONS_JSON_SCHEMA,
            submitDescription: "Submit the final list of options for this part of the night.",
            // Vetting catches fakes and closures, so skip the web search and keep it quick.
            webSearch: false,
          });
          costUsd += extra.costUsd;
          const options = cleanOptions(extra.data.options);
          options.forEach((o) => allNames.add(o.name));
          rounds.push(await vetOptions(options, trip.area, trip.rides));
        } catch (err) {
          console.error(`[night] ${piece}: top-up failed`, err);
        }
      };

      const vetSection = (piece: PieceId, raw: Option[], final: boolean) => {
        const prev = handled.get(piece);
        const candidates = cleanOptions(raw);
        // A short section mid-stream may be a half-finished answer that Claude is
        // about to redo; wait for the final submission instead of topping up early.
        if (!final && candidates.length < SHOW) return;
        // A later submission only replaces an earlier one if it has more to work with.
        if (prev && prev.candidates >= candidates.length) return;
        candidates.forEach((o) => allNames.add(o.name));
        const work = (async () => {
          await prev?.work;
          const rounds = [await vetOptions(candidates, trip.area, trip.rides)];
          let pick = choose(rounds, shownElsewhere(piece));
          const dropped = rounds[0].dropped.map((d) => `${d.name} (${d.reason})`).join(", ");
          console.log(
            `[night] ${piece}: ${candidates.length} candidates, ${pick.options.length} kept at ${secs()}s${dropped ? `; dropped ${dropped}` : ""}`,
          );
          if (pick.options.length < SHOW || pick.note) {
            // Show what we have now, then look for more nearby spots.
            if (pick.options.length) sendSection(piece, pick);
            await topUp(piece, rounds);
            pick = choose(rounds, shownElsewhere(piece));
          }
          sendSection(piece, pick);
          console.log(`[night] ${piece}: sent ${pick.options.length} at ${secs()}s`);
        })();
        handled.set(piece, { candidates: candidates.length, work });
      };

      try {
        const result = await askClaude({
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
            for (const section of sections.slice(0, -1)) {
              const s = SectionSchema.safeParse(section);
              if (s.success && pieces.includes(s.data.piece)) vetSection(s.data.piece, s.data.options, false);
            }
          },
          // Claude sometimes submits early with parts missing or only one or two options.
          check: (data) => {
            const short = pieces.filter((p) => {
              const s = data.sections.find((x) => x.piece === p);
              return !s || s.options.length < SHOW;
            });
            return short.length
              ? `Some parts are missing or have too few options: ${short.map(pieceLabel).join(", ")}. Submit again with ${want} options in every section for: ${pieces.join(", ")}.`
              : null;
          },
        });
        costUsd += result.costUsd;
        for (const s of result.data.sections) if (pieces.includes(s.piece)) vetSection(s.piece, s.options, true);
        // A part Claude never filled still gets a top-up rather than an empty section.
        for (const piece of pieces) if (!handled.has(piece)) vetSection(piece, [], true);
        await Promise.all([...handled.values()].map((h) => h.work));
        console.log(`[night] all sections done at ${secs()}s`);
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
