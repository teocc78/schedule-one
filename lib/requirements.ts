import type {
  MajorRequirements,
  CompletedCourse,
  RequirementGroup,
  CourseOffering,
} from "@/types";

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
 * Given a major's requirements and the student's completed courses,
 * returns a status object for each requirement group.
 */
export function computeRequirementStatus(
  requirements: MajorRequirements,
  completed: CompletedCourse[]
): RequirementStatus[] {
  const completedCodes = new Set(completed.map((c) => c.code));

  return requirements.groups.map((group) => {
    const completedInGroup = group.courses.filter((c) => completedCodes.has(c));
    const remaining = group.courses.filter((c) => !completedCodes.has(c));

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
  const completedCodes = new Set(completed.map((c) => c.code));
  const remainingGroupIds = new Set(remainingGroups.map((g) => g.groupId));
  // Courses still needed across all groups
  const remainingCourseCodes = new Set(
    remainingGroups.flatMap((g) => g.remainingCourses)
  );

  return offerings.filter((offering) => {
    const prereqsMet = offering.prerequisites.every((p) =>
      completedCodes.has(p)
    );
    if (!prereqsMet) return false;

    // Course appears in a remaining requirement group
    const satisfiesRemaining =
      remainingCourseCodes.has(offering.code) ||
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
