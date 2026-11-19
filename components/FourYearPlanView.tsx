import { PastGrades } from "@/components/PastGrades";
import type { FourYearPlan, PlannedCourse, PlannedQuarter } from "@/lib/four-year-plan";

const WHY: Record<PlannedCourse["why"], string> = {
  required: "Required",
  choice: "Your pick",
  prereq: "Prerequisite",
};

function CourseRow({ c, quarter }: { c: PlannedCourse; quarter: string }) {
  return (
    <li className="plan-course">
      <div className="row between" style={{ gap: ".5rem", alignItems: "flex-start" }}>
        <div className="grow">
          <strong className="mono">{c.code}</strong> <span>{c.title}</span>
          <div className="fine">
            {WHY[c.why]} · {c.countsFor}
          </div>
          <PastGrades code={c.code} />
          {c.mustGet && (
            <div style={{ marginTop: ".3rem" }}>
              <span className="must-get">MUST TAKE IN {quarter.toUpperCase()}</span>{" "}
              <span className="fine">{c.mustGetReason}</span>
            </div>
          )}
        </div>
        <span className="fine" style={{ whiteSpace: "nowrap" }}>{c.units} units</span>
      </div>
    </li>
  );
}

function QuarterCard({ q }: { q: PlannedQuarter }) {
  const season = q.term.split(" ")[0];
  return (
    <section className="card plan-quarter">
      <div className="row between" style={{ alignItems: "baseline", marginBottom: ".4rem" }}>
        <h3 style={{ margin: 0, fontSize: "1.05rem" }}>{q.term}</h3>
        <span className="fine">
          {q.standing} · {q.totalUnits} units
        </span>
      </div>
      <ul className="plain-list">
        {q.courses.map((c) => <CourseRow key={c.code} c={c} quarter={season} />)}
        {q.otherUnits > 0 && (
          <li className="plan-course fine">
            <div className="row between">
              <span>GE or elective of your choice</span>
              <span>{q.otherUnits} units</span>
            </div>
          </li>
        )}
      </ul>
      {q.notes.map((n) => <p key={n} className="fine" style={{ margin: ".4rem 0 0" }}>{n}</p>)}
      {q.backups.length > 0 && (
        <details style={{ marginTop: ".5rem" }}>
          <summary style={{ cursor: "pointer", fontWeight: 600, fontSize: ".9rem" }}>Backups if a class is full ({q.backups.length})</summary>
          <ul className="plain-list" style={{ marginTop: ".35rem" }}>
            {q.backups.map((b) => (
              <li key={b.code} className="fine" style={{ marginBottom: ".25rem" }}>
                <strong className="mono">{b.code}</strong> {b.title}
                {b.code !== "GE" && <> ({b.units} units)</>}: {b.reason}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

export function FourYearPlanView({ plan }: { plan: FourYearPlan }) {
  const mustGets = plan.quarters.flatMap((q) => q.courses.filter((c) => c.mustGet).map((c) => ({ ...c, term: q.term })));
  return (
    <div>
      <p className="fine" style={{ marginBottom: "1rem" }}>
        {plan.major} · starting {plan.startTerm}
      </p>
      <div style={{ display: "flex", gap: ".75rem", flexWrap: "wrap", marginBottom: "1rem" }}>
        <div className="card" style={{ padding: ".5rem .9rem" }}>
          <b style={{ font: "400 1.3rem var(--display)", display: "block" }}>{plan.graduationTerm ?? "Not yet"}</b>
          <span className="fine">graduation</span>
        </div>
        <div className="card" style={{ padding: ".5rem .9rem" }}>
          <b style={{ font: "400 1.3rem var(--display)", display: "block" }}>{plan.unitsEarned + plan.unitsInProgress}</b>
          <span className="fine">units after this quarter</span>
        </div>
        <div className="card" style={{ padding: ".5rem .9rem" }}>
          <b style={{ font: "400 1.3rem var(--display)", display: "block" }}>{plan.quarters.length}</b>
          <span className="fine">quarters left</span>
        </div>
      </div>

      {mustGets.length > 0 && (
        <div className="note warn">
          <strong>Get these at your first pass time:</strong>
          <ul className="plain-list" style={{ margin: ".3rem 0 0" }}>
            {mustGets.slice(0, 4).map((c) => (
              <li key={c.code}>
                <span className="mono">{c.code}</span> in {c.term}. <span className="fine">{c.mustGetReason}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {plan.unscheduled.length > 0 && (
        <div className="note warn">
          <strong>Couldn&apos;t place:</strong>{" "}
          {plan.unscheduled.map((u) => `${u.code} (${u.reason})`).join(" ")}
        </div>
      )}

      <div className="plan-grid">
        {plan.quarters.map((q) => <QuarterCard key={q.term} q={q} />)}
      </div>

      <details className="note" style={{ marginTop: "1rem" }}>
        <summary style={{ cursor: "pointer", fontWeight: 600 }}>What this plan assumes</summary>
        <ul style={{ margin: ".4rem 0 0", paddingLeft: "1.1rem" }}>
          {plan.assumptions.map((a) => <li key={a} className="fine">{a}</li>)}
        </ul>
      </details>
    </div>
  );
}
