import {
  buildDefaultCountryModule,
  createCountryIssue,
  hasValue,
} from "@/lib/invoicing/blueprint/module-factory";

export const maliComplianceModule = buildDefaultCountryModule("ML", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-07",
  evidence: [
    {
      label: "API Mali investment and business administration portal",
      url: "https://apimali.gov.ml/",
      reviewedAt: "2026-04-07",
    },
    {
      label: "API Mali regional single-window offices",
      url: "https://apimali.gov.ml/antennes-regionales/",
      reviewedAt: "2026-04-07",
    },
  ],
  extendValidation(issues, document) {
    if (document.lines.some((line) => !hasValue(line.description))) {
      issues.push(
        createCountryIssue(
          "invoice.lines",
          "ML_LINE_DESCRIPTION_REQUIRED",
          "Mali invoices should describe the goods or services supplied.",
          "ERROR",
          "ML"
        )
      );
    }
    if (document.taxBreakdown.length === 0) {
      issues.push(
        createCountryIssue(
          "invoice.taxBreakdown",
          "ML_TAX_BREAKDOWN_REQUIRED",
          "Mali invoices should show the applicable tax rate and amount.",
          "ERROR",
          "ML"
        )
      );
    }
    return issues;
  },
});
