import {
  buildDefaultCountryModule,
  createCountryIssue,
  hasValue,
} from "@/lib/invoicing/blueprint/module-factory";

export const somaliaComplianceModule = buildDefaultCountryModule("SO", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-07",
  evidence: [
    {
      label: "Somalia Ministry of Finance",
      url: "https://www.mof.gov.so/",
      reviewedAt: "2026-04-07",
    },
    {
      label: "Somalia Revenue Department",
      url: "https://mof.gov.so/departments/revenue-department",
      reviewedAt: "2026-04-07",
    },
  ],
  extendValidation(issues, document) {
    if (document.lines.some((line) => !hasValue(line.description))) {
      issues.push(
        createCountryIssue(
          "invoice.lines",
          "SO_LINE_DESCRIPTION_REQUIRED",
          "Somalia invoices should describe the goods or services supplied.",
          "ERROR",
          "SO"
        )
      );
    }
    if (document.taxBreakdown.length === 0) {
      issues.push(
        createCountryIssue(
          "invoice.taxBreakdown",
          "SO_TAX_BREAKDOWN_REQUIRED",
          "Somalia invoices should show the applicable tax rate and amount where tax is charged.",
          "ERROR",
          "SO"
        )
      );
    }
    return issues;
  },
});
