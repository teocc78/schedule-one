/**
 * Past grade distributions, our permitted stand-in for professor ratings.
 * Rate My Professors doesn't allow scraping (see lib/ratings.ts). These come
 * from UCSB Registrar records the Daily Nexus obtained through Public Records
 * Act requests and publishes as free to reuse.
 */
import data from "@/data/grades/recent-grades.json";
import { normalizeCode } from "@/lib/course-codes";

export interface GradeSummary {
  avgGPA: number;
  /** Percent of letter-graded students who got an A-, A or A+ */
  pctA: number;
  students: number;
  quarters: number;
  last: string;
}
export interface CourseGrades {
  all: GradeSummary;
  /** Up to four instructors who taught it most recently */
  instructors: (GradeSummary & { name: string })[];
}

const courses = (data as unknown as { courses: Record<string, CourseGrades> }).courses;
const byCode = new Map(Object.entries(courses).map(([k, v]) => [normalizeCode(k), v]));

export const GRADES_SOURCE = "Daily Nexus, from UCSB Registrar records";
export const GRADES_SOURCE_URL = "https://github.com/dailynexusdata/grades-data";

export function gradesFor(code: string): CourseGrades | null {
  return byCode.get(normalizeCode(code)) ?? null;
}

/** "LANG B J" -> "Lang" */
export function instructorShortName(name: string): string {
  const last = name.trim().split(/\s+/)[0] ?? name;
  return last.charAt(0) + last.slice(1).toLowerCase();
}
