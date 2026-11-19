/**
 * Rule-based 4-year plan. No AI.
 *
 * 1. Pick the courses still needed: every unfinished course in an "all"
 *    group, and for "choose n" groups the options with the fewest missing
 *    prerequisites. A course counts toward one group only.
 * 2. Add any prerequisite the student hasn't taken.
 * 3. Place courses quarter by quarter (Fall, Winter, Spring; no Summer),
 *    longest prerequisite chain first, within a major-unit cap, respecting
 *    prerequisites, same-quarter co-requisites, class standing and
 *    once-a-year courses.
 * 4. Fill each quarter with GE or elective units to stay full time and reach
 *    180 units.
 * 5. Flag courses that push back graduation if they slip a quarter, and list
 *    backup courses for every quarter.
 *
 * Never logs or stores student data.
 */
import type { CompletedCourse, MajorRequirements, TranscriptData } from "@/types";
import { getCourse, type CatalogCourse, type Quarter } from "@/lib/catalog";
import { normalizeCode } from "@/lib/course-codes";
import { isCredited } from "@/lib/requirements";
import { classStanding, FULL_TIME_MIN_UNITS } from "@/lib/standing";

export const GRADUATION_UNITS = 180;
const STANDING_UNITS = { upper: 90, senior: 135 } as const;
/** A course that unlocks this many remaining major courses is flagged as a must-get. */
const GATEWAY_MIN = 4;

export interface TermId {
  quarter: Quarter;
  year: number;
}

export interface PlannedCourse {
  code: string;
  title: string;
  units: number;
  /** required: listed by the major; choice: picked from a "choose" list; prereq: needed first for another course. */
  why: "required" | "choice" | "prereq";
  /** The requirement it counts toward, or the course it unlocks. */
  countsFor: string;
  /** Taking it later pushes back graduation, or it only runs this quarter. */
  mustGet?: boolean;
  mustGetReason?: string;
  /** Set when the course only runs in one quarter, e.g. "Winter". */
  exclusiveTo?: string;
}

export interface PlanBackup {
  code: string;
  title: string;
  units: number;
  reason: string;
}

export interface PlannedQuarter {
  term: string;
  courses: PlannedCourse[];
  majorUnits: number;
  /** GE or free-elective units to stay full time and reach 180. */
  otherUnits: number;
  totalUnits: number;
  /** Class standing at the start of the quarter. */
  standing: string;
  backups: PlanBackup[];
  notes: string[];
}

export interface FourYearPlan {
  major: string;
  startTerm: string;
  quarters: PlannedQuarter[];
  /** Last planned quarter, or null when the plan can't finish. */
  graduationTerm: string | null;
  unitsEarned: number;
  unitsInProgress: number;
  unitsAtGraduation: number;
  unscheduled: { code: string; reason: string }[];
  assumptions: string[];
}

export interface FourYearOptions {
  /** First quarter to plan. Defaults to the quarter after the transcript's last one, and never before Winter 2027. */
  start?: TermId;
  /** Most major units in one quarter. */
  maxMajorUnits?: number;
  /** Total units to aim for each quarter, GE included. */
  targetUnits?: number;
  maxQuarters?: number;
}

export const termLabel = (t: TermId) => `${t.quarter} ${t.year}`;

export function nextTerm(t: TermId): TermId {
  if (t.quarter === "Fall") return { quarter: "Winter", year: t.year + 1 };
  if (t.quarter === "Winter") return { quarter: "Spring", year: t.year };
  return { quarter: "Fall", year: t.year };
}

const termOrder = (t: TermId) => t.year * 10 + (t.quarter === "Winter" ? 1 : t.quarter === "Spring" ? 2 : 4);

