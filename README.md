# Schedule One

AI-powered class schedule planner for UCSB Statistics & Data Science students. Demo-quality prototype.

## Setup

```bash
# 1. Install dependencies
npm install

# 2. Set up environment variables
cp .env.local.example .env.local
# Edit .env.local and add your Anthropic API key

# 3. Run the dev server
npm run dev
```

Open http://localhost:3000.

## Required environment variables

| Variable | Description |
|---|---|
| `ANTHROPIC_API_KEY` | Your Anthropic API key from console.anthropic.com |

## How to use

1. **Upload & Setup** — Paste your unofficial transcript (or load a sample), set scheduling preferences
2. **Processing** — The app parses your transcript and generates a validated schedule (~10–25 seconds)
3. **Results** — View your primary schedule on a weekly calendar grid, plus two backup options and swap suggestions

## Running tests

```bash
npm test
```

23 unit tests cover the requirements engine (group satisfaction, choose-n logic, eligible offerings) and the schedule validator (time conflicts, unit limits, prerequisites, constraints).

## Project structure

```
app/
  page.tsx                  # Upload & Setup screen
  processing/page.tsx       # Processing screen
  results/page.tsx          # Results screen
  api/
    parse-transcript/       # POST: extract courses from transcript text
    plan/                   # POST: generate + validate schedules
components/
  WeeklyCalendar.tsx        # Weekly grid view
  ScheduleCard.tsx          # Full schedule display (calendar + list + swaps + validation)
  ValidationBadge.tsx       # Shows which checks passed
lib/
  llm.ts                    # All Anthropic API calls (single module, retry logic)
  planner.ts                # Orchestrates requirements -> LLM -> validation
  requirements.ts           # Pure functions: requirement status, eligible offerings
  validator.ts              # Deterministic validator (no LLM)
types/
  index.ts                  # All shared TypeScript types
data/
  requirements/             # Major requirement JSON files
  offerings/                # Quarter course offering JSON files
  samples/                  # Sample transcripts for testing
```

## Swapping in real data

- **Offerings**: Replace `data/offerings/winter-2026.json` with real GOLD data in the same schema (`QuarterOfferings` type in `types/index.ts`)
- **Requirements**: Replace `data/requirements/statistics-data-science.json` with the real catalog requirements (`MajorRequirements` type)
- **Additional majors**: Add more files to `data/requirements/` and update the `/api/plan` route to select based on `majorCode`

## Architecture notes

- The LLM *proposes* schedules; the deterministic validator in `lib/validator.ts` *gates* them. Invalid schedules are never shown.
- All Anthropic calls are in `lib/llm.ts` with Zod schema validation and one automatic retry on malformed output.
- No user accounts, database, or scraping. All data is mock and local.
