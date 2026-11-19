import type {
  TranscriptData,
  MajorRequirements,
  QuarterOfferings,
  StudentConstraints,
  PlanResult,
  Schedule,
  ScheduledCourse,
  SwapOption,
  CourseOffering,
} from "@/types";
import {
  getRemainingGroups,
  getEligibleOfferings,
  groupCapacity,
  assignSatisfies,
  type RequirementStatus,
} from "@/lib/requirements";
import { proposeSchedules, type RawPlan, type RawSchedule } from "@/lib/llm";
import { validateSchedule } from "@/lib/validator";
import { buildFallbackSchedules } from "@/lib/fallback-scheduler";
import { normalizeCode } from "@/lib/course-codes";
import { classStanding, planNotices } from "@/lib/standing";

/** Thrown when no valid schedule exists at all; the API turns it into a 422. */
export class NoValidScheduleError extends Error {}

/** Injected for tests so they never call the real LLM. */
export type ProposeFn = typeof proposeSchedules;

/**
 * Orchestrates the full planning flow:
 * 1. Compute remaining requirements and the courses the student can take.
 * 2. Ask the LLM to propose schedules from eligible courses only.
 * 3. Validate every proposal with deterministic rules.
 * 4. If the primary fails, retry the LLM once with the validator's errors.
 * 5. If it still fails (or the LLM errors or times out), build schedules
 *    deterministically so the student still gets a valid result.
 */
export async function runPlanner(
  transcript: TranscriptData,
  requirements: MajorRequirements,
  offerings: QuarterOfferings,
  constraints: StudentConstraints,
  propose: ProposeFn = proposeSchedules
): Promise<PlanResult> {
  const remainingGroups = getRemainingGroups(requirements, transcript.completedCourses);
  if (remainingGroups.length === 0) {
    throw new NoValidScheduleError("All requirements are already satisfied.");
  }

  const eligible = getEligibleOfferings(
    offerings.courses,
    remainingGroups,
    transcript.completedCourses
  );
  if (eligible.length === 0) {
    throw new NoValidScheduleError(
      "None of this quarter's offerings fit your remaining requirements with the prerequisites you have."
    );
  }

  const remainingGroupSummary = remainingGroups
    .map((g) => {
      const needed =
        g.stillNeeded === g.remainingCourses.length
          ? `All of: ${g.remainingCourses.join(", ")}`
          : `${g.stillNeeded} more from: ${g.remainingCourses.join(", ")}`;
      return `- ${g.groupName} (${g.groupId}): ${needed}`;
    })
    .join("\n");

  const quarterLabel = offerings.quarter.includes(String(offerings.year))
    ? offerings.quarter
    : `${offerings.quarter} ${offerings.year}`;
  const ctx: Ctx = { eligible, remainingGroups, constraints, transcript };

  let schedules: Schedule[] = [];
  let feedback: string | undefined;

  for (let attempt = 1; attempt <= 2; attempt++) {
    let raw: RawPlan;
    try {
      raw = await propose(
        transcript,
        requirements,
        quarterLabel,
        eligible,
        constraints,
        remainingGroupSummary,
        feedback
      );
    } catch (err) {
      // Any AI failure (wrong settings, quota, outage, malformed output)
      // falls through to the deterministic planner so the student still gets
      // schedules. The site owner sees the cause here and in /api/health?ai=1.
      console.error("[planner] AI proposal failed; using rule-based planner:", err instanceof Error ? err.message : "unknown error");
      break;
    }
    schedules = [raw.primary, raw.backup1, raw.backup2].map((r, i) =>
      resolveSchedule(r, i > 0, ctx)
    );
    if (schedules[0].validation.valid) break;
    feedback = schedules[0].validation.errors.map((e) => `- ${e}`).join("\n");
  }

  const valid: Schedule[] = [];
  const usedKeys = new Set<string>();
  for (const s of schedules) {
    const key = scheduleKey(s);
    if (s.validation.valid && !usedKeys.has(key)) {
      usedKeys.add(key);
      valid.push(s);
    }
  }

  // Top up with deterministic schedules until there are three valid ones.
  if (valid.length < 3) {
    const fallback = buildFallbackSchedules(eligible, remainingGroups, constraints, 6);
    for (const f of fallback) {
      if (valid.length >= 3) break;
      const s = fromFallback(f.courses, f.satisfies, valid.length > 0, ctx);
      const key = scheduleKey(s);
      if (!s.validation.valid || usedKeys.has(key)) continue;
      usedKeys.add(key);
      valid.push(s);
    }
  }

  if (valid.length === 0) {
    throw new NoValidScheduleError(
      "No combination of this quarter's eligible courses fits your unit range and time preferences. Try widening the unit range, allowing earlier classes, or freeing a day."
    );
  }

  const primary = valid[0];
  // If fewer than three distinct valid schedules exist, repeat the last one
  // with a note so the UI still has its two backup tabs.
  const backup1 = valid[1] ?? { ...primary, changeNote: "No other valid combination found." };
  const backup2 = valid[2] ?? { ...backup1, changeNote: "No other valid combination found." };

  const covered = new Set(primary.courses.flatMap((c) => c.satisfies));
  const remainingRequirements = remainingGroups
    .map((g) => g.groupId)
    .filter((id) => !covered.has(id));

  const earned = transcript.totalUnitsEarned;
  return {
    primary,
    backups: [backup1, backup2],
    remainingRequirements,
    standing: classStanding(earned),
    notices: planNotices(earned, primary.totalUnits, primary.courses.map((c) => c.offering.code)),
  };
}

