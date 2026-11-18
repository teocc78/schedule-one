/**
 * Two-phase quarter scheduling engine (spec sections 1 and 2). Pure functions.
 *
 * Phase 1 picks lectures (mandatory courses first, then electives/GE). A
 * lecture is only kept if at least one of its linked discussion/lab
 * sections still fits ("feasibility check"); otherwise it is marked
 * "no workable section" and dropped.
 * Phase 2 places each lecture's section into the gaps the lectures left.
 * A section can never move a lecture.
 *
 * The priority toggle (time slot vs professor rating) only REORDERS options
 * that already work. Conflicts are never traded for a better time or a
 * better-rated professor. Hard calendar blocks are treated like conflicts;
 * soft blocks and the back-to-back buffer only affect ranking.
 */

export type Day = "M" | "T" | "W" | "R" | "F";
export const DAYS: Day[] = ["M", "T", "W", "R", "F"];

export interface Meeting {
  days: Day[];
  /** "HH:MM", 24-hour */
  start: string;
  end: string;
}

export type SectionKind = "LEC" | "DIS" | "LAB";
export type SeatStatus = "open" | "full" | "waitlist" | "closed" | "cancelled" | "unknown";

export interface Section {
  enrollCode: string;
  /** UCSB section number, e.g. "0100" (lecture) or "0101" (its discussion) */
  section: string;
  kind: SectionKind;
  meetings: Meeting[];
  instructor?: string;
  /** Professor rating if a ratings source exists (sections usually have none). */
  rating?: number | null;
  status?: SeatStatus;
  enrolled?: number;
  capacity?: number;
  restrictions?: string[];
}

export interface LectureOption {
  lecture: Section;
  /** Linked discussions/labs. Empty means the lecture has none. */
  sections: Section[];
}

export interface CourseSections {
  courseId: string;
  title: string;
  units: number;
  /** Mandatory courses are scheduled before electives in Phase 1. */
  mandatory: boolean;
  options: LectureOption[];
  geCodes?: string[];
}

export interface TimeBlock {
  day: Day;
  start: string;
  end: string;
  kind: "hard" | "soft";
  label?: string;
}

export interface PreferredWindow {
  start: string;
  end: string;
  days?: Day[];
}

/** OPEN in the spec: whether the toggle applies per quarter or per course. Per quarter for now. */
export type Priority = "time" | "professor";

export interface PlannerSettings {
  priority: Priority;
  blocks: TimeBlock[];
  preferredWindows?: PreferredWindow[];
  /** Minimum minutes between back-to-back classes. A preference, not a rule. */
  bufferMinutes?: number;
}

export interface Pick {
  courseId: string;
  lecture: Section;
  section: Section | null;
}

export interface SectionCheck {
  courseId: string;
  enrollCode: string;
  kind: SectionKind;
  fits: boolean;
  /** Names of what it collides with: "EEMB 7 LEC", "Hard block: Work" */
  conflictsWith: string[];
}

export interface PlanOutcome {
  picks: Pick[];
  /** Courses that could not be placed and why. */
  unplaced: { courseId: string; reason: string }[];
  /** Every lecture/section the engine rejected, with the reason. */
  rejected: { courseId: string; enrollCode: string; kind: SectionKind; reason: string }[];
  notes: string[];
}

// ── time helpers ─────────────────────────────────────────────

export function toMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function overlapMinutes(a: { start: string; end: string }, b: { start: string; end: string }): number {
  return Math.max(0, Math.min(toMinutes(a.end), toMinutes(b.end)) - Math.max(toMinutes(a.start), toMinutes(b.start)));
}

export function meetingsOverlap(a: Meeting, b: Meeting): boolean {
  return a.days.some((d) => b.days.includes(d)) && overlapMinutes(a, b) > 0;
}

export function sectionsConflict(a: Section, b: Section): boolean {
  return a.meetings.some((ma) => b.meetings.some((mb) => meetingsOverlap(ma, mb)));
}

function hitsBlock(s: Section, block: TimeBlock): boolean {
  return s.meetings.some((m) => m.days.includes(block.day) && overlapMinutes(m, block) > 0);
}

interface Occupant {
  label: string;
  section: Section;
}

