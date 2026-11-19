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
| `UCSB_API_KEY` | No | UCSB Academic Curriculums v3 consumer key. Without it the app uses the saved fixtures in `data/ucsb-fixtures/` |
| `NEXT_PUBLIC_FEATURE_LIKELIHOOD` | No | `true` shows offered/seat likelihood buckets (low confidence until enrollment history is verified) |

Set the same variables in Vercel under Project Settings > Environment Variables, then redeploy.

No AI service or API key is needed. Transcripts are read by rules (`lib/transcript-parser.ts`) and schedules are built by rules (`lib/fallback-scheduler.ts`, `lib/planner.ts`). `/api/health` shows whether the UCSB key is set, never its value.

## What it does

1. **Upload & setup**: pick a major (plus an optional second major or minor), upload the transcript as a PDF or .txt or paste it, then either "Build it for me" or personalize (units, earliest start, latest end, free days, and upper-division courses that seem interesting). Programs without requirement data show as "coming soon" and the plan route answers 422 `program_not_ready`.
2. **Plan**: the transcript reader handles GOLD's unofficial transcript and most "code, title, units, grade" layouts, keeping in-progress courses. The planner searches the eligible courses for the best main schedule and two different backups, each checked by `lib/validator.ts`, and prefers the courses the 4-year plan puts in Winter 2027. When the open major courses can't reach full time, it says how many GE or elective units to add.
3. **4-Year Plan tab** (`lib/four-year-plan.ts`, `/api/four-year-plan`): rule-based, no AI. Lays out every remaining major course quarter by quarter from Winter 2027 to 180 units, keeps prerequisites in order, fills each quarter to full time with GE or electives, lists backups per quarter, and marks courses as "MUST TAKE IN WINTER" (and so on) when a course runs once a year, sits on the path to graduation, or unlocks 4+ later courses. In-progress courses (grade IP) count as done.
4. **Past grades**: course rows show average GPA and % A's since 2023, and the instructors who taught it lately (`data/grades/recent-grades.json`, from the Daily Nexus's UCSB Registrar public-records data, which it publishes as free to reuse).

## Majors and sample data

- The major picker lists the Sigma Eta Pi majors. Economics & Accounting, Statistics & Data Science, Biological Sciences and Electrical Engineering have requirement data (`data/requirements/`); the rest show as coming soon.
- `data/catalog/courses.json` holds titles, units, prerequisites, standing and term limits for 296 courses from the 2026-27 catalog.
- `data/offerings/winter-2027-standin.json` holds STAND-IN Winter 2027 sections (real courses, made-up times) for the newer majors until the UCSB API key is set.
- `public/samples/` has three EXAMPLE transcripts for made-up students (Econ & Accounting sophomore, Biology junior, EE senior). Onboarding labels them as examples, picking one sets the major, and the dashboard shows an "Example transcript" banner until the student adds their own.
- When a student's major courses can't reach 12 units this quarter (an Econ sophomore can only take ECON 10A), the quarter plan schedules what is open and says how many GE units to add.
- `docs/ucsb-api-key-prompt.md` is a browser-agent prompt for getting the UCSB API key.

## Running tests

```bash
npm test        # Vitest
npx tsc --noEmit
npm run build
```

## Project structure (main parts)

```
app/api/plan, app/api/parse-transcript   # Rule-based planning and transcript reading
app/api/ucsb/classes                      # Course data via the UCSB layer
app/api/extract-text                      # PDF/.txt upload to text (5 MB max, never logged)
lib/
  transcript-parser.ts                    # Reads pasted or uploaded transcripts
  planner.ts, validator.ts                # Main schedule + 2 backups, all validated
  fallback-scheduler.ts, course-codes.ts  # Schedule search
  ge.ts                                   # GE areas (one per course) + stacking special subjects
  schedule-engine.ts                      # Two-phase lecture/section scheduler, open slots, swaps
  pass-planner.ts                         # Pass caps 11.5 / 15.5 / 21.0, waitlist >= 12 units
  majors.ts                               # Program list; combines double majors and minors
  four-year-plan.ts, catalog.ts           # 4-year plan; 2026-27 catalog lookups
  grade-history.ts                        # Past grade distributions (ratings stand-in)
  standing.ts                             # Class standing, 12-unit full time, upper-division notice
  registration-flags.ts                   # "Mostly a Fall course" and "Must get" from past offerings
  interests.ts, pdf-text.ts
  recommend.ts, likelihood.ts, cart-prompt.ts, flags.ts, ratings.ts
  ucsb/                                   # Curriculums v3 client, cache, adapter, quarter codes, fixtures
docs/
  product-spec.md, ucsb-api-reference.md, gap-analysis.md, chrome-extension.md
```

## Notes

- Everything is rule-based; there are no AI calls.
- The UCSB client caches responses and limits live calls per hour; it never logs or stores student data.
- Not built yet: study abroad and transfer courses, requirement data for most SEP majors and all minors, and college-specific GE rules. The UI says so.
- Term flags use the synthetic `data/ucsb-fixtures/enrollment-history.json` until the UCSB API key is set, so most courses show no flag.
- Professor ratings: Rate My Professors does not allow scraping, so the app shows past grade distributions instead. Sections are ranked by time fit, because Winter 2027 instructors are TBA until the UCSB API key is set.
