import { describe, it, expect } from "vitest";
import { validateSchedule } from "@/lib/validator";
import type {
  ScheduledCourse,
  StudentConstraints,
  CompletedCourse,
  DayOfWeek,
} from "@/types";

// ── Fixtures ──────────────────────────────────────────────────

const defaultConstraints: StudentConstraints = {
  minUnits: 12,
  maxUnits: 20,
  noClassBefore: "08:00",
  freeDays: [],
  mustInclude: [],
  mustExclude: [],
};

const completedCourses: CompletedCourse[] = [
  { code: "PSTAT 120A", title: "Prob", units: 4, grade: "A", quarter: "Fall 2024" },
  { code: "MATH 3B", title: "Calc II", units: 4, grade: "A", quarter: "Fall 2024" },
  { code: "MATH 4A", title: "Lin Alg", units: 4, grade: "A", quarter: "Winter 2025" },
];

function makeCourse(
  code: string,
  days: string[],
  start: string,
  end: string,
  units = 4,
  prereqs: string[] = [],
  satisfies: string[] = []
): ScheduledCourse {
  return {
    offering: {
      code,
      title: code,
      units,
      schedule: { days: days as DayOfWeek[], startTime: start, endTime: end },
      instructor: "Staff",
      prerequisites: prereqs,
      description: "",
      enrollmentCap: 100,
    },
    satisfies,
  };
}

// ── Time conflict tests ───────────────────────────────────────

describe("no_time_conflicts", () => {
  it("passes when no courses overlap", () => {
    const courses = [
      makeCourse("A", ["M", "W"], "09:00", "09:50"),
      makeCourse("B", ["M", "W"], "10:00", "10:50"),
    ];
    const result = validateSchedule(courses, defaultConstraints, completedCourses);
    expect(result.passedChecks).toContain("no_time_conflicts");
  });

  it("fails when two courses overlap on same day", () => {
    const courses = [
      makeCourse("A", ["M", "W"], "09:00", "10:00"),
      makeCourse("B", ["M"], "09:30", "10:30"),
    ];
    const result = validateSchedule(courses, defaultConstraints, completedCourses);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("Time conflict"))).toBe(true);
    expect(result.passedChecks).not.toContain("no_time_conflicts");
  });

  it("passes when courses share days but times don't overlap", () => {
    const courses = [
      makeCourse("A", ["T", "R"], "08:00", "09:15"),
      makeCourse("B", ["T", "R"], "09:30", "10:45"),
    ];
    const result = validateSchedule(courses, defaultConstraints, completedCourses);
    expect(result.passedChecks).toContain("no_time_conflicts");
  });

  it("passes when courses overlap in time but on different days", () => {
    const courses = [
      makeCourse("A", ["M", "W"], "09:00", "10:00"),
      makeCourse("B", ["T", "R"], "09:00", "10:00"),
    ];
    const result = validateSchedule(courses, defaultConstraints, completedCourses);
    expect(result.passedChecks).toContain("no_time_conflicts");
  });
});

// ── Unit limit tests ──────────────────────────────────────────

describe("unit_limit", () => {
  it("passes within min/max range", () => {
    const courses = [
      makeCourse("A", ["M"], "09:00", "09:50", 4),
      makeCourse("B", ["T"], "09:00", "09:50", 4),
      makeCourse("C", ["W"], "09:00", "09:50", 4),
      makeCourse("D", ["R"], "09:00", "09:50", 4),
    ];
    const result = validateSchedule(courses, defaultConstraints, completedCourses);
    expect(result.passedChecks).toContain("unit_limit");
  });

  it("fails when below minimum units", () => {
    const courses = [makeCourse("A", ["M"], "09:00", "09:50", 4)];
    const result = validateSchedule(courses, defaultConstraints, completedCourses);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("below minimum"))).toBe(true);
  });

  it("fails when above maximum units", () => {
    const courses = [
      makeCourse("A", ["M"], "08:00", "08:50", 4),
      makeCourse("B", ["M"], "09:00", "09:50", 4),
      makeCourse("C", ["M"], "10:00", "10:50", 4),
      makeCourse("D", ["M"], "11:00", "11:50", 4),
      makeCourse("E", ["M"], "12:00", "12:50", 4),
      makeCourse("F", ["M"], "13:00", "13:50", 4),
    ]; // 24 units > 20
    const result = validateSchedule(courses, defaultConstraints, completedCourses);
    expect(result.errors.some((e) => e.includes("exceeds maximum"))).toBe(true);
  });
});

