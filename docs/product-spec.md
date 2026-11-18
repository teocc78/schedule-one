# Schedule One: Product Feature Spec (quarter planning, GE logic, pass planning, likelihood, GOLD cart)

Spec version dated Nov 16, 2026. Copied into the repo for reference; personal details were removed because this repository is public. Items marked OPEN are not decided. The original three-step flow (upload progress check, plan, personalize) in the Product Brief still stands; this file adds and sharpens features.

## 0. Principles

- Hard rules live in code (prerequisites, conflicts, unit caps, GE counting). AI only ranks and explains.
- The student always clicks Enroll. The product never handles passwords or Duo codes.
- Estimates are labeled as estimates. GOLD wins when it disagrees with the app.
- Collect classes taken and requirements, not grades, unless the student adds more.

## 1. Quarter planning engine

Two phases.

1. Phase 1, lectures. Choose and prioritize lectures for all mandatory courses first, then add elective or GE lectures. Only lecture times count here.
2. Feasibility check. Before ranking a lecture, confirm at least one linked discussion or lab section still fits against the other lectures. If none does, mark it "no workable section" and drop it.
3. Phase 2, sections. Place each lecture's discussion or lab into the gaps the lectures left. A section can never move a lecture.

Priority toggle. The student picks time slot or professor rating. It drives ranking in both phases.
- Time slot mode: rank by fit to preferred windows; professor rating breaks ties.
- Professor mode: rank by rating first; time fit breaks ties. Sections usually have TAs with no ratings, so Phase 2 falls back to time fit. Say so in the UI.
- Conflicts are never traded away. The toggle only reorders options that already work.
- OPEN: per quarter or per course.

Calendar planning. The app uses the student's calendar to know which time blocks work.
- Hard blocks (never schedule) and soft blocks (avoid if possible).
- Optional buffer between back-to-back classes (setting, not a rule).
- Input: Google Calendar sign-in or a weekly grid the student paints (grid is simpler for beta).

Why this matters: GOLD lets students register for courses with time conflicts and does not drop them (registrar course-registration page). The app's conflict check is real added value.

Worked test case (sample student, Winter 2027). Locked: PSY 10B lecture MW 11:00-12:15 plus Wed 3:00-4:50 section; PSTAT 8 lecture MW 12:30-1:45 plus TR 5:00-5:50 discussion; EEMB 7 lecture TR 3:30-4:45. Candidate JAPAN 80 (5 units): lecture TR 11:00-12:15 fits; discussion 59915 R 3:00-3:50 conflicts with EEMB 7 (overlap 3:30-3:50), so the engine must reject it and offer other discussion sections.

## 2. Open-slot finder and backup options

- Quarter fit: with mandatory courses locked, list every other section (electives, GE, upper division) that fits without conflict, tagged "fits" or "conflicts with X".
- Backups per mandatory course: every lecture and linked section with status (open, full, waitlist), restrictions, and compatibility with locked picks, ranked.
- Swap view: precompute how swapping to a backup for course A changes what fits for course B.
- Optional: final exam times as a second conflict check.

## 3. GE rules (must be explicit in the UI)

General Subject Areas A to G. A course can fill only ONE area, even if it is listed in several (for example Art History 6A cannot count for both E and F). If a course is flagged for two areas, the planner assigns it to the area with the larger remaining need.
- B.S. counts: A 2, B 1 to 3, C 3, D 2, E 2, F 1, G 1.

Special subjects can stack: Writing (6 courses, WRT flag), World Cultures (1, NWC), Ethnicity (1, ET), Quantitative Relationships (1, QN; QN courses also carry a C, D, E or G flag), European Traditions (B.A. only). One course can fill one General Subject Area plus any number of special subjects. American History & Institutions (university requirement) also double-counts with GE and major courses.

Writing rules: each WRT course needs 1,800 or more words; after matriculation only designated UCSB courses count (up to 2 UC or UCEAP courses by petition).

Unmet-requirement display. Read the student's progress check and show each GE line as met or not met.

Worked examples of multi-flag courses: JAPAN 80 is Area G plus WRT plus NWC. ANTH W 3 is Area D plus WRT plus NWC. C LIT 36 (Global Humanities) shows GE codes WRT NWC in GOLD for Winter 2027. A plain Area D course scores 1.

Source for flags: catalog GE lookup sheet (2026-27), cross-checked against the GECodes column in GOLD's Course Info window. The student's progress check may use a different catalog year. GOLD wins on disagreement.

## 4. Course and GE database, recommendations

