import { buildDefaultCountryModule, createCountryIssue } from "@/lib/invoicing/blueprint/module-factory";

export const mozambiqueComplianceModule = buildDefaultCountryModule("MZ", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-07",
  evidence: [
    {
      label: "Mozambique tax authority e-Declaracao and IVA filing notice",
      url: "https://edeclaracao.at.gov.mz/Register.aspx",
      reviewedAt: "2026-04-07",
    },
  ],
  extendValidation(issues, document) {
    if (document.taxBreakdown.length === 0) {
      issues.push(
        createCountryIssue(
          "invoice.taxBreakdown",
          "MZ_TAX_BREAKDOWN_REQUIRED",
          "Mozambique VAT invoices should show the applicable IVA rate and amount.",
          "ERROR",
          "MZ"
        )
      );
    }
    return issues;
  },
});
