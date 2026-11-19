/**
 * Majors and minors the planner knows about, and how several programs
 * (double major, major plus minor) combine into one requirement list.
 *
 * Only programs with `ready: true` have requirement data. The rest are
 * listed so students see them coming, and the planner refuses them with a
 * clear message instead of guessing.
 *
 * ASSUMPTION: a course listed by two programs counts toward both. UCSB and
 * some departments limit how many courses a double major or minor may
 * share; that limit is not modelled yet.
 */
import type { MajorRequirements } from "@/types";
import sds from "@/data/requirements/statistics-data-science.json";
import econAcc from "@/data/requirements/economics-accounting.json";
import bio from "@/data/requirements/biological-sciences.json";
import ee from "@/data/requirements/electrical-engineering.json";

export type College = "Letters & Science" | "Engineering" | "Creative Studies";

export interface Program {
  code: string;
  name: string;
  kind: "major" | "minor";
  college: College;
  ready: boolean;
}

/**
 * The SEP major list, in the order the chapter uses. `ready` means the
 * requirement data is in data/requirements; the rest show as coming soon.
 */
export const PROGRAMS: Program[] = [
  { code: "economics", name: "Economics (B.A.)", kind: "major", college: "Letters & Science", ready: false },
  { code: "economics-accounting", name: "Economics & Accounting (B.A.)", kind: "major", college: "Letters & Science", ready: true },
  { code: "communication", name: "Communication (B.A.)", kind: "major", college: "Letters & Science", ready: false },
  { code: "statistics-data-science", name: "Statistics & Data Science (B.S.)", kind: "major", college: "Letters & Science", ready: true },
  { code: "computer-science", name: "Computer Science (B.S.)", kind: "major", college: "Engineering", ready: false },
  { code: "political-science", name: "Political Science (B.A.)", kind: "major", college: "Letters & Science", ready: false },
  { code: "psychological-brain-sciences", name: "Psychological & Brain Sciences (B.S.)", kind: "major", college: "Letters & Science", ready: false },
  { code: "financial-math-statistics", name: "Financial Mathematics & Statistics (B.S.)", kind: "major", college: "Letters & Science", ready: false },
  { code: "biological-sciences", name: "Biological Sciences (B.S.)", kind: "major", college: "Letters & Science", ready: true },
  { code: "biopsychology", name: "Biopsychology (B.S.)", kind: "major", college: "Letters & Science", ready: false },
  { code: "electrical-engineering", name: "Electrical Engineering (B.S.)", kind: "major", college: "Engineering", ready: true },
  { code: "computer-engineering", name: "Computer Engineering (B.S.)", kind: "major", college: "Engineering", ready: false },
  { code: "actuarial-science", name: "Actuarial Science (B.S.)", kind: "major", college: "Letters & Science", ready: false },
  { code: "applied-mathematics", name: "Applied Mathematics (B.S.)", kind: "major", college: "Letters & Science", ready: false },
  { code: "mathematics", name: "Mathematics (B.A. or B.S.)", kind: "major", college: "Letters & Science", ready: false },
  { code: "history", name: "History (B.A.)", kind: "major", college: "Letters & Science", ready: false },
  { code: "environmental-studies", name: "Environmental Studies (B.A. or B.S.)", kind: "major", college: "Letters & Science", ready: false },
  { code: "history-policy-law-governance", name: "History of Policy, Law & Governance (B.A.)", kind: "major", college: "Letters & Science", ready: false },
  { code: "geography", name: "Geography (B.A.)", kind: "major", college: "Letters & Science", ready: false },
  { code: "chemical-engineering", name: "Chemical Engineering (B.S.)", kind: "major", college: "Engineering", ready: false },
  { code: "chemistry", name: "Chemistry (B.A. or B.S.)", kind: "major", college: "Letters & Science", ready: false },
  { code: "biochemistry", name: "Biochemistry (B.S.)", kind: "major", college: "Letters & Science", ready: false },
];

const REQUIREMENTS: Record<string, MajorRequirements> = {
  "statistics-data-science": sds as unknown as MajorRequirements,
  "economics-accounting": econAcc as unknown as MajorRequirements,
  "biological-sciences": bio as unknown as MajorRequirements,
  "electrical-engineering": ee as unknown as MajorRequirements,
};

export const majors = () => PROGRAMS.filter((p) => p.kind === "major");
export const minors = () => PROGRAMS.filter((p) => p.kind === "minor");
export const findProgram = (code: string) => PROGRAMS.find((p) => p.code === code);

export class ProgramNotReadyError extends Error {}

/**
 * Combine the requirement groups of every chosen program. Group IDs that
 * clash between programs get the program code in front, and every group
 * name says which program it belongs to when there is more than one.
 */
export function combinedRequirements(codes: string[]): MajorRequirements {
  const unique = [...new Set(codes.filter(Boolean))];
  if (unique.length === 0) throw new ProgramNotReadyError("Pick a major first.");
  const notReady = unique.filter((c) => !REQUIREMENTS[c]);
  if (notReady.length) {
    const names = notReady.map((c) => findProgram(c)?.name ?? c).join(", ");
    throw new ProgramNotReadyError(
      `Schedule One doesn't have the requirements for ${names} yet. It's on the list to add.`
    );
  }
  if (unique.length === 1) return REQUIREMENTS[unique[0]];

  const seen = new Set<string>();
  const groups = unique.flatMap((code) =>
    REQUIREMENTS[code].groups.map((g) => {
      const id = seen.has(g.id) ? `${code}:${g.id}` : g.id;
      seen.add(id);
      return { ...g, id, name: `${REQUIREMENTS[code].major}: ${g.name}` };
    })
  );
  const equivalents: Record<string, string[]> = {};
  for (const code of unique) {
    for (const [k, v] of Object.entries(REQUIREMENTS[code].equivalents ?? {})) {
      equivalents[k] = [...new Set([...(equivalents[k] ?? []), ...v])];
    }
  }
  return {
    major: unique.map((c) => REQUIREMENTS[c].major).join(" + "),
    majorCode: unique.join("+"),
    groups,
    equivalents,
  };
}

/** Test seam: register requirement data for a program. */
export function registerRequirementsForTests(code: string, req: MajorRequirements) {
  REQUIREMENTS[code] = req;
}
