# Spec vs repo: gap analysis (Nov 18, 2026)

Compared `main` against the Nov 16, 2026 product spec (`docs/product-spec.md`). "Before" is `main`; "Now" is this branch.

| Spec section | Before | Now | Where |
|---|---|---|---|
| Print/generate schedule reliability | Broken (see below) | Fixed | `lib/planner.ts`, `lib/validator.ts`, `lib/fallback-scheduler.ts`, `lib/fetch-json.ts` |
| Vercel build | Failing on Next.js 16.4.3 | Builds on 16.4.6 | `package.json` |
| 1. Two-phase scheduler, toggle, calendar blocks, buffer | Missing | Built | `lib/schedule-engine.ts` |
| 1. Worked test case (JAPAN 80 discussion 59915) | Missing | Test passes | `tests/schedule-engine.test.ts` |
| 2. Open slots, backups, swap view, finals check | Missing | Built | `lib/schedule-engine.ts` |
| 3. GE rules (one area per course, stacking specials, progress check wins) | Missing | Built | `lib/ge.ts` |
| 4. UCSB Curriculums v3 layer (server key, cache, fixtures) | Missing | Built, fixtures synthetic | `lib/ucsb/` |
| 4. Recommendations (set cover through the scheduler) | Missing | Built | `lib/recommend.ts` |
| 5. Pass planner | Missing | Built | `lib/pass-planner.ts` |
| 6. Likelihood buckets | Missing | Built behind a flag | `lib/likelihood.ts` |
| 7A. Free cart prompt | Missing | Built | `lib/cart-prompt.ts` |
| 7B. Paid extension | Missing | Not built on purpose | `docs/chrome-extension.md` |
| UI for all of the above | "Coming soon" | Planner tab | `components/planner/QuarterPlanner.tsx` |
| "Not an official UCSB application" footer | Missing | Added | `app/layout.tsx` |

## Print/generate bug: causes fixed
1. The validator rejected any requirement group claimed by two courses, so ordinary schedules (two electives from one group) failed with "Could not produce a valid schedule". It now allows as many courses as the group still needs.
2. No retry or fallback when the LLM's schedule failed validation. Now: one retry with the validator's errors, then a rule-based planner.
3. Prerequisites were AND-only and course codes were compared raw ("PSTAT8" vs "PSTAT 8"). Now normalized, with either/or prerequisites.
4. The browser called `res.json()` on Vercel's HTML timeout page. Now reads text first and shows a readable error; routes set `maxDuration = 60`.
5. The Gemini client was built at import time and JSON mode was off. (A later fix restored gemini-3.8-flash as the default model; changing it to gemini-2.5-flash here was a mistake, see the transcript fix PR.)

## Still open or blocked
- No `UCSB_API_KEY` yet: the app runs on synthetic fixtures. Capture real ones once a key exists (`docs/ucsb-api-reference.md`).
- Lecture-to-section linking uses GOLD numbering (0100/0101); unverified.
- Summer/Fall quarter digits unverified.
- Pass 3 college limit is a placeholder (21.5) until the L&S cap is confirmed.
- Professor ratings have no data source.
- Extension waits on a UCSB policy review.
