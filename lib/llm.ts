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
 * Default model. gemini-3.8-flash is Google's current stable Flash model.
 * Google limits the 2.5 models to projects that already used them, so a
 * new API key gets errors from "gemini-2.5-flash"; that is what broke
 * transcript reading in production. Override with GEMINI_MODEL.
 */
export const DEFAULT_MODEL = "gemini-3.8-flash";

/**
 * Tried in order when the configured model is unavailable to this key
 * (unknown model, or not enabled for the project).
 */
export const FALLBACK_MODELS = ["gemini-3.8-flash", "gemini-flash-latest", "gemini-3.5-flash-lite"];

/** The server is missing or has a wrong setting (key, model). */
export class LLMConfigError extends Error {}
/** Gemini is rate limiting or overloaded; trying again later can work. */
export class LLMBusyError extends Error {}

let client: GoogleGenAI | null = null;

/** Created on first use so a missing key never breaks `next build`. */
function getClient(): GoogleGenAI {
  if (client) return client;
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new LLMConfigError(
      "GEMINI_API_KEY is not set on the server. Add it to .env.local (local) or the Vercel project's environment variables, then redeploy."
    );
  }
  client = new GoogleGenAI({ apiKey });
  return client;
}

/** For tests only. */
export function resetClientForTests() {
  client = null;
  workingModel = null;
}

function modelsToTry(): string[] {
  const configured = process.env.GEMINI_MODEL?.trim();
  const list = configured ? [configured, ...FALLBACK_MODELS] : [DEFAULT_MODEL, ...FALLBACK_MODELS];
  return [...new Set(list)];
}

/** Remember which model worked so later calls skip the failed ones. */
let workingModel: string | null = null;

export type LLMErrorKind = "key" | "model" | "busy" | "other";

/** Sort a Gemini SDK error into something the app can act on. */
export function classifyError(err: unknown): LLMErrorKind {
  const status = typeof err === "object" && err && "status" in err ? Number((err as { status: unknown }).status) : NaN;
  const msg = err instanceof Error ? err.message : String(err);
  if (/api[ _-]?key (not valid|invalid|expired)|API_KEY_INVALID|invalid\s*api\s*key|unauthenticated/i.test(msg) || status === 401) return "key";
  if (status === 429 || status === 503 || /RESOURCE_EXHAUSTED|quota|rate limit|overloaded|UNAVAILABLE/i.test(msg)) return "busy";
  if (status === 404 || /not found|is not supported|not available|no longer available|limit(ed|ing) access|does not have access|permission denied|PERMISSION_DENIED/i.test(msg) || status === 403) return "model";
  return "other";
}

/** Call Gemini, falling back through models this key may not have. */
async function generate(prompt: string): Promise<string> {
  const ai = getClient();
  const candidates = workingModel ? [workingModel, ...modelsToTry().filter((m) => m !== workingModel)] : modelsToTry();
  let lastModelError = "";
  for (const m of candidates) {
    try {
      // No temperature: Google deprecated sampling parameters for Gemini 3
      // models. JSON mode stops markdown fences and chatty text.
      const response = await ai.models.generateContent({
        model: m,
        contents: prompt,
        config: { responseMimeType: "application/json" },
      });
      workingModel = m;
      return response.text ?? "";
    } catch (err) {
      const kind = classifyError(err);
      const detail = err instanceof Error ? err.message.slice(0, 200) : "unknown";
      if (kind === "key") {
        throw new LLMConfigError("Gemini rejected GEMINI_API_KEY. Create a new key in Google AI Studio and update it in Vercel.");
      }
      if (kind === "busy") throw new LLMBusyError(`Gemini is busy or over quota: ${detail}`);
      if (kind === "model") {
        console.error(`[llm] model ${m} unavailable for this key: ${detail}`);
        lastModelError = detail;
        continue;
      }
      throw err;
    }
  }
  throw new LLMConfigError(
    `None of these Gemini models worked with this key: ${candidates.join(", ")}. Set GEMINI_MODEL to a model your key can use. Last error: ${lastModelError}`
  );
}

// ── Zod schemas ───────────────────────────────────────────────

// Models often send null for a field they can't find, or "4.0" for a
// number. Accept those instead of failing the whole transcript.
const text = z.preprocess((v) => (v == null ? "" : String(v)), z.string());
const num = z.preprocess((v) => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : 0;
}, z.number());

const CompletedCourseSchema = z.object({
  code: text,
  title: text,
  units: num,
  grade: text,
  quarter: text,
});

const TranscriptDataSchema = z.object({
  studentName: text.optional().default(""),
  studentId: text.optional().default(""),
  major: text.optional().default(""),
  completedCourses: z.preprocess((v) => (Array.isArray(v) ? v : []), z.array(CompletedCourseSchema)),
  totalUnitsEarned: num.optional().default(0),
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
  const out = await generate(prompt);

  // Extract JSON from the response (handles markdown code blocks)
  const jsonMatch = out.match(/```(?:json)?\s*([\s\S]*?)```/) ??
    out.match(/(\{[\s\S]*\})/);
  const jsonStr = jsonMatch ? jsonMatch[1] : out;

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

  const raw = await callWithRetry(prompt, TranscriptDataSchema);
  return cleanTranscript(raw);
}

const GRADES = new Set(["A+", "A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D+", "D", "D-", "F", "P", "NP"]);

/** Drop rows without a code or a final grade and recompute total units in code. */
export function cleanTranscript(raw: z.infer<typeof TranscriptDataSchema>): TranscriptData {
  const completedCourses = raw.completedCourses
    .map((c) => ({ ...c, code: c.code.trim().toUpperCase().replace(/\s+/g, " "), grade: c.grade.trim().toUpperCase() }))
    .filter((c) => c.code && GRADES.has(c.grade));
  const totalUnitsEarned = Math.round(completedCourses.reduce((n, c) => n + c.units, 0) * 10) / 10;
  return {
    studentName: raw.studentName,
    studentId: raw.studentId || "0000",
    major: raw.major,
    completedCourses,
    totalUnitsEarned,
  } as TranscriptData;
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

// ── Health check ──────────────────────────────────────────────

/** One tiny call to see whether the key and a model work. Never returns the key. */
export async function checkAI(): Promise<{ ok: boolean; model?: string; problem?: string }> {
  try {
    await generate('Reply with {"ok":true}');
    return { ok: true, model: workingModel ?? undefined };
  } catch (err) {
    if (err instanceof LLMConfigError) return { ok: false, problem: err.message };
    if (err instanceof LLMBusyError) return { ok: false, problem: "Gemini is busy or over quota right now." };
    return { ok: false, problem: "Unexpected error from Gemini." };
  }
}
