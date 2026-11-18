import { describe, it, expect } from "vitest";
import { computeGEStatus, geScore, parseGECodes, BS_REQUIREMENTS } from "@/lib/ge";

const line = (s: ReturnType<typeof computeGEStatus>, l: string) => s.lines.find((x) => x.line === l)!;

describe("GE engine", () => {
  it("parses areas and stacking special subjects", () => {
    expect(parseGECodes(["G", "WRT", "NWC"])).toEqual({ areas: ["G"], specials: ["WRT", "NWC"] });
    expect(parseGECodes([" D ", "QN"])).toEqual({ areas: ["D"], specials: ["QNT"] });
  });

  it("counts a multi-area course toward only ONE area (Art History 6A: E or F)", () => {
    const s = computeGEStatus([{ code: "ARTHI 6A", geCodes: ["E", "F"] }]);
    const counted = [line(s, "E"), line(s, "F")].filter((l) => l.courses.includes("ARTHI 6A"));
    expect(counted).toHaveLength(1);
  });

  it("assigns a two-area course to the area with the larger remaining need", () => {
    // E needs 2, F needs 1 -> E has the larger need.
    const s = computeGEStatus([{ code: "ARTHI 6A", geCodes: ["E", "F"] }]);
    expect(s.areaAssignment["ARTHI 6A"]).toBe("E");
    // With F still open and E already filled by two single-area courses, F wins.
    const s2 = computeGEStatus([
      { code: "PHIL 1", geCodes: ["E"] },
      { code: "PHIL 3", geCodes: ["E"] },
      { code: "ARTHI 6A", geCodes: ["E", "F"] },
    ]);
    expect(s2.areaAssignment["ARTHI 6A"]).toBe("F");
    expect(line(s2, "F").met).toBe(true);
  });

  it("stacks special subjects on top of the area (JAPAN 80 = G + WRT + NWC)", () => {
    const s = computeGEStatus([{ code: "JAPAN 80", geCodes: ["G", "WRT", "NWC"] }]);
    expect(line(s, "G").met).toBe(true);
    expect(line(s, "NWC").met).toBe(true);
    expect(line(s, "WRT").have).toBe(1);
    expect(line(s, "WRT").met).toBe(false); // needs 6
  });

  it("scores candidates by open lines covered", () => {
    const status = computeGEStatus([], BS_REQUIREMENTS);
    expect(geScore({ code: "JAPAN 80", geCodes: ["G", "WRT", "NWC"] }, status).score).toBe(3);
    expect(geScore({ code: "ANTH W 3", geCodes: ["D", "WRT", "NWC"] }, status).score).toBe(3);
    expect(geScore({ code: "POL S 1", geCodes: ["D"] }, status).score).toBe(1);
  });

  it("lets the progress check win when it disagrees", () => {
    const s = computeGEStatus([{ code: "WRIT 2", geCodes: ["A"] }], BS_REQUIREMENTS, { A: true, NWC: false });
    expect(line(s, "A").met).toBe(true);
    expect(line(s, "A").source).toBe("progress-check");
  });

  it("does not credit an area that is already full", () => {
    const status = computeGEStatus([{ code: "MUS 15", geCodes: ["F"] }]);
    expect(geScore({ code: "ARTHI 1", geCodes: ["F"] }, status).score).toBe(0);
  });
});
