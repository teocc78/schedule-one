import { gradesFor, instructorShortName, GRADES_SOURCE, GRADES_SOURCE_URL } from "@/lib/grade-history";

/** One line of past grades for a course, with the instructors who taught it lately. */
export function PastGrades({ code }: { code: string }) {
  const g = gradesFor(code);
  if (!g) return null;
  const recent = g.instructors.slice(0, 3).map((i) => `${instructorShortName(i.name)} ${i.avgGPA.toFixed(2)}`).join(", ");
  return (
    <div className="fine" style={{ marginTop: ".2rem" }} title={`${GRADES_SOURCE}. ${g.all.students} letter-graded students since 2023.`}>
      Past grades: avg GPA {g.all.avgGPA.toFixed(2)}, {g.all.pctA}% A&apos;s over {g.all.quarters} quarters
      {recent && <> · Recent: {recent}</>}{" "}
      <a href={GRADES_SOURCE_URL} target="_blank" rel="noreferrer">(source)</a>
    </div>
  );
}
