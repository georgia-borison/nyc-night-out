# Night Out NYC

Plan a night out in New York for a late-20s/early-30s crowd. Pick a neighborhood, describe the vibe, and choose which parts of the night you want: pre-drinks, dinner, an activity, events, a nightcap, dancing. Claude searches the web for real, currently open places and tonight's events, then turns your picks into a timed itinerary you can save and share.

## Setup

1. Copy `.env.local.example` to `.env.local` and add your Anthropic API key (from console.anthropic.com):
   ```
   ANTHROPIC_API_KEY=sk-ant-...
   ```
2. `npm install`
3. `npm run dev` and open http://localhost:3000

## How it works

- `app/api/night`: one Claude call that fills every part of the night.
- `app/api/suggest`: refreshes a single section ("Show different options" / "More like this").
- `app/api/itinerary`: orders your picks into a timeline with times and travel between stops.
- `app/api/plans`: saves plans to `data/plans.json`. Share links (`/plan/<id>`) only work while the app runs on your machine, until it's deployed.
- `lib/prompt.ts`: the audience rules (no college bars, variety, confirm places are open). Tweak the app's taste here.
- `lib/cuisines.ts` / `lib/neighborhoods.ts`: the filter chips.

Uses `claude-opus-5` with a small web-search budget: one call covers the whole night (3 searches, 4 with events), and refreshing a section uses 1. The app shows what each plan cost.
