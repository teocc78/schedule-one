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
  type RequirementStatus,
} from "@/lib/requirements";
import { validateSchedule } from "@/lib/validator";
import { buildFallbackSchedules } from "@/lib/fallback-scheduler";
import { normalizeCode } from "@/lib/course-codes";
import { classStanding, planNotices, fullTimeNotice, FULL_TIME_MIN_UNITS } from "@/lib/standing";

/** Thrown when no valid schedule exists at all; the API turns it into a 422. */
export class NoValidScheduleError extends Error {}

/**
 * Plans one quarter with rules only (no AI):
 * 1. Work out the remaining requirements and the courses the student can take.
 * 2. Search combinations of those courses that fit the unit range, time
 *    preferences and free days, with no time conflicts.
 * 3. Score them: courses that count toward requirements first, then courses
 *    the 4-year plan puts in this quarter, then courses marked interesting.
 * 4. Validate the best three; the first is the main schedule, the others are
 *    backups, and each course gets swap options that fit around the rest.
 */
export async function runPlanner(
  transcript: TranscriptData,
  requirements: MajorRequirements,
  offerings: QuarterOfferings,
  constraints: StudentConstraints,
  /** Course codes the 4-year plan puts in this quarter; preferred, not required. */
  priority: string[] = []
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

  // Early in a major, the rest of the major often waits on one gateway course
  // (an Econ sophomore can only take ECON 10A in Winter). When the eligible
  // major courses can't reach the unit minimum, plan what there is and tell
  // the student how many GE or elective units to add, instead of failing.
  const unitsByCode = new Map<string, number>();
  for (const o of eligible) {
    const k = normalizeCode(o.code);
    unitsByCode.set(k, Math.max(unitsByCode.get(k) ?? 0, o.units));
  }
  const majorUnitsAvailable = [...unitsByCode.values()].reduce((a, b) => a + b, 0);
  const shortOfMinimum = majorUnitsAvailable < constraints.minUnits;
  const planConstraints: StudentConstraints = shortOfMinimum
    ? { ...constraints, minUnits: majorUnitsAvailable }
    : constraints;

  const ctx: Ctx = { eligible, remainingGroups, constraints: planConstraints, transcript };

  const valid: Schedule[] = [];
  const usedKeys = new Set<string>();
  for (const f of buildFallbackSchedules(eligible, remainingGroups, planConstraints, 8, 5, priority)) {
    if (valid.length >= 3) break;
    const s = fromSearch(f.courses, f.satisfies, valid[0] ?? null, ctx);
    const key = scheduleKey(s);
    if (!s.validation.valid || usedKeys.has(key)) continue;
    usedKeys.add(key);
    valid.push(s);
  }

  if (valid.length === 0) {
    throw new NoValidScheduleError(
      "Nothing fits your units and times. Try a wider unit range or earlier classes."
    );
  }

  const primary = valid[0];
  // If fewer than three distinct valid schedules exist, repeat the last one
  // with a note so the UI still has its two backup tabs.
  const same = "Same as the main schedule: nothing else fits. Use the swap options or add a GE.";
  const backup1 = valid[1] ?? { ...primary, changeNote: same };
  const backup2 = valid[2] ?? { ...(valid[1] ?? primary), changeNote: same };

  const covered = new Set(primary.courses.flatMap((c) => c.satisfies));
  const remainingRequirements = remainingGroups
    .map((g) => g.groupId)
    .filter((id) => !covered.has(id));

  // Courses in progress finish before the quarter being planned starts.
  const earned = transcript.totalUnitsEarned + (transcript.unitsInProgress ?? 0);
  return {
    primary,
    backups: [backup1, backup2],
    remainingRequirements,
    standing: classStanding(earned),
    notices: shortOfMinimum
      ? [
          gapNotice(primary.totalUnits, constraints.minUnits),
          ...planNotices(earned, primary.totalUnits, primary.courses.map((c) => c.offering.code)).filter(
            (n) => n !== fullTimeNotice(primary.totalUnits)
          ),
        ]
      : planNotices(earned, primary.totalUnits, primary.courses.map((c) => c.offering.code)),
  };
}

// ── helpers ──────────────────────────────────────────────────

