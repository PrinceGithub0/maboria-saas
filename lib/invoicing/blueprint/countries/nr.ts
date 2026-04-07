import {
  buildDefaultCountryModule,
  createCountryIssue,
  hasValue,
} from "@/lib/invoicing/blueprint/module-factory";

export const nauruComplianceModule = buildDefaultCountryModule("NR", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-07",
  evidence: [
    {
      label: "Nauru government finance department",
      url: "https://naurugov.nr/government/departments/department-of-finance.aspx",
      reviewedAt: "2026-04-07",
    },
    {
      label: "Nauru customs and border control",
      url: "https://naurugov.nr/government/departments/customs-and-border-control.aspx",
      reviewedAt: "2026-04-07",
    },
  ],
  extendValidation(issues, document) {
    if (document.lines.some((line) => !hasValue(line.description))) {
      issues.push(
        createCountryIssue(
          "invoice.lines",
          "NR_LINE_DESCRIPTION_REQUIRED",
          "Nauru invoices should describe the goods or services supplied.",
          "ERROR",
          "NR"
        )
      );
    }
    issues.push(
      createCountryIssue(
        "invoice.supportingDocuments",
        "NR_CUSTOMS_SUPPORT_NOTICE",
        "Keep invoices available for Nauru customs and border-control review where imports are involved.",
        "WARNING",
        "NR"
      )
    );
    return issues;
  },
});
