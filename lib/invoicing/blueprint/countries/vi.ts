import {
  buildDefaultCountryModule,
  createCountryIssue,
  hasValue,
} from "@/lib/invoicing/blueprint/module-factory";

export const usVirginIslandsComplianceModule = buildDefaultCountryModule("VI", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-07",
  evidence: [
    {
      label: "U.S. Virgin Islands Bureau of Internal Revenue",
      url: "https://bir.vi.gov/",
      reviewedAt: "2026-04-07",
    },
    {
      label: "U.S. Virgin Islands tax department overview",
      url: "https://ltg.gov.vi/departments/bureau-of-internal-revenue/",
      reviewedAt: "2026-04-07",
    },
  ],
  extendValidation(issues, document) {
    if (document.lines.some((line) => !hasValue(line.description))) {
      issues.push(
        createCountryIssue(
          "invoice.lines",
          "VI_LINE_DESCRIPTION_REQUIRED",
          "U.S. Virgin Islands invoices should describe the goods or services supplied.",
          "ERROR",
          "VI"
        )
      );
    }
    issues.push(
      createCountryIssue(
        "invoice.supportingDocuments",
        "VI_GROSS_RECEIPTS_SUPPORT_NOTICE",
        "Retain invoice support for U.S. Virgin Islands groß-receipts and income-tax review where applicable.",
        "WARNING",
        "VI"
      )
    );
    return issues;
  },
});
