import {
  buildDefaultCountryModule,
  createCountryIssue,
  hasValue,
} from "@/lib/invoicing/blueprint/module-factory";

export const saintHelenaComplianceModule = buildDefaultCountryModule("SH", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-07",
  evidence: [
    {
      label: "St Helena HM Customs",
      url: "https://www.sainthelena.gov.sh/st-helena/government/portfolios/safety-security-and-home-affairs/hm-customs/",
      reviewedAt: "2026-04-07",
    },
    {
      label: "St Helena customs procedures reminder",
      url: "https://www.sainthelena.gov.sh/important-reminder-on-customs-procedures-for-imported-goods/",
      reviewedAt: "2026-04-07",
    },
  ],
  extendValidation(issues, document) {
    if (document.lines.some((line) => !hasValue(line.description))) {
      issues.push(
        createCountryIssue(
          "invoice.lines",
          "SH_LINE_DESCRIPTION_REQUIRED",
          "St Helena invoices should describe the goods or services supplied.",
          "ERROR",
          "SH"
        )
      );
    }
    issues.push(
      createCountryIssue(
        "invoice.supportingDocuments",
        "SH_CUSTOMS_DECLARATION_NOTICE",
        "Keep invoice values and supporting documents aligned with St Helena customs declaration requirements.",
        "WARNING",
        "SH"
      )
    );
    return issues;
  },
});
