// ============================================================
// Schedule One — shared TypeScript types
// All mock data is clearly labeled; swap in real data later.
// ============================================================

// ── Transcript ───────────────────────────────────────────────

export type LetterGrade = "A+" | "A" | "A-" | "B+" | "B" | "B-" | "C+" | "C" | "C-" | "D+" | "D" | "D-" | "F" | "P" | "NP" | "W" | "IP";

export interface CompletedCourse {
  code: string;       // e.g. "PSTAT 120A"
  title: string;
  units: number;
  grade: LetterGrade;
  quarter: string;    // e.g. "Fall 2023"
}

export interface TranscriptData {
  studentName: string;
  studentId: string;  // last 4 digits only, for display
  major: string;
  /** Finished courses, plus in-progress ones with grade "IP" (they count as done for planning). */
  completedCourses: CompletedCourse[];
  /** Units with a final grade. In-progress units are not included. */
  totalUnitsEarned: number;
  /** Units of courses still in progress (grade "IP"). */
  unitsInProgress?: number;
}

// ── Requirements ─────────────────────────────────────────────

export type RequirementGroupKind = "all" | "choose_n";

export interface RequirementGroup {
  id: string;
  name: string;
  kind: RequirementGroupKind;
  /** Only used when kind === "choose_n" */
  n?: number;
  courses: string[];  // course codes
  description?: string;
}

export interface MajorRequirements {
  major: string;
  majorCode: string;
  groups: RequirementGroup[];
  /** Courses that count in place of a listed course, e.g. MATH 3A: ["MATH 2A", "MATH 34A"]. */
  equivalents?: Record<string, string[]>;
}

// ── Offerings ────────────────────────────────────────────────

export type DayOfWeek = "M" | "T" | "W" | "R" | "F";

export interface TimeSlot {
  days: DayOfWeek[];
  startTime: string;  // "HH:MM" 24-hour
  endTime: string;    // "HH:MM" 24-hour
}

export interface CourseOffering {
  code: string;
  title: string;
  units: number;
  schedule: TimeSlot;
  instructor: string;
  prerequisites: string[];  // course codes
  description: string;
  enrollmentCap: number;
  requirementGroups?: string[];  // which requirement group IDs this satisfies
}

export interface QuarterOfferings {
  quarter: string;
  year: number;
  courses: CourseOffering[];
}

// ── Student Constraints ──────────────────────────────────────

export interface StudentConstraints {
  minUnits: number;
  maxUnits: number;
  /** Earliest start time, "HH:MM" 24-hour. No classes before this. */
  noClassBefore?: string;
  /** Days to keep completely free */
  freeDays: DayOfWeek[];
  /** Course codes to force-include */
  mustInclude: string[];
  /** Course codes to exclude */
  mustExclude: string[];
  /** Latest end time, "HH:MM" 24-hour. No classes ending after this. */
  noClassAfter?: string;
  /** Course codes the student marked "seems interesting". Preferred, not required. */
  interested?: string[];
  /** Free-text preferences passed to the LLM */
  freeText?: string;
}

// ── Validation ───────────────────────────────────────────────

export type ValidationCheck =
  | "no_time_conflicts"
  | "unit_limit"
  | "prerequisites_met"
  | "no_duplicate_requirements"
  | "respects_constraints";

export interface ValidationResult {
  valid: boolean;
  passedChecks: ValidationCheck[];
  errors: string[];
}

// ── Planning / Schedules ─────────────────────────────────────

export interface ScheduledCourse {
  offering: CourseOffering;
  /** Which requirement group(s) this satisfies */
  satisfies: string[];
  /** e.g. "Mostly a Fall course" */
  termPattern?: string;
  /** Register for this in your first pass: needed and rarely offered. */
  mustGet?: boolean;
  mustGetReason?: string;
}

export interface SwapOption {
  offering: CourseOffering;
  reason: string;
}

export interface Schedule {
  courses: ScheduledCourse[];
  totalUnits: number;
  explanation: string;
  validation: ValidationResult;
  /** For backup schedules: what changed vs primary */
  changeNote?: string;
  /** Per-course fallback alternatives */
  swaps: Record<string, SwapOption[]>;
}

export interface PlanResult {
  primary: Schedule;
  backups: [Schedule, Schedule];
  /** Requirement group IDs still not covered after this quarter */
  remainingRequirements: string[];
  /** Class standing from units earned, e.g. "Sophomore". */
  standing?: string;
  /** Plain-language notes for the student (full-time status, standing). */
  notices?: string[];
}

// ── API request/response shapes ──────────────────────────────

export interface ParseTranscriptRequest {
  text: string;
}

export interface PlanRequest {
  transcript: TranscriptData;
  /** Primary major. Kept for older clients; majorCodes wins when present. */
  majorCode: string;
  /** One or two majors (double major). */
  majorCodes?: string[];
  minorCode?: string;
  quarter: string;
  constraints: StudentConstraints;
}
