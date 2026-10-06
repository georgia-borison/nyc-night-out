import type { PieceId } from "./schema";

// Lines for the loading card. Picked to fit what someone asked for, then
// shuffled so repeat visits don't feel canned.

function shuffle<T>(list: T[]) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const place = (area: string) => area.split("/")[0].trim();

/** budget is the label shown to people, e.g. "$$" or "$$–$$$". */
export function searchPhrases(opts: { area: string; budget: string; pieces: PieceId[]; rides: boolean }) {
  const { budget, pieces, rides } = opts;
  const area = place(opts.area);
  const has = (...ids: PieceId[]) => ids.some((id) => pieces.includes(id));
  const lines = [
    `Knocking on unmarked doors in ${area}…`,
    "Asking bartenders what they drink on their night off…",
    "Ruling out anywhere with a beer-pong table…",
    "Checking who's still open (RIP to the fallen)…",
    "Skipping the tourist traps so you don't have to…",
    `Pricing out the good stuff at ${budget}…`,
    "Squinting at a lot of dimly lit Instagram photos…",
    "Making sure nobody here is fake. Looking at you, Owl's Head…",
    "Consulting the group chat that lives in our head…",
  ];
  if (has("dinner")) {
    lines.push(
      "Reading menus so you don't have to…",
      "Finding a table where you can actually hear each other…",
      "Weighing the pasta-to-price ratio…",
    );
  }
  if (has("pre_drinks", "post_drinks")) {
    lines.push("Testing which negronis are worth the trip…", "Locating a bartender who remembers your name…");
  }
  if (has("dancing")) lines.push("Scouting a dance floor that isn't a bottle-service trap…");
  if (has("activity", "events")) {
    lines.push("Hunting for a show worth putting your phone away for…", "Checking what's actually on tonight…");
  }
  lines.push(rides ? "Plotting a route with no sad subway transfers…" : `Keeping it all a short walk around ${area}…`);
  return shuffle(lines);
}

export function itineraryPhrases() {
  return shuffle([
    "Lining up your stops like dominoes…",
    "Timing the walks between spots…",
    "Naming your night (this is the hard part)…",
    "Making sure you won't be late for anything…",
    "Leaving room for one more drink…",
    "Drawing your route on the map…",
  ]);
}
