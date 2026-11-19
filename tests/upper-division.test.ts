import { describe, it, expect } from "vitest";
import type { QuarterOfferings } from "@/types";
import { PROGRAMS, combinedRequirements } from "@/lib/majors";
import { coverageByProgram, lookupCourses, upperDivCourse, upperDivisionForProgram } from "@/lib/upper-division";
import { interestGroups } from "@/lib/interests";
import { isUpperDivision } from "@/lib/standing";

describe("upper-division catalog", () => {
  it("lists classes with descriptions for every major", () => {
    for (const row of coverageByProgram()) {
      expect(row.total, row.name).toBeGreaterThan(20);
      expect(row.withDescription, row.name).toBe(row.total);
    }
    expect(coverageByProgram()).toHaveLength(PROGRAMS.length);
  });

  it("groups a major's classes by subject and keeps research and internships apart", () => {
    const r = upperDivisionForProgram("biopsychology")!;
    expect(r.groups.map((g) => g.subject)).toEqual(["PSY", "MCDB"]);
    expect(r.groups[0].courses.every((c) => c.code.startsWith("PSY "))).toBe(true);
    expect(r.special.some((c) => c.code === "PSY 199")).toBe(true);
    expect(r.groups[0].courses.some((c) => c.code === "PSY 199")).toBe(false);
    expect(upperDivisionForProgram("not-a-major")).toBeUndefined();
  });

  it("has a description for every upper-division course the ready majors require", () => {
    const ready = PROGRAMS.filter((p) => p.ready).map((p) => p.code);
    for (const code of ready) {
      const req = combinedRequirements([code]);
      const codes = [...new Set(req.groups.flatMap((g) => g.courses).filter(isUpperDivision))];
      const missing = codes.filter((c) => !upperDivCourse(c)?.description);
      expect(missing, code).toEqual([]);
    }
  });

  it("looks courses up by code, ignoring spacing and case", () => {
    expect(upperDivCourse("pstat120a")?.title).toBeTruthy();
    expect(Object.keys(lookupCourses(["PSTAT 120A", "NOPE 1"]))).toEqual(["PSTAT 120A"]);
  });
});

describe("interest picker with catalog descriptions", () => {
  it("fills in titles and descriptions for courses not offered this quarter", () => {
    const req = combinedRequirements(["statistics-data-science"]);
    const offerings = { quarter: "Winter 2027", courses: [] } as unknown as QuarterOfferings;
    const codes = req.groups.flatMap((g) => g.courses).filter(isUpperDivision);
    const groups = interestGroups(req, offerings, lookupCourses(codes));
    const courses = groups.flatMap((g) => g.courses);
    expect(courses.length).toBeGreaterThan(0);
    expect(courses.every((c) => c.title && c.description)).toBe(true);
    expect(courses.every((c) => !c.offeredThisQuarter)).toBe(true);
  });
});
