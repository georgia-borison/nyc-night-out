import { describeError } from "@/lib/claude";
import { findOptions } from "@/lib/findOptions";
import { NightRequestSchema, type NightEvent, type Option, type PieceId } from "@/lib/schema";
import { SHOW, choose, vetOptions, type Vetted } from "@/lib/vetOptions";

export const maxDuration = 300;

const NO_EVENTS = "Couldn't confirm any events for this date. Try “Show different options” to search again.";

// The first search. Every selected part of the night is asked for on its own,
// all at the same time, so the wait is the slowest part rather than the sum.
// Each part is vetted (real, open, close enough, on budget) and streamed to
// the page as newline-delimited JSON as soon as it's ready.
export async function POST(request: Request) {
  const parsed = NightRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }
  const { pieces, ...trip } = parsed.data;

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

      // Every name Claude has suggested in any part, so top-ups don't repeat them.
      const allNames = new Set<string>();
      // What each section currently shows, so the same place never appears in two.
      const shown = new Map<PieceId, string[]>();
      const shownElsewhere = (piece: PieceId) =>
        new Set([...shown].filter(([p]) => p !== piece).flatMap(([, names]) => names.map((n) => n.trim().toLowerCase())));
      const sendSection = (piece: PieceId, pick: { options: Option[]; note?: string }) => {
        shown.set(piece, pick.options.map((o) => o.name));
        send({ type: "section", piece, ...pick });
      };
      const onSearch = (query: string) => {
        // The same search can surface twice (in generated code, then as the call itself).
        if (searched.has(query)) return;
        searched.add(query);
        send({ type: "search", query });
      };

      // Too few good options: ask Claude for this part again, excluding everything seen
      // and steering toward kinds of places not already covered.
      const topUp = async (piece: PieceId, rounds: Vetted[]) => {
        send({ type: "topup", piece });
        console.log(`[night] ${piece}: topping up at ${secs()}s`);
        const kept = rounds.flatMap((r) => [...r.near, ...r.cheaper]);
        const overBudget = rounds.some((r) => r.dropped.some((d) => d.reason === "over budget"));
        const hints = [`Only suggest places inside the area boundaries${trip.rides ? "" : ", a short walk from each other"}.`];
        if (overBudget) hints.push("Some earlier picks were over budget; stay at or under it.");
        try {
          const extra = await findOptions(
            {
              ...trip,
              piece,
              otherPieces: pieces,
              exclude: [...allNames].slice(0, 40),
              avoidCategories: [...new Set(kept.map((o) => o.category))],
              hint: hints.join(" "),
            },
            // Vetting catches fakes and closures, so skip the web search and keep it quick.
            { search: false },
          );
          costUsd += extra.costUsd;
          extra.options.forEach((o) => allNames.add(o.name));
          rounds.push(await vetOptions(extra.options, trip));
        } catch (err) {
          console.error(`[night] ${piece}: top-up failed`, err);
        }
      };

      const runPiece = async (piece: PieceId) => {
        let candidates: Option[] = [];
        let failure: unknown = null;
        try {
          const found = await findOptions({ ...trip, piece, otherPieces: pieces, exclude: [] }, { onSearch });
          costUsd += found.costUsd;
          candidates = found.options;
        } catch (err) {
          failure = err;
          console.error(`[night] ${piece}: search failed at ${secs()}s`, err);
        }
        candidates.forEach((o) => allNames.add(o.name));
        console.log(`[night] ${piece}: ${candidates.length} candidates from Claude at ${secs()}s`);

        const rounds = [await vetOptions(candidates, trip)];
        let pick = choose(rounds, shownElsewhere(piece));
        const dropped = rounds[0].dropped.map((d) => `${d.name} (${d.reason})`).join(", ");
        console.log(
          `[night] ${piece}: ${pick.options.length} kept at ${secs()}s [${pick.options.map((o) => `${o.category} ${o.price}`).join("; ")}]${dropped ? `; dropped ${dropped}` : ""}`,
        );
        // If the search itself failed for a reason a retry won't fix (no credits, bad key), don't top up.
        const status = failure === null ? null : describeError(failure).status;
        const fatal = status !== null && status < 500 && status !== 422;
        // Events must be confirmed by a live search, so they're never padded from memory.
        if (piece === "events") {
          if (!pick.options.length && !fatal) pick = { options: [], note: NO_EVENTS };
        } else if (!fatal && (pick.options.length < SHOW || pick.note)) {
          // Show what we have now, then look for more nearby spots.
          if (pick.options.length) sendSection(piece, pick);
          await topUp(piece, rounds);
          pick = choose(rounds, shownElsewhere(piece));
        }
        if (pick.options.length || !failure) sendSection(piece, pick);
        console.log(`[night] ${piece}: sent ${pick.options.length} at ${secs()}s`);
        return { failure, sent: pick.options.length };
      };

      try {
        const results = await Promise.all(pieces.map(runPiece));
        console.log(`[night] all sections done at ${secs()}s, ~$${costUsd.toFixed(3)}`);
        const firstFailure = results.find((r) => r.failure)?.failure;
        // Nothing came back at all: show the reason (e.g. out of credits) instead of empty sections.
        if (firstFailure && results.every((r) => r.sent === 0)) {
          send({ type: "error", error: describeError(firstFailure).message });
        } else {
          send({ type: "done", costUsd });
        }
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
