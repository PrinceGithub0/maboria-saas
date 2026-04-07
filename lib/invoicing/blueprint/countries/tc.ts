import {
  buildDefaultCountryModule,
  createCountryIssue,
  hasValue,
} from "@/lib/invoicing/blueprint/module-factory";

export const turksAndCaicosComplianceModule = buildDefaultCountryModule("TC", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-07",
  evidence: [
    {
      label: "Turks and Caicos Islands revenue department",
      url: "https://www.gov.tc/revenue/",
      reviewedAt: "2026-04-07",
    },
    {
      label: "Turks and Caicos customs and revenue services",
      url: "https://www.gov.tc/revenue/categories/customs",
      reviewedAt: "2026-04-07",
    },
  ],
  extendValidation(issues, document) {
    if (document.lines.some((line) => !hasValue(line.description))) {
      issues.push(
        createCountryIssue(
          "invoice.lines",
          "TC_LINE_DESCRIPTION_REQUIRED",
          "Turks and Caicos invoices should describe the goods or services supplied.",
          "ERROR",
          "TC"
        )
      );
    }
    issues.push(
      createCountryIssue(
        "invoice.supportingDocuments",
        "TC_CUSTOMS_SUPPORT_NOTICE",
        "Keep invoice support available for Turks and Caicos customs and revenue review where applicable.",
        "WARNING",
        "TC"
      )
    );
    return issues;
  },
});
