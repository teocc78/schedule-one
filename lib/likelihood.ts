/**
 * Likelihood scores (spec section 6), behind FEATURES.likelihood.
 * Two separate scores, shown only as High / Medium / Low buckets, never as
 * percentages.
 *
 * UNVERIFIED: whether past quarters return enrolledTotal and maxEnroll from
 * the API. Until a captured response confirms it, seat likelihood is always
 * reported as low confidence.
 */
import { fromQuarterCode, type QuarterName } from "@/lib/ucsb/quarter";

export type Bucket = "High" | "Medium" | "Low";

export interface OfferedLikelihood {
  bucket: Bucket;
  /** Years (of those checked) the course ran in the target term. */
  ranInTerm: number;
  yearsChecked: number;
  message: string;
  disclaimer: string;
}

export const PAST_OFFERINGS_DISCLAIMER = "Past offerings don't guarantee future ones (GOLD says the same).";

/** A. Will it be offered in `term`? From which quarters it ran in recent years. */
export function offeredLikelihood(pastQuarters: string[], term: QuarterName, yearsBack = 5, currentYear?: number): OfferedLikelihood {
  const parsed = pastQuarters.map(fromQuarterCode);
  const latest = currentYear ?? Math.max(...parsed.map((p) => p.year), 0);
  const window = parsed.filter((p) => p.year > latest - yearsBack);
  const years = new Set(window.filter((p) => p.name === term).map((p) => p.year));
  const ranInTerm = years.size;
  const ratio = yearsBack ? ranInTerm / yearsBack : 0;
  const bucket: Bucket = ratio >= 0.75 ? "High" : ratio >= 0.4 ? "Medium" : "Low";

  const otherTerms = new Set(window.filter((p) => p.name !== term).map((p) => `${p.name}${p.year}`));
  let message = `Ran in ${term} ${ranInTerm} of the last ${yearsBack} years.`;
  if (bucket === "High" && otherTerms.size <= Math.floor(yearsBack / 2)) {
    message += ` Mostly a ${term}-only course: take it this ${term} or likely wait a year.`;
  }
  return { bucket, ranInTerm, yearsChecked: yearsBack, message, disclaimer: PAST_OFFERINGS_DISCLAIMER };
}

export interface SeatInputs {
  history: { enrolledTotal: number | null; maxEnroll: number | null }[];
  /** Seats right now from classspaceavailability. */
  current?: { enrolledTotal: number; maxEnroll: number } | null;
  restrictedToOtherMajors?: boolean;
  passRestricted?: boolean;
  pass: 1 | 2 | 3;
  /** Set true only after a real past-quarter response showed enrolledTotal/maxEnroll. */
  historyVerified?: boolean;
}

export interface SeatLikelihood {
  bucket: Bucket;
  confidence: "low" | "medium";
  reasons: string[];
}

/** B. Will I get a seat? */
export function seatLikelihood(i: SeatInputs): SeatLikelihood {
  const reasons: string[] = [];
  const usable = i.history.filter((h) => h.enrolledTotal !== null && h.maxEnroll);
  let pressure = 0.5;
  if (usable.length) {
    const avg = usable.reduce((s, h) => s + h.enrolledTotal! / h.maxEnroll!, 0) / usable.length;
    const filled = usable.filter((h) => h.enrolledTotal! >= h.maxEnroll!).length;
    pressure = avg;
    reasons.push(`Filled ${filled} of ${usable.length} past quarters on record.`);
  } else {
    reasons.push("No past fill data, so this is a rough guess.");
  }
  if (i.current) {
    const left = i.current.maxEnroll - i.current.enrolledTotal;
    reasons.push(left > 0 ? `${left} seats open right now.` : "Full right now.");
    if (left <= 0) pressure = Math.max(pressure, 1.2);
  }
  if (i.restrictedToOtherMajors) {
    pressure += 0.3;
    reasons.push("Restricted to other majors.");
  }
  if (i.passRestricted) {
    pressure += 0.1;
    reasons.push("Pass-restricted.");
  }
  pressure += i.pass === 1 ? -0.15 : i.pass === 3 ? 0.15 : 0;

  const bucket: Bucket = pressure >= 0.97 ? "Low" : pressure >= 0.8 ? "Medium" : "High";
  const confidence = i.historyVerified && usable.length >= 3 ? "medium" : "low";
  if (confidence === "low") reasons.push("Low confidence: past seat history isn't verified yet.");
  return { bucket, confidence, reasons };
}
