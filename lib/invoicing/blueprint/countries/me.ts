import { buildDefaultCountryModule, createCountryIssue } from "@/lib/invoicing/blueprint/module-factory";

export const montenegroComplianceModule = buildDefaultCountryModule("ME", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-07",
  evidence: [
    {
      label: "Government of Montenegro Tax Administration portal",
      url: "https://www.gov.me/en/taxadministration",
      reviewedAt: "2026-04-07",
    },
    {
      label: "Montenegro Law on Tax Administration",
      url: "https://www.gov.me/en/documents/40de49a2-24f9-4727-bd25-143d0b920e33",
      reviewedAt: "2026-04-07",
    },
  ],
  extendValidation(issues, document) {
    if (document.taxBreakdown.length === 0) {
      issues.push(
        createCountryIssue(
          "invoice.taxBreakdown",
          "ME_TAX_BREAKDOWN_REQUIRED",
          "Montenegro VAT invoices should show the applicable VAT rate and amount.",
          "ERROR",
          "ME"
        )
      );
    }
    return issues;
  },
});
