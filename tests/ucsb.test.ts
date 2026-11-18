import { describe, it, expect, vi } from "vitest";
import { UcsbClient, UcsbConfigError, UcsbRateLimitError, getClasses, UCSB_BASE_URL } from "@/lib/ucsb/client";
import { toQuarterCode, fromQuarterCode } from "@/lib/ucsb/quarter";
import { linkSections } from "@/lib/ucsb/linking";
import { toCourseSections, parseDays, parseTime } from "@/lib/ucsb/adapter";
import { loadFixtureClasses } from "@/lib/ucsb/fixtures";
import { planQuarter } from "@/lib/schedule-engine";
import { LOCKED_W27 } from "@/lib/samples/winter-2027";

describe("quarter codes", () => {
  it("Winter 2027 is 20271", () => {
    expect(toQuarterCode("Winter", 2027)).toBe("20271");
    expect(fromQuarterCode("20192")).toEqual({ name: "Spring", year: 2019 });
  });
});

describe("adapter", () => {
  it("parses padded day strings and times", () => {
    expect(parseDays("M W    ")).toEqual(["M", "W"]);
    expect(parseDays(" T R   ")).toEqual(["T", "R"]);
    expect(parseTime("1100")).toBe("11:00");
    expect(parseTime("9:30")).toBe("09:30");
  });

  it("links discussions to their lecture by section number", () => {
    const [japan] = loadFixtureClasses({ quarter: "20271", courseId: "JAPAN 80" });
    const groups = linkSections(japan.classSections!);
    expect(groups).toHaveLength(1);
    expect(groups[0].lecture.section).toBe("0100");
    expect(groups[0].secondaries.map((s) => s.enrollCode)).toEqual(["59915", "59923", "59931"]);
  });

  it("feeds fixture data straight into the engine (59915 rejected)", () => {
    const [japan] = loadFixtureClasses({ quarter: "20271", courseId: "JAPAN 80" });
    const course = toCourseSections(japan);
    expect(course.courseId).toBe("JAPAN 80");
    expect(course.geCodes).toEqual(["G", "WRT", "NWC"]);
    const out = planQuarter({ locked: LOCKED_W27, courses: [course], settings: { priority: "time", blocks: [] } });
    expect(out.picks.find((p) => p.courseId === "JAPAN 80")!.section!.enrollCode).not.toBe("59915");
  });

  it("marks full sections", () => {
    const [cl] = loadFixtureClasses({ quarter: "20271", courseId: "C LIT 36" });
    const c = toCourseSections(cl);
    expect(c.options[0].sections.find((s) => s.enrollCode === "61027")!.status).toBe("full");
  });
});

describe("UCSB client", () => {
  const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

  it("fails clearly without a key and getClasses falls back to fixtures", async () => {
    const c = new UcsbClient(undefined, vi.fn());
    await expect(c.searchClasses({ quarter: "20271" })).rejects.toBeInstanceOf(UcsbConfigError);
    const r = await getClasses({ quarter: "20271", geCode: "NWC" }, c);
    expect(r.source).toBe("fixture");
    expect(r.classes.map((x) => x.title)).toEqual(expect.arrayContaining([expect.stringContaining("Japanese")]));
    expect(r.classes.every((x) => x.generalEducation!.some((g) => g.geCode === "NWC"))).toBe(true);
  });

  it("sends the key only as the ucsb-api-key header and uses exact parameter names", async () => {
    const f = vi.fn(async () => ok({ pageNumber: 1, pageSize: 500, total: 0, classes: [] }));
    const c = new UcsbClient("test-key", f as unknown as typeof fetch);
    await c.searchClasses({ quarter: "20271", subjectCode: "JAPAN", openSections: true, pageSize: 900 });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url.startsWith(`${UCSB_BASE_URL}/v3/classes/search?`)).toBe(true);
    expect(url).toContain("subjectCode=JAPAN");
    expect(url).toContain("openSections=true");
    expect(url).toContain("pageSize=500");
    expect(url).not.toContain("test-key");
    expect((init.headers as Record<string, string>)["ucsb-api-key"]).toBe("test-key");
  });

  it("serves repeat calls from cache", async () => {
    const f = vi.fn(async () => ok({ pageNumber: 1, pageSize: 10, total: 0, classes: [] }));
    const c = new UcsbClient("k", f as unknown as typeof fetch);
    await c.searchClasses({ quarter: "20271" });
    await c.searchClasses({ quarter: "20271" });
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("enforces the hourly call budget", async () => {
    const f = vi.fn(async () => ok({}));
    const c = new UcsbClient("k", f as unknown as typeof fetch);
    for (let i = 0; i < 10; i++) await c.getFinals("20271", String(10000 + i));
    await expect(c.getFinals("20271", "99999")).rejects.toBeInstanceOf(UcsbRateLimitError);
  });

  it("treats an invalid key as a configuration error", async () => {
    const f = vi.fn(async () => new Response('{"fault":{"faultstring":"Invalid ApiKey for given resource"}}', { status: 401 }));
    const c = new UcsbClient("bad", f as unknown as typeof fetch);
    await expect(c.getClass("20271", "59915")).rejects.toBeInstanceOf(UcsbConfigError);
  });

  it("surfaces 404 messages", async () => {
    const f = vi.fn(async () => new Response('{"message":"No class found"}', { status: 404 }));
    const c = new UcsbClient("k", f as unknown as typeof fetch);
    await expect(c.getClass("20271", "00000")).rejects.toThrow(/404: No class found/);
  });
});
