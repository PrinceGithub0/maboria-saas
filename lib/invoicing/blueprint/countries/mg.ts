import { buildDefaultCountryModule, createCountryIssue } from "@/lib/invoicing/blueprint/module-factory";

export const madagascarComplianceModule = buildDefaultCountryModule("MG", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-07",
  evidence: [
    {
      label: "Madagascar Direction Generale des Impots",
      url: "https://www.impots.mg/",
      reviewedAt: "2026-04-07",
    },
  ],
  extendValidation(issues, document) {
    if (document.taxBreakdown.length === 0) {
      issues.push(
        createCountryIssue(
          "invoice.taxBreakdown",
          "MG_TAX_BREAKDOWN_REQUIRED",
          "Madagascar VAT invoices should show the applicable TVA rate and amount.",
          "ERROR",
          "MG"
        )
      );
    }
    return issues;
  },
});
