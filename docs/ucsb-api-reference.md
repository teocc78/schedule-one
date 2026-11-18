# UCSB Academic Curriculums API v3: reference for Schedule One

From a read of developer.ucsb.edu on Nov 17, 2026 (no API calls made). Anything marked UNVERIFIED was not confirmed on the portal. Account details were removed because this repository is public.

## Access
- Academic Curriculums v3 access is approved for the project. No consumer key exists yet: an app must be created on the developer portal to get the `ucsb-api-key` value.
- No rate limits or quotas are posted.

## Endpoints (Swagger 2.0)
Base URL `https://api.ucsb.edu/academics/curriculums` (https only). Auth header `ucsb-api-key`; optional `ucsb-api-version` (default 3.0). Spec: https://developer.ucsb.edu/sites/default/files/openapi/curriculums-v3_0_0.yaml

| Method | Path | Purpose |
|---|---|---|
| GET | /v3/classes/{quarter}/{enrollcode} | One class by quarter and enroll code |
| GET | /v3/classes/search | Search classes (quarter required) |
| GET | /v3/classsection/{quarter}/{enrollcode} | One class by enroll code (same shape as /classes) |
| GET | /v3/classspaceavailability/{quarter} | Live seat counts, one class or whole quarter |
| GET | /v3/finals | Final exam info (quarter and enrollCode both required) |

## Parameters
- `quarter`: YYYYQ. 1 = Winter, 2 = Spring confirmed. Summer and Fall digits UNVERIFIED (see `lib/ucsb/quarter.ts`).
- `/classes/search` filters: `courseId` (13 chars, space-padded; padding UNVERIFIED), `enrollCode`, `session`, `subjectCode`, `deptCode`, `objLevelCode`, `title`, `areas` (**no allowed values listed; not used**), `openSections`, `nonRestriction`, `nonPreReq`, `minUnits` + `maxUnits`, `minStartTime`, `maxStartTime` (int, 900 = 9am), `days`, `instructor`, `pageNumber`, `pageSize` (max 500), `includeClassSections`.

## Response fields
Class: quarter, courseId, title, description, units (`unitsFixed`, `unitsVariableHigh/Low`), `instructionType`, `instructionTypeSecondary`, `generalEducation[] {geCode, geCollege}`, `classSections[]`.

Section: enrollCode, section, classClosed, courseCancelled, secondaryStatus, `enrolledTotal`, `maxEnroll`, approvals, restriction fields, concurrentCourses[], `timeLocations[] {room, building, days, beginTime, endTime}`, `instructors[]`.

Lecture-to-section linking has no documented parent field. `lib/ucsb/linking.ts` uses GOLD section numbering (lecture `0100`, its sections `0101`, `0102`); UNVERIFIED.

Errors: 400 `{message, modelState}`, 404 `{message}`. A bad key returns "Invalid ApiKey for given resource" (status not documented).

## Rules for student apps (from the portal)
Keys never in repos; HTTPS; servers in the US; do not store student information returned by UCSB APIs (course data is fine); state "not an official UCSB application" in the footer; caching allowed "for limited periods" (duration not given).

## Open items
1. Create the app and get the consumer key; set `UCSB_API_KEY` in Vercel (server-side only).
2. Ask UCSB about course-data storage duration, `areas` values, Summer/Fall digits, rate limits, and whether the faculty-sponsor/open-source rule applies.
3. With a key, capture two fixtures once (C LIT 36 in 20261 for enrolledTotal/maxEnroll history; PSY 10B in 20271) and replace the synthetic ones in `data/ucsb-fixtures/`.
4. Confirm Vercel functions run in a US region (Vercel's default, iad1, is US).
