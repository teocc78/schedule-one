import { NextRequest, NextResponse } from "next/server";
import { lookupCourses, upperDivisionForProgram } from "@/lib/upper-division";

/**
 * Upper-division course descriptions from the UCSB General Catalog.
 *
 * GET /api/courses?program=psychological-brain-sciences
 *   every upper-division course in that major's subjects, grouped by subject
 * GET /api/courses?codes=PSTAT 120A,PSTAT 126
 *   title, units and description for each listed course that has an entry
 */
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const program = params.get("program");
  if (program) {
    const result = upperDivisionForProgram(program);
    if (!result) return NextResponse.json({ error: "Unknown major." }, { status: 404 });
    return NextResponse.json(result);
  }
  const codes = (params.get("codes") ?? "")
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean)
    .slice(0, 400);
  if (codes.length === 0) {
    return NextResponse.json({ error: "Give a program or a list of course codes." }, { status: 400 });
  }
  return NextResponse.json({ courses: lookupCourses(codes) });
}
