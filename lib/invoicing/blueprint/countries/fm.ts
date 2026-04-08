import {
  buildDefaultCountryModule,
  createCountryIssue,
  hasValue,
} from "@/lib/invoicing/blueprint/module-factory";

export const micronesiaComplianceModule = buildDefaultCountryModule("FM", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-07",
  evidence: [
    {
      label: "FSM Department of Finance and Administration",
      url: "https://gov.fm/index.php/component/content/article/35-department-of-finance-and-administration",
      reviewedAt: "2026-04-07",
    },
    {
      label: "FSM customs and tax administration",
      url: "https://gov.fm/index.php/component/content/article/35-department-of-finance-and-administration/95-division-of-customs-tax-administration",
      reviewedAt: "2026-04-07",
    },
  ],
  extendValidation(issues, document) {
    if (document.lines.some((line) => !hasValue(line.description))) {
      issues.push(
        createCountryIssue(
          "invoice.lines",
          "FM_LINE_DESCRIPTION_REQUIRED",
          "Micronesia invoices should describe the goods or services supplied.",
          "ERROR",
          "FM"
        )
      );
    }
    issues.push(
      createCountryIssue(
        "invoice.supportingDocuments",
        "FM_REVENUE_SUPPORT_NOTICE",
        "Maintain invoice support for FSM customs and groß-revenue tax filings where applicable.",
        "WARNING",
        "FM"
      )
    );
    return issues;
  },
});
