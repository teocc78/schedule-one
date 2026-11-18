/**
 * Convert UCSB API classes into the engine's CourseSections shape.
 * This is the only place that knows both shapes, so swapping fixtures for
 * live data changes nothing else.
 */
import type { UcsbClass, UcsbClassSection, UcsbTimeLocation } from "./types";
import { linkSections } from "./linking";
import type { CourseSections, Day, Meeting, SeatStatus, Section } from "@/lib/schedule-engine";
import { normalizeCode } from "@/lib/course-codes";

const DAY_CHARS: Day[] = ["M", "T", "W", "R", "F"];

/** "M W    " / "TR" / "MWF" -> ["M","W"] etc. */
export function parseDays(days: string | null | undefined): Day[] {
  if (!days) return [];
  return DAY_CHARS.filter((d) => days.toUpperCase().includes(d));
}

/** "11:00", "1100", "9:30" -> "HH:MM" */
export function parseTime(t: string | null | undefined): string | null {
  if (!t) return null;
  const s = t.trim();
  const m = s.match(/^(\d{1,2}):?(\d{2})$/);
  if (!m) return null;
  return `${m[1].padStart(2, "0")}:${m[2]}`;
}

function meetingsOf(tls: UcsbTimeLocation[] | null | undefined): Meeting[] {
  return (tls ?? [])
    .map((tl) => {
      const start = parseTime(tl.beginTime);
      const end = parseTime(tl.endTime);
      const days = parseDays(tl.days);
      return start && end && days.length ? { days, start, end } : null;
    })
    .filter((m): m is Meeting => m !== null);
}

function truthy(v: string | boolean | null | undefined): boolean {
  return v === true || (typeof v === "string" && /^(y|yes|true)$/i.test(v.trim()));
}

export function seatStatus(s: UcsbClassSection): SeatStatus {
  if (truthy(s.courseCancelled)) return "cancelled";
  if (truthy(s.classClosed)) return "closed";
  if (typeof s.enrolledTotal === "number" && typeof s.maxEnroll === "number") {
    return s.enrolledTotal >= s.maxEnroll ? "full" : "open";
  }
  return "unknown";
}

function restrictions(s: UcsbClassSection): string[] {
  const r: string[] = [];
  if (s.restrictionMajor) r.push(`Majors: ${s.restrictionMajor.trim()}`);
  if (s.restrictionMajorPass) r.push(`Major pass: ${s.restrictionMajorPass.trim()}`);
  if (s.restrictionLevel) r.push(`Level: ${s.restrictionLevel.trim()}`);
  if (s.restrictionMinor) r.push(`Minors: ${s.restrictionMinor.trim()}`);
  if (s.departmentApprovalRequired) r.push("Department approval");
  if (s.instructorApprovalRequired) r.push("Instructor approval");
  return r;
}

function toSection(s: UcsbClassSection, kind: Section["kind"]): Section {
  return {
    enrollCode: s.enrollCode.trim(),
    section: s.section.trim(),
    kind,
    meetings: meetingsOf(s.timeLocations),
    instructor: s.instructors?.[0]?.instructor ?? undefined,
    rating: null,
    status: seatStatus(s),
    enrolled: s.enrolledTotal ?? undefined,
    capacity: s.maxEnroll ?? undefined,
    restrictions: restrictions(s),
  };
}

/** courseId in the API is space-padded ("ES 1- 16B "); show it the GOLD way. */
export function displayCourseId(courseId: string): string {
  return normalizeCode(courseId.replace(/\s+/g, " "));
}

export function toCourseSections(cls: UcsbClass, mandatory = false): CourseSections {
  const groups = linkSections((cls.classSections ?? []).filter((s) => !truthy(s.courseCancelled)));
  const secondaryKind: Section["kind"] = /LAB/i.test(cls.instructionTypeSecondary ?? "") ? "LAB" : "DIS";
  return {
    courseId: displayCourseId(cls.courseId),
    title: cls.title.trim(),
    units: cls.unitsFixed ?? cls.unitsVariableHigh ?? 0,
    mandatory,
    geCodes: (cls.generalEducation ?? []).map((g) => g.geCode.trim()).filter(Boolean),
    options: groups.map((g) => ({
      lecture: toSection(g.lecture, "LEC"),
      sections: g.secondaries.map((s) => toSection(s, secondaryKind)),
    })),
  };
}
