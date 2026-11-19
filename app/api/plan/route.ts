import { NextRequest, NextResponse } from "next/server";
import { runPlanner, NoValidScheduleError } from "@/lib/planner";
import type { PlanRequest } from "@/types";
import { combinedRequirements, findProgram, ProgramNotReadyError } from "@/lib/majors";
import offeringsData from "@/data/offerings/winter-2027.json";
import standinData from "@/data/offerings/winter-2027-standin.json";
import { buildFourYearPlan, type FourYearPlan } from "@/lib/four-year-plan";
import { normalizeCode } from "@/lib/course-codes";
import historyFixture from "@/data/ucsb-fixtures/enrollment-history.json";
import { flagsFor, historyFromFixture } from "@/lib/registration-flags";
import type { Schedule } from "@/types";
import type { QuarterOfferings } from "@/types";

// Rules only; a large schedule search can take a few seconds.
export const maxDuration = 30;

// Real 2026-27 courses with placeholder times for Stats & Data Science, plus
// stand-in sections for the other ready majors until the UCSB API is set.
const base = offeringsData as unknown as QuarterOfferings;
const standin = standinData as unknown as QuarterOfferings;
const baseCodes = new Set(base.courses.map((c) => c.code));
const offerings: QuarterOfferings = {
  ...base,
  courses: [...base.courses, ...standin.courses.filter((c) => !baseCodes.has(c.code))],
};
// Synthetic until the UCSB API key is set; see lib/registration-flags.ts.
const history = historyFromFixture(historyFixture as { courses: Record<string, { quarter: string }[]> });

function addFlags(s: Schedule, fourYear: FourYearPlan | null) {
  // The 4-year plan knows which Winter courses hold up graduation.
  const winter = new Map(
    (fourYear?.quarters[0]?.term === "Winter 2027" ? fourYear.quarters[0].courses : []).map((c) => [normalizeCode(c.code), c])
  );
  for (const c of s.courses) {
    const f = flagsFor(c.offering.code, "Winter", history, c.satisfies.length > 0);
    const p = winter.get(normalizeCode(c.offering.code));
    c.termPattern = f.termPattern;
    c.mustGet = f.mustGet || Boolean(p?.mustGet);
    c.mustGetReason = f.mustGet ? f.reason : p?.mustGetReason;
    c.exclusiveTo = f.mustGet ? f.exclusiveTo : p?.mustGet ? p.exclusiveTo : undefined;
  }
}

export async function POST(req: NextRequest) {
  let body: PlanRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Request body was not valid JSON" }, { status: 400 });
  }
  if (!body.transcript || !body.constraints) {
    return NextResponse.json({ error: "Missing transcript or constraints" }, { status: 400 });
  }

  try {
    const codes = [...(body.majorCodes?.length ? body.majorCodes : [body.majorCode || "statistics-data-science"]), body.minorCode ?? ""];
    const requirements = combinedRequirements(codes);
    let fourYear: FourYearPlan | null = null;
    try {
      fourYear = buildFourYearPlan(requirements, body.transcript);
    } catch {
      fourYear = null;
    }
    // The quarter plan prefers what the 4-year plan puts in Winter 2027.
    const priority = fourYear?.quarters[0]?.term === "Winter 2027" ? fourYear.quarters[0].courses.map((c) => c.code) : [];
    const ba = codes.some((c) => findProgram(c)?.name.includes("B.A."));
    const result = await runPlanner(body.transcript, requirements, offerings, body.constraints, priority, { ba });
    [result.primary, ...result.backups].forEach((s) => addFlags(s, fourYear));
    result.groupNames = { ...result.groupNames, ...Object.fromEntries(requirements.groups.map((g) => [g.id, g.name])) };
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof ProgramNotReadyError) {
      return NextResponse.json({ error: err.message, code: "program_not_ready" }, { status: 422 });
    }
    if (err instanceof NoValidScheduleError) {
      return NextResponse.json({ error: err.message }, { status: 422 });
    }
    // Never log student data; the message alone is enough to debug.
    console.error("[plan]", err instanceof Error ? err.message : "unknown error");
    return NextResponse.json({ error: "Planning failed. Please try again." }, { status: 500 });
  }
}
