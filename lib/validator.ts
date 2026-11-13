import type {
  ScheduledCourse,
  StudentConstraints,
  ValidationResult,
  ValidationCheck,
  CompletedCourse,
} from "@/types";

// ── Time helpers ──────────────────────────────────────────────

function toMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function timesOverlap(
  a: { startTime: string; endTime: string },
  b: { startTime: string; endTime: string }
): boolean {
  return (
    toMinutes(a.startTime) < toMinutes(b.endTime) &&
    toMinutes(b.startTime) < toMinutes(a.endTime)
  );
}

// ── Individual checks ─────────────────────────────────────────

function checkNoTimeConflicts(courses: ScheduledCourse[]): string[] {
  const errors: string[] = [];
  for (let i = 0; i < courses.length; i++) {
    for (let j = i + 1; j < courses.length; j++) {
      const a = courses[i].offering.schedule;
      const b = courses[j].offering.schedule;
      const sharedDays = a.days.filter((d) => b.days.includes(d));
      if (sharedDays.length > 0 && timesOverlap(a, b)) {
        errors.push(
          `Time conflict: ${courses[i].offering.code} and ${courses[j].offering.code} overlap on ${sharedDays.join(",")}`
        );
      }
    }
  }
  return errors;
}

function checkUnitLimit(
  courses: ScheduledCourse[],
  constraints: StudentConstraints
): string[] {
  const total = courses.reduce((sum, c) => sum + c.offering.units, 0);
  const errors: string[] = [];
  if (total < constraints.minUnits) {
    errors.push(`Total units (${total}) is below minimum (${constraints.minUnits})`);
  }
  if (total > constraints.maxUnits) {
    errors.push(`Total units (${total}) exceeds maximum (${constraints.maxUnits})`);
  }
  return errors;
}

function checkPrerequisites(
  courses: ScheduledCourse[],
  completed: CompletedCourse[]
): string[] {
  const completedCodes = new Set(completed.map((c) => c.code));
  const errors: string[] = [];
  for (const sc of courses) {
    for (const prereq of sc.offering.prerequisites) {
      if (!completedCodes.has(prereq)) {
        errors.push(
          `${sc.offering.code} requires ${prereq}, which has not been completed`
        );
      }
    }
  }
  return errors;
}

function checkNoDuplicateRequirements(courses: ScheduledCourse[]): string[] {
  const errors: string[] = [];
  const groupCounts: Record<string, string[]> = {};
  for (const sc of courses) {
    for (const gid of sc.satisfies) {
      groupCounts[gid] = [...(groupCounts[gid] ?? []), sc.offering.code];
    }
  }
  for (const [gid, codes] of Object.entries(groupCounts)) {
    if (codes.length > 1) {
      errors.push(
        `Requirement group "${gid}" is covered by multiple courses: ${codes.join(", ")} — possible over-counting`
      );
    }
  }
  return errors;
}

function checkConstraints(
  courses: ScheduledCourse[],
  constraints: StudentConstraints
): string[] {
  const errors: string[] = [];

  for (const sc of courses) {
    const { days, startTime } = sc.offering.schedule;

    // Free days
    for (const freeDay of constraints.freeDays) {
      if (days.includes(freeDay)) {
        errors.push(
          `${sc.offering.code} is scheduled on ${freeDay}, which should be free`
        );
      }
    }

    // No-earlier-than constraint
    if (
      constraints.noClassBefore &&
      toMinutes(startTime) < toMinutes(constraints.noClassBefore)
    ) {
      errors.push(
        `${sc.offering.code} starts at ${startTime}, before the requested start time ${constraints.noClassBefore}`
      );
    }

    // Must-exclude courses
    if (constraints.mustExclude.includes(sc.offering.code)) {
      errors.push(`${sc.offering.code} is in the excluded courses list`);
    }
  }

  // Must-include courses
  const scheduledCodes = new Set(courses.map((sc) => sc.offering.code));
  for (const code of constraints.mustInclude) {
    if (!scheduledCodes.has(code)) {
      errors.push(`${code} was requested but is not in the schedule`);
    }
  }

  return errors;
}

// ── Main validator ────────────────────────────────────────────

export function validateSchedule(
  courses: ScheduledCourse[],
  constraints: StudentConstraints,
  completed: CompletedCourse[]
): ValidationResult {
  const passedChecks: ValidationCheck[] = [];
  const allErrors: string[] = [];

  const conflictErrors = checkNoTimeConflicts(courses);
  if (conflictErrors.length === 0) passedChecks.push("no_time_conflicts");
  else allErrors.push(...conflictErrors);

  const unitErrors = checkUnitLimit(courses, constraints);
  if (unitErrors.length === 0) passedChecks.push("unit_limit");
  else allErrors.push(...unitErrors);

  const prereqErrors = checkPrerequisites(courses, completed);
  if (prereqErrors.length === 0) passedChecks.push("prerequisites_met");
  else allErrors.push(...prereqErrors);

  const dupErrors = checkNoDuplicateRequirements(courses);
  if (dupErrors.length === 0) passedChecks.push("no_duplicate_requirements");
  else allErrors.push(...dupErrors);

  const constraintErrors = checkConstraints(courses, constraints);
  if (constraintErrors.length === 0) passedChecks.push("respects_constraints");
  else allErrors.push(...constraintErrors);

  return {
    valid: allErrors.length === 0,
    passedChecks,
    errors: allErrors,
  };
}
