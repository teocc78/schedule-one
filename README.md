# Schedule One

Class schedule planner for UCSB students. Student project, not an official UCSB application.

## Setup

```bash
npm install
cp .env.local.example .env.local   # then fill in the values below
npm run dev
```

Open http://localhost:3000.

## Environment variables (server-side only, never commit them)

| Variable | Required | What it does |
|---|---|---|
| `GEMINI_API_KEY` | Yes | Gemini key for transcript parsing and schedule proposals (aistudio.google.com) |
| `GEMINI_MODEL` | No | Override the model; defaults to `gemini-3.8-flash`. Leave empty unless you need a specific model. If the model is unavailable to your key, the app tries gemini-3.8-flash and gemini-3.5-flash-lite. Aliases like gemini-flash-latest return 404 on the API version the SDK uses |
| `UCSB_API_KEY` | No | UCSB Academic Curriculums v3 consumer key. Without it the app uses the saved fixtures in `data/ucsb-fixtures/` |
| `NEXT_PUBLIC_FEATURE_LIKELIHOOD` | No | `true` shows offered/seat likelihood buckets (low confidence until enrollment history is verified) |

Set the same variables in Vercel under Project Settings > Environment Variables, then redeploy.

To check the live setup, open `/api/health` (shows whether the keys are set, never their values; `geminiModelSetting` is the GEMINI_MODEL variable, null when unset) or `/api/health?ai=1` (tries each model once and shows Gemini's status for each: 429 means the key's quota or rate limit is used up, 503 means Google is overloaded).

Most transcripts are read by rules with no AI call (`lib/transcript-fallback.ts`); the AI handles unusual layouts. If the AI is busy or misconfigured, transcript reading uses what the rules found and planning uses the rule-based planner, so students are not blocked; the cause shows in the server logs and `/api/health?ai=1`.

## What it does

1. **Upload & setup**: paste a transcript or progress check, set preferences.
2. **Plan**: the LLM proposes schedules from eligible courses only; `lib/validator.ts` gates them. If the LLM fails or proposes invalid schedules, `lib/fallback-scheduler.ts` builds valid ones deterministically.
3. **Planner tab** (dashboard): week grid with hard/soft blocks and a buffer, time-vs-professor toggle, two-phase lecture/section planning, open-slot finder with backups and swap impact, GE status and suggestions, pass plan with waitlist warning, and a copy-paste GOLD cart prompt (add to cart only).

## Running tests

```bash
npm test        # Vitest
npx tsc --noEmit
npm run build
```

## Project structure (main parts)

```
app/api/plan, app/api/parse-transcript   # LLM routes (maxDuration 60)
app/api/ucsb/classes                      # Course data via the UCSB layer
components/planner/QuarterPlanner.tsx     # Planner tab
lib/
  llm.ts, planner.ts, validator.ts        # Propose -> validate -> retry -> fallback
  fallback-scheduler.ts, course-codes.ts
  ge.ts                                   # GE areas (one per course) + stacking special subjects
  schedule-engine.ts                      # Two-phase lecture/section scheduler, open slots, swaps
  pass-planner.ts                         # Pass caps 11.5 / 15.5, waitlist >= 12 units
  recommend.ts, likelihood.ts, cart-prompt.ts, flags.ts, ratings.ts
  ucsb/                                   # Curriculums v3 client, cache, adapter, quarter codes, fixtures
docs/
  product-spec.md, ucsb-api-reference.md, gap-analysis.md, chrome-extension.md
```

## Notes

- Hard rules live in code; the AI only proposes and ranks.
- The UCSB client caches responses and limits live calls per hour; it never logs or stores student data.
- Professor ratings have no source yet (Rate My Professors does not allow scraping), so professor mode ranks on time fit until one is added.
