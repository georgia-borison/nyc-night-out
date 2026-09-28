# Night Out NYC

Plan a night out in New York for a late-20s/early-30s crowd. Pick a neighborhood, describe the vibe, and choose which parts of the night you want: pre-drinks, dinner, an activity, events, a nightcap, dancing. Claude searches the web for real, currently open places and tonight's events, then turns your picks into a timed itinerary with a map that you can save and share.

## Setup

1. Copy `.env.local.example` to `.env.local` and add your Anthropic API key (from console.anthropic.com):
   ```
   ANTHROPIC_API_KEY=sk-ant-...
   ```
2. `npm install`
3. `npm run dev` and open http://localhost:3000

## How it works

- `app/api/night`: one Claude call that fills every part of the night. It streams each search and each section to the page as they happen.
- `app/api/suggest`: refreshes a single section ("Show different options" / "More like this").
- `app/api/itinerary`: orders your picks into a timeline with times and travel between stops.
- `app/api/itinerary`: also looks up map coordinates for each stop (OpenStreetMap, `lib/geocode.ts`).
- `app/api/plans` + `app/plan/[id]`: saved plans and share links, stored in Upstash Redis (`lib/store.ts`). "My plans" is kept per browser (`lib/myPlans.ts`).
- `components/NightPlan.tsx` / `PlanMap.tsx`: the final plan page and its map.
- `lib/prompt.ts`: the audience rules (no college bars, variety, confirm places are open). Tweak the app's taste here.
- `lib/cuisines.ts` / `lib/neighborhoods.ts`: the filter chips.

Uses `claude-sonnet-5` with a small web-search budget: one call covers the whole night (up to 2 searches, 3 with events), and refreshing a section uses 1. The app shows what each plan cost, typically around $0.10 to $0.15 for a full night.
