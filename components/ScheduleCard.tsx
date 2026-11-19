import { PastGrades } from "@/components/PastGrades";
import type { Schedule } from "@/types";
import { WeeklyCalendar } from "./WeeklyCalendar";
import { ValidationBadge } from "./ValidationBadge";
import { CourseFlags } from "./PlanNotices";

interface Props {
  schedule: Schedule;
  title: string;
  isPrimary?: boolean;
  /** Requirement group id to plain name; ids are shown when missing. */
  groupNames?: Record<string, string>;
}

const COURSE_COLORS = [
  "bg-blue-50 border-blue-200",
  "bg-purple-50 border-purple-200",
  "bg-green-50 border-green-200",
  "bg-orange-50 border-orange-200",
  "bg-pink-50 border-pink-200",
  "bg-teal-50 border-teal-200",
];
const COURSE_DOT_COLORS = [
  "bg-blue-500",
  "bg-purple-500",
  "bg-green-500",
  "bg-orange-500",
  "bg-pink-500",
  "bg-teal-500",
];

export function ScheduleCard({ schedule, title, isPrimary = false, groupNames }: Props) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      {/* Change note for backups */}
      {schedule.changeNote && (
        <div className="bg-amber-50 border-b border-amber-100 px-5 py-3 flex items-start gap-2">
          <span className="text-amber-500 mt-0.5 shrink-0">↕</span>
          <p className="text-sm text-amber-800">
            <span className="font-semibold">What changed: </span>{schedule.changeNote}
          </p>
        </div>
      )}

      <div className="p-6 space-y-6">
        {/* Calendar */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-800">Weekly view</h3>
            <span className="text-xs text-gray-400">{schedule.totalUnits} units total</span>
          </div>
          <WeeklyCalendar courses={schedule.courses} />
        </div>

        {/* Course list */}
        <div>
          <h3 className="text-sm font-semibold text-gray-800 mb-3">Courses</h3>
          <div className="space-y-2">
            {schedule.courses.map((sc, i) => (
              <div
                key={sc.offering.code}
                className={`flex items-start justify-between gap-3 p-3 rounded-xl border ${COURSE_COLORS[i % COURSE_COLORS.length]}`}
              >
                <div className="flex items-start gap-2.5 flex-1 min-w-0">
                  <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${COURSE_DOT_COLORS[i % COURSE_DOT_COLORS.length]}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-gray-900">{sc.offering.code}</span>
                      <span className="text-xs text-gray-500 truncate">{sc.offering.title}</span>
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      {sc.offering.schedule.days.join("")} · {sc.offering.schedule.startTime}–{sc.offering.schedule.endTime} · {sc.offering.instructor}
                    </div>
                    <CourseFlags termPattern={sc.termPattern} mustGet={sc.mustGet} mustGetReason={sc.mustGetReason} />
                    <PastGrades code={sc.offering.code} />
                    {sc.satisfies.length > 0 && (
                      <div className="flex gap-1 mt-1.5 flex-wrap">
                        {sc.satisfies.map((gid) => (
                          <span key={gid} className="text-[10px] font-medium bg-white/80 text-gray-600 px-2 py-0.5 rounded-full border border-gray-200">
                            {groupNames?.[gid] ?? gid}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <span className="text-xs font-semibold text-gray-500 shrink-0 mt-0.5">{sc.offering.units}u</span>
              </div>
            ))}
          </div>
        </div>

        {/* Explanation */}
        <details className="more">
          <summary>Why this schedule</summary>
          <p className="text-sm leading-relaxed">{schedule.explanation}</p>
        </details>

        {/* Swap options */}
        {Object.entries(schedule.swaps).length > 0 && (
          <details className="more">
            <summary>Swap options if a course fills up ({Object.values(schedule.swaps).flat().length})</summary>
            <div className="space-y-2">
              {Object.entries(schedule.swaps).map(([courseCode, options]) =>
                options.map((swap, i) => (
                  <div key={`${courseCode}-${i}`} className="flex items-start gap-2 text-xs bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5">
                    <span className="font-semibold text-gray-700 shrink-0">{courseCode}</span>
                    <span className="text-gray-300">→</span>
                    <span className="font-semibold text-gray-700 shrink-0">{swap.offering.code}</span>
                    <span className="text-gray-500 leading-relaxed">{swap.reason}</span>
                  </div>
                ))
              )}
            </div>
          </details>
        )}

        {/* Validation */}
        <ValidationBadge validation={schedule.validation} />
      </div>
    </div>
  );
}