/** Used when the major's eligible courses can't reach the unit minimum. */
export function gapNotice(majorUnits: number, minUnits: number): string {
  const target = Math.max(minUnits, FULL_TIME_MIN_UNITS);
  return `Only ${majorUnits} major units are open this quarter. Add at least ${target - majorUnits} units of GE or elective courses to reach ${target}${target === FULL_TIME_MIN_UNITS ? " (full time)" : ""}.`;
}

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

function overlaps(a: CourseOffering, b: CourseOffering): boolean {
  const min = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
  };
  if (!a.schedule.days.some((d) => b.schedule.days.includes(d))) return false;
  return min(a.schedule.startTime) < min(b.schedule.endTime) && min(b.schedule.startTime) < min(a.schedule.endTime);
}

/**
 * Up to three swap options per course: eligible courses not already in the
 * schedule that fit around the others and stay within the unit range. Ones
 * that count toward the same requirement come first.
 */
export function buildSwaps(chosen: CourseOffering[], satisfies: Map<string, string[]>, ctx: Ctx): Record<string, SwapOption[]> {
  const inSchedule = new Set(chosen.map((o) => normalizeCode(o.code)));
  const total = chosen.reduce((n, o) => n + o.units, 0);
  const swaps: Record<string, SwapOption[]> = {};
  const groupsOf = (o: CourseOffering) =>
    ctx.remainingGroups.filter((g) => g.remainingCourses.some((c) => normalizeCode(c) === normalizeCode(o.code))).map((g) => g.groupId);
  const nameOf = (id: string) => ctx.remainingGroups.find((g) => g.groupId === id)?.groupName ?? id;
  for (const o of chosen) {
    const others = chosen.filter((x) => x !== o);
    const mine = new Set(satisfies.get(o.code) ?? []);
    const options = ctx.eligible
      .filter((alt) => !inSchedule.has(normalizeCode(alt.code)))
      .filter((alt) => !others.some((x) => overlaps(x, alt)))
      .filter((alt) => {
        const units = total - o.units + alt.units;
        return units >= ctx.constraints.minUnits && units <= ctx.constraints.maxUnits;
      })
      .filter((alt) => !ctx.constraints.freeDays.some((d) => alt.schedule.days.includes(d)))
      .map((alt) => {
        const groups = groupsOf(alt);
        const same = groups.find((g) => mine.has(g));
        return {
          offering: alt,
          sameGroup: Boolean(same),
          reason: same
            ? `Also counts toward ${nameOf(same)}, and fits your other classes.`
            : `Counts toward ${groups[0] ? nameOf(groups[0]) : "your major"} instead, and fits your other classes.`,
        };
      })
      .sort((a, b) => Number(b.sameGroup) - Number(a.sameGroup));
    const seen = new Set<string>();
    swaps[o.code] = options
      .filter((x) => !seen.has(normalizeCode(x.offering.code)) && seen.add(normalizeCode(x.offering.code)))
      .slice(0, 3)
      .map(({ offering, reason }) => ({ offering, reason }));
  }
  return swaps;
}

function fromSearch(
  offerings: CourseOffering[],
  satisfies: Map<string, string[]>,
  primary: Schedule | null,
  ctx: Ctx
): Schedule {
  const groups = [...new Set([...satisfies.values()].flat())].map(
    (id) => ctx.remainingGroups.find((g) => g.groupId === id)?.groupName ?? id
  );
  const units = offerings.reduce((n, o) => n + o.units, 0);
  const explanation =
    `${offerings.map((o) => o.code).join(", ")} (${units} units)` +
    (groups.length ? `, covering ${groups.join(", ")}.` : ".");
  let changeNote: string | undefined;
  if (primary) {
    const main = new Set(primary.courses.map((c) => c.offering.code));
    const mine = new Set(offerings.map((o) => o.code));
    const out = [...main].filter((c) => !mine.has(c));
    const add = [...mine].filter((c) => !main.has(c));
    changeNote = out.length && add.length ? `Takes ${add.join(", ")} instead of ${out.join(", ")}.` : add.length ? `Adds ${add.join(", ")}.` : `Drops ${out.join(", ")}.`;
  }
  return finish(offerings, satisfies, explanation, changeNote, buildSwaps(offerings, satisfies, ctx), ctx);
}
