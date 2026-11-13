import { describe, it, expect } from "vitest";
import {
  computeRequirementStatus,
  getRemainingGroups,
  getEligibleOfferings,
} from "@/lib/requirements";
import type { MajorRequirements, CompletedCourse, CourseOffering } from "@/types";

const requirements: MajorRequirements = {
  major: "Statistics & Data Science",
  majorCode: "statistics-data-science",
  groups: [
    {
      id: "lower-math",
      name: "Lower-Division Mathematics",
      kind: "all",
      courses: ["MATH 3A", "MATH 3B", "MATH 3C"],
    },
    {
      id: "lower-pstat-core",
      name: "Lower-Division Statistics Core",
      kind: "all",
      courses: ["PSTAT 120A", "PSTAT 120B", "PSTAT 122"],
    },
    {
      id: "upper-electives",
      name: "Upper-Division Electives",
      kind: "choose_n",
      n: 2,
      courses: ["PSTAT 171", "PSTAT 174", "PSTAT 175"],
    },
  ],
};

const allCompleted: CompletedCourse[] = [
  { code: "MATH 3A", title: "Calc I", units: 4, grade: "A", quarter: "Fall 2023" },
  { code: "MATH 3B", title: "Calc II", units: 4, grade: "A", quarter: "Fall 2023" },
  { code: "MATH 3C", title: "Calc III", units: 4, grade: "A", quarter: "Winter 2024" },
  { code: "PSTAT 120A", title: "Prob", units: 4, grade: "A", quarter: "Spring 2024" },
  { code: "PSTAT 120B", title: "Prob II", units: 4, grade: "A", quarter: "Fall 2024" },
  { code: "PSTAT 122", title: "Data Sci Intro", units: 4, grade: "A", quarter: "Fall 2024" },
  { code: "PSTAT 171", title: "Fixed Income", units: 4, grade: "A", quarter: "Winter 2025" },
  { code: "PSTAT 174", title: "Time Series", units: 4, grade: "A", quarter: "Winter 2025" },
];

const partialCompleted: CompletedCourse[] = [
  { code: "MATH 3A", title: "Calc I", units: 4, grade: "A", quarter: "Fall 2023" },
  { code: "MATH 3B", title: "Calc II", units: 4, grade: "A", quarter: "Fall 2023" },
  { code: "PSTAT 120A", title: "Prob", units: 4, grade: "A", quarter: "Spring 2024" },
  { code: "PSTAT 171", title: "Fixed Income", units: 4, grade: "A", quarter: "Winter 2025" },
];

describe("computeRequirementStatus", () => {
  it("marks groups as satisfied when all courses completed", () => {
    const status = computeRequirementStatus(requirements, allCompleted);
    expect(status.every((s) => s.satisfied)).toBe(true);
  });

  it("marks group as not satisfied when courses are missing", () => {
    const status = computeRequirementStatus(requirements, partialCompleted);
    const mathGroup = status.find((s) => s.groupId === "lower-math")!;
    expect(mathGroup.satisfied).toBe(false);
    expect(mathGroup.remainingCourses).toContain("MATH 3C");
    expect(mathGroup.completedCourses).toContain("MATH 3A");
    expect(mathGroup.completedCourses).toContain("MATH 3B");
  });

  it("handles choose_n: satisfied when enough courses taken", () => {
    const status = computeRequirementStatus(requirements, allCompleted);
    const electivesGroup = status.find((s) => s.groupId === "upper-electives")!;
    expect(electivesGroup.satisfied).toBe(true);
    expect(electivesGroup.stillNeeded).toBe(0);
  });

  it("handles choose_n: not satisfied when too few taken", () => {
    const status = computeRequirementStatus(requirements, partialCompleted);
    const electivesGroup = status.find((s) => s.groupId === "upper-electives")!;
    expect(electivesGroup.satisfied).toBe(false);
    expect(electivesGroup.stillNeeded).toBe(1);
  });
});

describe("getRemainingGroups", () => {
  it("returns empty when all requirements met", () => {
    const remaining = getRemainingGroups(requirements, allCompleted);
    expect(remaining).toHaveLength(0);
  });

  it("returns only unsatisfied groups", () => {
    const remaining = getRemainingGroups(requirements, partialCompleted);
    const ids = remaining.map((r) => r.groupId);
    expect(ids).toContain("lower-math");
    expect(ids).toContain("lower-pstat-core");
    expect(ids).toContain("upper-electives");
    expect(ids).not.toContain("__nonexistent__");
  });
});

describe("getEligibleOfferings", () => {
  const offerings: CourseOffering[] = [
    {
      code: "MATH 3C",
      title: "Calc III",
      units: 4,
      schedule: { days: ["M", "W", "F"], startTime: "11:00", endTime: "11:50" },
      instructor: "Staff",
      prerequisites: ["MATH 3B"],
      description: "",
      enrollmentCap: 100,
      requirementGroups: ["lower-math"],
    },
    {
      code: "PSTAT 120B",
      title: "Prob II",
      units: 4,
      schedule: { days: ["M", "W", "F"], startTime: "10:00", endTime: "10:50" },
      instructor: "Staff",
      prerequisites: ["PSTAT 120A"],
      description: "",
      enrollmentCap: 100,
      requirementGroups: ["lower-pstat-core"],
    },
    {
      code: "PSTAT 175",
      title: "Survival",
      units: 4,
      schedule: { days: ["T", "R"], startTime: "14:00", endTime: "15:15" },
      instructor: "Staff",
      prerequisites: ["PSTAT 999"], // unmet prereq
      description: "",
      enrollmentCap: 50,
      requirementGroups: ["upper-electives"],
    },
  ];

  it("only returns offerings with met prerequisites", () => {
    const remaining = getRemainingGroups(requirements, partialCompleted);
    const eligible = getEligibleOfferings(offerings, remaining, partialCompleted);
    const codes = eligible.map((o) => o.code);
    expect(codes).toContain("MATH 3C");
    expect(codes).toContain("PSTAT 120B");
    expect(codes).not.toContain("PSTAT 175"); // missing prereq PSTAT 999
  });
});
