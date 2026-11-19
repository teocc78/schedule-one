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

export type College = "Letters & Science" | "Engineering" | "Creative Studies";

export interface Program {
  code: string;
  name: string;
  kind: "major" | "minor";
  college: College;
  ready: boolean;
}

export const PROGRAMS: Program[] = [
  { code: "statistics-data-science", name: "Statistics & Data Science (B.S.)", kind: "major", college: "Letters & Science", ready: true },
  { code: "economics-accounting", name: "Economics & Accounting (B.A.)", kind: "major", college: "Letters & Science", ready: false },
  { code: "biological-sciences", name: "Biological Sciences (B.S.)", kind: "major", college: "Letters & Science", ready: false },
  { code: "electrical-engineering", name: "Electrical Engineering (B.S.)", kind: "major", college: "Engineering", ready: false },
];

const REQUIREMENTS: Record<string, MajorRequirements> = {
  "statistics-data-science": sds as unknown as MajorRequirements,
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
  return {
    major: unique.map((c) => REQUIREMENTS[c].major).join(" + "),
    majorCode: unique.join("+"),
    groups,
  };
}

/** Test seam: register requirement data for a program. */
export function registerRequirementsForTests(code: string, req: MajorRequirements) {
  REQUIREMENTS[code] = req;
}
