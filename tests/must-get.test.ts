import { describe, it, expect } from "vitest";
import { mustGetLabel } from "@/lib/must-get";
import { flagsFor } from "@/lib/registration-flags";

describe("must-get label", () => {
  it("names the only quarter a class runs in", () => {
    expect(mustGetLabel("Winter", "Winter")).toBe("MUST GET, EXCLUSIVE TO WINTER");
    expect(mustGetLabel("Spring", "Spring")).toBe("MUST GET, EXCLUSIVE TO SPRING");
  });
  it("says the quarter when the class matters for another reason", () => {
    expect(mustGetLabel("Fall")).toBe("MUST GET IN FALL");
  });
  it("registration flags carry the exclusive quarter", () => {
    const winterOnly = ["20221", "20231", "20241", "20251"];
    expect(flagsFor("ECON 10A", "Winter", { "ECON 10A": winterOnly }, true).exclusiveTo).toBe("Winter");
  });
});