- courses: one row per course (flags, units, prerequisites, grade mode). Source: catalog.
- offerings: one row per course per quarter. Snapshot each quarter, keep past quarters ("fall only" warnings, next opportunity).
- sections: lecture, discussion and lab rows per offering; refresh seats often near pass time.
- requirements: each major sheet and GE rule as data, with catalog year.

Recommendation: unmet requirements, then candidate courses offered next quarter, then score by number of open requirements covered, then pass through the section 1 scheduler so only courses that fit the calendar are suggested. Greedy set cover is enough for the MVP.

API access: UCSB Developer API, Curriculums API (v3). Fields: classes by quarter, sections, times, instructors, `enrolledTotal`, `maxEnroll`, restrictions, `generalEducation` (geCode), plus `classspaceavailability` and `finals`. Key goes in the `ucsb-api-key` header from a server-side environment variable only. Quarter codes are YYYYQ (Winter 2027 = 20271; example in the spec: 20192 = Spring 2019). Verify the exact `areas` filter values against the OpenAPI spec before relying on them; GE codes can also be filtered client-side from each class's returned codes.

Risk: the API spec describes its data as cacheable for limited periods and no API-specific terms were found. Keep snapshots for the beta, flag it, and get data-use terms in writing as part of the school partnership. The Product Brief notes UCSB asked for about 2 calls per hour around pass times in 2020, so cache rather than call live.

## 5. Pass planner

Official unit limits (registrar pass times page): Pass 1 is 11.5 units, Pass 2 is 15.5 units, Pass 3 is the college limit. OPEN: exact L&S college limit for Pass 3; confirm Pass 2 and 3 limits are cumulative registered units.

Rules to model:
- Assign each planned course to a pass so the running unit total stays under that pass's cap. Put courses most likely to fill (for example PSY 10B) in the earliest pass that fits.
- After each pass, re-plan from the student's actual registered schedule. The existing schedule is the locked input; the two-phase engine then picks sections for the next course into the remaining gaps.
- Waitlisting requires at least 12 registered UCSB units (registrar). Warn if a plan puts a waitlist before the student reaches 12.
- Pass times are not based on units or class level; they follow tenure (completed non-summer quarters). Ask the student for their pass times; do not guess.
- The schedule of classes is typically published about two weeks before pass times begin.
- Saving to the cart does not enroll. Prerequisites are checked at registration and again before day 1, and students who do not meet them are dropped.

## 6. Likelihood scores

Two separate scores per course, shown as buckets (High, Medium, Low), never as exact percentages.

A. Will it be offered? From enrollment history: which quarters the course ran over the past several academic years. Example: C LIT 36 ran in Winter almost every year and Fall only twice, which drives a "winter-only, take it now or wait a year" warning. GOLD itself says past offerings do not guarantee future ones, so say so in the UI.

B. Will I get a seat? Inputs: fill ratio history (enrolled / max per past quarter), restrictions (majors-only, pass-restricted), current space from `classspaceavailability`, and the student's pass.

Verification step before building: one test call for a past quarter (Winter 2026 = 20261) for C LIT 36, and check that `enrolledTotal` and `maxEnroll` come back. If not, fall back to the GOLD public Course Enrollment Histories page and treat seat likelihood as low confidence.

Limits: no waitlist-length data in either source.

## 7. GOLD cart assistance

A. Free: a copy-paste prompt for a browser agent the student already has (Claude in Chrome, Gemini in Chrome). Do not assume every student has access. The prompt lists exact courses and section numbers, says "add to cart only", stops at any login wall, and reports anything that does not match.

B. Paid, separate Chrome extension linked to the service (not built; see docs/chrome-extension.md).

Guardrails (both tiers): cart only, the student clicks Enroll; never ask for, store or type a password or Duo code; never change existing enrollments; stop on title mismatch and say "not yet posted" rather than guessing. OPEN: UCSB acceptable-use policy and Terms review before shipping the extension.

## 9. Suggested build order

1. Requirement and GE engine with tests. 2. Scheduling engine. 3. Pass planner. 4. API client with server-side key, caching and fixtures. 5. Recommendations. 6. Likelihood scores. 7. UI. 8. Free cart prompt generator. 9. Extension, only after the policy check.

## 10. Open questions

1. Toggle scope: per quarter or per course.
2. Pass 2 and 3 limit semantics and the L&S cap.
3. Catalog-year handling for GE flags and major sheets.
4. UCSB API data-use terms for stored snapshots.
5. Whether the API returns historical enrollment and maximums.
6. Policy review for the extension; premium pricing.
7. Where professor ratings come from (Rate My Professors terms do not allow scraping).
