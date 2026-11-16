# Schedule One — Gap Report
_Generated 2026-11-15. Read-only audit of main branch._

---

## 1. Feature Status Table

| ID | Feature | Status | Evidence | Size | Dependencies |
|----|---------|--------|----------|------|--------------|
| F01 | Google Sign-in (ucsb.edu) | MISSING | no auth anywhere | L | needs Auth.js + Google OAuth |
| F02 | UCSB email server-side enforcement | MISSING | no middleware | M | F01 |
| F03 | Demo mode (no sign-in) | PARTIAL | onboarding has 3 sample transcripts; no "demo" label | S | — |
| F04 | Transcript upload (PDF or paste) | PARTIAL | paste + 3 samples work; no PDF upload | M | — |
| F05 | Transcript confirm/edit screen | MISSING | parse → processing immediately, no edit step | M | F04 |
| F06 | AP/transfer credit entry | MISSING | not in onboarding wizard | M | F05 |
| F07 | Requirements audit (audit fn) | DONE | `lib/requirements.ts:computeRequirementStatus` | — | — |
| F08 | Course prerequisite data | PARTIAL | real prereqs in winter-2027.json; only 30 courses, SDS only | M | data/source |
| F09 | 4-year plan generator | MISSING | only next-quarter planning exists | L | F07, F08 |
| F10 | Weekly schedule grid | PARTIAL | WeeklyCalendar.tsx exists; not wired to dashboard grid | M | — |
| F11 | Conflict detection | DONE | `lib/validator.ts:no_time_conflicts` | — | — |
| F12 | Time prefs / backup classes | PARTIAL | backup1/backup2 schedules generated; no time-pref UI | M | — |
| F13 | Section data interface (mock/real) | MOCKED | winter-2027.json has placeholder times; no UCSB API | M | UCSB_API_KEY |
| F14 | .ics calendar export | MISSING | Share tab says "coming soon" | M | — |
| F15 | Mobile layout | PARTIAL | CSS has responsive rail; not fully tested on 375px | S | — |
| F16 | Loading / error / empty states | PARTIAL | processing screen has error state; not all tabs | S | — |
| F17 | Data persistence (across sessions) | MISSING | sessionStorage only — clears on browser close | L | F01, DB |
| F18 | Delete my data | MISSING | no user data stored to delete | S | F01, F17 |
| F19 | Landing page beta disclaimer | MISSING | landing page has no "not an official UCSB product" notice | S | — |
| F20 | 28-major requirement data | MISSING | only SDS B.S. 2026-27; 27 majors missing | L | data/source |
| F21 | docs/spec/ source files | MISSING | docs/ dir empty; data/source/ does not exist | — | Drive files |

---

## 2. Top 10 Risks for the Presentation

| # | Risk | Severity | Detail |
|---|------|----------|--------|
| 1 | **Gemini API key may be invalid** | 🔴 BLOCKER | `AQ.` format keys from AI Studio may not work with `@google/genai` SDK; full flow untested end-to-end |
| 2 | **No auth** | 🔴 HIGH | Anyone who gets the URL can use it; no ucsb.edu restriction |
| 3 | **SDS only** | 🟠 HIGH | Presenting to SEP group — if any attendee is not SDS, the degree audit is wrong or empty |
| 4 | **Section times are fake** | 🟠 HIGH | All 30 courses use placeholder MWF/TR times from `_note: "representative placeholders"` — if shown as real it's misleading |
| 5 | **No transcript edit screen** | 🟠 HIGH | Gemini parse goes straight to planning with no chance to correct mistakes; a bad parse silently produces a wrong schedule |
| 6 | **sessionStorage only** | 🟡 MEDIUM | Refresh the browser → all data gone; likely to happen during a live demo |
| 7 | **15-25 second Gemini call** | 🟡 MEDIUM | Vercel free tier has 10s serverless timeout; planning call will time out without `export const maxDuration = 60` (Vercel Pro required) |
| 8 | **Lint errors (11)** | 🟡 MEDIUM | Build passes but `npm run lint` has 11 errors; not a blocker but sloppy for a pitch |
| 9 | **No beta/disclaimer on landing** | 🟡 MEDIUM | Spec requires "not an official UCSB product" notice; missing = compliance risk |
| 10 | **No .ics / no QR on Share tab** | 🟢 LOW | Share tab is a stub; demo ends on a "coming soon" screen |

---

## 3. Proposed Build Plan

### Pre-conditions (do before any lane)
- [ ] Confirm Gemini API key works end-to-end (test `/api/parse-transcript` with curl)
- [ ] Add `export const maxDuration = 60` to both API routes (or upgrade Vercel to Pro)
- [ ] Add beta disclaimer to landing page

### Lane order
```
Lane 1 (Auth)        ← blocks Lane 5 (persistence)
Lane 2 (Data)        ← blocks Lane 4 (4-year plan)
Lane 3 (Transcript)  ← independent, start now
Lane 4 (Plan gen)    ← needs Lane 2
Lane 5 (Course sel)  ← needs Lane 1 (for session), Lane 2 (for real section data)
Lane 6 (Polish)      ← independent, start alongside others
```

### Files each lane owns
| Lane | Owns | Must not touch |
|------|------|----------------|
| 1 Auth | `app/api/auth/`, `middleware.ts`, `lib/auth.ts`, `app/login/` | — |
| 2 Data | `data/source/`, `data/processed/`, `lib/data.ts`, `scripts/ingest.ts` | `lib/llm.ts` |
| 3 Transcript | `app/onboarding/`, `app/api/parse-transcript/`, new `app/review/` | `lib/requirements.ts` |
| 4 Plan gen | `lib/planner.ts`, `app/api/plan/`, new 4yr plan UI in dashboard | `lib/llm.ts`, `lib/requirements.ts` |
| 5 Course sel | `lib/sections.ts` (new), `components/WeeklyCalendar.tsx`, Schedule tab | `data/` |
| 6 Polish | `app/page.tsx`, `app/globals.css`, `components/`, `docs/demo-script.md` | everything else |

### Merge order
1. Lane 1 (Auth) → main
2. Lane 2 (Data) → rebase on main
3. Lanes 3, 4, 5, 6 simultaneously → rebase on Lane 2

---

## 4. What Teo Must Do by Hand
- Add `ANTHROPIC_API_KEY` / `GEMINI_API_KEY` to Vercel env vars (done — verify it works)
- Google Cloud: create OAuth 2.0 client, add authorized redirect URIs for localhost + Vercel
- Set `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `BETA_ALLOWED_EMAILS` in Vercel
- Drop Drive files into `data/source/` (28 major .txt files, gap-fill-prereqs, four-year-plans)
- Upgrade Vercel plan to Pro if Gemini calls exceed 10s (free tier limit)

---

_Status legend: DONE = works end-to-end · PARTIAL = core logic exists, gaps noted · MOCKED = placeholder data/UI · MISSING = not started_
