import {
  buildDefaultCountryModule,
  createCountryIssue,
  hasValue,
} from "@/lib/invoicing/blueprint/module-factory";

export const usOutlyingIslandsComplianceModule = buildDefaultCountryModule("UM", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-07",
  evidence: [
    {
      label: "U.S. Department of the Interior Office of Insular Affairs",
      url: "https://www.doi.gov/oia/",
      reviewedAt: "2026-04-07",
    },
    {
      label: "U.S. insular areas and related authorities",
      url: "https://www.doi.gov/library/internet/insular",
      reviewedAt: "2026-04-07",
    },
  ],
  extendValidation(issues, document) {
    if (document.lines.some((line) => !hasValue(line.description))) {
      issues.push(
        createCountryIssue(
          "invoice.lines",
          "UM_LINE_DESCRIPTION_REQUIRED",
          "U.S. Outlying Islands invoices should describe the goods or services supplied.",
          "ERROR",
          "UM"
        )
      );
    }
    issues.push(
      createCountryIssue(
        "invoice.supportingDocuments",
        "UM_TERRITORIAL_SUPPORT_NOTICE",
        "Keep the administering island authority, contract basis, and federal support documentation attached for U.S. Outlying Islands billing.",
        "WARNING",
        "UM"
      )
    );
    return issues;
  },
});
