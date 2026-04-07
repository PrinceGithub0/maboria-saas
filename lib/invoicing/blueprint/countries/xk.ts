import { buildDefaultCountryModule, createCountryIssue } from "@/lib/invoicing/blueprint/module-factory";

export const kosovoComplianceModule = buildDefaultCountryModule("XK", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-07",
  evidence: [
    {
      label: "Kosovo general tax information",
      url: "https://www.atk-ks.org/en/portfolio/informata-te-pergjithshme-per-tatimet-ne-kosove/",
      reviewedAt: "2026-04-07",
    },
    {
      label: "Kosovo VAT rate compliance notice",
      url: "https://www.atk-ks.org/en/notice-to-taxpayers-apply-the-vat-rate-correctly-3/",
      reviewedAt: "2026-04-07",
    },
  ],
  extendValidation(issues, document) {
    if (document.taxBreakdown.length === 0) {
      issues.push(
        createCountryIssue(
          "invoice.taxBreakdown",
          "XK_VAT_BREAKDOWN_REQUIRED",
          "Kosovo VAT invoices should show the applicable VAT rate and amount.",
          "ERROR",
          "XK"
        )
      );
    }
    return issues;
  },
});
