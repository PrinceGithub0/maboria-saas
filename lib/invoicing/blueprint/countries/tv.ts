import {
  buildDefaultCountryModule,
  createCountryIssue,
  hasValue,
} from "@/lib/invoicing/blueprint/module-factory";

export const tuvaluComplianceModule = buildDefaultCountryModule("TV", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-07",
  evidence: [
    {
      label: "Tuvalu revenue and customs department",
      url: "https://finance.gov.tv/inland-revenue/",
      reviewedAt: "2026-04-07",
    },
    {
      label: "Tuvalu customs guidance",
      url: "https://finance.gov.tv/customs/",
      reviewedAt: "2026-04-07",
    },
  ],
  extendValidation(issues, document) {
    if (document.lines.some((line) => !hasValue(line.description))) {
      issues.push(
        createCountryIssue(
          "invoice.lines",
          "TV_LINE_DESCRIPTION_REQUIRED",
          "Tuvalu invoices should describe the goods or services supplied.",
          "ERROR",
          "TV"
        )
      );
    }
    issues.push(
      createCountryIssue(
        "invoice.supportingDocuments",
        "TV_REVENUE_CUSTOMS_NOTICE",
        "Keep invoice support available for Tuvalu revenue, levy, and customs review where applicable.",
        "WARNING",
        "TV"
      )
    );
    return issues;
  },
});
