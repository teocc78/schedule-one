/**
 * Saved fixtures used when UCSB_API_KEY is not set and in every test.
 * They are SYNTHETIC until real responses are captured (see
 * docs/ucsb-api-reference.md, open item 3). Tests must never hit the live API.
 */
import search20271 from "@/data/ucsb-fixtures/classes-search-20271.json";
import history from "@/data/ucsb-fixtures/enrollment-history.json";
import type { UcsbClass, UcsbClassSearchParams } from "./types";
import { normalizeCode } from "@/lib/course-codes";

const BY_QUARTER: Record<string, UcsbClass[]> = {
  "20271": (search20271 as unknown as { classes: UcsbClass[] }).classes,
};

const squash = (s: string) => normalizeCode(s.replace(/\s+/g, " "));

export function loadFixtureClasses(params: UcsbClassSearchParams): UcsbClass[] {
  let xs = BY_QUARTER[params.quarter] ?? [];
  if (params.subjectCode) xs = xs.filter((c) => squash(c.courseId).startsWith(squash(params.subjectCode!) + " "));
  if (params.courseId) xs = xs.filter((c) => squash(c.courseId) === squash(params.courseId!));
  if (params.enrollCode) xs = xs.filter((c) => (c.classSections ?? []).some((s) => s.enrollCode === params.enrollCode));
  return xs;
}

export function fixtureQuarters(): string[] {
  return Object.keys(BY_QUARTER);
}

export interface HistoryRow {
  quarter: string;
  enrolledTotal: number | null;
  maxEnroll: number | null;
}

export function loadFixtureHistory(courseId: string): HistoryRow[] {
  const all = (history as unknown as { courses: Record<string, HistoryRow[]> }).courses;
  return all[squash(courseId)] ?? [];
}
