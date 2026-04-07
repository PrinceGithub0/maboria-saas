import {
  buildDefaultCountryModule,
  createCountryIssue,
  hasValue,
} from "@/lib/invoicing/blueprint/module-factory";

export const afghanistanComplianceModule = buildDefaultCountryModule("AF", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-07",
  evidence: [
    {
      label: "Afghanistan Ministry of Finance",
      url: "https://www.mof.gov.af/en",
      reviewedAt: "2026-04-07",
    },
    {
      label: "Afghanistan Ministry of Finance customs revenue update",
      url: "https://mof.gov.af/en/ministry-finance-has-collected-highest-customs-revenue-ever-0",
      reviewedAt: "2026-04-07",
    },
  ],
  extendValidation(issues, document) {
    if (document.lines.some((line) => !hasValue(line.description))) {
      issues.push(
        createCountryIssue(
          "invoice.lines",
          "AF_LINE_DESCRIPTION_REQUIRED",
          "Afghanistan invoices should describe the goods or services supplied.",
          "ERROR",
          "AF"
        )
      );
    }
    issues.push(
      createCountryIssue(
        "invoice.taxBreakdown",
        "AF_TAX_CLASSIFICATION_NOTICE",
        "Confirm the correct Afghanistan tax treatment, including business receipt tax, customs, or sector-specific charges where applicable.",
        "WARNING",
        "AF"
      )
    );
    return issues;
  },
});
