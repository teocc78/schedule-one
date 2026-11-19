/**
 * Course facts the 4-year planner needs: title, units, prerequisites and,
 * where known, the only quarters a course runs. Built from the UCSB General
 * Catalog 2026-27; see data/catalog/courses.json for what is simplified.
 */
import data from "@/data/catalog/courses.json";
import { normalizeCode } from "@/lib/course-codes";

export type Quarter = "Fall" | "Winter" | "Spring";

export interface CatalogCourse {
  code: string;
  title: string;
  units: number;
  /** Each entry must be met; "A|B" means either course. */
  prereqs: string[];
  /** Prerequisite entries that may be taken in the same quarter. */
  concurrent: string[];
  /** Class standing the catalog asks for: upper = 90 units, senior = 135. */
  standing?: "upper" | "senior";
  /** Needs the instructor's consent; the planner leaves it out. */
  consent?: boolean;
  /** The only quarters it runs, when it runs once a year. */
  terms?: Quarter[];
  ge?: string;
}

type Raw = Omit<CatalogCourse, "code" | "prereqs" | "concurrent"> & { prereqs?: string[]; concurrent?: string[] };
const RAW = (data as unknown as { courses: Record<string, Raw> }).courses;

const BY_CODE = new Map<string, CatalogCourse>(
  Object.entries(RAW).map(([code, c]) => [
    normalizeCode(code),
    { ...c, code, prereqs: c.prereqs ?? [], concurrent: c.concurrent ?? [] },
  ])
);

export function getCourse(code: string): CatalogCourse | undefined {
  return BY_CODE.get(normalizeCode(code));
}

/** Test seam: add or replace a catalog entry. */
export function registerCourseForTests(course: CatalogCourse) {
  BY_CODE.set(normalizeCode(course.code), course);
}
