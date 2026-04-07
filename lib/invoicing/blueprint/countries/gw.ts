import {
  buildDefaultCountryModule,
  createCountryIssue,
  hasValue,
} from "@/lib/invoicing/blueprint/module-factory";

export const guineaBissauComplianceModule = buildDefaultCountryModule("GW", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-07",
  evidence: [
    {
      label: "Guinea-Bissau Ministry of Economy and Finance",
      url: "https://www.mef.gw/",
      reviewedAt: "2026-04-07",
    },
    {
      label: "Guinea-Bissau Ministry of Finance portal",
      url: "https://www.financas.gov.gw/",
      reviewedAt: "2026-04-07",
    },
  ],
  extendValidation(issues, document) {
    if (document.lines.some((line) => !hasValue(line.description))) {
      issues.push(
        createCountryIssue(
          "invoice.lines",
          "GW_LINE_DESCRIPTION_REQUIRED",
          "Guinea-Bissau invoices should describe the goods or services supplied.",
          "ERROR",
          "GW"
        )
      );
    }
    if (document.taxBreakdown.length === 0) {
      issues.push(
        createCountryIssue(
          "invoice.taxBreakdown",
          "GW_TAX_BREAKDOWN_REQUIRED",
          "Guinea-Bissau invoices should show the applicable tax rate and amount.",
          "ERROR",
          "GW"
        )
      );
    }
    return issues;
  },
});
