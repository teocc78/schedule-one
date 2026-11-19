/**
 * Rule-based transcript reader. No AI: every transcript is read here.
 *
 * Handles GOLD-style text and most hand-pasted layouts, for example:
 *
 *   FALL 2023
 *   MATH 3A  Calculus with Applications I   4.0  A
 *   PSTAT 120A PROBABILITY & STATISTICS A- 4.0 14.8     (grade before units, grade points after)
 *   Winter 2024, CMPSC 8, Intro to Computer Science, 4, B+
 *   F23 ECON 1 Principles of Economics 5 A              (quarter on the line)
 *   pstat8  Transition to Data Science  4  IP           (lower case, no space, in progress)
 *
 * A course row with units but no grade yet counts as in progress (IP).
 * Withdrawn, incomplete, not-reported and failed rows (W, I, NR, NG, F, NP)
 * are left out, because they don't count toward requirements or units.
 */
import type { TranscriptData } from "@/types";

type Grade = TranscriptData["completedCourses"][number]["grade"];
type Course = TranscriptData["completedCourses"][number];

const LETTER = new Set(["A+", "A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D+", "D", "D-", "F"]);
const PASS = new Set(["P", "S", "CR"]);
const NO_PASS = new Set(["NP", "U", "NC"]);
const SKIP = new Set(["W", "I", "NR", "NG", "WU"]);

const SEASONS: Record<string, string> = { F: "Fall", W: "Winter", S: "Spring", M: "Summer", FA: "Fall", WI: "Winter", SP: "Spring", SU: "Summer" };
const SEASON_WORD = /\b(fall|winter|spring|summer)\b/i;
const YEAR = /\b(20\d{2}|19\d{2})\b/;
// "F23", "W24", "S25", "M24" (summer) at the start of a line
const SHORT_QUARTER = /^\s*(F|W|S|M|FA|WI|SP|SU)\s?'?(\d{2})\b/i;

// Course code at the start: department (1-2 words, e.g. "PSTAT", "C LIT", "W&L"),
// optional space, number (e.g. 8, 120A, 5AA, 10AL).
const CODE = /^\s*([A-Za-z][A-Za-z&]{0,7}(?: [A-Za-z&]{1,6})?)\s?(\d{1,3}[A-Za-z]{0,3})\b(.*)$/;
const UNITS = /^\d{1,2}(?:\.\d{1,2})?$/;
// Words that can open a line but are never departments
const NOT_DEPT = new Set(["TOTAL", "TOTALS", "UNITS", "GPA", "PAGE", "TERM", "CUM", "CUMULATIVE", "QUARTER", "YEAR", "FALL", "WINTER", "SPRING", "SUMMER", "AP", "IB", "EXAM", "TEST"]);

function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

function quarterFrom(line: string): string | null {
  const s = line.match(SHORT_QUARTER);
  if (s) return `${SEASONS[s[1].toUpperCase()]} 20${s[2]}`;
  const season = line.match(SEASON_WORD);
  const year = line.match(YEAR);
  if (season && year) return `${titleCase(season[1])} ${year[1]}`;
  return null;
}

function normalizeGrade(tok: string): Grade | "skip" | null {
  const t = tok.toUpperCase().replace(/[()*]/g, "");
  if (LETTER.has(t)) return t as Grade;
  if (PASS.has(t)) return "P";
  if (NO_PASS.has(t)) return "NP";
  if (t === "IP" || t === "INPROGRESS") return "IP";
  if (SKIP.has(t)) return "skip";
  return null;
}

export interface ParseResult {
  transcript: TranscriptData;
  /** Lines that start with a course code but have no units we could find. */
  unreadCourseLines: number;
}

/** Reads one row after its course code. Null when it has no units. */
function readRow(rest: string): { title: string; units: number; grade: Grade | "skip" } | null {
  const tokens = rest.replace(/[,|;]/g, " ").split(/\s+/).filter(Boolean);
  const isNum = (t: string) => /^\d+(?:\.\d+)?$/.test(t);
  const u = tokens.findIndex((t) => UNITS.test(t) && parseFloat(t) > 0 && parseFloat(t) <= 12);
  if (u < 0) return null;
  const units = parseFloat(tokens[u]);

  // Grade after the units (GOLD: "4.0 A" or "4.0 4.0 A 14.8"): skip extra
  // number columns, take the first word if it is a grade.
  let grade: Grade | "skip" | null = null;
  for (let i = u + 1; i < tokens.length; i++) {
    if (isNum(tokens[i])) continue;
    grade = normalizeGrade(tokens[i]);
    break;
  }
  // Grade before the units ("A- 4.0"). Only an upper-case grade, and never
  // "I", which is far more often a Roman numeral in a title.
  let titleEnd = u;
  if (grade === null && u > 1) {
    const prev = tokens[u - 1];
    const g = prev === prev.toUpperCase() && prev !== "I" ? normalizeGrade(prev) : null;
    if (g) {
      grade = g;
      titleEnd = u - 1;
    }
  }
  const title = tokens.slice(0, titleEnd).filter((t) => !isNum(t)).join(" ");
  return { title, units, grade: grade ?? "IP" };
}

/** Removes a quarter written at the start of a row ("F23", "Fall 2023,"). */
function stripLeadingQuarter(line: string): string {
  return line
    .replace(SHORT_QUARTER, "")
    .replace(/^\s*(?:fall|winter|spring|summer)\s*(?:quarter\s*)?(?:20\d{2}|19\d{2})\s*[,:\-]?/i, "");
}

export function parseTranscriptText(text: string): ParseResult {
  let quarter = "";
  let major = "";
  let unread = 0;
  const completedCourses: Course[] = [];

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\t/g, "  ").replace(/\u00a0/g, " ");
    if (!line.trim()) continue;

    const m = line.match(/^\s*(?:Major|Declared Major|Program)\s*[:\-]\s*(.+)$/i);
    if (m) {
      if (!major) major = m[1].trim();
      continue;
    }

    // A quarter can be its own heading line, or sit at the start or end of a row.
    const q = quarterFrom(line);
    const body = q ? stripLeadingQuarter(line) : line;
    const c = body.match(CODE);
    const isCourse = c !== null && !NOT_DEPT.has(c[1].split(" ")[0].toUpperCase());
    if (q) quarter = q;
    if (!isCourse) continue;

    const row = readRow(c[3]);
    if (!row) {
      if (/[A-Za-z]{3,}/.test(c[3])) unread++;
      continue;
    }
    // Skipped (W, I, NR) and failed (F, NP) courses don't count toward anything.
    if (row.grade === "skip" || row.grade === "F" || row.grade === "NP") continue;
    completedCourses.push({
      code: `${c[1].toUpperCase()} ${c[2].toUpperCase()}`,
      title: row.title,
      units: row.units,
      grade: row.grade,
      quarter,
    });
  }

  const sum = (ip: boolean) =>
    Math.round(
      completedCourses
        .filter((c) => (c.grade === "IP") === ip)
        .reduce((n, c) => n + c.units, 0) * 10
    ) / 10;
  return {
    transcript: {
      studentName: "",
      studentId: "0000",
      major,
      completedCourses,
      totalUnitsEarned: sum(false),
      unitsInProgress: sum(true),
    },
    unreadCourseLines: unread,
  };
}
