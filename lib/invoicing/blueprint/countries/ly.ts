import {
  buildDefaultCountryModule,
  createCountryIssue,
  hasValue,
} from "@/lib/invoicing/blueprint/module-factory";

export const libyaComplianceModule = buildDefaultCountryModule("LY", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-07",
  evidence: [
    {
      label: "Libya Ministry of Finance",
      url: "https://mof.gov.ly/en/",
      reviewedAt: "2026-04-07",
    },
    {
      label: "Libya Ministry of Finance affiliated tax and customs entities",
      url: "https://mof.gov.ly/mof-entities-affiliated/",
      reviewedAt: "2026-04-07",
    },
  ],
  extendValidation(issues, document) {
    if (document.lines.some((line) => !hasValue(line.description))) {
      issues.push(
        createCountryIssue(
          "invoice.lines",
          "LY_LINE_DESCRIPTION_REQUIRED",
          "Libya invoices should describe the goods or services supplied.",
          "ERROR",
          "LY"
        )
      );
    }
    if (document.taxBreakdown.length === 0) {
      issues.push(
        createCountryIssue(
          "invoice.taxBreakdown",
          "LY_VAT_BREAKDOWN_REQUIRED",
          "Libya invoices should show the applicable tax rate and amount where VAT or similar turnover tax applies.",
          "ERROR",
          "LY"
        )
      );
    }
    return issues;
  },
});
