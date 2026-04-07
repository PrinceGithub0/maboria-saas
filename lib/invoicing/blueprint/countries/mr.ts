import {
  buildDefaultCountryModule,
  createCountryIssue,
  hasValue,
} from "@/lib/invoicing/blueprint/module-factory";

export const mauritaniaComplianceModule = buildDefaultCountryModule("MR", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-07",
  evidence: [
    {
      label: "Mauritania Ministry of Finance",
      url: "https://finances.gov.mr/fr",
      reviewedAt: "2026-04-07",
    },
    {
      label: "Mauritania Finance Ministry tax and customs reform update",
      url: "https://finances.gov.mr/fr/node/605",
      reviewedAt: "2026-04-07",
    },
  ],
  extendValidation(issues, document) {
    if (document.lines.some((line) => !hasValue(line.description))) {
      issues.push(
        createCountryIssue(
          "invoice.lines",
          "MR_LINE_DESCRIPTION_REQUIRED",
          "Mauritania invoices should describe the goods or services supplied.",
          "ERROR",
          "MR"
        )
      );
    }
    if (document.taxBreakdown.length === 0) {
      issues.push(
        createCountryIssue(
          "invoice.taxBreakdown",
          "MR_VAT_BREAKDOWN_REQUIRED",
          "Mauritania VAT invoices should show the applicable VAT rate and amount.",
          "ERROR",
          "MR"
        )
      );
    }
    return issues;
  },
});
