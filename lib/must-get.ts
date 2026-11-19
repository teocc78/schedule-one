/**
 * The label on a course the student should get at their first pass time.
 * "MUST GET, EXCLUSIVE TO WINTER" when it only runs in one quarter;
 * "MUST GET IN WINTER" when it matters for another reason (a long chain of
 * prerequisites, or many later courses need it).
 */
export function mustGetLabel(quarter: string, exclusiveTo?: string): string {
  return exclusiveTo ? `MUST GET, EXCLUSIVE TO ${exclusiveTo.toUpperCase()}` : `MUST GET IN ${quarter.toUpperCase()}`;
}
