/**
 * Pass planner (spec section 5). Pure functions.
 *
 * Official caps from the registrar's pass-times page: Pass 1 = 11.5 units,
 * Pass 2 = 15.5 units, Pass 3 = the college unit limit.
 *
 * ASSUMPTION: caps are cumulative registered units (Pass 2's 15.5 includes
 * what was registered in Pass 1). The spec lists this as OPEN.
 */

/**
 * TODO(spec section 10, Q2): confirm the College of Letters & Science
 * per-quarter limit used in Pass 3. 21.5 is a placeholder, UNVERIFIED.
 */
export const COLLEGE_UNIT_LIMIT_PASS3 = 21.5;

export const PASS_CAPS = [11.5, 15.5, COLLEGE_UNIT_LIMIT_PASS3] as const;

/** Registrar: waitlisting requires at least 12 registered UCSB units. */
export const WAITLIST_MIN_UNITS = 12;

export type FillRisk = "high" | "medium" | "low";

export interface PlannedCourse {
  courseId: string;
  units: number;
  /** How likely the course is to fill before later passes. High goes first. */
  fillRisk: FillRisk;
  /** The student expects to waitlist for this course. */
  waitlist?: boolean;
}

export interface PassAssignment {
  pass: 1 | 2 | 3;
  courses: PlannedCourse[];
  /** Cumulative registered units after this pass. */
  cumulativeUnits: number;
  cap: number;
}

export interface PassPlan {
  passes: PassAssignment[];
  /** Courses that don't fit under any cap. */
  overflow: PlannedCourse[];
  warnings: string[];
}

const riskOrder: Record<FillRisk, number> = { high: 0, medium: 1, low: 2 };

/**
 * Put each course in the earliest pass whose cumulative cap it fits under,
 * most-likely-to-fill first.
 */
export function planPasses(
  courses: PlannedCourse[],
  alreadyRegisteredUnits = 0,
  caps: readonly number[] = PASS_CAPS
): PassPlan {
  const ordered = [...courses].sort((a, b) => riskOrder[a.fillRisk] - riskOrder[b.fillRisk] || b.units - a.units);
  const passes: PassAssignment[] = caps.map((cap, i) => ({
    pass: (i + 1) as 1 | 2 | 3,
    courses: [],
    cumulativeUnits: 0,
    cap,
  }));
  const overflow: PlannedCourse[] = [];
  const warnings: string[] = [];

  // units registered before each pass's additions, cumulative
  const added = passes.map(() => 0);
  const totalThrough = (i: number) => alreadyRegisteredUnits + added.slice(0, i + 1).reduce((a, b) => a + b, 0);

  for (const c of ordered) {
    const idx = passes.findIndex((_, i) => totalThrough(i) + c.units <= caps[i] + 1e-9);
    if (idx === -1) {
      overflow.push(c);
      continue;
    }
    // Waitlisting needs 12 registered units BEFORE the waitlist request.
    if (c.waitlist && totalThrough(idx) < WAITLIST_MIN_UNITS) {
      warnings.push(
        `${c.courseId} is planned as a waitlist in Pass ${idx + 1}, but you'd only have ${totalThrough(idx)} registered units then. Waitlisting needs at least ${WAITLIST_MIN_UNITS}.`
      );
    }
    added[idx] += c.units;
    passes[idx].courses.push(c);
  }

  passes.forEach((p, i) => (p.cumulativeUnits = totalThrough(i)));
  if (overflow.length) {
    warnings.push(
      `${overflow.map((c) => c.courseId).join(", ")} won't fit under the Pass 3 limit of ${caps[caps.length - 1]} units.`
    );
  }
  return { passes, overflow, warnings };
}

export const PASS_NOTES = [
  "Pass times follow tenure (completed non-summer quarters), not units or class level. Enter yours from GOLD; the app doesn't guess.",
  "The schedule of classes is usually published about two weeks before pass times start.",
  "Saving to your GOLD cart does not enroll you. Prerequisites are checked at registration and again before the first day.",
  "After each pass, re-plan from what you actually registered for.",
];
