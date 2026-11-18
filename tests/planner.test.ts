import { describe, it, expect, vi } from "vitest";
import { runPlanner, NoValidScheduleError, type ProposeFn } from "@/lib/planner";
import { LLMConfigError } from "@/lib/llm";
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

const sched = (codes: string[]) => ({
  courses: codes.map((code) => ({ code, satisfies: [] })),
  explanation: "test",
  swaps: {},
});

describe("runPlanner (print schedule regression)", () => {
  it("accepts a schedule with two PSTAT electives instead of returning 422", async () => {
    const propose: ProposeFn = vi.fn(async () => ({
      primary: sched(["PSTAT 126", "PSTAT 122", "PSTAT 174"]),
      backup1: sched(["PSTAT 126", "PSTAT 123", "PSTAT 174"]),
      backup2: sched(["PSTAT 126", "PSTAT 133", "PSTAT 130"]),
    }));
    const result = await runPlanner(transcript, requirements, offerings, constraints, propose);
    expect(result.primary.validation.valid).toBe(true);
    expect(result.primary.courses.map((c) => c.offering.code)).toEqual(["PSTAT 126", "PSTAT 122", "PSTAT 174"]);
    expect(propose).toHaveBeenCalledTimes(1);
  });

  it("retries once with the validator's errors when the first proposal conflicts", async () => {
    const propose = vi
      .fn<ProposeFn>()
      // PSTAT 126 (MWF 11:00) and MATH 137A (MWF 11:00) overlap.
      .mockResolvedValueOnce({
        primary: sched(["PSTAT 126", "MATH 137A", "PSTAT 174"]),
        backup1: sched(["PSTAT 126"]),
        backup2: sched(["PSTAT 126"]),
      })
      .mockResolvedValueOnce({
        primary: sched(["PSTAT 126", "PSTAT 122", "PSTAT 174"]),
        backup1: sched(["PSTAT 126", "PSTAT 123", "PSTAT 174"]),
        backup2: sched(["PSTAT 126", "PSTAT 133", "PSTAT 130"]),
      });
    const withMath8 = { ...transcript, completedCourses: [...transcript.completedCourses, done("MATH 8")] };
    const result = await runPlanner(withMath8, requirements, offerings, constraints, propose);
    expect(propose).toHaveBeenCalledTimes(2);
    const feedback = propose.mock.calls[1][6];
    expect(feedback).toContain("Time conflict");
    expect(result.primary.validation.valid).toBe(true);
  });

  it("falls back to the rule-based planner when the LLM keeps failing", async () => {
    const propose: ProposeFn = vi.fn(async () => {
      throw new Error("model timed out");
    });
    const result = await runPlanner(transcript, requirements, offerings, constraints, propose);
    expect(result.primary.validation.valid).toBe(true);
    expect(result.backups[0].validation.valid).toBe(true);
    expect(result.primary.totalUnits).toBeGreaterThanOrEqual(12);
  });

  it("surfaces a missing API key instead of silently falling back", async () => {
    const propose: ProposeFn = vi.fn(async () => {
      throw new LLMConfigError("GEMINI_API_KEY is not set");
    });
    await expect(runPlanner(transcript, requirements, offerings, constraints, propose)).rejects.toBeInstanceOf(LLMConfigError);
  });

  it("explains when no valid combination exists", async () => {
    const propose: ProposeFn = vi.fn(async () => {
      throw new Error("down");
    });
    const tight = { ...constraints, freeDays: ["M", "T", "W", "R", "F"] as StudentConstraints["freeDays"] };
    await expect(runPlanner(transcript, requirements, offerings, tight, propose)).rejects.toBeInstanceOf(NoValidScheduleError);
  });
});
