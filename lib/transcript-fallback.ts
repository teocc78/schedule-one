/**
 * Rule-based transcript reader. Handles the common GOLD-style layout:
 *
 *   FALL 2023
 *   MATH 3A  Calculus with Applications I   4.0  A
 *
 * Used first when the text is regular enough, so most transcripts never
 * need an AI call, and as a backup when Gemini is busy or over quota.
 */
import type { TranscriptData } from "@/types";

const GRADE = "A\\+|A-|A|B\\+|B-|B|C\\+|C-|C|D\\+|D-|D|F|NP|P|IP";
const COURSE_LINE = new RegExp(
  // department (1-2 words, e.g. "PSTAT", "C LIT", "W&L"), number (e.g. 8, 120A, 5AA), title, units, grade
  `^\\s*([A-Z][A-Z&]{0,7}(?: [A-Z&]{1,6})?)\\s+(\\d{1,3}[A-Z]{0,3})\\s+(.+?)\\s+(\\d{1,2}(?:\\.\\d)?)\\s+(${GRADE})\\s*$`
);
const QUARTER_LINE = /^\s*(FALL|WINTER|SPRING|SUMMER)\s+(?:QUARTER\s+)?(\d{4})\s*$/i;
const NOT_FINAL = /\s(W|I|NR)\s*$/;

function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

export interface RuleParseResult {
  transcript: TranscriptData;
  /** Lines that look like a course row (code + units) but couldn't be read. */
  unreadCourseLines: number;
}

export function parseTranscriptByRules(text: string): RuleParseResult {
  let quarter = "";
  let major = "";
  let unread = 0;
  const completedCourses: TranscriptData["completedCourses"] = [];

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\t/g, "  ");
    const q = line.match(QUARTER_LINE);
    if (q) {
      quarter = `${titleCase(q[1])} ${q[2]}`;
      continue;
    }
    const m = line.match(/^\s*Major:\s*(.+)$/i);
    if (m && !major) {
      major = m[1].trim();
      continue;
    }
    const c = line.match(COURSE_LINE);
    if (c) {
      completedCourses.push({
        code: `${c[1]} ${c[2]}`,
        title: c[3].trim(),
        units: parseFloat(c[4]),
        grade: c[5] as TranscriptData["completedCourses"][number]["grade"],
        quarter,
      });
      continue;
    }
    // A row with a course code and units but a grade we don't count (IP, W)
    // is fine to skip; any other code-and-units row is one we failed to read.
    if (/^\s*[A-Z][A-Z&]{0,7}(?: [A-Z&]{1,6})?\s+\d{1,3}[A-Z]{0,3}\s+.+\s\d{1,2}(?:\.\d)?\s/.test(line) && !NOT_FINAL.test(line)) {
      unread++;
    }
  }

  const sum = (ip: boolean) =>
    Math.round(completedCourses.filter((c) => (c.grade === "IP") === ip).reduce((n, c) => n + c.units, 0) * 10) / 10;
  return {
    transcript: { studentName: "", studentId: "0000", major, completedCourses, totalUnitsEarned: sum(false), unitsInProgress: sum(true) },
    unreadCourseLines: unread,
  };
}

/** True when the rule-based result is complete enough to skip the AI. */
export function rulesAreEnough(r: RuleParseResult): boolean {
  return r.transcript.completedCourses.length >= 3 && r.unreadCourseLines === 0;
}
