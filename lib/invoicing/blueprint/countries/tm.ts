import {
  buildDefaultCountryModule,
  createCountryIssue,
  hasValue,
} from "@/lib/invoicing/blueprint/module-factory";

export const turkmenistanComplianceModule = buildDefaultCountryModule("TM", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-07",
  evidence: [
    {
      label: "Turkmenistan tax service",
      url: "https://tax.gov.tm/",
      reviewedAt: "2026-04-07",
    },
    {
      label: "Turkmenistan tax laws portal",
      url: "https://tax.gov.tm/hukuknamalar/t%C3%BCrkmenistany%C5%88-kanunlary",
      reviewedAt: "2026-04-07",
    },
  ],
  extendValidation(issues, document) {
    if (document.lines.some((line) => !hasValue(line.description))) {
      issues.push(
        createCountryIssue(
          "invoice.lines",
          "TM_LINE_DESCRIPTION_REQUIRED",
          "Turkmenistan invoices should describe the goods or services supplied.",
          "ERROR",
          "TM"
        )
      );
    }
    if (document.taxBreakdown.length === 0) {
      issues.push(
        createCountryIssue(
          "invoice.taxBreakdown",
          "TM_TAX_BREAKDOWN_REQUIRED",
          "Turkmenistan invoices should show the applicable tax rate and amount.",
          "ERROR",
          "TM"
        )
      );
    }
    return issues;
  },
});
