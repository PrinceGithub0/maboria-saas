import {
  buildDefaultCountryModule,
  createCountryIssue,
  hasValue,
} from "@/lib/invoicing/blueprint/module-factory";

export const anguillaComplianceModule = buildDefaultCountryModule("AI", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-07",
  evidence: [
    {
      label: "Anguilla Inland Revenue GST",
      url: "https://ird.gov.ai/Services/Tax/gst",
      reviewedAt: "2026-04-07",
    },
    {
      label: "Anguilla Inland Revenue General Services Tax",
      url: "https://ird.gov.ai/Services/Tax/GenST",
      reviewedAt: "2026-04-07",
    },
  ],
  extendValidation(issues, document) {
    if (document.lines.some((line) => !hasValue(line.description))) {
      issues.push(
        createCountryIssue(
          "invoice.lines",
          "AI_LINE_DESCRIPTION_REQUIRED",
          "Anguilla invoices should describe the goods or services supplied.",
          "ERROR",
          "AI"
        )
      );
    }
    issues.push(
      createCountryIssue(
        "invoice.taxBreakdown",
        "AI_GST_NOTICE",
        "Confirm whether Anguilla GST or General Services Tax applies and retain the matching tax invoice support.",
        "WARNING",
        "AI"
      )
    );
    return issues;
  },
});
