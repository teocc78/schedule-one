/**
 * All Gemini API calls.
 * - Structured JSON outputs with Zod schema validation
 * - One automatic retry on validation failure
 * - API key from environment variable only
 */

import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import type {
  TranscriptData,
  MajorRequirements,
  QuarterOfferings,
  StudentConstraints,
  PlanResult,
  ScheduledCourse,
  Schedule,
  SwapOption,
} from "@/types";
import { validateSchedule } from "@/lib/validator";
import { mapCoursesToGroups } from "@/lib/requirements";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
// shortcut: model name validated at runtime by API; set GEMINI_MODEL=gemini-3.8-flash
const MODEL = process.env.GEMINI_MODEL ?? "gemini-3.8-flash";

// ── Zod schemas ───────────────────────────────────────────────

const CompletedCourseSchema = z.object({
  code: z.string(),
  title: z.string(),
  units: z.number(),
  grade: z.string(),
  quarter: z.string(),
});

const TranscriptDataSchema = z.object({
  studentName: z.string(),
  studentId: z.string(),
  major: z.string(),
  completedCourses: z.array(CompletedCourseSchema),
  totalUnitsEarned: z.number(),
});

const ScheduledCourseSchema = z.object({
  code: z.string(),
  satisfies: z.array(z.string()),
});

const SwapOptionSchema = z.object({
  code: z.string(),
  reason: z.string(),
});

const ScheduleSchema = z.object({
  courses: z.array(ScheduledCourseSchema),
  explanation: z.string(),
  changeNote: z.string().optional(),
  swaps: z.record(z.string(), z.array(SwapOptionSchema)),
});

const PlanLLMOutputSchema = z.object({
  primary: ScheduleSchema,
  backup1: ScheduleSchema,
  backup2: ScheduleSchema,
});

// ── Helpers ───────────────────────────────────────────────────

async function callWithRetry<T>(
  prompt: string,
  schema: z.ZodType<T>,
  attempt = 1
): Promise<T> {
  const response = await ai.models.generateContent({ model: MODEL, contents: prompt });
  const text = response.text ?? "";

  // Extract JSON from the response (handles markdown code blocks)
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/) ??
    text.match(/(\{[\s\S]*\})/);
  const jsonStr = jsonMatch ? jsonMatch[1] : text;

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr.trim());
  } catch {
    if (attempt < 2) {
      return callWithRetry(prompt + "\n\nIMPORTANT: Return ONLY valid JSON, no other text.", schema, attempt + 1);
    }
    throw new Error(`Failed to parse LLM JSON output: ${jsonStr.slice(0, 200)}`);
  }

  const result = schema.safeParse(parsed);
  if (!result.success) {
    if (attempt < 2) {
      const errorMsg = result.error.issues.map((e) => `${String(e.path.join("."))}: ${e.message}`).join("; ");
      return callWithRetry(
        prompt + `\n\nYour previous response had validation errors: ${errorMsg}. Please fix and return valid JSON.`,
        schema,
        attempt + 1
      );
    }
    throw new Error(`LLM output failed schema validation: ${result.error.message}`);
  }

  return result.data;
}

// ── Transcript parsing ────────────────────────────────────────

export async function parseTranscript(text: string): Promise<TranscriptData> {
  const prompt = `You are a transcript parser for UCSB. Extract course information from the following transcript text.

Return ONLY a JSON object with this exact structure:
{
  "studentName": "Full Name",
  "studentId": "last 4 digits only",
  "major": "declared major as written",
  "completedCourses": [
    {
      "code": "DEPT 123",
      "title": "Course Title",
      "units": 4,
      "grade": "A",
      "quarter": "Fall 2023"
    }
  ],
  "totalUnitsEarned": 0
}

Rules:
- Include ALL courses that have a final grade (not IP/in-progress)
- Exclude courses with grade W (withdrawn) or IP
- Use the exact course code format with a space (e.g. "PSTAT 120A")
- grade must be one of: A+, A, A-, B+, B, B-, C+, C, C-, D+, D, D-, F, P, NP
- totalUnitsEarned is the sum of units for all included courses
- studentId: use only last 4 digits shown, or "0000" if not found

Transcript text:
---
${text}
---`;

  // Cast grade to LetterGrade — LLM is instructed to use valid values
  const raw = await callWithRetry(prompt, TranscriptDataSchema);
  return raw as TranscriptData;
}

// ── Schedule planning ─────────────────────────────────────────

