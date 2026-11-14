import { NextRequest, NextResponse } from "next/server";
import { runPlanner } from "@/lib/planner";
import type { PlanRequest } from "@/types";
import requirementsData from "@/data/requirements/statistics-data-science.json";
import offeringsData from "@/data/offerings/winter-2027.json";
import type { MajorRequirements, QuarterOfferings } from "@/types";

const requirements = requirementsData as unknown as MajorRequirements;
const offerings = offeringsData as unknown as QuarterOfferings;

export async function POST(req: NextRequest) {
  try {
    const body: PlanRequest = await req.json();
    if (!body.transcript || !body.constraints) {
      return NextResponse.json({ error: "Missing transcript or constraints" }, { status: 400 });
    }

    const result = await runPlanner(
      body.transcript,
      requirements,
      offerings,
      body.constraints
    );

    // Never return an invalid primary schedule
    if (!result.primary.validation.valid) {
      return NextResponse.json(
        {
          error: "Could not produce a valid schedule. Errors: " +
            result.primary.validation.errors.join("; "),
        },
        { status: 422 }
      );
    }

    return NextResponse.json(result);
  } catch (err) {
    console.error("[plan]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Planning failed" },
      { status: 500 }
    );
  }
}
