import { NextRequest, NextResponse } from "next/server";
import { runPlanner, NoValidScheduleError } from "@/lib/planner";
import type { PlanRequest } from "@/types";
import { combinedRequirements, ProgramNotReadyError } from "@/lib/majors";
import offeringsData from "@/data/offerings/winter-2027.json";
import historyFixture from "@/data/ucsb-fixtures/enrollment-history.json";
import { flagsFor, historyFromFixture } from "@/lib/registration-flags";
import type { Schedule } from "@/types";
import type { QuarterOfferings } from "@/types";

// The LLM call plus one corrective retry can take 20-40 s. Without this,
// Vercel cuts the function off at its default limit and the browser gets an
// HTML error page instead of JSON.
export const maxDuration = 60;

const offerings = offeringsData as unknown as QuarterOfferings;
// Synthetic until the UCSB API key is set; see lib/registration-flags.ts.
const history = historyFromFixture(historyFixture as { courses: Record<string, { quarter: string }[]> });

function addFlags(s: Schedule) {
  for (const c of s.courses) {
    const f = flagsFor(c.offering.code, "Winter", history, c.satisfies.length > 0);
    c.termPattern = f.termPattern;
    c.mustGet = f.mustGet;
    c.mustGetReason = f.reason;
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
    const result = await runPlanner(body.transcript, requirements, offerings, body.constraints);
    [result.primary, ...result.backups].forEach(addFlags);
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
