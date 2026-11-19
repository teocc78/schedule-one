import { describe, it, expect } from "vitest";
import { parseTranscriptText } from "@/lib/transcript-parser";

const codes = (text: string) => parseTranscriptText(text).transcript.completedCourses.map((c) => `${c.code}:${c.grade}:${c.units}:${c.quarter}`);

describe("transcript reader (no AI)", () => {
  it("reads the GOLD layout with quarter headings", () => {
    expect(codes("FALL 2023\nMATH 3A  Calculus with Applications I   4.0  A\nPSTAT 8  Transition to Data Science 4.0 B+\nWINTER 2024\nCMPSC 8 Intro to Computer Science 4.0 A-")).toEqual([
      "MATH 3A:A:4:Fall 2023",
      "PSTAT 8:B+:4:Fall 2023",
      "CMPSC 8:A-:4:Winter 2024",
    ]);
  });

  it("reads grade-before-units and ignores grade points", () => {
    expect(codes("Fall Quarter 2024 - Undergraduate\nPSTAT 120A PROBABILITY & STATISTICS A- 4.0 14.8")).toEqual(["PSTAT 120A:A-:4:Fall 2024"]);
  });

  it("reads attempted and earned columns before the grade", () => {
    expect(codes("Spring 2025\nECON 1 PRINCIPLES OF ECON-MICRO 5.0 5.0 B 15.0")).toEqual(["ECON 1:B:5:Spring 2025"]);
  });

  it("reads comma-separated rows with the quarter on each line", () => {
    expect(codes("Winter 2024, CMPSC 8, Intro to Computer Science, 4, B+\nF23 ECON 1 Principles of Economics 5 A")).toEqual([
      "CMPSC 8:B+:4:Winter 2024",
      "ECON 1:A:5:Fall 2023",
    ]);
  });

  it("reads lower case and codes with no space", () => {
    expect(codes("pstat8 Transition to Data Science 4 a")).toEqual(["PSTAT 8:A:4:"]);
  });

  it("treats a row with no grade yet as in progress, and keeps Roman numerals in titles", () => {
    const r = parseTranscriptText("WINTER 2026\nMATH 4A LINEAR ALGEBRA I 4.0\nMATH 3B CALCULUS II 4.0 B").transcript;
    expect(r.completedCourses.map((c) => [c.code, c.title, c.grade])).toEqual([
      ["MATH 4A", "LINEAR ALGEBRA I", "IP"],
      ["MATH 3B", "CALCULUS II", "B"],
    ]);
    expect(r.unitsInProgress).toBe(4);
    expect(r.totalUnitsEarned).toBe(4);
  });

  it("leaves out withdrawn and failed courses", () => {
    expect(codes("Fall 2024\nCHEM 1A General Chemistry 3.0 W\nMATH 2A Calculus 5.0 F\nANTH 2 Intro Cultural Anthropology 4.0 P")).toEqual(["ANTH 2:P:4:Fall 2024"]);
  });

  it("skips summary lines and finds the major", () => {
    const r = parseTranscriptText("Major: Economics & Accounting\nTOTAL UNITS 48.0\nTerm GPA 3.50 Units 16\nECON 2 Macro 5.0 A").transcript;
    expect(r.major).toBe("Economics & Accounting");
    expect(r.completedCourses.map((c) => c.code)).toEqual(["ECON 2"]);
  });
});
