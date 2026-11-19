/**
 * Upper-division courses a student can mark "seems interesting" while
 * personalizing. Grouped by requirement, with a short description where
 * this quarter's class data has one.
 */
import type { MajorRequirements, QuarterOfferings } from "@/types";
import { normalizeCode } from "@/lib/course-codes";
import { isUpperDivision } from "@/lib/standing";

export interface InterestCourse {
  code: string;
  title: string;
  description: string;
  offeredThisQuarter: boolean;
}

export interface InterestGroup {
  id: string;
  name: string;
  description?: string;
  courses: InterestCourse[];
}

export function interestGroups(req: MajorRequirements, offerings: QuarterOfferings): InterestGroup[] {
  const byCode = new Map(offerings.courses.map((o) => [normalizeCode(o.code), o]));
  return req.groups
    .map((g) => ({
      id: g.id,
      name: g.name,
      description: g.description,
      courses: g.courses.filter(isUpperDivision).map((code) => {
        const o = byCode.get(normalizeCode(code));
        return {
          code,
          title: o?.title ?? "",
          description: o?.description ?? "",
          offeredThisQuarter: Boolean(o),
        };
      }),
    }))
    .filter((g) => g.courses.length > 0);
}

/** Shorten a catalog description to its first sentence. */
export function shortDescription(text: string, max = 140): string {
  const first = text.split(/(?<=\.)\s/)[0] ?? "";
  return first.length > max ? first.slice(0, max - 1).trimEnd() + "…" : first;
}
