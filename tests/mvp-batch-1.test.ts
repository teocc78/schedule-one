import { describe, it, expect } from "vitest";
import { classStanding, isUpperDivision, fullTimeNotice, planNotices } from "@/lib/standing";
import { combinedRequirements, registerRequirementsForTests, ProgramNotReadyError, majors } from "@/lib/majors";
import { mainTerm, flagsFor } from "@/lib/registration-flags";
import { itemsToLines } from "@/lib/pdf-text";
import { interestGroups, shortDescription } from "@/lib/interests";
import { COLLEGE_UNIT_LIMIT_PASS3 } from "@/lib/pass-planner";
import type { MajorRequirements, QuarterOfferings } from "@/types";

describe("class standing and full time", () => {
  it("uses UCSB unit thresholds", () => {
    expect(classStanding(0)).toBe("Freshman");
    expect(classStanding(44.9)).toBe("Freshman");
    expect(classStanding(45)).toBe("Sophomore");
    expect(classStanding(90)).toBe("Junior");
    expect(classStanding(135)).toBe("Senior");
  });

  it("detects upper-division course numbers", () => {
    expect(isUpperDivision("PSTAT 120A")).toBe(true);
    expect(isUpperDivision("ECON 100B")).toBe(true);
    expect(isUpperDivision("PSTAT 8")).toBe(false);
    expect(isUpperDivision("MATH 4B")).toBe(false);
    expect(isUpperDivision("PSTAT 220A")).toBe(false);
  });

  it("warns under 12 units only", () => {
    expect(fullTimeNotice(11)).toMatch(/part time \(full time is 12\+\)/);
    expect(fullTimeNotice(12)).toBeNull();
  });

  it("flags upper-division courses for students under 90 units", () => {
    const notes = planNotices(60, 12, ["PSTAT 120A", "MATH 4B"]);
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatch(/PSTAT 120A/);
    expect(notes[0]).not.toMatch(/MATH 4B/);
    expect(planNotices(95, 16, ["PSTAT 120A"])).toEqual([]);
  });

  it("caps Pass 3 at 21 units", () => {
    expect(COLLEGE_UNIT_LIMIT_PASS3).toBe(21);
  });
});

describe("majors and double majors", () => {
  const other: MajorRequirements = {
    major: "Test Major",
    majorCode: "test-major",
    groups: [
      { id: "prep", name: "Preparation", kind: "all", courses: ["MATH 3A"] },
      { id: "unique", name: "Unique", kind: "all", courses: ["ECON 1"] },
    ],
  };

  it("lists the programs that aren't ready yet", () => {
    const codes = majors().map((m) => m.code);
    expect(codes).toContain("economics-accounting");
    expect(majors().find((m) => m.code === "statistics-data-science")?.ready).toBe(true);
  });

  it("refuses a program without requirement data", () => {
    expect(() => combinedRequirements(["computer-science"])).toThrow(ProgramNotReadyError);
  });

  it("combines two programs and renames clashing group ids", () => {
    registerRequirementsForTests("test-major", other);
    const single = combinedRequirements(["statistics-data-science"]);
    const both = combinedRequirements(["statistics-data-science", "test-major"]);
    expect(both.groups).toHaveLength(single.groups.length + 2);
    expect(both.majorCode).toBe("statistics-data-science+test-major");
    const ids = both.groups.map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(both.groups.find((g) => g.name.startsWith("Test Major: Unique"))?.id).toBe("unique");
  });
});

describe("registration flags", () => {
  const fallOnly = ["20224", "20234", "20244", "20254", "20264"];

  it("finds the main term from five years of history", () => {
    expect(mainTerm(fallOnly)).toBe("Fall");
    expect(mainTerm(["20224", "20231", "20234", "20241", "20244", "20251"])).toBeNull();
    expect(mainTerm([])).toBeNull();
  });

  it("marks a still-needed course in its main term as must get", () => {
    const f = flagsFor("PSTAT 120A", "Fall", { "PSTAT 120A": fallOnly }, true);
    expect(f.termPattern).toBe("Mostly a Fall course");
    expect(f.mustGet).toBe(true);
    expect(flagsFor("PSTAT 120A", "Winter", { "PSTAT 120A": fallOnly }, true).mustGet).toBeUndefined();
    expect(flagsFor("PSTAT 120A", "Fall", { "PSTAT 120A": fallOnly }, false).mustGet).toBeUndefined();
    expect(flagsFor("PSTAT 999", "Fall", {}, true)).toEqual({});
  });
});

describe("PDF text lines", () => {
  it("rebuilds rows and keeps column gaps", () => {
    const items = [
      { str: "Title", x: 60, y: 700, width: 30, fontSize: 10 },
      { str: "PSTAT 8", x: 0, y: 700, width: 40, fontSize: 10 },
      { str: "4.0", x: 200, y: 700.5, width: 15, fontSize: 10 },
      { str: "FALL 2024", x: 0, y: 720, width: 50, fontSize: 10 },
    ];
    expect(itemsToLines(items)).toBe("FALL 2024\nPSTAT 8  Title  4.0");
  });
});

describe("interest picker", () => {
  it("lists upper-division courses by group", () => {
    const req: MajorRequirements = {
      major: "X", majorCode: "x",
      groups: [
        { id: "a", name: "Electives", kind: "choose_n", n: 1, courses: ["PSTAT 8", "PSTAT 131", "PSTAT 174"] },
        { id: "b", name: "Lower", kind: "all", courses: ["MATH 3A"] },
      ],
    };
    const offerings = { quarter: "Winter 2027", courses: [{ code: "PSTAT 131", title: "Machine Learning", description: "Intro to ML. More text." }] } as unknown as QuarterOfferings;
    const groups = interestGroups(req, offerings);
    expect(groups).toHaveLength(1);
    expect(groups[0].courses.map((c) => c.code)).toEqual(["PSTAT 131", "PSTAT 174"]);
    expect(groups[0].courses[0].offeredThisQuarter).toBe(true);
    expect(groups[0].courses[1].offeredThisQuarter).toBe(false);
  });

  it("shortens descriptions to the first sentence", () => {
    expect(shortDescription("One. Two.")).toBe("One.");
    expect(shortDescription("a".repeat(200)).length).toBe(140);
  });
});
