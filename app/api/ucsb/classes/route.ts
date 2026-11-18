import { NextRequest, NextResponse } from "next/server";
import { getClasses, ucsbClient, UcsbApiError } from "@/lib/ucsb/client";
import { toCourseSections } from "@/lib/ucsb/adapter";

/**
 * GET /api/ucsb/classes?quarter=20271&subjectCode=JAPAN&geCode=NWC&refresh=1
 * Course data only. The UCSB key stays on the server.
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const quarter = sp.get("quarter") ?? "";
  if (!/^\d{5}$/.test(quarter)) {
    return NextResponse.json({ error: "quarter must be YYYYQ, e.g. 20271" }, { status: 400 });
  }
  if (sp.get("refresh") === "1") ucsbClient().clearCache();

  try {
    const r = await getClasses({
      quarter,
      subjectCode: sp.get("subjectCode") ?? undefined,
      courseId: sp.get("courseId") ?? undefined,
      geCode: sp.get("geCode") ?? undefined,
    });
    return NextResponse.json({
      source: r.source,
      warning: r.warning,
      courses: r.classes.map((c) => toCourseSections(c)),
    });
  } catch (err) {
    const status = err instanceof UcsbApiError ? (err.status === 404 ? 404 : 502) : 500;
    console.error("[ucsb/classes]", err instanceof Error ? err.message : "unknown error");
    return NextResponse.json({ error: "Couldn't load UCSB class data right now." }, { status });
  }
}
