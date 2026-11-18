import { describe, it, expect } from "vitest";
import {
  planQuarter,
  optionRows,
  findOpenSlots,
  swapImpact,
  finalExamConflicts,
  checkSection,
  type CourseSections,
  type PlannerSettings,
  type Section,
} from "@/lib/schedule-engine";
import { LOCKED_W27, JAPAN_80_W27 } from "@/lib/samples/winter-2027";

const base: PlannerSettings = { priority: "time", blocks: [] };
const sec = (code: string, kind: Section["kind"], days: Section["meetings"][number]["days"], start: string, end: string, extra: Partial<Section> = {}): Section => ({
  enrollCode: code, section: code, kind, meetings: [{ days, start, end }], ...extra,
});

describe("Winter 2027 worked test case (spec section 1)", () => {
  it("accepts the JAPAN 80 lecture TR 11:00-12:15", () => {
    const lec = JAPAN_80_W27.options[0].lecture;
    expect(checkSection("JAPAN 80", lec, LOCKED_W27, []).fits).toBe(true);
  });

  it("rejects discussion 59915 (R 3:00-3:50) because it overlaps EEMB 7", () => {
    const d = JAPAN_80_W27.options[0].sections.find((s) => s.enrollCode === "59915")!;
    const check = checkSection("JAPAN 80", d, [...LOCKED_W27, { courseId: "JAPAN 80", lecture: JAPAN_80_W27.options[0].lecture, section: null }], []);
    expect(check.fits).toBe(false);
    expect(check.conflictsWith).toContain("EEMB 7 LEC");
  });

  it("plans JAPAN 80 with a different discussion and records why 59915 was rejected", () => {
    const out = planQuarter({ locked: LOCKED_W27, courses: [JAPAN_80_W27], settings: base });
    const j = out.picks.find((p) => p.courseId === "JAPAN 80")!;
    expect(j.lecture.enrollCode).toBe("59907");
    expect(j.section?.enrollCode).not.toBe("59915");
    expect(out.rejected.some((r) => r.enrollCode === "59915" && r.reason.includes("EEMB 7"))).toBe(true);
    // Locked picks are never moved.
    expect(out.picks.slice(0, 3)).toEqual(LOCKED_W27);
  });

  it("tags 59915 as 'conflicts with EEMB 7' in the open-slot finder", () => {
    const rows = findOpenSlots([JAPAN_80_W27], LOCKED_W27, base);
    const r = rows.find((x) => x.section?.enrollCode === "59915")!;
    expect(r.fits).toBe(false);
    expect(r.conflictsWith).toContain("EEMB 7 LEC");
    expect(rows.filter((x) => x.fits).length).toBe(2);
  });
});

