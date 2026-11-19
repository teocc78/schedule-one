/** True when an instructor name is worth showing (not blank, TBA or Staff). */
export function showInstructor(name?: string | null): name is string {
  if (!name) return false;
  return !/^(tba|tbd|staff)$/i.test(name.trim());
}
