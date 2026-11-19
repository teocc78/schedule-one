import type { ValidationResult, ValidationCheck } from "@/types";

const CHECK_LABELS: Record<ValidationCheck, string> = {
  no_time_conflicts: "No time conflicts",
  unit_limit: "Unit limit",
  prerequisites_met: "Prerequisites met",
  no_duplicate_requirements: "No duplicate requirements",
  respects_constraints: "Respects your preferences",
};

/** One line when every check passes; the full list opens on a tap. */
export function ValidationBadge({ validation }: { validation: ValidationResult }) {
  const checks = Object.keys(CHECK_LABELS) as ValidationCheck[];
  const failed = checks.filter((c) => !validation.passedChecks.includes(c));
  const list = (
    <div className="space-y-1">
      {checks.map((check) => {
        const passed = !failed.includes(check);
        return (
          <div key={check} className="flex items-center gap-1.5 text-xs">
            <span className={passed ? "text-green-500" : "text-red-400"}>{passed ? "✓" : "✗"}</span>
            <span className={passed ? "text-gray-600" : "text-gray-500"}>{CHECK_LABELS[check]}</span>
          </div>
        );
      })}
    </div>
  );
  return (
    <div className={`rounded-lg border p-3 ${validation.valid ? "border-green-200 bg-green-50" : "border-yellow-200 bg-yellow-50"}`}>
      {validation.valid && failed.length === 0 ? (
        <details className="more" style={{ marginTop: 0 }}>
          <summary className="text-xs text-green-700">✓ All {checks.length} checks passed</summary>
          {list}
        </details>
      ) : (
        <>
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700">Warnings</span>
          <div className="mt-2">{list}</div>
        </>
      )}
      {validation.errors.length > 0 && (
        <ul className="mt-2 space-y-0.5">
          {validation.errors.map((e, i) => (
            <li key={i} className="text-xs text-yellow-700">• {e}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
