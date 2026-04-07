import { buildDefaultCountryModule, createCountryIssue } from "@/lib/invoicing/blueprint/module-factory";

export const samoaComplianceModule = buildDefaultCountryModule("WS", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-07",
  evidence: [
    {
      label: "Samoa Inland Revenue Services and VAGST",
      url: "https://revenue.gov.ws/our-services/inland-revenue-services/",
      reviewedAt: "2026-04-07",
    },
    {
      label: "Samoa tax rates including VAGST",
      url: "https://revenue.gov.ws/rates/",
      reviewedAt: "2026-04-07",
    },
  ],
  extendValidation(issues, document) {
    if (document.taxBreakdown.length === 0) {
      issues.push(
        createCountryIssue(
          "invoice.taxBreakdown",
          "WS_VAGST_BREAKDOWN_REQUIRED",
          "Samoa VAGST invoices should show the applicable VAGST rate and amount.",
          "ERROR",
          "WS"
        )
      );
    }
    return issues;
  },
});
