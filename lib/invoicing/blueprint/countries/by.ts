import {
  buildDefaultCountryModule,
  createCountryIssue,
  hasValue,
} from "@/lib/invoicing/blueprint/module-factory";

export const belarusComplianceModule = buildDefaultCountryModule("BY", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-07",
  evidence: [
    {
      label: "Belarus Ministry for Taxes and Duties",
      url: "https://nalog.gov.by/",
      reviewedAt: "2026-04-07",
    },
    {
      label: "Belarus tax administration updates",
      url: "https://nalog.gov.by/actual/",
      reviewedAt: "2026-04-07",
    },
  ],
  extendValidation(issues, document) {
    if (document.lines.some((line) => !hasValue(line.description))) {
      issues.push(
        createCountryIssue(
          "invoice.lines",
          "BY_LINE_DESCRIPTION_REQUIRED",
          "Belarus invoices should describe the goods or services supplied.",
          "ERROR",
          "BY"
        )
      );
    }
    if (document.taxBreakdown.length === 0) {
      issues.push(
        createCountryIssue(
          "invoice.taxBreakdown",
          "BY_VAT_BREAKDOWN_REQUIRED",
          "Belarus VAT invoices should show the applicable VAT rate and amount.",
          "ERROR",
          "BY"
        )
      );
    }
    return issues;
  },
});
