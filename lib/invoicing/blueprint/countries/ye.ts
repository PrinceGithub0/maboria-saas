import {
  buildDefaultCountryModule,
  createCountryIssue,
  hasValue,
} from "@/lib/invoicing/blueprint/module-factory";

export const yemenComplianceModule = buildDefaultCountryModule("YE", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-07",
  evidence: [
    {
      label: "Yemen Ministry of Finance",
      url: "https://mof.gov.ye/",
      reviewedAt: "2026-04-07",
    },
    {
      label: "Yemen Finance Ministry investment-law implementation notice",
      url: "https://mof.gov.ye/?p=3286",
      reviewedAt: "2026-04-07",
    },
  ],
  extendValidation(issues, document) {
    if (document.lines.some((line) => !hasValue(line.description))) {
      issues.push(
        createCountryIssue(
          "invoice.lines",
          "YE_LINE_DESCRIPTION_REQUIRED",
          "Yemen invoices should describe the goods or services supplied.",
          "ERROR",
          "YE"
        )
      );
    }
    issues.push(
      createCountryIssue(
        "invoice.taxBreakdown",
        "YE_TAX_CLASSIFICATION_NOTICE",
        "Confirm the applicable Yemen customs, sales, or income-tax treatment and retain the matching supporting documents.",
        "WARNING",
        "YE"
      )
    );
    return issues;
  },
});
