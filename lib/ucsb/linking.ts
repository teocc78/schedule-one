import type { UcsbClassSection } from "./types";

/**
 * Group a class's sections into lectures and their linked discussions/labs.
 *
 * TODO(UNVERIFIED): the API has no documented parent field
 * (`concurrentCourses` and `secondaryStatus` are candidates). This uses
 * GOLD's section numbering: a lecture's number ends in "00" (e.g. "0100")
 * and its secondaries share the first two digits ("0101", "0102").
 * Replace this one function once real responses show how linking works.
 */
export function linkSections(sections: UcsbClassSection[]): { lecture: UcsbClassSection; secondaries: UcsbClassSection[] }[] {
  const norm = (s: string) => s.trim().padStart(4, "0");
  const lectures = sections.filter((s) => norm(s.section).endsWith("00"));
  if (lectures.length === 0) {
    // No lecture numbering: treat every section as a standalone lecture.
    return sections.map((s) => ({ lecture: s, secondaries: [] }));
  }
  return lectures.map((lec) => {
    const prefix = norm(lec.section).slice(0, 2);
    return {
      lecture: lec,
      secondaries: sections.filter((s) => s !== lec && !norm(s.section).endsWith("00") && norm(s.section).startsWith(prefix)),
    };
  });
}
