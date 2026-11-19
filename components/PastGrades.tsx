import { gradesFor, instructorShortName, GRADES_SOURCE, GRADES_SOURCE_URL } from "@/lib/grade-history";

/** Past grades for a course in one short line; recent instructors open on a tap. */
export function PastGrades({ code, open = false }: { code: string; open?: boolean }) {
  const g = gradesFor(code);
  if (!g) return null;
  const recent = g.instructors.slice(0, 3).map((i) => `${instructorShortName(i.name)} ${i.avgGPA.toFixed(2)}`).join(", ");
  if (open) {
    // Already inside an expanded section: plain text, no second tap.
    return (
      <p>
        Past grades: avg GPA {g.all.avgGPA.toFixed(2)}, {g.all.pctA}% A&apos;s since 2023.{recent && <> Recent: {recent}.</>}{" "}
        <a href={GRADES_SOURCE_URL} target="_blank" rel="noreferrer" title={GRADES_SOURCE}>Source</a>
      </p>
    );
  }
  return (
    <details className="more">
      <summary>Avg GPA {g.all.avgGPA.toFixed(2)} · {g.all.pctA}% A&apos;s</summary>
      <p>
        Over {g.all.quarters} quarters since 2023.{recent && <> Recent: {recent}.</>}{" "}
        <a href={GRADES_SOURCE_URL} target="_blank" rel="noreferrer" title={GRADES_SOURCE}>Source</a>
      </p>
    </details>
  );
}
