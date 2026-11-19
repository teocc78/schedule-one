import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseTranscriptText } from "@/lib/transcript-parser";
import { combinedRequirements } from "@/lib/majors";
import { buildFourYearPlan, nextTerm, defaultStart } from "@/lib/four-year-plan";
import { computeRequirementStatus } from "@/lib/requirements";
import { getCourse } from "@/lib/catalog";
import { normalizeCode } from "@/lib/course-codes";
import { runPlanner } from "@/lib/planner";
import type { CourseOffering, QuarterOfferings } from "@/types";
import base from "@/data/offerings/winter-2027.json";
import standin from "@/data/offerings/winter-2027-standin.json";

const SAMPLES = [
  { file: "transcript-econ-accounting-sophomore.txt", major: "economics-accounting", earned: 48, ip: 15 },
  { file: "transcript-biology-junior.txt", major: "biological-sciences", earned: 93, ip: 13 },
  { file: "transcript-ee-senior.txt", major: "electrical-engineering", earned: 155, ip: 17 },
];

const read = (f: string) => parseTranscriptText(readFileSync(`data/samples/${f}`, "utf8"));

describe("sample transcripts", () => {
  for (const s of SAMPLES) {
    it(`${s.file} reads cleanly and uses real catalog courses`, () => {
      const r = read(s.file);
      expect(r.unreadCourseLines).toBe(0);
      expect(r.transcript.totalUnitsEarned).toBe(s.earned);
      expect(r.transcript.unitsInProgress).toBe(s.ip);
      // public copy matches
      expect(readFileSync(`public/samples/${s.file}`, "utf8")).toBe(readFileSync(`data/samples/${s.file}`, "utf8"));
    });

    it(`${s.file}: every course was taken after its prerequisites`, () => {
      const { transcript } = read(s.file);
      const order = ["Winter", "Spring", "Summer", "Fall"];
      const when = (q: string) => { const [t, y] = q.split(" "); return Number(y) * 10 + order.indexOf(t); };
      const taken = new Map(transcript.completedCourses.map((c) => [normalizeCode(c.code), when(c.quarter)]));
      for (const c of transcript.completedCourses) {
        const cat = getCourse(c.code);
        if (!cat) continue;
        for (const entry of cat.prereqs) {
          const ok = entry.split("|").some((a) => {
            const t = taken.get(normalizeCode(a));
            return t !== undefined && (t < when(c.quarter) || (cat.concurrent.includes(entry) && t === when(c.quarter)));
          });
          expect(ok, `${c.code} needs ${entry}`).toBe(true);
        }
      }
    });
  }
});

describe("4-year plan", () => {
  for (const s of SAMPLES) {
    it(`${s.file}: plans every remaining requirement and reaches 180 units`, () => {
      const { transcript } = read(s.file);
      const req = combinedRequirements([s.major]);
      const plan = buildFourYearPlan(req, transcript);
      expect(plan.startTerm).toBe("Winter 2027");
      expect(plan.unscheduled).toEqual([]);
      expect(plan.graduationTerm).not.toBeNull();
      expect(plan.unitsAtGraduation).toBeGreaterThanOrEqual(180);

      // Every group is satisfied by transcript plus plan.
      const planned = plan.quarters.flatMap((q) => q.courses.map((c) => ({ code: c.code, title: c.title, units: c.units, grade: "A" as const, quarter: q.term })));
      const status = computeRequirementStatus(req, [...transcript.completedCourses, ...planned]);
      expect(status.filter((g) => !g.satisfied).map((g) => g.groupName)).toEqual([]);

      // Prerequisites come before the course (or alongside, where allowed).
      const at = new Map<string, number>();
      transcript.completedCourses.forEach((c) => at.set(normalizeCode(c.code), -1));
      plan.quarters.forEach((q, i) => q.courses.forEach((c) => at.set(normalizeCode(c.code), i)));
      plan.quarters.forEach((q, i) => {
        for (const c of q.courses) {
          const cat = getCourse(c.code)!;
          for (const e of cat.prereqs) {
            const ok = e.split("|").some((a) => { const t = at.get(normalizeCode(a)); return t !== undefined && (t < i || (cat.concurrent.includes(e) && t === i)); })
              || req.equivalents && e.split("|").every((a) => !getCourse(a));
            expect(ok, `${c.code} in ${q.term} needs ${e}`).toBe(true);
          }
        }
        // full time except possibly the last quarter
        if (i < plan.quarters.length - 1) expect(q.totalUnits).toBeGreaterThanOrEqual(12);
        expect(q.majorUnits).toBeLessThanOrEqual(16);
      });
    });
  }

  it("the senior's year-long design project is flagged for Winter", () => {
    const { transcript } = read("transcript-ee-senior.txt");
    const plan = buildFourYearPlan(combinedRequirements(["electrical-engineering"]), transcript);
    const winter = plan.quarters[0];
    expect(winter.term).toBe("Winter 2027");
    const c = winter.courses.find((x) => x.code === "ECE 188B")!;
    expect(c.mustGet).toBe(true);
    expect(c.mustGetReason).toMatch(/Only runs in Winter/);
    expect(plan.graduationTerm).toBe("Spring 2027");
  });

  it("every quarter with major courses offers a backup", () => {
    for (const s of SAMPLES) {
      const { transcript } = read(s.file);
      const plan = buildFourYearPlan(combinedRequirements([s.major]), transcript);
      for (const q of plan.quarters.filter((x) => x.courses.length)) expect(q.backups.length, `${s.file} ${q.term}`).toBeGreaterThan(0);
    }
  });

  it("flags the accounting chain for the sophomore, starting with ECON 10A in Winter", () => {
    const { transcript } = read("transcript-econ-accounting-sophomore.txt");
    const plan = buildFourYearPlan(combinedRequirements(["economics-accounting"]), transcript);
    const c = plan.quarters[0].courses.find((x) => x.code === "ECON 10A")!;
    expect(c.mustGet).toBe(true);
    expect(c.mustGetReason).toMatch(/ECON 136C → ECON 118/);
  });

  it("terms roll Fall, Winter, Spring and start after the transcript", () => {
    expect(nextTerm({ quarter: "Fall", year: 2026 })).toEqual({ quarter: "Winter", year: 2027 });
    expect(nextTerm({ quarter: "Spring", year: 2027 })).toEqual({ quarter: "Fall", year: 2027 });
    expect(defaultStart([{ code: "X 1", title: "", units: 4, grade: "IP", quarter: "Spring 2027" }])).toEqual({ quarter: "Fall", year: 2027 });
  });

  it("counts MATH 34A-B in place of MATH 3A-B", () => {
    const req = combinedRequirements(["economics-accounting"]);
    const status = computeRequirementStatus(req, [
      { code: "MATH 34A", title: "", units: 4, grade: "B", quarter: "Fall 2025" },
      { code: "MATH 34B", title: "", units: 4, grade: "B", quarter: "Winter 2026" },
    ]);
    expect(status.find((g) => g.groupId === "ecacc-calc")!.satisfied).toBe(true);
  });
});

