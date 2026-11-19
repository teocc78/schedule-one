/**
 * Suggested GE classes for a quarter where the major alone can't fill a
 * schedule (an Econ sophomore can only take ECON 10A in Winter, for example).
 *
 * 1. Work out which GE areas the transcript already covers, from the GE
 *    areas in data/catalog/ge-courses.json.
 * 2. Offer the suggested Winter GE sections that fill an open area, as extra
 *    offerings with one "GE Area X" requirement group each, so the normal
 *    schedule search can use them.
 *
 * Area B (foreign language) is left out: it depends on placement and the
 * language the student picks.
 */
import geCatalog from "@/data/catalog/ge-courses.json";
import geSections from "@/data/offerings/winter-2027-ge.json";
import type { CompletedCourse, CourseOffering, DayOfWeek } from "@/types";
import type { RequirementStatus } from "@/lib/requirements";
import { normalizeCode } from "@/lib/course-codes";
import {
  BA_SPECIAL_COUNTS,
  BS_AREA_COUNTS,
  BS_SPECIAL_COUNTS,
  GE_LABELS,
  computeGEStatus,
  geScore,
  type GEArea,
  type GEStatus,
} from "@/lib/ge";

interface GECatalogEntry {
  title: string;
  units: number;
  ge: string[];
  specials?: string[];
}

const CATALOG = new Map(
  Object.entries((geCatalog as unknown as { courses: Record<string, GECatalogEntry> }).courses).map(([code, c]) => [
    normalizeCode(code),
    { code, ...c },
  ])
);

interface Section {
  code: string;
  schedule: { days: DayOfWeek[]; startTime: string; endTime: string };
  prerequisites: string[];
}
const SECTIONS = (geSections as unknown as { sections: Section[] }).sections;

const NOT_EARNED = new Set(["F", "NP", "W"]);

/** "A1" and "A2" both count toward Area A. */
function geCodes(c: GECatalogEntry): string[] {
  return [...c.ge.map((a) => a.replace(/^A[12]$/, "A")), ...(c.specials ?? [])];
}

/** GE progress from a transcript; in-progress courses count. */
export function geStatusFromTranscript(completed: CompletedCourse[], ba = false): GEStatus {
  const taken = completed
    .filter((c) => !NOT_EARNED.has(c.grade))
    .map((c) => CATALOG.get(normalizeCode(c.code)))
    .filter((c): c is NonNullable<typeof c> => Boolean(c))
    .map((c) => ({ code: c.code, geCodes: geCodes(c) }));
  return computeGEStatus(taken, {
    areas: BS_AREA_COUNTS,
    specials: ba ? BA_SPECIAL_COUNTS : BS_SPECIAL_COUNTS,
  });
}

export interface GESuggestions {
  offerings: CourseOffering[];
  /** One group per open GE area, e.g. "ge-G" named "GE Area G: Literature". */
  groups: RequirementStatus[];
  /** Extra score for courses that also fill open special subjects. */
  bonus: Map<string, number>;
}

/** Suggested GE sections that fill an open area for this student. */
export function suggestGECourses(completed: CompletedCourse[], ba = false): GESuggestions {
  const status = geStatusFromTranscript(completed, ba);
  const done = new Set(completed.filter((c) => !NOT_EARNED.has(c.grade)).map((c) => normalizeCode(c.code)));
  const openAreas = new Map(
    status.lines
      .filter((l) => l.line !== "B" && l.line.length === 1 && !l.met)
      .map((l) => [l.line as GEArea, l.needed - l.have])
  );

  const offerings: CourseOffering[] = [];
  const bonus = new Map<string, number>();
  const used = new Map<GEArea, string[]>();
  for (const s of SECTIONS) {
    const c = CATALOG.get(normalizeCode(s.code));
    if (!c || done.has(normalizeCode(s.code))) continue;
    if (!s.prerequisites.every((p) => done.has(normalizeCode(p)))) continue;
    const { fills } = geScore({ code: c.code, geCodes: geCodes(c) }, status);
    const area = fills.find((f): f is GEArea => openAreas.has(f as GEArea));
    if (!area) continue;
    offerings.push({
      code: c.code,
      title: c.title,
      units: c.units,
      schedule: s.schedule,
      instructor: "TBA",
      prerequisites: s.prerequisites,
      description: `Suggested GE: ${GE_LABELS[area]}.`,
      enrollmentCap: 0,
      requirementGroups: [`ge-${area}`],
    });
    bonus.set(c.code, fills.length - 1);
    used.set(area, [...(used.get(area) ?? []), c.code]);
  }

  const groups: RequirementStatus[] = [...used].map(([area, codes]) => ({
    groupId: `ge-${area}`,
    groupName: `GE ${GE_LABELS[area]}`,
    satisfied: false,
    completedCourses: [],
    remainingCourses: codes,
    stillNeeded: openAreas.get(area) ?? 1,
  }));
  return { offerings, groups, bonus };
}
