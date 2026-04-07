import {
  buildDefaultCountryModule,
  createCountryIssue,
  hasValue,
} from "@/lib/invoicing/blueprint/module-factory";

export const congoKinshasaComplianceModule = buildDefaultCountryModule("CD", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-07",
  evidence: [
    {
      label: "DR Congo DGI",
      url: "https://dgi.gouv.cd/",
      reviewedAt: "2026-04-07",
    },
    {
      label: "DR Congo TVA teledeclaration",
      url: "https://dgi.gouv.cd/teledeclaration/",
      reviewedAt: "2026-04-07",
    },
  ],
  extendValidation(issues, document) {
    if (document.lines.some((line) => !hasValue(line.description))) {
      issues.push(
        createCountryIssue(
          "invoice.lines",
          "CD_LINE_DESCRIPTION_REQUIRED",
          "DR Congo invoices should describe the goods or services supplied.",
          "ERROR",
          "CD"
        )
      );
    }
    if (document.taxBreakdown.length === 0) {
      issues.push(
        createCountryIssue(
          "invoice.taxBreakdown",
          "CD_TAX_BREAKDOWN_REQUIRED",
          "DR Congo invoices should show the applicable tax rate and amount.",
          "ERROR",
          "CD"
        )
      );
    }
    return issues;
  },
});
