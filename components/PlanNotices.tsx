import type { PlanResult } from "@/types";

/** Class standing and plan-wide notices (full time, upper-division standing). */
export function PlanNotices({ plan }: { plan: Pick<PlanResult, "standing" | "notices"> }) {
  if (!plan.standing && !plan.notices?.length) return null;
  return (
    <div style={{ margin: "0 0 1rem" }}>
      {plan.standing && <p className="fine" style={{ margin: "0 0 .5rem" }}>Class standing: <strong>{plan.standing}</strong></p>}
      {plan.notices && plan.notices.length > 0 && (
        <ul className="notices">
          {plan.notices.map((n) => <li key={n}>{n}</li>)}
        </ul>
      )}
    </div>
  );
}

/** "Mostly a fall course" and "Must get" labels for one scheduled course. */
export function CourseFlags({ termPattern, mustGet, mustGetReason }: { termPattern?: string; mustGet?: boolean; mustGetReason?: string }) {
  if (!termPattern && !mustGet) return null;
  return (
    <span style={{ display: "inline-flex", gap: ".35rem", flexWrap: "wrap", alignItems: "center", marginTop: ".25rem" }}>
      {mustGet && <span className="must-get" title={mustGetReason}>MUST GET, or PASS TIME!</span>}
      {termPattern && <span className="tag warn" style={{ fontSize: ".72rem" }}>{termPattern}</span>}
    </span>
  );
}
