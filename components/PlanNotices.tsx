import type { PlanResult } from "@/types";
import { mustGetLabel } from "@/lib/must-get";

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
export function CourseFlags({ termPattern, mustGet, mustGetReason, exclusiveTo, quarter = "Winter" }: { termPattern?: string; mustGet?: boolean; mustGetReason?: string; exclusiveTo?: string; quarter?: string }) {
  if (!termPattern && !mustGet) return null;
  // "Mostly a Winter course" says the same thing as the exclusive label.
  const showPattern = termPattern && !(mustGet && exclusiveTo);
  return (
    <span style={{ display: "inline-flex", gap: ".35rem", flexWrap: "wrap", alignItems: "center", marginTop: ".25rem" }}>
      {mustGet && <span className="must-get" title={mustGetReason}>{mustGetLabel(quarter, exclusiveTo)}</span>}
      {showPattern && <span className="tag warn" style={{ fontSize: ".72rem" }}>{termPattern}</span>}
    </span>
  );
}
