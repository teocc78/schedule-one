import { describe, it, expect } from "vitest";
import { planPasses, PASS_CAPS } from "@/lib/pass-planner";

describe("pass planner (spec section 5)", () => {
  it("uses the registrar caps 11.5 / 15.5", () => {
    expect(PASS_CAPS[0]).toBe(11.5);
    expect(PASS_CAPS[1]).toBe(15.5);
  });

  it("puts the course most likely to fill in the earliest pass that fits", () => {
    const plan = planPasses([
      { courseId: "EEMB 7", units: 4, fillRisk: "low" },
      { courseId: "PSY 10B", units: 5, fillRisk: "high" },
      { courseId: "PSTAT 8", units: 5, fillRisk: "medium" },
      { courseId: "JAPAN 80", units: 5, fillRisk: "low" },
    ]);
    expect(plan.passes[0].courses.map((c) => c.courseId)).toEqual(["PSY 10B", "PSTAT 8"]);
    expect(plan.passes[0].cumulativeUnits).toBe(10);
    // 10 + 5 = 15 <= 15.5 in Pass 2; then EEMB 7 (4) would make 19 -> Pass 3.
    expect(plan.passes[1].courses.map((c) => c.courseId)).toEqual(["JAPAN 80"]);
    expect(plan.passes[2].courses.map((c) => c.courseId)).toEqual(["EEMB 7"]);
  });

  it("warns when a waitlist is planned before 12 registered units", () => {
    const plan = planPasses([{ courseId: "PSY 10B", units: 5, fillRisk: "high", waitlist: true }]);
    expect(plan.warnings[0]).toMatch(/at least 12/);
  });

  it("does not warn when 12 units are already registered", () => {
    const plan = planPasses([{ courseId: "JAPAN 80", units: 5, fillRisk: "high", waitlist: true }], 12);
    expect(plan.warnings).toHaveLength(0);
    expect(plan.passes[2].courses[0].courseId).toBe("JAPAN 80"); // 12 + 5 = 17 > 15.5
  });

  it("reports overflow past the Pass 3 limit", () => {
    const plan = planPasses([{ courseId: "BIG", units: 30, fillRisk: "low" }]);
    expect(plan.overflow).toHaveLength(1);
  });
});
