/**
 * Upper-division courses (100 to 199) with their catalog descriptions, for
 * every subject a Schedule One major draws on. Data comes from the UCSB
 * General Catalog 2026-27; see data/catalog/upper-division.json.
 *
 * This module imports a large JSON file, so use it on the server (API
 * routes, server components and tests), not in client components.
 */
import data from "@/data/catalog/upper-division.json";
import { PROGRAMS, findProgram } from "@/lib/majors";
import { normalizeCode } from "@/lib/course-codes";

export interface UpperDivCourse {
  code: string;
  title: string;
  /** "4", or a range such as "1-4". */
  units: string;
  description?: string;
  /** Independent study, internship, honors or thesis course. */
  special?: boolean;
}

export interface SubjectGroup {
  subject: string;
  name: string;
  courses: UpperDivCourse[];
}

export interface ProgramCourses {
  program: string;
  name: string;
  /** Lecture and seminar courses, one group per subject. */
  groups: SubjectGroup[];
  /** Independent study, internships, honors and thesis courses. */
  special: UpperDivCourse[];
  total: number;
  withDescription: number;
}

/** What each catalog subject code stands for. */
export const SUBJECT_NAMES: Record<string, string> = {
  "CH E": "Chemical Engineering",
  CHEM: "Chemistry & Biochemistry",
  CMPSC: "Computer Science",
  COMM: "Communication",
  ECE: "Electrical & Computer Engineering",
  ECON: "Economics",
  EEMB: "Ecology, Evolution & Marine Biology",
  "ENV S": "Environmental Studies",
  GEOG: "Geography",
  HIST: "History",
  MATH: "Mathematics",
  MCDB: "Molecular, Cellular & Developmental Biology",
  "POL S": "Political Science",
  PSTAT: "Statistics & Applied Probability",
  PSY: "Psychological & Brain Sciences",
};

type Raw = Omit<UpperDivCourse, "code">;
const RAW = (data as unknown as { courses: Record<string, Raw> }).courses;

const ALL: UpperDivCourse[] = Object.entries(RAW).map(([code, c]) => ({ code, ...c }));
const BY_CODE = new Map(ALL.map((c) => [normalizeCode(c.code), c]));

const subjectOf = (code: string) => code.replace(/\s+\S+$/, "");

/** The catalog entry for one upper-division course, if Schedule One has it. */
export function upperDivCourse(code: string): UpperDivCourse | undefined {
  return BY_CODE.get(normalizeCode(code));
}

/** Title, units and description for each code that has a catalog entry. */
export function lookupCourses(codes: string[]): Record<string, UpperDivCourse> {
  const out: Record<string, UpperDivCourse> = {};
  for (const code of codes) {
    const c = upperDivCourse(code);
    if (c) out[code] = c;
  }
  return out;
}

/** Every upper-division course in the program's subjects, grouped by subject. */
export function upperDivisionForProgram(code: string): ProgramCourses | undefined {
  const program = findProgram(code);
  if (!program) return undefined;
  const subjects = new Set(program.subjects);
  const mine = ALL.filter((c) => subjects.has(subjectOf(c.code)));
  const groups = program.subjects.map((subject) => ({
    subject,
    name: `${SUBJECT_NAMES[subject] ?? subject} (${subject})`,
    courses: mine.filter((c) => subjectOf(c.code) === subject && !c.special),
  }));
  return {
    program: program.code,
    name: program.name,
    groups,
    special: mine.filter((c) => c.special),
    total: mine.length,
    withDescription: mine.filter((c) => c.description).length,
  };
}

/** Course and description counts for every major, for docs and tests. */
export function coverageByProgram() {
  return PROGRAMS.map((p) => {
    const r = upperDivisionForProgram(p.code)!;
    return { program: p.code, name: p.name, total: r.total, withDescription: r.withDescription };
  });
}
