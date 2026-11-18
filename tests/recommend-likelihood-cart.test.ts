import { describe, it, expect } from "vitest";
import { recommendCourses } from "@/lib/recommend";
import { computeGEStatus } from "@/lib/ge";
import { offeredLikelihood, seatLikelihood } from "@/lib/likelihood";
import { buildCartPrompt } from "@/lib/cart-prompt";
import { loadFixtureClasses, loadFixtureHistory } from "@/lib/ucsb/fixtures";
import { toCourseSections } from "@/lib/ucsb/adapter";
import { LOCKED_W27 } from "@/lib/samples/winter-2027";

const candidates = loadFixtureClasses({ quarter: "20271" })
  .map((c) => toCourseSections(c))
  .filter((c) => !["PSY 10B", "PSTAT 8", "EEMB 7"].includes(c.courseId));

describe("recommendations (greedy set cover)", () => {
  it("prefers multi-flag courses that fit, and skips ones that conflict", () => {
    // Sample student: everything met except Writing and World Cultures.
    const status = computeGEStatus([], undefined, { A: true, B: true, C: true, D: true, E: true, F: true, G: true, ET: true, QNT: true });
    const recs = recommendCourses({ candidates, geStatus: status, picks: LOCKED_W27, settings: { priority: "time", blocks: [] }, maxCourses: 2 });
    expect(recs[0].fillsGE).toEqual(expect.arrayContaining(["WRT", "NWC"]));
    expect(recs.every((r) => r.option.fits)).toBe(true);
    // POL S 1 only fills Area D, which is already met -> never recommended.
    expect(recs.map((r) => r.courseId)).not.toContain("POL S 1");
  });

  it("never recommends a section that conflicts with locked classes", () => {
    const status = computeGEStatus([]);
    const recs = recommendCourses({ candidates, geStatus: status, picks: LOCKED_W27, settings: { priority: "time", blocks: [] }, maxCourses: 4 });
    const japan = recs.find((r) => r.courseId === "JAPAN 80");
    if (japan) expect(japan.option.section?.enrollCode).not.toBe("59915");
  });
});

describe("likelihood buckets", () => {
  it("flags a winter-only course", () => {
    const quarters = loadFixtureHistory("C LIT 36").map((h) => h.quarter);
    const r = offeredLikelihood(quarters, "Winter", 5, 2026);
    expect(r.bucket).toBe("High");
    expect(r.message).toMatch(/Winter-only/);
    expect(r.disclaimer).toMatch(/don't guarantee/);
  });

  it("returns buckets, never percentages, and low confidence until verified", () => {
    const s = seatLikelihood({ history: loadFixtureHistory("PSY 10B"), pass: 2 });
    expect(["High", "Medium", "Low"]).toContain(s.bucket);
    expect(s.bucket).toBe("Low");
    expect(s.confidence).toBe("low");
    expect(JSON.stringify(s)).not.toMatch(/%/);
  });

  it("an open, rarely-full course in Pass 1 is High", () => {
    const s = seatLikelihood({ history: [{ enrolledTotal: 40, maxEnroll: 90 }], current: { enrolledTotal: 10, maxEnroll: 90 }, pass: 1 });
    expect(s.bucket).toBe("High");
  });
});

describe("cart prompt", () => {
  it("lists exact sections and the guardrails", () => {
    const p = buildCartPrompt({ quarterLabel: "Winter 2027", picks: LOCKED_W27 });
    expect(p).toContain("PSY 10B: lecture section 0100 (enroll code 10001), with discussion section 0101 (enroll code 10019)");
    expect(p).toMatch(/Add to cart ONLY/);
    expect(p).toMatch(/password or Duo code/);
    expect(p).toMatch(/stop and tell me/);
    expect(p).toMatch(/Never change or drop classes/);
    expect(p).toMatch(/doesn't match/);
    expect(p).toMatch(/Added to cart or Blocked/);
  });
});
