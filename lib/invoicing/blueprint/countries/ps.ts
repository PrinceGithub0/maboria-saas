import {
  buildDefaultCountryModule,
  createCountryIssue,
  hasValue,
} from "@/lib/invoicing/blueprint/module-factory";

export const palestinianTerritoriesComplianceModule = buildDefaultCountryModule("PS", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-07",
  evidence: [
    {
      label: "Palestinian Ministry of Finance and Planning",
      url: "https://pmof.ps/",
      reviewedAt: "2026-04-07",
    },
    {
      label: "Palestinian VAT guidance and forms",
      url: "https://pmof.ps/%D8%B6%D8%B1%D9%8A%D8%A8%D8%A9-%D8%A7%D9%84%D9%82%D9%8A%D9%85%D8%A9-%D8%A7%D9%84%D9%85%D8%B6%D8%A7%D9%81%D8%A9/",
      reviewedAt: "2026-04-07",
    },
  ],
  extendValidation(issues, document) {
    if (document.lines.some((line) => !hasValue(line.description))) {
      issues.push(
        createCountryIssue(
          "invoice.lines",
          "PS_LINE_DESCRIPTION_REQUIRED",
          "Palestinian invoices should describe the goods or services supplied.",
          "ERROR",
          "PS"
        )
      );
    }
    if (document.taxBreakdown.length === 0) {
      issues.push(
        createCountryIssue(
          "invoice.taxBreakdown",
          "PS_TAX_BREAKDOWN_REQUIRED",
          "Palestinian invoices should show the applicable VAT rate and amount.",
          "ERROR",
          "PS"
        )
      );
    }
    return issues;
  },
});