// ── Prerequisites tests ───────────────────────────────────────

describe("prerequisites_met", () => {
  it("passes when all prerequisites are completed", () => {
    const courses = [
      makeCourse("PSTAT 120B", ["M", "W", "F"], "10:00", "10:50", 4, ["PSTAT 120A"]),
      makeCourse("PSTAT 126", ["T", "R"], "11:00", "12:15", 4, ["PSTAT 120B", "MATH 4A"]),
    ];
    // PSTAT 120B prereq is met; but PSTAT 126 requires PSTAT 120B which is in the current schedule, not completed
    // Should fail for PSTAT 126
    const result = validateSchedule(courses, defaultConstraints, completedCourses);
    expect(result.errors.some((e) => e.includes("PSTAT 120B") && e.includes("PSTAT 126"))).toBe(true);
  });

  it("passes when a course has no prerequisites", () => {
    const courses = [
      makeCourse("MATH 3A", ["M", "W", "F"], "08:00", "08:50", 4, []),
      makeCourse("CMPSC 9", ["T", "R"], "10:00", "11:15", 4, []),
      makeCourse("X", ["M"], "09:00", "09:50", 4, []),
      makeCourse("Y", ["T"], "09:00", "09:50", 4, []),
    ];
    const result = validateSchedule(courses, defaultConstraints, completedCourses);
    expect(result.passedChecks).toContain("prerequisites_met");
  });

  it("fails when a prerequisite is missing", () => {
    const courses = [
      makeCourse("PSTAT 160A", ["M", "W", "F"], "14:00", "14:50", 4, ["PSTAT 120B", "MATH 4A"]),
      makeCourse("B", ["T"], "09:00", "09:50", 4, []),
      makeCourse("C", ["W"], "10:00", "10:50", 4, []),
      makeCourse("D", ["R"], "11:00", "11:50", 4, []),
    ];
    // PSTAT 120B not in completedCourses
    const result = validateSchedule(courses, defaultConstraints, completedCourses);
    expect(result.errors.some((e) => e.includes("PSTAT 120B"))).toBe(true);
  });
});

// ── Constraint tests ──────────────────────────────────────────

describe("respects_constraints", () => {
  it("fails when a class is before noClassBefore", () => {
    const constraints: StudentConstraints = {
      ...defaultConstraints,
      noClassBefore: "10:00",
    };
    const courses = [
      makeCourse("A", ["M"], "08:00", "08:50", 4),
      makeCourse("B", ["T"], "10:00", "10:50", 4),
      makeCourse("C", ["W"], "11:00", "11:50", 4),
      makeCourse("D", ["R"], "12:00", "12:50", 4),
    ];
    const result = validateSchedule(courses, constraints, completedCourses);
    expect(result.errors.some((e) => e.includes("before the requested start time"))).toBe(true);
  });

  it("fails when a class is on a free day", () => {
    const constraints: StudentConstraints = {
      ...defaultConstraints,
      freeDays: ["F"],
    };
    const courses = [
      makeCourse("A", ["M", "W", "F"], "09:00", "09:50", 4),
      makeCourse("B", ["T"], "10:00", "11:15", 4),
      makeCourse("C", ["T"], "11:30", "12:45", 4),
      makeCourse("D", ["R"], "13:00", "14:15", 4),
    ];
    const result = validateSchedule(courses, constraints, completedCourses);
    expect(result.errors.some((e) => e.includes("should be free"))).toBe(true);
  });

  it("fails when a must-include course is absent", () => {
    const constraints: StudentConstraints = {
      ...defaultConstraints,
      mustInclude: ["PSTAT 131"],
    };
    const courses = [
      makeCourse("A", ["M"], "09:00", "09:50", 4),
      makeCourse("B", ["T"], "10:00", "11:15", 4),
      makeCourse("C", ["W"], "11:00", "11:50", 4),
      makeCourse("D", ["R"], "13:00", "14:15", 4),
    ];
    const result = validateSchedule(courses, constraints, completedCourses);
    expect(result.errors.some((e) => e.includes("PSTAT 131"))).toBe(true);
  });

  it("fails when a must-exclude course is present", () => {
    const constraints: StudentConstraints = {
      ...defaultConstraints,
      mustExclude: ["PSTAT 131"],
    };
    const courses = [
      makeCourse("PSTAT 131", ["T", "R"], "14:00", "15:15", 4),
      makeCourse("B", ["M"], "10:00", "10:50", 4),
      makeCourse("C", ["W"], "11:00", "11:50", 4),
      makeCourse("D", ["R"], "08:00", "09:15", 4),
    ];
    const result = validateSchedule(courses, constraints, completedCourses);
    expect(result.errors.some((e) => e.includes("excluded"))).toBe(true);
  });
});

