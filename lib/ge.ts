/**
 * UCSB General Education engine (spec section 3). Pure functions.
 *
 * Rules encoded here:
 * - General Subject Areas A to G. A course fills at most ONE area, even if
 *   it is listed in several. When a course is flagged for two areas it goes
 *   to the area with the larger remaining need.
 * - Special subjects (Writing, World Cultures, Ethnicity, Quantitative
 *   Relationships, European Traditions for B.A.) stack: one course can fill
 *   one area plus any number of special subjects.
 * - GOLD / the student's progress check wins on disagreement, so a
 *   progress-check override always beats what the engine computes.
 */

export type GEArea = "A" | "B" | "C" | "D" | "E" | "F" | "G";
export type GESpecial = "WRT" | "NWC" | "ET" | "QNT" | "EUR";
export type GELine = GEArea | GESpecial;

export const GE_AREAS: GEArea[] = ["A", "B", "C", "D", "E", "F", "G"];
export const GE_SPECIALS: GESpecial[] = ["WRT", "NWC", "ET", "QNT", "EUR"];

export const GE_LABELS: Record<GELine, string> = {
  A: "Area A: English Reading & Composition",
  B: "Area B: Foreign Language",
  C: "Area C: Science, Mathematics & Technology",
  D: "Area D: Social Sciences",
  E: "Area E: Culture & Thought",
  F: "Area F: Arts",
  G: "Area G: Literature",
  WRT: "Writing",
  NWC: "World Cultures",
  ET: "Ethnicity",
  QNT: "Quantitative Relationships",
  EUR: "European Traditions",
};

/**
 * Course counts for a College of Letters & Science B.S. (spec section 3).
 * Area B is "1 to 3" depending on the major; 1 is used as the default and
 * can be overridden per major.
 */
export const BS_AREA_COUNTS: Record<GEArea, number> = { A: 2, B: 1, C: 3, D: 2, E: 2, F: 1, G: 1 };

/** Special-subject counts. European Traditions applies to B.A. only. */
export const BS_SPECIAL_COUNTS: Record<GESpecial, number> = { WRT: 6, NWC: 1, ET: 1, QNT: 1, EUR: 0 };
export const BA_SPECIAL_COUNTS: Record<GESpecial, number> = { ...BS_SPECIAL_COUNTS, EUR: 1 };

export interface GECourse {
  code: string;
  /** Raw GE codes as GOLD / the API return them, e.g. ["G", "WRT", "NWC"]. */
  geCodes: string[];
}

export interface GELineStatus {
  line: GELine;
  label: string;
  needed: number;
  have: number;
  met: boolean;
  /** Courses counted toward this line. */
  courses: string[];
  /** "engine" when computed here, "progress-check" when overridden. */
  source: "engine" | "progress-check";
}

export interface GEStatus {
  lines: GELineStatus[];
  /** Which single area each course was assigned to (null = none). */
  areaAssignment: Record<string, GEArea | null>;
}

const SPECIAL_ALIASES: Record<string, GESpecial> = {
  WRT: "WRT",
  WRIT: "WRT",
  NWC: "NWC",
  ET: "ET",
  ETH: "ET",
  QN: "QNT",
  QNT: "QNT",
  EUR: "EUR",
  EUROTRAD: "EUR",
};

/** Split raw GE codes into areas and special subjects. Unknown codes are ignored. */
export function parseGECodes(codes: string[]): { areas: GEArea[]; specials: GESpecial[] } {
  const areas = new Set<GEArea>();
  const specials = new Set<GESpecial>();
  for (const raw of codes) {
    const c = raw.trim().toUpperCase();
    if ((GE_AREAS as string[]).includes(c)) areas.add(c as GEArea);
    else if (SPECIAL_ALIASES[c]) specials.add(SPECIAL_ALIASES[c]);
  }
  return { areas: [...areas], specials: [...specials] };
}

