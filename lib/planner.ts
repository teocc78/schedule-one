import type {
  TranscriptData,
  MajorRequirements,
  QuarterOfferings,
  StudentConstraints,
  PlanResult,
} from "@/types";
import { getRemainingGroups } from "@/lib/requirements";
import { planSchedule } from "@/lib/llm";

/**
 * Orchestrates the full planning flow:
 * 1. Compute remaining requirements
 * 2. Call LLM to propose schedules
 * 3. Return validated PlanResult (validation happens inside llm.ts)
 */
export async function runPlanner(
  transcript: TranscriptData,
  requirements: MajorRequirements,
  offerings: QuarterOfferings,
  constraints: StudentConstraints
): Promise<PlanResult> {
  const remainingGroups = getRemainingGroups(requirements, transcript.completedCourses);

  const remainingGroupSummary = remainingGroups
    .map((g) => {
      const needed =
        g.stillNeeded === g.remainingCourses.length
          ? `All of: ${g.remainingCourses.join(", ")}`
          : `${g.stillNeeded} more from: ${g.remainingCourses.join(", ")}`;
      return `- ${g.groupName} (${g.groupId}): ${needed}`;
    })
    .join("\n");

  if (remainingGroups.length === 0) {
    throw new Error("All requirements are already satisfied.");
  }

  return planSchedule(
    transcript,
    requirements,
    offerings,
    constraints,
    remainingGroupSummary
  );
}