function occupantsOf(picks: Pick[]): Occupant[] {
  const out: Occupant[] = [];
  for (const p of picks) {
    out.push({ label: `${p.courseId} ${p.lecture.kind}`, section: p.lecture });
    if (p.section) out.push({ label: `${p.courseId} ${p.section.kind}`, section: p.section });
  }
  return out;
}

/** Everything a section collides with: occupied slots and hard blocks. */
export function conflictsFor(s: Section, occupied: Occupant[], blocks: TimeBlock[]): string[] {
  const hits: string[] = [];
  for (const o of occupied) if (sectionsConflict(s, o.section)) hits.push(o.label);
  for (const b of blocks) if (b.kind === "hard" && hitsBlock(s, b)) hits.push(`Hard block${b.label ? `: ${b.label}` : ""}`);
  return hits;
}

// ── ranking ──────────────────────────────────────────────────

/** Lower is better. Soft-block overlap, short gaps, and time outside preferred windows. */
export function timePenalty(s: Section, settings: PlannerSettings, occupied: Occupant[]): number {
  let p = 0;
  for (const b of settings.blocks) {
    if (b.kind !== "soft") continue;
    for (const m of s.meetings) if (m.days.includes(b.day)) p += overlapMinutes(m, b);
  }
  const windows = settings.preferredWindows ?? [];
  if (windows.length) {
    for (const m of s.meetings) {
      for (const d of m.days) {
        const inside = windows
          .filter((w) => !w.days || w.days.includes(d))
          .reduce((best, w) => Math.max(best, overlapMinutes(m, w)), 0);
        p += toMinutes(m.end) - toMinutes(m.start) - inside;
      }
    }
  }
  const buf = settings.bufferMinutes ?? 0;
  if (buf > 0) {
    for (const m of s.meetings) {
      for (const o of occupied) {
        for (const om of o.section.meetings) {
          if (!m.days.some((d) => om.days.includes(d))) continue;
          const gap = Math.min(
            Math.abs(toMinutes(m.start) - toMinutes(om.end)),
            Math.abs(toMinutes(om.start) - toMinutes(m.end))
          );
          if (gap < buf) p += (buf - gap) * 2;
        }
      }
    }
  }
  return p;
}

function ratingOf(s: Section): number {
  return typeof s.rating === "number" ? s.rating : -1;
}

/** Order options by the student's toggle. Conflicts are filtered elsewhere, never traded. */
export function rankSections<T extends Section>(
  list: T[],
  settings: PlannerSettings,
  occupied: Occupant[],
  usesRatings: boolean
): T[] {
  const scored = list.map((s, i) => ({ s, i, time: timePenalty(s, settings, occupied), rating: ratingOf(s) }));
  scored.sort((a, b) => {
    if (settings.priority === "professor" && usesRatings) {
      return b.rating - a.rating || a.time - b.time || a.i - b.i;
    }
    return a.time - b.time || b.rating - a.rating || a.i - b.i;
  });
  return scored.map((x) => x.s);
}

// ── the engine ───────────────────────────────────────────────

export interface PlanInput {
  /** Already-registered or locked picks. Never moved. */
  locked: Pick[];
  courses: CourseSections[];
  settings: PlannerSettings;
}

