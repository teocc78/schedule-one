/**
 * Class standing and full-time rules. Pure functions.
 *
 * UCSB class level by units earned: freshman under 45, sophomore 45 to
 * 89.9, junior 90 to 134.9, senior 135 and up. Full time is 12 units.
 *
 * ASSUMPTION: some departments limit upper-division courses (numbered
 * 100-199) to juniors and seniors. GOLD has the real restriction per
 * section, so the app warns instead of blocking.
 */

export const FULL_TIME_MIN_UNITS = 12;
export const UPPER_DIV_STANDING_UNITS = 90;

export type Standing = "Freshman" | "Sophomore" | "Junior" | "Senior";

export function classStanding(unitsEarned: number): Standing {
  if (unitsEarned >= 135) return "Senior";
  if (unitsEarned >= 90) return "Junior";
  if (unitsEarned >= 45) return "Sophomore";
  return "Freshman";
}

/** True for course numbers 100-199 (e.g. "PSTAT 120A", "ECON 100B"). */
export function isUpperDivision(code: string): boolean {
  const m = code.trim().match(/(\d{1,3})[A-Z]{0,3}$/i);
  if (!m) return false;
  const n = parseInt(m[1], 10);
  return n >= 100 && n < 200;
}

export function hasUpperDivStanding(unitsEarned: number): boolean {
  return unitsEarned >= UPPER_DIV_STANDING_UNITS;
}

export function fullTimeNotice(units: number): string | null {
  return units < FULL_TIME_MIN_UNITS
    ? `This is ${units} units. You need at least ${FULL_TIME_MIN_UNITS} units to count as a full-time student, which can matter for financial aid, housing and visas.`
    : null;
}

/** Notes for a planned quarter: full-time status and upper-division standing. */
export function planNotices(unitsEarned: number, scheduledUnits: number, scheduledCodes: string[]): string[] {
  const notes: string[] = [];
  const ft = fullTimeNotice(scheduledUnits);
  if (ft) notes.push(ft);
  if (!hasUpperDivStanding(unitsEarned)) {
    const upper = scheduledCodes.filter(isUpperDivision);
    if (upper.length) {
      notes.push(
        `You have ${unitsEarned} units (${classStanding(unitsEarned)} standing). Some departments save upper-division seats for juniors and seniors (90+ units), so check ${upper.join(", ")} in GOLD for a class-level restriction.`
      );
    }
  }
  return notes;
}