export interface GERequirements {
  areas: Record<GEArea, number>;
  specials: Record<GESpecial, number>;
}

export const BS_REQUIREMENTS: GERequirements = { areas: BS_AREA_COUNTS, specials: BS_SPECIAL_COUNTS };

/**
 * Compute GE status from courses taken.
 * Single-area courses are placed first, then multi-area courses go to the
 * area with the larger remaining need (ties: alphabetical, for stability).
 */
export function computeGEStatus(
  taken: GECourse[],
  req: GERequirements = BS_REQUIREMENTS,
  progressCheck: Partial<Record<GELine, boolean>> = {}
): GEStatus {
  const remaining: Record<GEArea, number> = { ...req.areas };
  const areaCourses: Record<GEArea, string[]> = { A: [], B: [], C: [], D: [], E: [], F: [], G: [] };
  const specialCourses: Record<GESpecial, string[]> = { WRT: [], NWC: [], ET: [], QNT: [], EUR: [] };
  const areaAssignment: Record<string, GEArea | null> = {};

  const parsed = taken.map((c) => ({ code: c.code, ...parseGECodes(c.geCodes) }));
  const ordered = [...parsed].sort((a, b) => a.areas.length - b.areas.length);

  for (const c of ordered) {
    for (const s of c.specials) specialCourses[s].push(c.code);
    if (c.areas.length === 0) {
      areaAssignment[c.code] = null;
      continue;
    }
    const best = pickArea(c.areas, remaining);
    areaAssignment[c.code] = best;
    areaCourses[best].push(c.code);
    remaining[best] = Math.max(0, remaining[best] - 1);
  }

  const lines: GELineStatus[] = [];
  for (const a of GE_AREAS) {
    const needed = req.areas[a];
    if (needed === 0) continue;
    lines.push(lineStatus(a, needed, areaCourses[a], progressCheck[a]));
  }
  for (const s of GE_SPECIALS) {
    const needed = req.specials[s];
    if (needed === 0) continue;
    lines.push(lineStatus(s, needed, specialCourses[s], progressCheck[s]));
  }
  return { lines, areaAssignment };
}

function pickArea(areas: GEArea[], remaining: Record<GEArea, number>): GEArea {
  return [...areas].sort((x, y) => remaining[y] - remaining[x] || x.localeCompare(y))[0];
}

function lineStatus(
  line: GELine,
  needed: number,
  courses: string[],
  override: boolean | undefined
): GELineStatus {
  const have = courses.length;
  const engineMet = have >= needed;
  return {
    line,
    label: GE_LABELS[line],
    needed,
    have,
    met: override ?? engineMet,
    courses,
    source: override === undefined ? "engine" : "progress-check",
  };
}

/**
 * How many open GE lines a candidate course would fill: at most one area
 * (only if that area still needs courses) plus each still-open special
 * subject. A plain Area D course scores 1; JAPAN 80 (G + WRT + NWC) scores
 * 3 when all three are open.
 */
export function geScore(course: GECourse, status: GEStatus): { score: number; fills: GELine[] } {
  const { areas, specials } = parseGECodes(course.geCodes);
  const open = new Map(status.lines.map((l) => [l.line, !l.met] as const));
  const remainingByArea = Object.fromEntries(
    status.lines.filter((l) => (GE_AREAS as string[]).includes(l.line)).map((l) => [l.line, l.met ? 0 : l.needed - l.have])
  ) as Record<GEArea, number>;

  const fills: GELine[] = [];
  const openAreas = areas.filter((a) => open.get(a));
  if (openAreas.length > 0) {
    const area = [...openAreas].sort((x, y) => (remainingByArea[y] ?? 0) - (remainingByArea[x] ?? 0) || x.localeCompare(y))[0];
    fills.push(area);
  }
  for (const s of specials) if (open.get(s)) fills.push(s);
  return { score: fills.length, fills };
}
