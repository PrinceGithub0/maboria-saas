import {
  buildDefaultCountryModule,
  createCountryIssue,
  hasValue,
} from "@/lib/invoicing/blueprint/module-factory";

export const niueComplianceModule = buildDefaultCountryModule("NU", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-07",
  evidence: [
    {
      label: "Government of Niue",
      url: "https://www.gov.nu/",
      reviewedAt: "2026-04-07",
    },
    {
      label: "Niue finance ministry",
      url: "https://www.gov.nu/wb/pages/government/ministries/finance.php",
      reviewedAt: "2026-04-07",
    },
  ],
  extendValidation(issues, document) {
    if (document.lines.some((line) => !hasValue(line.description))) {
      issues.push(
        createCountryIssue(
          "invoice.lines",
          "NU_LINE_DESCRIPTION_REQUIRED",
          "Niue invoices should describe the goods or services supplied.",
          "ERROR",
          "NU"
        )
      );
    }
    issues.push(
      createCountryIssue(
        "invoice.supportingDocuments",
        "NU_FINANCE_SUPPORT_NOTICE",
        "Keep invoice support aligned with Niue finance and customs documentation requirements where applicable.",
        "WARNING",
        "NU"
      )
    );
    return issues;
  },
});
