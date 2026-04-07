import {
  buildDefaultCountryModule,
  createCountryIssue,
  hasValue,
} from "@/lib/invoicing/blueprint/module-factory";

export const burundiComplianceModule = buildDefaultCountryModule("BI", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-07",
  evidence: [
    {
      label: "Burundi Revenue Authority",
      url: "https://www.obr.bi/",
      reviewedAt: "2026-04-07",
    },
    {
      label: "Burundi tax and customs forms",
      url: "https://www.obr.bi/index.php/en/formulaires-d-impots-et-taxes",
      reviewedAt: "2026-04-07",
    },
  ],
  extendValidation(issues, document) {
    if (document.lines.some((line) => !hasValue(line.description))) {
      issues.push(
        createCountryIssue(
          "invoice.lines",
          "BI_LINE_DESCRIPTION_REQUIRED",
          "Burundi invoices should describe the goods or services supplied.",
          "ERROR",
          "BI"
        )
      );
    }
    if (document.taxBreakdown.length === 0) {
      issues.push(
        createCountryIssue(
          "invoice.taxBreakdown",
          "BI_TAX_BREAKDOWN_REQUIRED",
          "Burundi invoices should show the applicable tax rate and amount.",
          "ERROR",
          "BI"
        )
      );
    }
    return issues;
  },
});
