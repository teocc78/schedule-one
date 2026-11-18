/**
 * Winter 2027 worked test case from the product spec (section 1).
 * Times come from the spec. Enroll code 59915 is from the spec; every other
 * enroll code and the alternative JAPAN 80 sections are SYNTHETIC sample
 * data for the demo and tests. Check GOLD for real sections.
 */
import type { CourseSections, Pick, Section } from "@/lib/schedule-engine";

const sec = (
  enrollCode: string,
  section: string,
  kind: Section["kind"],
  days: Section["meetings"][number]["days"],
  start: string,
  end: string,
  extra: Partial<Section> = {}
): Section => ({ enrollCode, section, kind, meetings: [{ days, start, end }], status: "open", ...extra });

export const LOCKED_W27: Pick[] = [
  {
    courseId: "PSY 10B",
    lecture: sec("10001", "0100", "LEC", ["M", "W"], "11:00", "12:15", { instructor: "Staff" }),
    section: sec("10019", "0101", "DIS", ["W"], "15:00", "16:50"),
  },
  {
    courseId: "PSTAT 8",
    lecture: sec("20001", "0100", "LEC", ["M", "W"], "12:30", "13:45", { instructor: "Staff" }),
    section: sec("20027", "0101", "DIS", ["T", "R"], "17:00", "17:50"),
  },
  {
    courseId: "EEMB 7",
    lecture: sec("30001", "0100", "LEC", ["T", "R"], "15:30", "16:45", { instructor: "Staff" }),
    section: null,
  },
];

export const JAPAN_80_W27: CourseSections = {
  courseId: "JAPAN 80",
  title: "Japanese Literature in Translation (sample)",
  units: 5,
  mandatory: false,
  geCodes: ["G", "WRT", "NWC"],
  options: [
    {
      lecture: sec("59907", "0100", "LEC", ["T", "R"], "11:00", "12:15", { instructor: "Staff" }),
      sections: [
        // From the spec: overlaps EEMB 7 (3:30-3:50 on Thursday) and must be rejected.
        sec("59915", "0101", "DIS", ["R"], "15:00", "15:50"),
        sec("59923", "0102", "DIS", ["F"], "10:00", "10:50"),
        sec("59931", "0103", "DIS", ["M"], "14:00", "14:50"),
      ],
    },
  ],
};

export const SAMPLE_COURSES_W27: CourseSections[] = [JAPAN_80_W27];
