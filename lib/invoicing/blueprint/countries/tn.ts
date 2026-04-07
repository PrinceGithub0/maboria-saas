import { buildDefaultCountryModule, createCountryIssue, hasValue } from "@/lib/invoicing/blueprint/module-factory";

export const tunisiaComplianceModule = buildDefaultCountryModule("TN", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-06",
  evidence: [
    {
      label: "Tunisia Ministry of Finance VAT invoicing obligations",
      url: "https://www.finances.gov.tn/fr/node/75",
      reviewedAt: "2026-04-06",
    },
  ],
  extendValidation(issues, document) {
    if (!hasValue(document.supplier.taxId || document.supplier.vatId)) {
      issues.push(
        createCountryIssue(
          "supplier.taxId",
          "TN_TAX_ID_REQUIRED",
          "Tunisian VAT invoices should capture the supplier tax registration number.",
          "ERROR",
          "TN"
        )
      );
    }
    if (document.totals.taxTotal > 0 && !document.taxBreakdown.length) {
      issues.push(
        createCountryIssue(
          "taxBreakdown",
          "TN_VAT_BREAKDOWN_REQUIRED",
          "Tunisian VAT invoices should include VAT rates and amounts.",
          "ERROR",
          "TN"
        )
      );
    }
    return issues;
  },
});
