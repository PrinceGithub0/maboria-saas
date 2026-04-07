import type { BlueprintValidationResult } from "@/lib/invoicing/blueprint/types";

const BLOCKING_WARNING_CODES = new Set([
  "COUNTRY_MANUAL_REVIEW_REQUIRED",
  "COUNTRY_LIMITED_SUPPORT",
]);

export function getBlueprintValidationBlockingReason(
  validation?: BlueprintValidationResult | null
) {
  const blueprintBlockingIssue =
    validation?.issues.find(
      (issue) =>
        issue.severity === "ERROR" ||
        (issue.severity === "WARNING" && BLOCKING_WARNING_CODES.has(issue.code))
    ) || null;
  return blueprintBlockingIssue?.message || null;
}
