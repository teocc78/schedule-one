/**
 * All Gemini API calls.
 * - Structured JSON outputs with Zod schema validation
 * - One automatic retry on validation failure
 * - API key from environment variable only
 */

import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { parseTranscriptByRules, rulesAreEnough } from "@/lib/transcript-fallback";
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
// The SDK calls Gemini's v1 API, where the gemini-flash-latest alias returns
// 404, so it is not in this list. Each model has its own quota.
export const FALLBACK_MODELS = ["gemini-3.8-flash", "gemini-3.5-flash-lite"];

/** The server is missing or has a wrong setting (key, model). */
export class LLMConfigError extends Error {}

/**
 * Gemini refused for load reasons. `reason` is "quota" when the key's usage
 * limit is used up (429) and "overloaded" when Google's servers are busy (503).
 */
export class LLMBusyError extends Error {
  constructor(message: string, public reason: "quota" | "overloaded", public attempts: ModelAttempt[] = []) {
    super(message);
  }
}

/** What happened when one model was tried. Never contains the key. */
export interface ModelAttempt {
  model: string;
  ok: boolean;
  status?: number;
  kind?: LLMErrorKind;
  /** Short reason from Gemini, e.g. "RESOURCE_EXHAUSTED: quota exceeded for ... requests per day". */
  detail?: string;
}

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

/** Test seam: replaces the wait between retries. */
let sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** For tests only. */
export function resetClientForTests(fakeSleep?: (ms: number) => Promise<void>) {
  client = null;
  workingModel = null;
  if (fakeSleep) sleep = fakeSleep;
}

function modelsToTry(): string[] {
  const configured = process.env.GEMINI_MODEL?.trim();
  const list = configured ? [configured, ...FALLBACK_MODELS] : [DEFAULT_MODEL, ...FALLBACK_MODELS];
  return [...new Set(list)];
}

/** Remember which model worked so later calls skip the failed ones. */
let workingModel: string | null = null;

/**
 * key: the key itself was rejected (401, API_KEY_INVALID).
 * access: Google refused this key or project (403: API disabled, key
 *   restricted or reported as leaked, model limited to some projects).
 * model: that model name doesn't exist on this API (404).
 */
export type LLMErrorKind = "key" | "access" | "model" | "quota" | "overloaded" | "other";

function statusOf(err: unknown): number | undefined {
  const s = typeof err === "object" && err && "status" in err ? Number((err as { status: unknown }).status) : NaN;
  return Number.isFinite(s) ? s : undefined;
}

/** Sort a Gemini SDK error into something the app can act on. */
export function classifyError(err: unknown): LLMErrorKind {
  const status = statusOf(err);
  const msg = err instanceof Error ? err.message : String(err);
  if (/api[ _-]?key (not valid|invalid|expired)|API_KEY_INVALID|invalid\s*api\s*key|unauthenticated/i.test(msg) || status === 401) return "key";
  if (status === 429 || /RESOURCE_EXHAUSTED|quota|rate limit|too many requests/i.test(msg)) return "quota";
  if (status === 503 || status === 504 || /overloaded|UNAVAILABLE|high demand/i.test(msg)) return "overloaded";
  if (status === 403 || /PERMISSION_DENIED|permission denied|API_KEY_SERVICE_BLOCKED|leaked|has not been used in project|is disabled|limit(ed|ing) access|does not have access/i.test(msg)) return "access";
  if (status === 404 || /not found|is not supported|no longer available|not available/i.test(msg)) return "model";
  return "other";
}

/** Gemini's own reason, trimmed, with anything that looks like a key removed. */
function shortDetail(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.replace(/AIza[0-9A-Za-z_-]{20,}/g, "[key]").replace(/\s+/g, " ").slice(0, 300);
}

/**
 * Call Gemini. Each model has its own quota, so on a quota error (429) or a
 * model that isn't available, move to the next model. On an overload (503),
 * wait briefly and try the same model once more first.
 */
