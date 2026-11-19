import { describe, it, expect } from "vitest";
import { gradesFor, instructorShortName } from "@/lib/grade-history";

describe("past grades", () => {
  it("has recent grades for a common course, with sane numbers", () => {
    const g = gradesFor("econ  10a");
    expect(g).not.toBeNull();
    expect(g!.all.avgGPA).toBeGreaterThan(1);
    expect(g!.all.avgGPA).toBeLessThanOrEqual(4.3);
    expect(g!.instructors.length).toBeGreaterThan(0);
    expect(g!.instructors.length).toBeLessThanOrEqual(4);
  });

  it("returns null for a course with no data", () => {
    expect(gradesFor("FAKE 999")).toBeNull();
  });

  it("shortens registrar names to a last name", () => {
    expect(instructorShortName("LANG B J")).toBe("Lang");
  });
});
