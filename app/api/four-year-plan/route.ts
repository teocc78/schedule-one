import { NextRequest, NextResponse } from "next/server";
import { combinedRequirements, ProgramNotReadyError } from "@/lib/majors";
import { buildFourYearPlan } from "@/lib/four-year-plan";
import type { TranscriptData } from "@/types";

/**
 * Rule-based 4-year plan (no AI). Never logs transcript contents.
 */
export async function POST(req: NextRequest) {
  let body: { transcript?: TranscriptData; majorCodes?: string[]; minorCode?: string; maxUnits?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Request body was not valid JSON" }, { status: 400 });
  }
  const t = body.transcript;
  if (!t || !Array.isArray(t.completedCourses)) {
    return NextResponse.json({ error: "Missing transcript" }, { status: 400 });
  }
  try {
    const codes = [...(body.majorCodes?.length ? body.majorCodes : ["statistics-data-science"]), body.minorCode ?? ""];
    const requirements = combinedRequirements(codes);
    const maxMajorUnits = typeof body.maxUnits === "number" && body.maxUnits >= 8 ? Math.min(body.maxUnits, 21) : undefined;
    return NextResponse.json(buildFourYearPlan(requirements, t, { maxMajorUnits }));
  } catch (err) {
    if (err instanceof ProgramNotReadyError) {
      return NextResponse.json({ error: err.message, code: "program_not_ready" }, { status: 422 });
    }
    console.error("[four-year-plan]", err instanceof Error ? err.message : "unknown error");
    return NextResponse.json({ error: "Couldn't build the 4-year plan. Please try again." }, { status: 500 });
  }
}