export function planQuarter(input: PlanInput): PlanOutcome {
  const { locked, settings } = input;
  const order = [...input.courses].sort((a, b) => Number(b.mandatory) - Number(a.mandatory));
  const rejected: PlanOutcome["rejected"] = [];
  const rejectedKeys = new Set<string>();
  const reject = (courseId: string, s: Section, reason: string) => {
    const key = `${courseId}|${s.enrollCode}|${reason}`;
    if (rejectedKeys.has(key)) return;
    rejectedKeys.add(key);
    rejected.push({ courseId, enrollCode: s.enrollCode, kind: s.kind, reason });
  };

  const lockedOcc = occupantsOf(locked);
  const notes: string[] = [];
  if (settings.priority === "professor") {
    notes.push(
      "Professor mode ranks lectures by rating. Discussion and lab sections are usually led by TAs with no ratings, so sections are ranked by time fit."
    );
  }

  // Phase 1 + Phase 2 with backtracking. Returns the first full assignment
  // in ranked order, which is the best one by the student's priority.
  type Chosen = { course: CourseSections; option: LectureOption } | { course: CourseSections; option: null };

  function phase2(chosen: Chosen[]): Pick[] | null {
    const lecturesOcc: Occupant[] = [
      ...lockedOcc,
      ...chosen.filter((c) => c.option).map((c) => ({ label: `${c.course.courseId} LEC`, section: c.option!.lecture })),
    ];
    const withSections = chosen.filter((c) => c.option) as { course: CourseSections; option: LectureOption }[];
    const picks: Pick[] = [];

    function place(i: number, occ: Occupant[]): boolean {
      if (i === withSections.length) return true;
      const { course, option } = withSections[i];
      if (option.sections.length === 0) {
        picks.push({ courseId: course.courseId, lecture: option.lecture, section: null });
        if (place(i + 1, occ)) return true;
        picks.pop();
        return false;
      }
      const fitting = option.sections.filter((s) => {
        const hits = conflictsFor(s, occ, settings.blocks);
        if (hits.length) reject(course.courseId, s, `conflicts with ${hits.join(", ")}`);
        return hits.length === 0;
      });
      for (const s of rankSections(fitting, settings, occ, false)) {
        picks.push({ courseId: course.courseId, lecture: option.lecture, section: s });
        if (place(i + 1, [...occ, { label: `${course.courseId} ${s.kind}`, section: s }])) return true;
        picks.pop();
      }
      return false;
    }

    return place(0, lecturesOcc) ? picks : null;
  }

  const unplacedAtBest: PlanOutcome["unplaced"] = [];

  function phase1(i: number, chosen: Chosen[]): Pick[] | null {
    if (i === order.length) return phase2(chosen);
    const course = order[i];
    const occ: Occupant[] = [
      ...lockedOcc,
      ...chosen.filter((c) => c.option).map((c) => ({ label: `${c.course.courseId} LEC`, section: c.option!.lecture })),
    ];
    const usable = course.options.filter((opt) => {
      const hits = conflictsFor(opt.lecture, occ, settings.blocks);
      if (hits.length) {
        reject(course.courseId, opt.lecture, `conflicts with ${hits.join(", ")}`);
        return false;
      }
      if (opt.sections.length === 0) return true;
      // Feasibility check: at least one linked section must still fit.
      const lectureOcc = [...occ, { label: `${course.courseId} LEC`, section: opt.lecture }];
      const anyFits = opt.sections.some((s) => conflictsFor(s, lectureOcc, settings.blocks).length === 0);
      if (!anyFits) reject(course.courseId, opt.lecture, "no workable section");
      return anyFits;
    });
    const rankedLectures = rankSections(
      usable.map((o) => o.lecture),
      settings,
      occ,
      true
    ).map((lec) => usable.find((o) => o.lecture === lec)!);

    for (const option of rankedLectures) {
      const r = phase1(i + 1, [...chosen, { course, option }]);
      if (r) return r;
    }
    // Electives may be left out; mandatory courses may not (unless nothing works at all).
    if (!course.mandatory || rankedLectures.length === 0) {
      const r = phase1(i + 1, [...chosen, { course, option: null }]);
      if (r) {
        unplacedAtBest.push({
          courseId: course.courseId,
          reason: rankedLectures.length === 0 ? "no lecture with a workable section fits" : "does not fit with the higher-priority courses",
        });
        return r;
      }
    }
    return null;
  }

  const result = phase1(0, []);
  if (!result) {
    return {
      picks: [...locked],
      unplaced: order.map((c) => ({ courseId: c.courseId, reason: "no conflict-free combination of the mandatory courses exists" })),
      rejected,
      notes,
    };
  }
  return { picks: [...locked, ...result], unplaced: dedupe(unplacedAtBest), rejected, notes };
}

function dedupe<T extends { courseId: string }>(xs: T[]): T[] {
  const seen = new Set<string>();
  return xs.filter((x) => (seen.has(x.courseId) ? false : (seen.add(x.courseId), true)));
}

// ── open-slot finder, backups, swaps (spec section 2) ───────

