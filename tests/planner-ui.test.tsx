import { describe, it, expect } from "vitest";
import { renderToString } from "react-dom/server";
import { QuarterPlanner } from "@/components/planner/QuarterPlanner";

describe("Planner tab renders", () => {
  it("shows the locked sample schedule, pass plan and cart prompt", () => {
    const html = renderToString(<QuarterPlanner />);
    expect(html).toContain("Quarter Planner");
    expect(html).toContain("PSY 10B");
    expect(html).toMatch(/Pass (<!-- -->)?1/);
    expect(html).toContain("Add to cart ONLY");
  });
});
