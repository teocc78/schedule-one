/**
 * Response shapes of the UCSB Academic Curriculums API v3, from the
 * OpenAPI spec (curriculums-v3_0_0.yaml) as summarized in
 * docs/ucsb-api-reference.md. Fields the portal did not show real values
 * for are typed loosely.
 */

export interface UcsbTimeLocation {
  room?: string | null;
  building?: string | null;
  roomCapacity?: number | null;
  /** e.g. "M W    " or "TR" (exact padding UNVERIFIED) */
  days?: string | null;
  /** e.g. "11:00" (format UNVERIFIED; "1100" is also handled) */
  beginTime?: string | null;
  endTime?: string | null;
}

export interface UcsbInstructor {
  instructor: string;
  functionCode?: string | null;
}

export interface UcsbClassSection {
  enrollCode: string;
  section: string;
  session?: string | null;
  classClosed?: string | boolean | null;
  courseCancelled?: string | boolean | null;
  gradingOptionCode?: string | null;
  secondaryStatus?: string | null;
  enrolledTotal?: number | null;
  maxEnroll?: number | null;
  departmentApprovalRequired?: boolean | null;
  instructorApprovalRequired?: boolean | null;
  restrictionLevel?: string | null;
  restrictionMajor?: string | null;
  restrictionMajorPass?: string | null;
  restrictionMinor?: string | null;
  restrictionMinorPass?: string | null;
  concurrentCourses?: string[] | null;
  timeLocations?: UcsbTimeLocation[] | null;
  instructors?: UcsbInstructor[] | null;
}

export interface UcsbGeneralEducation {
  geCode: string;
  geCollege?: string | null;
}

export interface UcsbClass {
  quarter: string;
  courseId: string;
  title: string;
  description?: string | null;
  contactHours?: number | null;
  college?: string | null;
  objLevelCode?: string | null;
  subjectArea?: string | null;
  deptCode?: string | null;
  instructionType?: string | null;
  instructionTypeSecondary?: string | null;
  gradingOption?: string | null;
  unitsFixed?: number | null;
  unitsVariableHigh?: number | null;
  unitsVariableLow?: number | null;
  delayedSectioning?: string | null;
  inProgressCourse?: boolean | null;
  onLineCourse?: boolean | null;
  generalEducation?: UcsbGeneralEducation[] | null;
  classSections?: UcsbClassSection[] | null;
}

export interface UcsbClassSearchResponse {
  pageNumber: number;
  pageSize: number;
  total: number;
  classes: UcsbClass[];
}

export interface UcsbSpaceAvailability {
  pageNumber: number;
  pageSize: number;
  total: number;
  classSpaces: {
    courseId: string;
    classSpaceAvailabilities: { section: string; enrollCode: string; enrolledTotal: number; maxEnroll: number }[];
  }[];
}

export interface UcsbFinal {
  hasFinals: boolean;
  comments?: string | null;
  examDay?: string | null;
  examDate?: string | null;
  beginTime?: string | null;
  endTime?: string | null;
}

/** Query parameters for GET /v3/classes/search. Names match the API exactly. */
export interface UcsbClassSearchParams {
  quarter: string;
  courseId?: string;
  enrollCode?: string;
  session?: string;
  subjectCode?: string;
  deptCode?: string;
  objLevelCode?: string;
  title?: string;
  /** Allowed values are undocumented. Don't rely on it; filter GE codes client-side. */
  areas?: string;
  openSections?: boolean;
  nonRestriction?: boolean;
  nonPreReq?: boolean;
  minUnits?: number;
  maxUnits?: number;
  minStartTime?: number;
  maxStartTime?: number;
  days?: string;
  instructor?: string;
  includeClassSections?: boolean;
  pageNumber?: number;
  /** Max 500 */
  pageSize?: number;
}