export interface OptionRow {
  courseId: string;
  lecture: Section;
  section: Section | null;
  fits: boolean;
  conflictsWith: string[];
  status: SeatStatus;
  restrictions: string[];
  /** Ranking position among fitting rows for this course (0 = best). */
  rank: number;
}

/** Every lecture+section combination of a course, tagged "fits" or "conflicts with X". */
export function optionRows(course: CourseSections, picks: Pick[], settings: PlannerSettings): OptionRow[] {
  const occ = occupantsOf(picks.filter((p) => p.courseId !== course.courseId));
  const rows: OptionRow[] = [];
  for (const opt of course.options) {
    const lecHits = conflictsFor(opt.lecture, occ, settings.blocks);
    const secs: (Section | null)[] = opt.sections.length ? opt.sections : [null];
    for (const s of secs) {
      const secHits = s
        ? conflictsFor(s, [...occ, { label: `${course.courseId} LEC`, section: opt.lecture }], settings.blocks)
        : [];
      const hits = [...new Set([...lecHits, ...secHits])];
      const status = worstStatus(opt.lecture.status, s?.status);
      rows.push({
        courseId: course.courseId,
        lecture: opt.lecture,
        section: s,
        fits: hits.length === 0,
        conflictsWith: hits,
        status,
        restrictions: [...(opt.lecture.restrictions ?? []), ...(s?.restrictions ?? [])],
        rank: 0,
      });
    }
  }
  const statusOrder: Record<SeatStatus, number> = { open: 0, waitlist: 1, unknown: 2, full: 3, closed: 4, cancelled: 5 };
  rows.sort(
    (a, b) =>
      Number(b.fits) - Number(a.fits) ||
      statusOrder[a.status] - statusOrder[b.status] ||
      timePenalty(a.lecture, settings, occ) + (a.section ? timePenalty(a.section, settings, occ) : 0) -
        (timePenalty(b.lecture, settings, occ) + (b.section ? timePenalty(b.section, settings, occ) : 0))
  );
  let r = 0;
  for (const row of rows) row.rank = row.fits ? r++ : -1;
  return rows;
}

function worstStatus(a?: SeatStatus, b?: SeatStatus): SeatStatus {
  const order: SeatStatus[] = ["cancelled", "closed", "full", "waitlist", "unknown", "open"];
  const xs = [a ?? "unknown", b ?? (a ?? "unknown")];
  return order.find((s) => xs.includes(s)) ?? "unknown";
}

/** Quarter fit: every option of every non-locked course, given the locked picks. */
export function findOpenSlots(courses: CourseSections[], picks: Pick[], settings: PlannerSettings): OptionRow[] {
  const lockedIds = new Set(picks.map((p) => p.courseId));
  return courses.filter((c) => !lockedIds.has(c.courseId)).flatMap((c) => optionRows(c, picks, settings));
}

/**
 * Swap view: if course A switches to `alt`, which options of course B fit?
 * Returns B's rows under the hypothetical schedule.
 */
export function swapImpact(
  picks: Pick[],
  alt: Pick,
  courseB: CourseSections,
  settings: PlannerSettings
): OptionRow[] {
  const hypothetical = [...picks.filter((p) => p.courseId !== alt.courseId), alt];
  return optionRows(courseB, hypothetical, settings);
}

export interface FinalExam {
  courseId: string;
  /** ISO date "2027-03-15" */
  date: string;
  start: string;
  end: string;
}

/** Optional second conflict check on final exam times. */
export function finalExamConflicts(finals: FinalExam[]): [string, string][] {
  const out: [string, string][] = [];
  for (let i = 0; i < finals.length; i++) {
    for (let j = i + 1; j < finals.length; j++) {
      const a = finals[i];
      const b = finals[j];
      if (a.date === b.date && overlapMinutes(a, b) > 0) out.push([a.courseId, b.courseId]);
    }
  }
  return out;
}

/** Check one section against picks + blocks (used by the UI and tests). */
export function checkSection(courseId: string, s: Section, picks: Pick[], blocks: TimeBlock[]): SectionCheck {
  const occ = occupantsOf(picks).filter((o) => o.section !== s);
  const hits = conflictsFor(s, occ, blocks);
  return { courseId, enrollCode: s.enrollCode, kind: s.kind, fits: hits.length === 0, conflictsWith: hits };
}
