import { buildDefaultCountryModule, createCountryIssue } from "@/lib/invoicing/blueprint/module-factory";

export const cookIslandsComplianceModule = buildDefaultCountryModule("CK", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-07",
  evidence: [
    {
      label: "Cook Islands VAT Act 1997",
      url: "https://www.cookislands.gov.ck/images/documents/RMD_Docs/ACTS/Value_Added_Tax_Act_1997/VAT_Act_Consolidated_to_2014_final.pdf",
      reviewedAt: "2026-04-07",
    },
    {
      label: "Cook Islands VAT guide",
      url: "https://www.cookislands.gov.ck/images/documents/RMD_Docs/Resources/Guides/RM206_Value-Added-Tax-Guide_VAT.pdf",
      reviewedAt: "2026-04-07",
    },
  ],
  extendValidation(issues, document) {
    if (document.taxBreakdown.length === 0) {
      issues.push(
        createCountryIssue(
          "invoice.taxBreakdown",
          "CK_VAT_BREAKDOWN_REQUIRED",
          "Cook Islands VAT invoices should show the applicable VAT rate and amount.",
          "ERROR",
          "CK"
        )
      );
    }
    return issues;
  },
});
