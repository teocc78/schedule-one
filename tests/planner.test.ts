import { describe, it, expect } from "vitest";
import { runPlanner, NoValidScheduleError } from "@/lib/planner";
import requirementsData from "@/data/requirements/statistics-data-science.json";
import offeringsData from "@/data/offerings/winter-2027.json";
import type {
  MajorRequirements,
  QuarterOfferings,
  StudentConstraints,
  TranscriptData,
  CompletedCourse,
} from "@/types";

const requirements = requirementsData as unknown as MajorRequirements;
const offerings = offeringsData as unknown as QuarterOfferings;

const done = (code: string): CompletedCourse => ({ code, title: code, units: 4, grade: "A", quarter: "Fall 2025" });

// A mid-program SDS student: lower division done, PSTAT 120A/B done.
const transcript: TranscriptData = {
  studentName: "Test Student",
  studentId: "0000",
  major: "Statistics & Data Science",
  completedCourses: [
    "MATH 3A", "MATH 3B", "MATH 4A", "MATH 6A", "PSTAT 8", "PSTAT 10",
    "CMPSC 8", "CMPSC 9", "PSTAT 120A", "PSTAT 120B",
  ].map(done),
  totalUnitsEarned: 40,
};

const constraints: StudentConstraints = {
  minUnits: 12,
  maxUnits: 16,
  freeDays: [],
  mustInclude: [],
  mustExclude: [],
};

const codes = (s: { courses: { offering: { code: string } }[] }) => s.courses.map((c) => c.offering.code);

describe("runPlanner (rules only, no AI)", () => {
  it("returns a valid main schedule and two different valid backups", async () => {
    const result = await runPlanner(transcript, requirements, offerings, constraints);
    const all = [result.primary, ...result.backups];
    for (const s of all) {
      expect(s.validation.valid).toBe(true);
      expect(s.totalUnits).toBeGreaterThanOrEqual(12);
      expect(s.totalUnits).toBeLessThanOrEqual(16);
    }
    const keys = new Set(all.map((s) => codes(s).sort().join("|")));
    expect(keys.size).toBe(3);
    expect(result.backups[0].changeNote).toMatch(/instead of|Adds|Drops/);
  });

  it("never schedules a course the student already finished", async () => {
    const result = await runPlanner(transcript, requirements, offerings, constraints);
    const finished = new Set(transcript.completedCourses.map((c) => c.code));
    for (const s of [result.primary, ...result.backups]) {
      expect(codes(s).some((c) => finished.has(c))).toBe(false);
    }
  });

  it("gives swap options that fit around the rest of the schedule", async () => {
    const result = await runPlanner(transcript, requirements, offerings, constraints);
    const inMain = new Set(codes(result.primary));
    const swaps = Object.values(result.primary.swaps).flat();
    expect(swaps.length).toBeGreaterThan(0);
    for (const s of swaps) expect(inMain.has(s.offering.code)).toBe(false);
  });

  it("prefers the courses the 4-year plan puts in this quarter", async () => {
    const base = await runPlanner(transcript, requirements, offerings, constraints);
    const notInMain = Object.values(base.primary.swaps).flat()[0].offering.code;
    const preferred = await runPlanner(transcript, requirements, offerings, constraints, [notInMain]);
    expect(codes(preferred.primary)).toContain(notInMain);
  });

  it("explains when no valid combination exists", async () => {
    const tight = { ...constraints, freeDays: ["M", "T", "W", "R", "F"] as StudentConstraints["freeDays"] };
    await expect(runPlanner(transcript, requirements, offerings, tight)).rejects.toBeInstanceOf(NoValidScheduleError);
  });
});
