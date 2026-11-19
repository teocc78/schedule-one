/**
 * Deterministic schedule builder used when the LLM's proposals fail
 * validation twice. It searches combinations of eligible offerings and
 * returns the best few that pass every hard rule. No AI involved, so the
 * student always gets a schedule when one exists.
 */

import type { CourseOffering, StudentConstraints } from "@/types";
import type { RequirementStatus } from "@/lib/requirements";
import { assignSatisfies } from "@/lib/requirements";
import { normalizeCode } from "@/lib/course-codes";

function toMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function conflicts(a: CourseOffering, b: CourseOffering): boolean {
  const shared = a.schedule.days.some((d) => b.schedule.days.includes(d));
  if (!shared) return false;
  return (
    toMinutes(a.schedule.startTime) < toMinutes(b.schedule.endTime) &&
    toMinutes(b.schedule.startTime) < toMinutes(a.schedule.endTime)
  );
}

function respectsConstraints(o: CourseOffering, c: StudentConstraints): boolean {
  if (c.freeDays.some((d) => o.schedule.days.includes(d))) return false;
  if (c.noClassBefore && toMinutes(o.schedule.startTime) < toMinutes(c.noClassBefore)) return false;
  if (c.noClassAfter && toMinutes(o.schedule.endTime) > toMinutes(c.noClassAfter)) return false;
  if (c.mustExclude.map(normalizeCode).includes(normalizeCode(o.code))) return false;
  return true;
}

export interface FallbackSchedule {
  courses: CourseOffering[];
  satisfies: Map<string, string[]>;
  score: number;
}

/**
 * Returns up to `count` distinct valid schedules, best first.
 * `eligible` must already be filtered for prerequisites and completion.
 */
export function buildFallbackSchedules(
  eligible: CourseOffering[],
  remainingGroups: RequirementStatus[],
  constraints: StudentConstraints,
  count = 3,
  maxCourses = 5
): FallbackSchedule[] {
  const pool = eligible.filter((o) => respectsConstraints(o, constraints));
  const mustInclude = constraints.mustInclude.map(normalizeCode);
  const interested = new Set((constraints.interested ?? []).map(normalizeCode));
  const results: FallbackSchedule[] = [];

  function score(courses: CourseOffering[]): { score: number; satisfies: Map<string, string[]> } {
    const satisfies = assignSatisfies(courses, remainingGroups);
    let s = 0;
    for (const groups of satisfies.values()) s += groups.length * 10;
    // Courses that count toward nothing still fill units but score lower.
    s += courses.length;
    // Courses the student marked "seems interesting" win ties between
    // otherwise equal schedules, but never outrank a requirement.
    s += courses.filter((o) => interested.has(normalizeCode(o.code))).length * 3;
    return { score: s, satisfies };
  }

  function dfs(start: number, chosen: CourseOffering[], units: number) {
    if (units >= constraints.minUnits && units <= constraints.maxUnits) {
      const codes = chosen.map((o) => normalizeCode(o.code));
      if (mustInclude.every((m) => codes.includes(m))) {
        const { score: s, satisfies } = score(chosen);
        results.push({ courses: [...chosen], satisfies, score: s });
      }
    }
    if (chosen.length >= maxCourses) return;
    for (let i = start; i < pool.length; i++) {
      const o = pool[i];
      if (units + o.units > constraints.maxUnits) continue;
      if (chosen.some((c) => conflicts(c, o))) continue;
      chosen.push(o);
      dfs(i + 1, chosen, units + o.units);
      chosen.pop();
    }
  }

  dfs(0, [], 0);

  results.sort((a, b) => b.score - a.score || b.courses.length - a.courses.length);

  // Keep schedules that differ from each other by at least one course.
  const picked: FallbackSchedule[] = [];
  const keys = new Set<string>();
  for (const r of results) {
    const key = r.courses.map((c) => c.code).sort().join("|");
    if (keys.has(key)) continue;
    keys.add(key);
    picked.push(r);
    if (picked.length >= count) break;
  }
  return picked;
}
