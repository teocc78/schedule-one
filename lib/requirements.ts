import type {
  MajorRequirements,
  CompletedCourse,
  CourseOffering,
} from "@/types";
import { normalizeCode, normalizeCodes, prereqSatisfied } from "@/lib/course-codes";

export interface RequirementStatus {
  groupId: string;
  groupName: string;
  satisfied: boolean;
  completedCourses: string[];
  remainingCourses: string[];
  /** For choose_n: how many more still needed */
  stillNeeded: number;
}

/**
 * True when the course, or a course that counts in its place (for example
 * MATH 34A for MATH 3A), is in the completed set. `done` must be normalized.
 */
export function isCredited(
  code: string,
  done: Set<string>,
  equivalents: Record<string, string[]> = {}
): boolean {
  const key = normalizeCode(code);
  if (done.has(key)) return true;
  const alts = Object.entries(equivalents).find(([k]) => normalizeCode(k) === key)?.[1] ?? [];
  return alts.some((a) => done.has(normalizeCode(a)));
}

/**
 * Given a major's requirements and the student's completed courses,
 * returns a status object for each requirement group.
 */
export function computeRequirementStatus(
  requirements: MajorRequirements,
  completed: CompletedCourse[]
): RequirementStatus[] {
  const completedCodes = normalizeCodes(completed.map((c) => c.code));
  const credited = (c: string) => isCredited(c, completedCodes, requirements.equivalents);

  return requirements.groups.map((group) => {
    const completedInGroup = group.courses.filter(credited);
    const remaining = group.courses.filter((c) => !credited(c));

    if (group.kind === "all") {
      return {
        groupId: group.id,
        groupName: group.name,
        satisfied: remaining.length === 0,
        completedCourses: completedInGroup,
        remainingCourses: remaining,
        stillNeeded: remaining.length,
      };
    }

    // choose_n
    const n = group.n ?? 1;
    const stillNeeded = Math.max(0, n - completedInGroup.length);
    return {
      groupId: group.id,
      groupName: group.name,
      satisfied: completedInGroup.length >= n,
      completedCourses: completedInGroup,
      remainingCourses: remaining,
      stillNeeded,
    };
  });
}

/**
 * Returns only the groups that are not yet fully satisfied.
 */
export function getRemainingGroups(
  requirements: MajorRequirements,
  completed: CompletedCourse[]
): RequirementStatus[] {
  return computeRequirementStatus(requirements, completed).filter(
    (s) => !s.satisfied
  );
}

/**
 * Given a list of offerings and remaining requirement groups,
 * returns offerings that satisfy at least one remaining requirement,
 * with prerequisites already met by the student.
 */
export function getEligibleOfferings(
  offerings: CourseOffering[],
  remainingGroups: RequirementStatus[],
  completed: CompletedCourse[]
): CourseOffering[] {
  const completedCodes = normalizeCodes(completed.map((c) => c.code));
  const remainingGroupIds = new Set(remainingGroups.map((g) => g.groupId));
  // Courses still needed across all groups
  const remainingCourseCodes = normalizeCodes(
    remainingGroups.flatMap((g) => g.remainingCourses)
  );

  return offerings.filter((offering) => {
    // Never suggest a course the student already finished.
    if (completedCodes.has(normalizeCode(offering.code))) return false;

    const prereqsMet = offering.prerequisites.every((p) =>
      prereqSatisfied(p, completedCodes)
    );
    if (!prereqsMet) return false;

    // Course appears in a remaining requirement group
    const satisfiesRemaining =
      remainingCourseCodes.has(normalizeCode(offering.code)) ||
      (offering.requirementGroups ?? []).some((gid) =>
        remainingGroupIds.has(gid)
      );

    return satisfiesRemaining;
  });
}

/**
 * Given a set of scheduled course codes, determine which requirement groups
 * each course satisfies, respecting choose_n constraints.
 */
export function mapCoursesToGroups(
  courseCodes: string[],
  requirements: MajorRequirements
): Record<string, string[]> {
  // Returns { courseCode -> [groupId, ...] }
  const result: Record<string, string[]> = {};

  for (const group of requirements.groups) {
    const matchingCodes = courseCodes.filter((c) => group.courses.includes(c));

    if (group.kind === "all") {
      for (const code of matchingCodes) {
        result[code] = [...(result[code] ?? []), group.id];
      }
    } else {
      // choose_n: assign up to n courses
      const n = group.n ?? 1;
      for (const code of matchingCodes.slice(0, n)) {
        result[code] = [...(result[code] ?? []), group.id];
      }
    }
  }

  return result;
}

/**
 * How many more courses each unsatisfied group can absorb this quarter.
 * Used by the validator so that two electives toward a "choose 5" group
 * are not mistaken for over-counting.
 */
export function groupCapacity(remainingGroups: RequirementStatus[]): Record<string, number> {
  const cap: Record<string, number> = {};
  for (const g of remainingGroups) cap[g.groupId] = g.stillNeeded;
  return cap;
}

/**
 * Deterministically decide which remaining group(s) each scheduled course
 * counts toward, filling each group at most up to what it still needs.
 * Requirement counting always happens here, in code.
 */
export function assignSatisfies(
  offerings: CourseOffering[],
  remainingGroups: RequirementStatus[]
): Map<string, string[]> {
  const left = groupCapacity(remainingGroups);
  const out = new Map<string, string[]>();
  for (const o of offerings) {
    const code = normalizeCode(o.code);
    const groups: string[] = [];
    for (const g of remainingGroups) {
      const listed =
        g.remainingCourses.some((c) => normalizeCode(c) === code) ||
        (o.requirementGroups ?? []).includes(g.groupId);
      if (listed && (left[g.groupId] ?? 0) > 0) {
        groups.push(g.groupId);
        left[g.groupId] -= 1;
      }
    }
    out.set(o.code, groups);
  }
  return out;
}
