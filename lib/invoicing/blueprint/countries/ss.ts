import {
  buildDefaultCountryModule,
  createCountryIssue,
  hasValue,
} from "@/lib/invoicing/blueprint/module-factory";

export const southSudanComplianceModule = buildDefaultCountryModule("SS", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-07",
  evidence: [
    {
      label: "South Sudan Revenue Authority eTax",
      url: "https://etax.nra.gov.ss/",
      reviewedAt: "2026-04-07",
    },
    {
      label: "South Sudan Revenue Authority eCustoms",
      url: "https://ecustoms.nra.gov.ss/customs/",
      reviewedAt: "2026-04-07",
    },
  ],
  extendValidation(issues, document) {
    if (document.lines.some((line) => !hasValue(line.description))) {
      issues.push(
        createCountryIssue(
          "invoice.lines",
          "SS_LINE_DESCRIPTION_REQUIRED",
          "South Sudan invoices should describe the goods or services supplied.",
          "ERROR",
          "SS"
        )
      );
    }
    if (document.taxBreakdown.length === 0) {
      issues.push(
        createCountryIssue(
          "invoice.taxBreakdown",
          "SS_TAX_BREAKDOWN_REQUIRED",
          "South Sudan invoices should show the applicable tax rate and amount where tax is charged.",
          "ERROR",
          "SS"
        )
      );
    }
    return issues;
  },
});
