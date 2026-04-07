import { buildDefaultCountryModule, createCountryIssue } from "@/lib/invoicing/blueprint/module-factory";

export const djiboutiComplianceModule = buildDefaultCountryModule("DJ", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-07",
  evidence: [
    {
      label: "Djibouti Ministry of Budget budget and tax framework",
      url: "https://budget.gouv.dj/le-budget-de-letat/",
      reviewedAt: "2026-04-07",
    },
  ],
  extendValidation(issues, document) {
    if (document.taxBreakdown.length === 0) {
      issues.push(
        createCountryIssue(
          "invoice.taxBreakdown",
          "DJ_TAX_BREAKDOWN_REQUIRED",
          "Djibouti VAT invoices should show the applicable VAT rate and amount.",
          "ERROR",
          "DJ"
        )
      );
    }
    return issues;
  },
});
