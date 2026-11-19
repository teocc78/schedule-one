import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseTranscriptText } from "@/lib/transcript-parser";
import { geStatusFromTranscript, suggestGECourses } from "@/lib/ge-suggest";

const sophomore = parseTranscriptText(
  readFileSync("data/samples/transcript-econ-accounting-sophomore.txt", "utf8")
).transcript;

describe("GE suggestions", () => {
  it("reads which GE areas the sophomore still needs", () => {
    const status = geStatusFromTranscript(sophomore.completedCourses, true);
    const open = status.lines.filter((l) => l.line.length === 1 && !l.met).map((l) => l.line);
    // WRIT 2 covers A1 only; MATH 3A/3B cover two of three Area C; nothing covers G.
    expect(open).toEqual(expect.arrayContaining(["A", "C", "G"]));
    expect(open).not.toContain("D");
    expect(open).not.toContain("E");
    expect(open).not.toContain("F");
  });

  it("only suggests GEs for open areas, skipping courses already taken", () => {
    const { offerings, groups } = suggestGECourses(sophomore.completedCourses, true);
    expect(offerings.length).toBeGreaterThan(3);
    for (const o of offerings) expect(o.requirementGroups?.[0]).toMatch(/^ge-[ACG]$/);
    expect(offerings.map((o) => o.code)).not.toContain("PSY 1"); // Area D is done
    expect(groups.find((g) => g.groupId === "ge-G")?.stillNeeded).toBe(1);
  });

  it("checks prerequisites: WRIT 50 needs WRIT 2", () => {
    const withoutWrit2 = sophomore.completedCourses.filter((c) => c.code !== "WRIT 2");
    const codes = suggestGECourses(withoutWrit2, true).offerings.map((o) => o.code);
    expect(codes).not.toContain("WRIT 50");
  });
});
