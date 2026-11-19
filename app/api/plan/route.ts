import { NextRequest, NextResponse } from "next/server";
import { runPlanner, NoValidScheduleError } from "@/lib/planner";
import type { PlanRequest } from "@/types";
import requirementsData from "@/data/requirements/statistics-data-science.json";
import offeringsData from "@/data/offerings/winter-2027.json";
import type { MajorRequirements, QuarterOfferings } from "@/types";

// The LLM call plus one corrective retry can take 20-40 s. Without this,
// Vercel cuts the function off at its default limit and the browser gets an
// HTML error page instead of JSON.
export const maxDuration = 60;

const requirements = requirementsData as unknown as MajorRequirements;
const offerings = offeringsData as unknown as QuarterOfferings;

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
    const result = await runPlanner(body.transcript, requirements, offerings, body.constraints);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof NoValidScheduleError) {
      return NextResponse.json({ error: err.message }, { status: 422 });
    }
    // Never log student data; the message alone is enough to debug.
    console.error("[plan]", err instanceof Error ? err.message : "unknown error");
    return NextResponse.json({ error: "Planning failed. Please try again." }, { status: 500 });
  }
}