export async function planSchedule(
  transcript: TranscriptData,
  requirements: MajorRequirements,
  offerings: QuarterOfferings,
  constraints: StudentConstraints,
  remainingGroupSummary: string
): Promise<PlanResult> {
  const offeringsJson = JSON.stringify(
    offerings.courses.map((c) => ({
      code: c.code,
      title: c.title,
      units: c.units,
      schedule: c.schedule,
      prerequisites: c.prerequisites,
      requirementGroups: c.requirementGroups,
    })),
    null,
    2
  );

  const completedCodes = transcript.completedCourses.map((c) => c.code);

  const prompt = `You are a UCSB academic advisor. Create a course schedule for a ${requirements.major} student.

COMPLETED COURSES: ${completedCodes.join(", ")}

REMAINING REQUIREMENTS:
${remainingGroupSummary}

STUDENT CONSTRAINTS:
- Target units: ${constraints.minUnits}–${constraints.maxUnits}
${constraints.noClassBefore ? `- No classes before ${constraints.noClassBefore}` : ""}
${constraints.freeDays.length ? `- Keep free: ${constraints.freeDays.join(", ")}` : ""}
${constraints.mustInclude.length ? `- Must include: ${constraints.mustInclude.join(", ")}` : ""}
${constraints.mustExclude.length ? `- Must exclude: ${constraints.mustExclude.join(", ")}` : ""}
${constraints.freeText ? `- Student preference: ${constraints.freeText}` : ""}

AVAILABLE COURSES (${offerings.quarter} ${offerings.year}):
${offeringsJson}

Create 3 schedules: one primary and two backups. Each backup must differ from the primary by at least one course swap.

Return ONLY a JSON object:
{
  "primary": {
    "courses": [
      { "code": "PSTAT 126", "satisfies": ["upper-methods"] }
    ],
    "explanation": "Plain English: why these courses, what requirements they satisfy",
    "swaps": {
      "PSTAT 126": [{ "code": "PSTAT 131", "reason": "Also satisfies upper-methods and has later times" }]
    }
  },
  "backup1": {
    "courses": [...],
    "explanation": "...",
    "changeNote": "Swapped X for Y because ...",
    "swaps": {}
  },
  "backup2": {
    "courses": [...],
    "explanation": "...",
    "changeNote": "Swapped ...",
    "swaps": {}
  }
}

Rules:
- Only include courses from the AVAILABLE COURSES list
- Do not include courses already completed
- Respect all constraints (time, free days, unit range)
- Only include courses whose prerequisites are all in COMPLETED COURSES
- satisfies array: list the requirement group IDs this course counts toward (use the requirementGroups field from the course data)
- Each schedule should total between ${constraints.minUnits} and ${constraints.maxUnits} units
- swaps: for each primary course, optionally suggest 1-2 alternative courses from the available list`;

  const raw = await callWithRetry(prompt, PlanLLMOutputSchema);

  // Resolve each raw schedule into a full Schedule with validation
  const offeringMap = new Map(offerings.courses.map((o) => [o.code, o]));

  function resolveSchedule(
    raw: z.infer<typeof ScheduleSchema>,
    isBackup: boolean
  ): Schedule {
    const scheduledCourses: ScheduledCourse[] = raw.courses
      .map((rc) => {
        const offering = offeringMap.get(rc.code);
        if (!offering) return null;
        return { offering, satisfies: rc.satisfies };
      })
      .filter((sc): sc is ScheduledCourse => sc !== null);

    const swaps: Record<string, SwapOption[]> = {};
    for (const [courseCode, swapList] of Object.entries(raw.swaps)) {
      const typedSwapList = swapList as Array<{ code: string; reason: string }>;
      swaps[courseCode] = typedSwapList
        .map((s) => {
          const offering = offeringMap.get(s.code);
          if (!offering) return null;
          return { offering, reason: s.reason };
        })
        .filter((s): s is SwapOption => s !== null);
    }

    const totalUnits = scheduledCourses.reduce(
      (sum, sc) => sum + sc.offering.units,
      0
    );

    const validation = validateSchedule(
      scheduledCourses,
      constraints,
      transcript.completedCourses
    );

    return {
      courses: scheduledCourses,
      totalUnits,
      explanation: raw.explanation,
      changeNote: isBackup ? raw.changeNote : undefined,
      validation,
      swaps,
    };
  }

  const primary = resolveSchedule(raw.primary, false);
  const backup1 = resolveSchedule(raw.backup1, true);
  const backup2 = resolveSchedule(raw.backup2, true);

  // Compute remaining requirements after this quarter
  const allScheduledCodes = primary.courses.map((sc) => sc.offering.code);
  const grouped = mapCoursesToGroups(allScheduledCodes, requirements);
  const coveredGroupIds = new Set(Object.values(grouped).flat());
  const remainingRequirements = requirements.groups
    .map((g) => g.id)
    .filter((id) => !coveredGroupIds.has(id));

  return {
    primary,
    backups: [backup1, backup2],
    remainingRequirements,
  };
}
