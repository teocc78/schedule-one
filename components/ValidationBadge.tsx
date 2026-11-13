import type { ValidationResult, ValidationCheck } from "@/types";

const CHECK_LABELS: Record<ValidationCheck, string> = {
  no_time_conflicts: "No time conflicts",
  unit_limit: "Unit limit",
  prerequisites_met: "Prerequisites met",
  no_duplicate_requirements: "No duplicate requirements",
  respects_constraints: "Respects your preferences",
};

export function ValidationBadge({ validation }: { validation: ValidationResult }) {
  return (
    <div className={`rounded-lg border p-3 ${validation.valid ? "border-green-200 bg-green-50" : "border-yellow-200 bg-yellow-50"}`}>
      <div className="flex items-center gap-2 mb-2">
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${validation.valid ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}`}>
          {validation.valid ? "Validated" : "Warnings"}
        </span>
      </div>
      <div className="space-y-1">
        {(Object.keys(CHECK_LABELS) as ValidationCheck[]).map((check) => {
          const passed = validation.passedChecks.includes(check);
          return (
            <div key={check} className="flex items-center gap-1.5 text-xs">
              <span className={passed ? "text-green-500" : "text-red-400"}>
                {passed ? "✓" : "✗"}
              </span>
              <span className={passed ? "text-gray-600" : "text-gray-500"}>
                {CHECK_LABELS[check]}
              </span>
            </div>
          );
        })}
      </div>
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