// ── Duplicate requirement tests ───────────────────────────────

describe("no_duplicate_requirements", () => {
  it("passes when each group is covered by one course", () => {
    const courses = [
      makeCourse("A", ["M"], "09:00", "09:50", 4, [], ["upper-methods"]),
      makeCourse("B", ["T"], "10:00", "11:15", 4, [], ["data-science"]),
      makeCourse("C", ["W"], "11:00", "11:50", 4, [], ["writing"]),
      makeCourse("D", ["R"], "13:00", "14:15", 4, [], ["upper-electives"]),
    ];
    const result = validateSchedule(courses, defaultConstraints, completedCourses);
    expect(result.passedChecks).toContain("no_duplicate_requirements");
  });

  it("flags when more courses claim a group than it still needs", () => {
    const courses = [
      makeCourse("A", ["M"], "09:00", "09:50", 4, [], ["upper-methods"]),
      makeCourse("B", ["T"], "10:00", "11:15", 4, [], ["upper-methods"]),
      makeCourse("C", ["W"], "11:00", "11:50", 4, [], ["data-science"]),
      makeCourse("D", ["R"], "13:00", "14:15", 4, [], ["writing"]),
    ];
    const result = validateSchedule(courses, defaultConstraints, completedCourses, {
      groupCapacity: { "upper-methods": 1, "data-science": 1, writing: 1 },
    });
    expect(result.errors.some((e) => e.includes("upper-methods"))).toBe(true);
  });

  it("allows two electives toward a choose-n group that still needs them (print-schedule bug)", () => {
    const courses = [
      makeCourse("PSTAT 115", ["T", "R"], "11:00", "12:15", 4, [], ["upper-electives-c"]),
      makeCourse("PSTAT 122", ["M", "W", "F"], "12:00", "12:50", 4, [], ["upper-electives-c"]),
      makeCourse("PSTAT 127", ["T", "R"], "14:00", "15:15", 4, [], ["upper-electives-c"]),
    ];
    const result = validateSchedule(courses, defaultConstraints, completedCourses, {
      groupCapacity: { "upper-electives-c": 5 },
    });
    expect(result.passedChecks).toContain("no_duplicate_requirements");
    expect(result.valid).toBe(true);
  });

  it("flags the same course listed twice", () => {
    const courses = [
      makeCourse("PSTAT 115", ["T", "R"], "11:00", "12:15"),
      makeCourse("pstat115", ["M"], "13:00", "13:50"),
      makeCourse("PSTAT 122", ["W"], "12:00", "12:50"),
    ];
    const result = validateSchedule(courses, defaultConstraints, completedCourses);
    expect(result.errors.some((e) => e.includes("more than once"))).toBe(true);
  });
});

describe("prerequisites: normalization and alternatives", () => {
  it("accepts either alternative in an A|B prerequisite", () => {
    const courses = [
      makeCourse("PSTAT 160A", ["T", "R"], "09:30", "10:45", 4, ["MATH 8|PSTAT 8"]),
      makeCourse("X", ["M"], "09:00", "09:50", 4),
      makeCourse("Y", ["W"], "09:00", "09:50", 4),
    ];
    const done: CompletedCourse[] = [
      ...completedCourses,
      { code: "PSTAT 8", title: "Transition", units: 5, grade: "A", quarter: "Fall 2025" },
    ];
    const result = validateSchedule(courses, defaultConstraints, done);
    expect(result.passedChecks).toContain("prerequisites_met");
  });

  it("matches transcript codes that differ only in spacing or case", () => {
    const courses = [
      makeCourse("PSTAT 120B", ["M", "W", "F"], "10:00", "10:50", 4, ["PSTAT 120A"]),
      makeCourse("X", ["T"], "09:00", "09:50", 4),
      makeCourse("Y", ["R"], "09:00", "09:50", 4),
    ];
    const done: CompletedCourse[] = [
      { code: "pstat120a", title: "Prob", units: 4, grade: "A", quarter: "Fall 2024" },
    ];
    const result = validateSchedule(courses, defaultConstraints, done);
    expect(result.passedChecks).toContain("prerequisites_met");
  });
});