describe("two-phase engine rules", () => {
  const course = (id: string, mandatory: boolean, options: CourseSections["options"], units = 4): CourseSections => ({
    courseId: id, title: id, units, mandatory, options,
  });

  it("drops a lecture with no workable section (feasibility check)", () => {
    const a = course("A", true, [{ lecture: sec("a1", "LEC", ["M", "W"], "09:00", "09:50"), sections: [] }]);
    const b = course("B", true, [
      // Its only section collides with A's lecture -> lecture is not workable.
      { lecture: sec("b1", "LEC", ["T", "R"], "09:00", "09:50"), sections: [sec("b1d", "DIS", ["M"], "09:00", "09:50")] },
      { lecture: sec("b2", "LEC", ["T", "R"], "13:00", "13:50"), sections: [sec("b2d", "DIS", ["F"], "09:00", "09:50")] },
    ]);
    const out = planQuarter({ locked: [], courses: [a, b], settings: base });
    expect(out.picks.find((p) => p.courseId === "B")!.lecture.enrollCode).toBe("b2");
    expect(out.rejected.some((r) => r.enrollCode === "b1" && r.reason === "no workable section")).toBe(true);
  });

  it("never lets a section move a lecture", () => {
    const a = course("A", true, [{ lecture: sec("a1", "LEC", ["M"], "10:00", "10:50"), sections: [sec("a1d", "DIS", ["T"], "10:00", "10:50")] }]);
    const b = course("B", true, [{ lecture: sec("b1", "LEC", ["T"], "10:00", "10:50"), sections: [] }]);
    // A's only section sits on B's only lecture: no valid plan, rather than bumping B's lecture.
    const out = planQuarter({ locked: [], courses: [a, b], settings: base });
    expect(out.picks).toHaveLength(0);
    expect(out.unplaced.length).toBeGreaterThan(0);
  });

  it("schedules mandatory courses before electives", () => {
    const elective = course("E", false, [{ lecture: sec("e1", "LEC", ["M"], "09:00", "09:50"), sections: [] }]);
    const mandatory = course("M", true, [{ lecture: sec("m1", "LEC", ["M"], "09:00", "09:50"), sections: [] }]);
    const out = planQuarter({ locked: [], courses: [elective, mandatory], settings: base });
    expect(out.picks.map((p) => p.courseId)).toEqual(["M"]);
    expect(out.unplaced.map((u) => u.courseId)).toEqual(["E"]);
  });

  it("time mode prefers the slot outside soft blocks; professor mode prefers the higher rating", () => {
    const c = course("C", true, [
      { lecture: sec("early", "LEC", ["M", "W"], "08:00", "09:15", { rating: 4.8 }), sections: [] },
      { lecture: sec("late", "LEC", ["M", "W"], "14:00", "15:15", { rating: 3.1 }), sections: [] },
    ]);
    const blocks = [
      { day: "M" as const, start: "08:00", end: "10:00", kind: "soft" as const },
      { day: "W" as const, start: "08:00", end: "10:00", kind: "soft" as const },
    ];
    const t = planQuarter({ locked: [], courses: [c], settings: { priority: "time", blocks } });
    expect(t.picks[0].lecture.enrollCode).toBe("late");
    const p = planQuarter({ locked: [], courses: [c], settings: { priority: "professor", blocks } });
    expect(p.picks[0].lecture.enrollCode).toBe("early");
    expect(p.notes.join(" ")).toMatch(/TAs/);
  });

  it("never trades a conflict for a better rating", () => {
    const locked = [{ courseId: "X", lecture: sec("x", "LEC", ["T"], "10:00", "11:00"), section: null }];
    const c = course("C", true, [
      { lecture: sec("great", "LEC", ["T"], "10:30", "11:30", { rating: 5 }), sections: [] },
      { lecture: sec("ok", "LEC", ["R"], "10:30", "11:30", { rating: 2 }), sections: [] },
    ]);
    const out = planQuarter({ locked, courses: [c], settings: { priority: "professor", blocks: [] } });
    expect(out.picks.find((p) => p.courseId === "C")!.lecture.enrollCode).toBe("ok");
  });

  it("treats hard blocks as conflicts", () => {
    const c = course("C", true, [
      { lecture: sec("a", "LEC", ["F"], "09:00", "09:50"), sections: [] },
      { lecture: sec("b", "LEC", ["F"], "13:00", "13:50"), sections: [] },
    ]);
    const out = planQuarter({ locked: [], courses: [c], settings: { priority: "time", blocks: [{ day: "F", start: "08:00", end: "12:00", kind: "hard", label: "Work" }] } });
    expect(out.picks[0].lecture.enrollCode).toBe("b");
    expect(out.rejected[0].reason).toContain("Hard block: Work");
  });

  it("uses the buffer as a preference when ranking", () => {
    const locked = [{ courseId: "X", lecture: sec("x", "LEC", ["M"], "09:00", "09:50"), section: null }];
    const c = course("C", true, [
      { lecture: sec("tight", "LEC", ["M"], "10:00", "10:50"), sections: [] },
      { lecture: sec("roomy", "LEC", ["M"], "11:00", "11:50"), sections: [] },
    ]);
    const out = planQuarter({ locked, courses: [c], settings: { priority: "time", blocks: [], bufferMinutes: 20 } });
    expect(out.picks.find((p) => p.courseId === "C")!.lecture.enrollCode).toBe("roomy");
  });
});

describe("backups and swaps (spec section 2)", () => {
  it("lists backups with status, fit and rank", () => {
    const rows = optionRows(JAPAN_80_W27, LOCKED_W27, base);
    expect(rows[0].fits).toBe(true);
    expect(rows.at(-1)!.fits).toBe(false);
    expect(rows.at(-1)!.rank).toBe(-1);
  });

  it("shows how a swap for course A changes what fits for course B", () => {
    const pstat8Alt = {
      courseId: "PSTAT 8",
      lecture: sec("20002", "LEC", ["T", "R"], "11:00", "12:15"),
      section: null,
    };
    const before = optionRows(JAPAN_80_W27, LOCKED_W27, base).filter((r) => r.fits).length;
    const after = swapImpact(LOCKED_W27, pstat8Alt, JAPAN_80_W27, base).filter((r) => r.fits).length;
    expect(before).toBe(2);
    expect(after).toBe(0); // JAPAN 80's only lecture now collides with PSTAT 8
  });

  it("flags final exam conflicts", () => {
    expect(
      finalExamConflicts([
        { courseId: "A", date: "2027-03-15", start: "08:00", end: "11:00" },
        { courseId: "B", date: "2027-03-15", start: "10:00", end: "13:00" },
        { courseId: "C", date: "2027-03-16", start: "08:00", end: "11:00" },
      ])
    ).toEqual([["A", "B"]]);
  });
});
