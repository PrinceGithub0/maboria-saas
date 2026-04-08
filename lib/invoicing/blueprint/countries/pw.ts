import {
  buildDefaultCountryModule,
  createCountryIssue,
  hasValue,
} from "@/lib/invoicing/blueprint/module-factory";

export const palauComplianceModule = buildDefaultCountryModule("PW", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-07",
  evidence: [
    {
      label: "Palau Ministry of Finance",
      url: "https://www.palaugov.pw/executive-branch/ministries/finance/",
      reviewedAt: "2026-04-07",
    },
    {
      label: "Palau customs and border protection",
      url: "https://www.palaugov.pw/executive-branch/ministries/finance/bureau-of-customs-and-border-protection/",
      reviewedAt: "2026-04-07",
    },
  ],
  extendValidation(issues, document) {
    if (document.lines.some((line) => !hasValue(line.description))) {
      issues.push(
        createCountryIssue(
          "invoice.lines",
          "PW_LINE_DESCRIPTION_REQUIRED",
          "Palau invoices should describe the goods or services supplied.",
          "ERROR",
          "PW"
        )
      );
    }
    issues.push(
      createCountryIssue(
        "invoice.supportingDocuments",
        "PW_PGRT_SUPPORT_NOTICE",
        "Retain invoice support for Palau groß-revenue tax and customs review where applicable.",
        "WARNING",
        "PW"
      )
    );
    return issues;
  },
});
