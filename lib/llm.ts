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
  CourseOffering,
  StudentConstraints,
} from "@/types";

/**
 * Model used for every call. Override with GEMINI_MODEL in .env.local or the
 * Vercel project settings. The old default ("gemini-3.8-flash") was a guess
 * and fails with a 404 whenever GEMINI_MODEL is not set.
 */
const DEFAULT_MODEL = "gemini-2.5-flash";

export class LLMConfigError extends Error {}

let client: GoogleGenAI | null = null;

/** Created on first use so a missing key never breaks `next build`. */
function getClient(): GoogleGenAI {
  if (client) return client;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new LLMConfigError(
      "GEMINI_API_KEY is not set on the server. Add it to .env.local (local) or the Vercel project's environment variables."
    );
  }
  client = new GoogleGenAI({ apiKey });
  return client;
}

function model(): string {
  return process.env.GEMINI_MODEL?.trim() || DEFAULT_MODEL;
}

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
  const response = await getClient().models.generateContent({
    model: model(),
    contents: prompt,
    // Ask Gemini for raw JSON so markdown fences and chatty text don't
    // break parsing.
    config: { responseMimeType: "application/json", temperature: 0.4 },
  });
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

export type RawSchedule = z.infer<typeof ScheduleSchema>;
export type RawPlan = z.infer<typeof PlanLLMOutputSchema>;

/**
 * Ask the LLM to propose three schedules from courses the student is
 * already eligible for. The LLM only proposes and explains; the planner
 * validates every proposal with deterministic rules before showing it.
 *
 * `feedback` carries validation errors from a previous attempt so the
 * model can correct itself.
 */
export async function proposeSchedules(
  transcript: TranscriptData,
  requirements: MajorRequirements,
  quarterLabel: string,
  eligible: CourseOffering[],
  constraints: StudentConstraints,
  remainingGroupSummary: string,
  feedback?: string
): Promise<RawPlan> {
  const offeringsJson = JSON.stringify(
    eligible.map((c) => ({
      code: c.code,
      title: c.title,
      units: c.units,
      schedule: c.schedule,
      requirementGroups: c.requirementGroups,
    }))
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

ELIGIBLE COURSES (${quarterLabel}; prerequisites already met, none completed):
${offeringsJson}

Create 3 schedules: one primary and two backups. Each backup must differ from the primary by at least one course.

Return ONLY a JSON object:
{
  "primary": {
    "courses": [ { "code": "PSTAT 126", "satisfies": ["upper-core-methods"] } ],
    "explanation": "Plain English: why these courses, what requirements they satisfy",
    "swaps": { "PSTAT 126": [{ "code": "PSTAT 131", "reason": "..." }] }
  },
  "backup1": { "courses": [], "explanation": "...", "changeNote": "Swapped X for Y because ...", "swaps": {} },
  "backup2": { "courses": [], "explanation": "...", "changeNote": "...", "swaps": {} }
}

Rules:
- Only use codes from ELIGIBLE COURSES
- No two courses may meet at overlapping times on a shared day
- Respect all constraints (time, free days, unit range)
- Each schedule must total between ${constraints.minUnits} and ${constraints.maxUnits} units
- swaps: for each primary course, optionally suggest 1-2 alternatives from the eligible list${
    feedback
      ? `

Your previous answer was rejected by the validator for these reasons. Fix them:
${feedback}`
      : ""
  }`;

  return callWithRetry(prompt, PlanLLMOutputSchema);
}
