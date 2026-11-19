/**
 * Per-course registration flags shown on a planned schedule.
 *
 * - "Mostly a Fall course": from which terms the course ran in past years.
 * - "MUST GET, EXCLUSIVE TO WINTER": a course the student still needs that
 *   runs mainly in the term being planned, so missing it likely means waiting
 *   a year. Register for it in your earliest pass.
 *
 * History comes from past-quarter class searches. Until the UCSB API key is
 * set, only the synthetic fixture is available, so most courses show no
 * flag rather than a guessed one.
 */
import { fromQuarterCode, type QuarterName } from "@/lib/ucsb/quarter";
import { normalizeCode } from "@/lib/course-codes";

export interface CourseFlags {
  /** e.g. "Mostly a Fall course" */
  termPattern?: string;
  mustGet?: boolean;
  reason?: string;
  /** The only quarter it (mostly) runs in, when mustGet is set. */
  exclusiveTo?: QuarterName;
}

/** Past quarter codes (YYYYQ) the course ran in, by normalized course code. */
export type OfferingHistory = Record<string, string[]>;

const TERMS: QuarterName[] = ["Fall", "Winter", "Spring"];

/**
 * The term a course mainly runs in, if any: it ran in that term in at least
 * 3 of the last `years` years and in each other regular term at most once.
 */
export function mainTerm(quarters: string[], years = 5): QuarterName | null {
  const parsed = quarters.map(fromQuarterCode).filter((q) => q.name !== "Summer");
  if (!parsed.length) return null;
  const latest = Math.max(...parsed.map((q) => q.year));
  const recent = parsed.filter((q) => q.year > latest - years);
  const yearsIn = (t: QuarterName) => new Set(recent.filter((q) => q.name === t).map((q) => q.year)).size;
  for (const t of TERMS) {
    if (yearsIn(t) >= 3 && TERMS.filter((o) => o !== t).every((o) => yearsIn(o) <= 1)) return t;
  }
  return null;
}

export function flagsFor(
  code: string,
  term: QuarterName,
  history: OfferingHistory,
  stillRequired: boolean
): CourseFlags {
  const past = history[normalizeCode(code)];
  if (!past?.length) return {};
  const main = mainTerm(past);
  if (!main) return {};
  const flags: CourseFlags = { termPattern: `Mostly a ${main} course` };
  if (main === term && stillRequired) {
    flags.mustGet = true;
    flags.exclusiveTo = term;
    flags.reason = `You still need ${code}, and it mostly runs in ${term}. If you miss it, you may wait a year. Register for it in your first pass.`;
  }
  return flags;
}

/** Build the history map from the class-search fixture shape. */
export function historyFromFixture(fixture: { courses: Record<string, { quarter: string }[]> }): OfferingHistory {
  const out: OfferingHistory = {};
  for (const [code, rows] of Object.entries(fixture.courses)) out[normalizeCode(code)] = rows.map((r) => r.quarter);
  return out;
}
