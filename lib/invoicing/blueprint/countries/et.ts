import { buildDefaultCountryModule, createCountryIssue } from "@/lib/invoicing/blueprint/module-factory";

export const ethiopiaComplianceModule = buildDefaultCountryModule("ET", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-07",
  evidence: [
    {
      label: "Ethiopia Ministry of Revenue portal",
      url: "https://www.mor.gov.et/web/mor/",
      reviewedAt: "2026-04-07",
    },
    {
      label: "Ethiopia Ministry of Revenue directives library",
      url: "https://www.mor.gov.et/web/mor/directives/-/document_library/v0fYiOMmDMMh/view_file/247627",
      reviewedAt: "2026-04-07",
    },
  ],
  extendValidation(issues, document) {
    if (document.taxBreakdown.length === 0) {
      issues.push(
        createCountryIssue(
          "invoice.taxBreakdown",
          "ET_TAX_BREAKDOWN_REQUIRED",
          "Ethiopian VAT invoices should show the applicable VAT rate and amount.",
          "ERROR",
          "ET"
        )
      );
    }
    return issues;
  },
});
