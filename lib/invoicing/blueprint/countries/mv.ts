import { buildDefaultCountryModule, createCountryIssue } from "@/lib/invoicing/blueprint/module-factory";

export const maldivesComplianceModule = buildDefaultCountryModule("MV", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-07",
  evidence: [
    {
      label: "Maldives Inland Revenue Authority GST overview",
      url: "https://www.mira.gov.mv/Pages/View/gst",
      reviewedAt: "2026-04-07",
    },
    {
      label: "Maldives Inland Revenue Authority homepage",
      url: "https://mira.gov.mv/",
      reviewedAt: "2026-04-07",
    },
  ],
  extendValidation(issues, document) {
    if (document.taxBreakdown.length === 0) {
      issues.push(
        createCountryIssue(
          "invoice.taxBreakdown",
          "MV_GST_BREAKDOWN_REQUIRED",
          "Maldives GST invoices should show the applicable GST rate and amount.",
          "ERROR",
          "MV"
        )
      );
    }
    return issues;
  },
});
