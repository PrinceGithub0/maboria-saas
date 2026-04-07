import {
  buildDefaultCountryModule,
  createCountryIssue,
  hasValue,
} from "@/lib/invoicing/blueprint/module-factory";

export const qatarComplianceModule = buildDefaultCountryModule("QA", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-07",
  evidence: [
    {
      label: "Qatar General Tax Authority tax information",
      url: "https://gta.gov.qa/en/taxes-info",
      reviewedAt: "2026-04-07",
    },
    {
      label: "Qatar General Tax Authority legal framework",
      url: "https://www.gta.gov.qa/en/laws",
      reviewedAt: "2026-04-07",
    },
  ],
  extendValidation(issues, document) {
    if (document.lines.some((line) => !hasValue(line.description))) {
      issues.push(
        createCountryIssue(
          "invoice.lines",
          "QA_LINE_DESCRIPTION_REQUIRED",
          "Qatar invoices should describe the goods or services supplied.",
          "ERROR",
          "QA"
        )
      );
    }
    issues.push(
      createCountryIssue(
        "invoice.recordkeeping",
        "QA_ACCOUNTING_RECORDS",
        "Qatar taxpayers should retain accounting records and consider withholding tax treatment for non-resident service payments.",
        "WARNING",
        "QA"
      )
    );
    return issues;
  },
});
