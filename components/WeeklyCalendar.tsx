import type { ScheduledCourse, DayOfWeek } from "@/types";

const DAYS: DayOfWeek[] = ["M", "T", "W", "R", "F"];
const DAY_FULL: Record<DayOfWeek, string> = {
  M: "Mon", T: "Tue", W: "Wed", R: "Thu", F: "Fri",
};

// Hours to display: 8am–6pm
const HOURS = Array.from({ length: 10 }, (_, i) => i + 8);

function toMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

const START_MINUTES = 8 * 60;
const TOTAL_MINUTES = 10 * 60;
const COLORS = [
  "bg-blue-100 border-blue-400 text-blue-800",
  "bg-purple-100 border-purple-400 text-purple-800",
  "bg-green-100 border-green-400 text-green-800",
  "bg-orange-100 border-orange-400 text-orange-800",
  "bg-pink-100 border-pink-400 text-pink-800",
  "bg-teal-100 border-teal-400 text-teal-800",
];

export function WeeklyCalendar({ courses }: { courses: ScheduledCourse[] }) {
  const colorMap: Record<string, string> = {};
  courses.forEach((sc, i) => {
    colorMap[sc.offering.code] = COLORS[i % COLORS.length];
  });

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[560px]">
        {/* Header row */}
        <div className="grid grid-cols-[48px_repeat(5,1fr)] text-xs font-medium text-gray-500 mb-1">
          <div />
          {DAYS.map((d) => (
            <div key={d} className="text-center py-1">{DAY_FULL[d]}</div>
          ))}
        </div>

        {/* Time grid */}
        <div className="relative grid grid-cols-[48px_repeat(5,1fr)]" style={{ height: `${TOTAL_MINUTES / 2}px` }}>
          {/* Hour lines */}
          {HOURS.map((h) => {
            const top = ((h * 60 - START_MINUTES) / TOTAL_MINUTES) * 100;
            return (
              <div key={h} className="col-span-6 absolute w-full" style={{ top: `${top}%` }}>
                <div className="flex items-start">
                  <span className="w-[48px] text-right pr-2 text-xs text-gray-400 -mt-2 select-none">
                    {h > 12 ? `${h - 12}pm` : h === 12 ? "12pm" : `${h}am`}
                  </span>
                  <div className="flex-1 border-t border-gray-100" />
                </div>
              </div>
            );
          })}

          {/* Course blocks */}
          {courses.map((sc) => {
            const { days, startTime, endTime } = sc.offering.schedule;
            const startMin = toMinutes(startTime);
            const endMin = toMinutes(endTime);
            const topPct = ((startMin - START_MINUTES) / TOTAL_MINUTES) * 100;
            const heightPct = ((endMin - startMin) / TOTAL_MINUTES) * 100;
            const color = colorMap[sc.offering.code];

            return days.map((day) => {
              const colIndex = DAYS.indexOf(day as DayOfWeek);
              if (colIndex === -1) return null;
              // col-start is 2-indexed (first col is time labels)
              return (
                <div
                  key={`${sc.offering.code}-${day}`}
                  className={`absolute rounded border-l-2 px-1.5 py-0.5 text-xs overflow-hidden ${color}`}
                  style={{
                    top: `${topPct}%`,
                    height: `${heightPct}%`,
                    left: `calc(48px + ${colIndex} * (100% - 48px) / 5 + 2px)`,
                    width: `calc((100% - 48px) / 5 - 4px)`,
                  }}
                >
                  <div className="font-semibold leading-tight truncate">{sc.offering.code}</div>
                  <div className="leading-tight text-[10px] opacity-80 truncate">{startTime}–{endTime}</div>
                </div>
              );
            });
          })}
        </div>
      </div>
    </div>
  );
}