describe("one-quarter plan for the sample students", () => {
  const constraints = { minUnits: 12, maxUnits: 16, freeDays: [], mustInclude: [], mustExclude: [], noClassBefore: "08:00" };
  const offerings = { ...standin, courses: [...(base.courses as CourseOffering[]), ...(standin.courses as CourseOffering[]).filter((c) => !base.courses.some((b) => b.code === c.code))] } as unknown as QuarterOfferings;

  it("fills the sophomore's schedule with ECON 10A plus suggested GEs", async () => {
    const { transcript } = read("transcript-econ-accounting-sophomore.txt");
    const r = await runPlanner(transcript, combinedRequirements(["economics-accounting"]), offerings, constraints, [], { ba: true });
    for (const s of [r.primary, ...r.backups]) {
      const codes = s.courses.map((c) => c.offering.code);
      expect(codes).toContain("ECON 10A");
      expect(codes.length).toBeGreaterThan(1);
      expect(s.totalUnits).toBeGreaterThanOrEqual(12);
      expect(s.validation.valid).toBe(true);
      // Every GE in the schedule counts toward an open GE area.
      for (const c of s.courses.filter((x) => x.offering.code !== "ECON 10A")) {
        expect(c.satisfies[0]).toMatch(/^ge-[ACG]$/);
      }
    }
    // The backups are real alternatives, not copies of the main schedule.
    const keys = [r.primary, ...r.backups].map((s) => s.courses.map((c) => c.offering.code).sort().join("|"));
    expect(new Set(keys).size).toBe(3);
    expect(r.notices?.[0]).toMatch(/Only 5 major units are open this quarter, so the rest are suggested GEs/);
    expect(r.groupNames?.["ge-G"]).toBe("GE Area G: Literature");
  });

  it("falls back to the unit gap notice when no suggested GE fits", async () => {
    const { transcript } = read("transcript-econ-accounting-sophomore.txt");
    // Mornings only, Tuesdays and Thursdays off: no suggested GE for an open area fits.
    const tight = { ...constraints, freeDays: ["T", "R"] as ("T" | "R")[], noClassAfter: "12:00" };
    const r = await runPlanner(transcript, combinedRequirements(["economics-accounting"]), offerings, tight, [], { ba: true });
    expect(r.primary.courses.map((c) => c.offering.code)).toEqual(["ECON 10A"]);
    expect(r.notices?.[0]).toMatch(/Add at least 7 units of GE or elective/);
  });

  it("gives the EE senior ECE 188B plus electives at full time", async () => {
    const { transcript } = read("transcript-ee-senior.txt");
    const r = await runPlanner(transcript, combinedRequirements(["electrical-engineering"]), offerings, constraints);
    const codes = r.primary.courses.map((c) => c.offering.code);
    expect(codes).toContain("ECE 188B");
    expect(r.primary.totalUnits).toBeGreaterThanOrEqual(12);
  });
});