export function parseTerm(label: string): TermId | null {
  const m = label.trim().match(/^(Fall|Winter|Spring|Summer)\s+(\d{4})$/i);
  if (!m) return null;
  const q = (m[1][0].toUpperCase() + m[1].slice(1).toLowerCase()) as Quarter | "Summer";
  // A plan never starts in Summer: treat Summer as just before Fall.
  return q === "Summer" ? { quarter: "Spring", year: Number(m[2]) } : { quarter: q, year: Number(m[2]) };
}

/** The quarter after the latest one on the transcript, and never before Winter 2027. */
export function defaultStart(completed: CompletedCourse[]): TermId {
  let start: TermId = { quarter: "Winter", year: 2027 };
  for (const c of completed) {
    const t = parseTerm(c.quarter ?? "");
    if (t) {
      const after = nextTerm(t);
      if (termOrder(after) > termOrder(start)) start = after;
    }
  }
  return start;
}

interface Choice {
  course: CatalogCourse;
  why: PlannedCourse["why"];
  countsFor: string;
  /** Group alternatives a student could take instead (choice picks only). */
  alternatives: string[];
}

export function buildFourYearPlan(
  requirements: MajorRequirements,
  transcript: Pick<TranscriptData, "completedCourses" | "totalUnitsEarned" | "unitsInProgress">,
  opts: FourYearOptions = {}
): FourYearPlan {
  const maxMajor = opts.maxMajorUnits ?? 16;
  const target = Math.max(FULL_TIME_MIN_UNITS, opts.targetUnits ?? 15);
  const maxQuarters = opts.maxQuarters ?? 15;
  const equivalents = requirements.equivalents ?? {};

  const done = new Set(
    transcript.completedCourses
      .filter((c) => !["F", "NP", "W"].includes(c.grade))
      .map((c) => normalizeCode(c.code))
  );
  const credited = (code: string) => isCredited(code, done, equivalents);
  const unitsEarned = transcript.totalUnitsEarned;
  const unitsInProgress =
    transcript.unitsInProgress ??
    transcript.completedCourses.filter((c) => c.grade === "IP").reduce((n, c) => n + c.units, 0);

  // ── 1. Choose the courses still needed ──────────────────────
  const picks = new Map<string, Choice>();
  const unscheduled: FourYearPlan["unscheduled"] = [];
  const usedDone = new Set<string>();
  const add = (code: string, why: Choice["why"], countsFor: string, alternatives: string[] = []) => {
    const course = getCourse(code);
    const key = normalizeCode(code);
    if (!course) {
      unscheduled.push({ code, reason: "Not in Schedule One's course list yet." });
      return;
    }
    if (!picks.has(key)) picks.set(key, { course, why, countsFor, alternatives });
  };

  /** How many courses the student would still need before taking `code`. */
  const missingCost = (code: string, seen = new Set<string>()): number => {
    const c = getCourse(code);
    if (!c || seen.has(c.code)) return 0;
    seen.add(c.code);
    let cost = 0;
    for (const entry of c.prereqs) {
      const alts = entry.split("|");
      if (alts.some((a) => credited(a) || picks.has(normalizeCode(a)))) continue;
      cost += 1 + Math.min(...alts.map((a) => (getCourse(a) ? missingCost(a, seen) : 0)));
    }
    return cost + (c.consent ? 10 : 0);
  };

  for (const group of requirements.groups) {
    if (group.kind === "all") {
      for (const code of group.courses) if (!credited(code)) add(code, "required", group.name);
      continue;
    }
    const n = group.n ?? 1;
    let have = 0;
    for (const code of group.courses) {
      const key = normalizeCode(code);
      if (have < n && credited(code) && !usedDone.has(key)) {
        usedDone.add(key);
        have++;
      }
    }
    const options = group.courses
      .filter((c) => !credited(c) && !picks.has(normalizeCode(c)) && getCourse(c))
      .map((c, i) => ({ c, i, cost: missingCost(c) }))
      .sort((a, b) => a.cost - b.cost || a.i - b.i)
      .map((o) => o.c);
    const chosen = options.slice(0, Math.max(0, n - have));
    const rest = options.slice(chosen.length);
    for (const code of chosen) add(code, "choice", group.name, rest);
    if (chosen.length < n - have) {
      unscheduled.push({ code: group.name, reason: `Needs ${n - have - chosen.length} more course(s) than Schedule One can plan.` });
    }
  }

  // ── 2. Add missing prerequisites ────────────────────────────
  const queue = [...picks.values()].map((p) => p.course);
  while (queue.length) {
    const c = queue.shift()!;
    for (const entry of c.prereqs) {
      const alts = entry.split("|");
      if (alts.some((a) => credited(a) || picks.has(normalizeCode(a)))) continue;
      const options = alts.filter((a) => getCourse(a)).sort((a, b) => missingCost(a) - missingCost(b));
      if (!options.length) continue; // outside the catalog subset; assume it's handled elsewhere
      add(options[0], "prereq", `Needed first for ${c.code}`);
      queue.push(getCourse(options[0])!);
    }
  }
  for (const [key, p] of [...picks]) {
    if (p.course.consent) {
      picks.delete(key);
      unscheduled.push({ code: p.course.code, reason: "Needs the instructor's consent; plan it with your adviser." });
    }
  }

  // ── 3. Chain length after each course (critical path) ───────
  const dependents = new Map<string, string[]>();
  for (const [key, p] of picks) {
    for (const entry of p.course.prereqs) {
      if (p.course.concurrent.includes(entry)) continue;
      for (const a of entry.split("|")) {
        const ak = normalizeCode(a);
        if (picks.has(ak)) dependents.set(ak, [...(dependents.get(ak) ?? []), key]);
      }
    }
  }
  const depthMemo = new Map<string, number>();
  const depth = (key: string, stack = new Set<string>()): number => {
    if (depthMemo.has(key)) return depthMemo.get(key)!;
    if (stack.has(key)) return 0;
    stack.add(key);
    const d = Math.max(0, ...(dependents.get(key) ?? []).map((k) => 1 + depth(k, stack)));
    stack.delete(key);
    depthMemo.set(key, d);
    return d;
  };
  const chainOf = (key: string): string[] => {
    const next = (dependents.get(key) ?? []).sort((a, b) => depth(b) - depth(a))[0];
    return [picks.get(key)!.course.code, ...(next ? chainOf(next) : [])];
  };

  // ── 4. Place courses quarter by quarter ─────────────────────
  const placedAt = new Map<string, number>();
  const order = [...picks.keys()];
  const quarters: PlannedQuarter[] = [];
  const terms: TermId[] = [];
  let term = opts.start ?? defaultStart(transcript.completedCourses);
  let units = unitsEarned + unitsInProgress;
  const totalMajor = [...picks.values()].reduce((n, p) => n + p.course.units, 0);
  let majorPlaced = 0;

  const entryMet = (entry: string, q: number, concurrentOk: boolean) =>
    entry.split("|").some((a) => {
      const k = normalizeCode(a);
      if (credited(a)) return true;
      const at = placedAt.get(k);
      if (at !== undefined) return at < q || (concurrentOk && at === q);
      // Not planned, not taken and not in the catalog: nothing to wait for.
      return !picks.has(k) && !getCourse(a);
    });
  const eligibleAt = (p: Choice, q: number, t: TermId, unitsAtStart: number) =>
    (!p.course.terms || p.course.terms.includes(t.quarter)) &&
    (!p.course.standing || unitsAtStart >= STANDING_UNITS[p.course.standing]) &&
    p.course.prereqs.every((e) => entryMet(e, q, p.course.concurrent.includes(e)));

  for (let q = 0; q < maxQuarters; q++) {
    const allPlaced = placedAt.size === picks.size;
    if (allPlaced && units >= GRADUATION_UNITS) break;
    const unitsAtStart = units;
    const courses: PlannedCourse[] = [];
    let majorUnits = 0;
    // Spread major courses over the quarters left until 180 units, so the
    // plan isn't all major courses up front and all GE at the end. Courses
    // that start a prerequisite chain or run once a year may go over this.
    const quartersLeft = Math.max(1, Math.ceil((GRADUATION_UNITS - unitsAtStart) / target));
    const majorLeft = totalMajor - majorPlaced;
    const evenCap = Math.min(maxMajor, Math.max(8, Math.ceil(majorLeft / quartersLeft) + 3));
    for (let changed = true; changed; ) {
      changed = false;
      const candidates = order
        .filter((k) => !placedAt.has(k) && eligibleAt(picks.get(k)!, q, term, unitsAtStart))
        .sort((a, b) => {
          const ta = picks.get(a)!.course.terms ? 1 : 0;
          const tb = picks.get(b)!.course.terms ? 1 : 0;
          return tb - ta || depth(b) - depth(a) || order.indexOf(a) - order.indexOf(b);
        });
      for (const k of candidates) {
        const p = picks.get(k)!;
        const urgent = depth(k) > 0 || Boolean(p.course.terms);
        if (majorUnits + p.course.units > (urgent ? maxMajor : evenCap)) continue;
        placedAt.set(k, q);
        majorUnits += p.course.units;
        courses.push({ code: p.course.code, title: p.course.title, units: p.course.units, why: p.why, countsFor: p.countsFor });
        changed = true;
        break; // re-check: a lecture can open its same-quarter lab
      }
    }
    majorPlaced += majorUnits;
    const majorLeftAfter = totalMajor - majorPlaced;
    const generalNeeded = Math.max(0, GRADUATION_UNITS - unitsAtStart - majorUnits - majorLeftAfter);
    let otherUnits = Math.min(generalNeeded, Math.max(0, target - majorUnits));
    const finalQuarter = majorLeftAfter === 0 && unitsAtStart + majorUnits + otherUnits >= GRADUATION_UNITS;
    const notes: string[] = [];
    if (!finalQuarter && majorUnits + otherUnits < FULL_TIME_MIN_UNITS) {
      otherUnits = FULL_TIME_MIN_UNITS - majorUnits;
    }
    const total = majorUnits + otherUnits;
    if (total < FULL_TIME_MIN_UNITS && total > 0) {
      notes.push(`Only ${total} units left for your last quarter, which is part time. Check with financial aid if that matters for you.`);
    }
    const before = classStanding(unitsAtStart);
    const after = classStanding(unitsAtStart + total);
    if (after !== before && q < maxQuarters - 1) notes.push(`You reach ${after} standing after this quarter.`);

    quarters.push({ term: termLabel(term), courses, majorUnits, otherUnits, totalUnits: total, standing: before, backups: [], notes });
    terms.push(term);
    units += total;
    term = nextTerm(term);
    if (courses.length === 0 && otherUnits === 0) break;
  }
  // Trim empty trailing quarters.
  while (quarters.length && quarters[quarters.length - 1].totalUnits === 0) {
    quarters.pop();
    terms.pop();
  }

  for (const [k, p] of picks) {
    if (!placedAt.has(k)) unscheduled.push({ code: p.course.code, reason: "Prerequisites or class standing couldn't be met in the plan." });
  }

  // ── 5. Must-get flags and backups ───────────────────────────
  const lastQ = quarters.length - 1;
  const unlockMemo = new Map<string, Set<string>>();
  const unlocks = (key: string): Set<string> => {
    if (unlockMemo.has(key)) return unlockMemo.get(key)!;
    const out = new Set<string>();
    unlockMemo.set(key, out);
    for (const d of dependents.get(key) ?? []) {
      out.add(d);
      for (const x of unlocks(d)) out.add(x);
    }
    return out;
  };
  for (let q = 0; q < quarters.length; q++) {
    const quarter = quarters[q];
    for (const pc of quarter.courses) {
      const k = normalizeCode(pc.code);
      const course = picks.get(k)!.course;
      const d = depth(k);
      if (course.terms && course.terms.length === 1) {
        pc.mustGet = true;
        pc.mustGetReason = `Only runs in ${course.terms[0]}. Missing it means waiting a full year.`;
        pc.exclusiveTo = course.terms[0];
      } else if (d >= 1 && q + d >= lastQ) {
        pc.mustGet = true;
        pc.mustGetReason = `Starts a chain of ${d + 1} courses (${chainOf(k).join(" → ")}). Taking it later pushes back graduation.`;
      } else if (unlocks(k).size >= GATEWAY_MIN) {
        pc.mustGet = true;
        pc.mustGetReason = `${unlocks(k).size} of your remaining major courses need it first (${chainOf(k).join(" → ")}). Get it at your first pass time.`;
      }
    }
    quarter.backups = backupsFor(q, terms[q], quarter);
  }

  function backupsFor(q: number, t: TermId, quarter: PlannedQuarter): PlanBackup[] {
    const out: PlanBackup[] = [];
    const seen = new Set(quarter.courses.map((c) => normalizeCode(c.code)));
    const ready = (code: string) => {
      const c = getCourse(code);
      return (
        c &&
        !c.consent &&
        (!c.terms || c.terms.includes(t.quarter)) &&
        c.prereqs.every((e) => entryMet(e, q, false))
      );
    };
    // Other options for the same requirement.
    for (const pc of quarter.courses) {
      const p = picks.get(normalizeCode(pc.code))!;
      if (p.why !== "choice") continue;
      for (const alt of p.alternatives) {
        const ak = normalizeCode(alt);
        if (seen.has(ak) || picks.has(ak) || !ready(alt)) continue;
        const c = getCourse(alt)!;
        out.push({ code: c.code, title: c.title, units: c.units, reason: `Counts for ${p.countsFor} instead of ${pc.code}.` });
        seen.add(ak);
        break;
      }
    }
    // Later courses that could move up if a class fills.
    for (const [k, at] of placedAt) {
      if (out.length >= 4) break;
      if (at <= q || seen.has(k)) continue;
      const p = picks.get(k)!;
      if (!ready(p.course.code)) continue;
      out.push({
        code: p.course.code,
        title: p.course.title,
        units: p.course.units,
        reason: `Planned for ${quarters[at].term}; take it now if a class here is full.`,
      });
      seen.add(k);
    }
    if (out.length === 0 && quarter.courses.length > 0) {
      const first = quarter.courses[0].code;
      out.push({
        code: "GE",
        title: "Any open GE or elective",
        units: 4,
        reason: `Nothing else in your major is open to you yet. If ${first} fills, join the waitlist and keep a GE so you stay full time.`,
      });
    }
    return out.slice(0, 4);
  }

  const allPlaced = [...picks.keys()].every((k) => placedAt.has(k));
  const unitsAtGraduation = unitsEarned + unitsInProgress + quarters.reduce((n, q) => n + q.totalUnits, 0);
  const finished = allPlaced && unitsAtGraduation >= GRADUATION_UNITS && quarters.length > 0;

  return {
    major: requirements.major,
    startTerm: quarters[0]?.term ?? termLabel(opts.start ?? defaultStart(transcript.completedCourses)),
    quarters,
    graduationTerm: finished ? quarters[quarters.length - 1].term : null,
    unitsEarned,
    unitsInProgress,
    unitsAtGraduation,
    unscheduled,
    assumptions: [
      "Courses are assumed to run every Fall, Winter and Spring unless marked otherwise. Many upper-division courses run once a year, so check GOLD.",
      "Summer isn't planned. A summer course can move your graduation earlier.",
      "GE and free electives are shown as units. UCSB needs 180 units, your college's GE areas and the writing requirement to graduate.",
      "Minimum grades, placement exams, AP credit and major-only restrictions aren't checked. Courses in progress are counted as passed.",
    ],
  };
}
