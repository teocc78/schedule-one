/**
 * Course recommendations (spec section 4): unmet requirements -> courses
 * offered next quarter -> score by open requirements covered -> keep only
 * courses that fit the calendar (via the section 1 engine). Greedy set
 * cover is enough for the MVP. Pure functions.
 */
import type { CourseSections, Pick, PlannerSettings, OptionRow } from "@/lib/schedule-engine";
import { optionRows } from "@/lib/schedule-engine";
import { computeGEStatus, geScore, type GEStatus, type GELine, type GECourse } from "@/lib/ge";
import { normalizeCode } from "@/lib/course-codes";

export interface MajorNeed {
  groupId: string;
  groupName: string;
  stillNeeded: number;
  courses: string[];
}

export interface Recommendation {
  courseId: string;
  title: string;
  units: number;
  fillsGE: GELine[];
  fillsMajor: string[];
  score: number;
  /** The best conflict-free lecture/section given everything picked so far. */
  option: OptionRow;
}

export interface RecommendInput {
  candidates: CourseSections[];
  geStatus: GEStatus;
  majorNeeds?: MajorNeed[];
  picks: Pick[];
  settings: PlannerSettings;
  maxCourses?: number;
  maxUnits?: number;
}

export function recommendCourses(input: RecommendInput): Recommendation[] {
  const maxCourses = input.maxCourses ?? 3;
  const pickedIds = new Set(input.picks.map((p) => normalizeCode(p.courseId)));
  let units = 0;
  const picks = [...input.picks];
  const takenGE: GECourse[] = [];
  const majorLeft = new Map((input.majorNeeds ?? []).map((m) => [m.groupId, m.stillNeeded]));
  const out: Recommendation[] = [];

  let geStatus = input.geStatus;
  const pool = input.candidates.filter((c) => !pickedIds.has(normalizeCode(c.courseId)));

  while (out.length < maxCourses) {
    let best: Recommendation | null = null;
    for (const c of pool) {
      if (out.some((r) => r.courseId === c.courseId)) continue;
      if (input.maxUnits && units + c.units > input.maxUnits) continue;
      const ge = geScore({ code: c.courseId, geCodes: c.geCodes ?? [] }, geStatus);
      const fillsMajor = (input.majorNeeds ?? [])
        .filter((m) => (majorLeft.get(m.groupId) ?? 0) > 0 && m.courses.map(normalizeCode).includes(normalizeCode(c.courseId)))
        .map((m) => m.groupId);
      const score = ge.score + fillsMajor.length;
      if (score === 0) continue;
      const fitting = optionRows(c, picks, input.settings).filter((r) => r.fits);
      if (fitting.length === 0) continue;
      if (!best || score > best.score || (score === best.score && c.units < best.units)) {
        best = { courseId: c.courseId, title: c.title, units: c.units, fillsGE: ge.fills, fillsMajor, score, option: fitting[0] };
      }
    }
    if (!best) break;
    out.push(best);
    units += best.units;
    picks.push({ courseId: best.courseId, lecture: best.option.lecture, section: best.option.section });
    for (const g of best.fillsMajor) majorLeft.set(g, (majorLeft.get(g) ?? 1) - 1);
    const cs = pool.find((c) => c.courseId === best!.courseId)!;
    takenGE.push({ code: cs.courseId, geCodes: cs.geCodes ?? [] });
    geStatus = mergeStatus(input.geStatus, takenGE);
  }
  return out;
}

/** Re-score GE after hypothetically adding courses (keeps progress-check overrides). */
function mergeStatus(base: GEStatus, added: GECourse[]): GEStatus {
  const extra = computeGEStatus(added);
  return {
    areaAssignment: { ...base.areaAssignment, ...extra.areaAssignment },
    lines: base.lines.map((l) => {
      const e = extra.lines.find((x) => x.line === l.line);
      const have = l.have + (e?.have ?? 0);
      return { ...l, have, courses: [...l.courses, ...(e?.courses ?? [])], met: l.met || have >= l.needed };
    }),
  };
}