async function generate(prompt: string, attempts: ModelAttempt[] = []): Promise<string> {
  const ai = getClient();
  const candidates = workingModel ? [workingModel, ...modelsToTry().filter((m) => m !== workingModel)] : modelsToTry();
  for (const m of candidates) {
    for (let tryNo = 1; tryNo <= 2; tryNo++) {
      try {
        // No temperature: Google deprecated sampling parameters for Gemini 3
        // models. JSON mode stops markdown fences and chatty text.
        const response = await ai.models.generateContent({
          model: m,
          contents: prompt,
          config: { responseMimeType: "application/json" },
        });
        workingModel = m;
        attempts.push({ model: m, ok: true });
        return response.text ?? "";
      } catch (err) {
        const kind = classifyError(err);
        const detail = shortDetail(err);
        attempts.push({ model: m, ok: false, status: statusOf(err), kind, detail });
        console.error(`[llm] ${m} failed (${kind}, ${statusOf(err) ?? "no status"}): ${detail}`);
        if (kind === "key") {
          throw new LLMConfigError("Gemini rejected GEMINI_API_KEY. Create a new key in Google AI Studio and update it in Vercel.");
        }
        if (kind === "overloaded" && tryNo === 1) {
          await sleep(1500);
          continue;
        }
        if (kind === "other") throw err;
        break; // quota, access, model, or overloaded twice: next model
      }
    }
  }
  const failed = attempts.filter((a) => !a.ok);
  if (failed.some((a) => a.kind === "quota")) {
    throw new LLMBusyError(`Gemini quota used up for: ${[...new Set(failed.filter((a) => a.kind === "quota").map((a) => a.model))].join(", ")}`, "quota", attempts);
  }
  if (failed.some((a) => a.kind === "overloaded")) {
    throw new LLMBusyError("Gemini is overloaded right now.", "overloaded", attempts);
  }
  const tried = failed.map((a) => `${a.model} (${a.status ?? "no status"} ${a.kind})`).join(", ");
  if (failed.some((a) => a.kind === "access")) {
    throw new LLMConfigError(
      `Google refused this key (403) for: ${tried}. In Google AI Studio, check the key's API restrictions and that the Gemini API is enabled for its project.`
    );
  }
  throw new LLMConfigError(`None of these Gemini models exist for this key: ${tried}. Set GEMINI_MODEL to a model your key can use.`);
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

/**
 * Read a transcript. The rule-based reader goes first and is used on its own
 * when it reads every course row, so most transcripts need no AI call. The AI
 * handles unusual layouts; if it is busy, whatever the rules found is used.
 */
export async function parseTranscript(text: string): Promise<TranscriptData> {
  const rules = parseTranscriptByRules(text);
  if (rulesAreEnough(rules)) return rules.transcript;
  try {
    return await parseTranscriptWithAI(text);
  } catch (err) {
    // Any AI failure (busy, wrong settings, bad output): if the rules found
    // courses, use them rather than stopping the student.
    if (rules.transcript.completedCourses.length > 0) {
      console.error("[llm] AI unavailable; using rule-based transcript reading:", err instanceof Error ? err.message.slice(0, 300) : "unknown error");
      return rules.transcript;
    }
    throw err;
  }
}

async function parseTranscriptWithAI(text: string): Promise<TranscriptData> {
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
- Include ALL courses that have a final grade, and courses in progress with grade "IP"
- Exclude courses with grade W (withdrawn)
- Use the exact course code format with a space (e.g. "PSTAT 120A")
- grade must be one of: A+, A, A-, B+, B, B-, C+, C, C-, D+, D, D-, F, P, NP, IP
- totalUnitsEarned is the sum of units for courses with a final grade (not IP)
- studentId: use only last 4 digits shown, or "0000" if not found

Transcript text:
---
${text}
---`;

  const raw = await callWithRetry(prompt, TranscriptDataSchema);
  return cleanTranscript(raw);
}

const GRADES = new Set(["A+", "A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D+", "D", "D-", "F", "P", "NP", "IP"]);

/** Drop rows without a code or a final grade and recompute total units in code. */
export function cleanTranscript(raw: z.infer<typeof TranscriptDataSchema>): TranscriptData {
  const completedCourses = raw.completedCourses
    .map((c) => ({ ...c, code: c.code.trim().toUpperCase().replace(/\s+/g, " "), grade: c.grade.trim().toUpperCase() }))
    .filter((c) => c.code && GRADES.has(c.grade));
  const sum = (ip: boolean) =>
    Math.round(completedCourses.filter((c) => (c.grade === "IP") === ip).reduce((n, c) => n + c.units, 0) * 10) / 10;
  return {
    studentName: raw.studentName,
    studentId: raw.studentId || "0000",
    major: raw.major,
    completedCourses,
    totalUnitsEarned: sum(false),
    unitsInProgress: sum(true),
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
${constraints.noClassAfter ? `- No classes ending after ${constraints.noClassAfter}` : ""}
${constraints.interested?.length ? `- Student finds these interesting (prefer them when they fit a requirement): ${constraints.interested.join(", ")}` : ""}
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

/**
 * Try each candidate model once with a tiny prompt and report what Gemini
 * said for each, so the site owner can tell quota (429) from overload (503)
 * from an unavailable model. Never returns the key.
 */
export async function checkAI(): Promise<{ ok: boolean; models: ModelAttempt[]; summary: string }> {
  let ai: GoogleGenAI;
  try {
    ai = getClient();
  } catch (err) {
    return { ok: false, models: [], summary: err instanceof Error ? err.message : "No client" };
  }
  const models: ModelAttempt[] = [];
  for (const m of modelsToTry()) {
    try {
      await ai.models.generateContent({ model: m, contents: 'Reply with {"ok":true}', config: { responseMimeType: "application/json" } });
      models.push({ model: m, ok: true });
    } catch (err) {
      models.push({ model: m, ok: false, status: statusOf(err), kind: classifyError(err), detail: shortDetail(err) });
    }
  }
  const working = models.filter((x) => x.ok).map((x) => x.model);
  const summary = working.length
    ? `Working models: ${working.join(", ")}.`
    : models.every((x) => x.kind === "quota")
      ? "Every model returned 429 (quota or rate limit used up for this key's Google project)."
      : models.some((x) => x.kind === "access")
        ? "Google refused this key (403) for some models; check the key's restrictions in Google AI Studio."
      : "No model worked; see each model's status and detail.";
  return { ok: working.length > 0, models, summary };
}
