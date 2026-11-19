import type {
  ScheduledCourse,
  StudentConstraints,
  ValidationResult,
  ValidationCheck,
  CompletedCourse,
} from "@/types";
import { normalizeCode, normalizeCodes, prereqSatisfied, describePrereq } from "@/lib/course-codes";

export interface ValidateOptions {
  /**
   * How many more courses each requirement group can still absorb
   * (choose_n: n minus completed; all: courses still missing).
   * When given, a group is only flagged as over-counted if more scheduled
   * courses claim it than it still needs.
   */
  groupCapacity?: Record<string, number>;
}

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
  const completedCodes = normalizeCodes(completed.map((c) => c.code));
  const errors: string[] = [];
  for (const sc of courses) {
    if (completedCodes.has(normalizeCode(sc.offering.code))) {
      errors.push(`${sc.offering.code} has already been completed`);
    }
    for (const prereq of sc.offering.prerequisites) {
      if (!prereqSatisfied(prereq, completedCodes)) {
        errors.push(
          `${sc.offering.code} requires ${describePrereq(prereq)}, which has not been completed`
        );
      }
    }
  }
  return errors;
}

function checkNoDuplicateRequirements(
  courses: ScheduledCourse[],
  groupCapacity?: Record<string, number>
): string[] {
  const errors: string[] = [];

  // The same course twice is always wrong.
  const seen = new Set<string>();
  for (const sc of courses) {
    const code = normalizeCode(sc.offering.code);
    if (seen.has(code)) errors.push(`${sc.offering.code} appears more than once`);
    seen.add(code);
  }

  // Several courses may legitimately count toward one group (two PSTAT
  // electives toward a "choose 5" group). Only flag a group when more
  // courses claim it than it still needs. Without capacity data there is
  // nothing to compare against, so no group is flagged.
  //
  // Bug fixed here: this used to flag ANY group claimed by two courses,
  // which rejected normal elective-heavy schedules and made /api/plan
  // return 422 "Could not produce a valid schedule" at random.
  if (groupCapacity) {
    const groupCounts: Record<string, string[]> = {};
    for (const sc of courses) {
      for (const gid of sc.satisfies) {
        groupCounts[gid] = [...(groupCounts[gid] ?? []), sc.offering.code];
      }
    }
    for (const [gid, codes] of Object.entries(groupCounts)) {
      const cap = groupCapacity[gid] ?? 0;
      if (codes.length > cap) {
        errors.push(
          `Requirement group "${gid}" only needs ${cap} more course(s) but ${codes.length} are counted toward it: ${codes.join(", ")}`
        );
      }
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
    const { days, startTime, endTime } = sc.offering.schedule;

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

    // No-later-than constraint
    if (
      constraints.noClassAfter &&
      toMinutes(endTime) > toMinutes(constraints.noClassAfter)
    ) {
      errors.push(
        `${sc.offering.code} ends at ${endTime}, after the requested end time ${constraints.noClassAfter}`
      );
    }

    // Must-exclude courses
    if (constraints.mustExclude.map(normalizeCode).includes(normalizeCode(sc.offering.code))) {
      errors.push(`${sc.offering.code} is in the excluded courses list`);
    }
  }

  // Must-include courses
  const scheduledCodes = normalizeCodes(courses.map((sc) => sc.offering.code));
  for (const code of constraints.mustInclude) {
    if (!scheduledCodes.has(normalizeCode(code))) {
      errors.push(`${code} was requested but is not in the schedule`);
    }
  }

  return errors;
}

// ── Main validator ────────────────────────────────────────────

export function validateSchedule(
  courses: ScheduledCourse[],
  constraints: StudentConstraints,
  completed: CompletedCourse[],
  options: ValidateOptions = {}
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

  const dupErrors = checkNoDuplicateRequirements(courses, options.groupCapacity);
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