// ── helpers ──────────────────────────────────────────────────

interface Ctx {
  eligible: CourseOffering[];
  remainingGroups: RequirementStatus[];
  constraints: StudentConstraints;
  transcript: TranscriptData;
}

function scheduleKey(s: Schedule): string {
  return s.courses.map((c) => normalizeCode(c.offering.code)).sort().join("|");
}

function finish(
  offerings: CourseOffering[],
  satisfies: Map<string, string[]>,
  explanation: string,
  changeNote: string | undefined,
  swaps: Record<string, SwapOption[]>,
  ctx: Ctx
): Schedule {
  const courses: ScheduledCourse[] = offerings.map((o) => ({
    offering: o,
    satisfies: satisfies.get(o.code) ?? [],
  }));
  const validation = validateSchedule(courses, ctx.constraints, ctx.transcript.completedCourses, {
    groupCapacity: groupCapacity(ctx.remainingGroups),
  });
  return {
    courses,
    totalUnits: offerings.reduce((n, o) => n + o.units, 0),
    explanation,
    changeNote,
    validation,
    swaps,
  };
}

/** Turn an LLM proposal into a Schedule, ignoring codes that aren't eligible. */
export function resolveSchedule(raw: RawSchedule, isBackup: boolean, ctx: Ctx): Schedule {
  const byCode = new Map(ctx.eligible.map((o) => [normalizeCode(o.code), o]));
  const seen = new Set<string>();
  const offerings: CourseOffering[] = [];
  for (const rc of raw.courses) {
    const key = normalizeCode(rc.code);
    const o = byCode.get(key);
    if (o && !seen.has(key)) {
      seen.add(key);
      offerings.push(o);
    }
  }

  const swaps: Record<string, SwapOption[]> = {};
  for (const [courseCode, list] of Object.entries(raw.swaps)) {
    const owner = byCode.get(normalizeCode(courseCode));
    if (!owner) continue;
    swaps[owner.code] = list
      .map((s) => {
        const o = byCode.get(normalizeCode(s.code));
        return o ? { offering: o, reason: s.reason } : null;
      })
      .filter((s): s is SwapOption => s !== null);
  }

  // Requirement credit is decided in code, not by the LLM.
  const satisfies = assignSatisfies(offerings, ctx.remainingGroups);
  return finish(offerings, satisfies, raw.explanation, isBackup ? raw.changeNote : undefined, swaps, ctx);
}

function fromFallback(
  offerings: CourseOffering[],
  satisfies: Map<string, string[]>,
  isBackup: boolean,
  ctx: Ctx
): Schedule {
  const groups = [...new Set([...satisfies.values()].flat())];
  const units = offerings.reduce((n, o) => n + o.units, 0);
  const explanation =
    `${offerings.map((o) => o.code).join(", ")} (${units} units), picked by the rule-based planner` +
    (groups.length ? ` to cover ${groups.join(", ")}.` : ".");
  return finish(
    offerings,
    satisfies,
    explanation,
    isBackup ? "Alternative combination with no time conflicts." : undefined,
    {},
    ctx
  );
}
