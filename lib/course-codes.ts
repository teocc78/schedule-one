/**
 * Course-code helpers shared by the validator, requirements engine and
 * planners. Pure functions, no I/O.
 *
 * Pasted transcripts come in slightly different shapes
 * ("pstat120a", "PSTAT  120A", "Pstat 120A"), and prerequisite lists need
 * "either/or" entries (for example MATH 8 or PSTAT 8). Comparing raw strings
 * made valid schedules fail the prerequisite check, so every comparison goes
 * through these helpers.
 */

/** "pstat120a" -> "PSTAT 120A", "ANTH  W 3" -> "ANTH W 3". */
export function normalizeCode(code: string): string {
  const upper = code.trim().toUpperCase().replace(/\s+/g, " ");
  // Insert a space between the subject letters and the number when missing.
  return upper.replace(/^([A-Z&]+)(\d)/, "$1 $2");
}

export function normalizeCodes(codes: Iterable<string>): Set<string> {
  const out = new Set<string>();
  for (const c of codes) out.add(normalizeCode(c));
  return out;
}

/**
 * A prerequisite entry is either a single course code or alternatives
 * separated by "|" ("MATH 8|PSTAT 8"). Returns true when any alternative
 * is in the completed set (which must already be normalized).
 */
export function prereqSatisfied(prereq: string, completed: Set<string>): boolean {
  return prereq
    .split("|")
    .map(normalizeCode)
    .some((alt) => completed.has(alt));
}

/** Human-readable form of a prerequisite entry: "MATH 8 or PSTAT 8". */
export function describePrereq(prereq: string): string {
  return prereq.split("|").map(normalizeCode).join(" or ");
}
