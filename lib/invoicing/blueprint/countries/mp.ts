import {
  buildDefaultCountryModule,
  createCountryIssue,
  hasValue,
} from "@/lib/invoicing/blueprint/module-factory";

export const northernMarianaIslandsComplianceModule = buildDefaultCountryModule("MP", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-07",
  evidence: [
    {
      label: "CNMI Revenue and Taxation",
      url: "https://finance.gov.mp/revenue-taxation.php",
      reviewedAt: "2026-04-07",
    },
    {
      label: "CNMI Customs Services",
      url: "https://www.dof.gov.mp/customs-services.php",
      reviewedAt: "2026-04-07",
    },
  ],
  extendValidation(issues, document) {
    if (document.lines.some((line) => !hasValue(line.description))) {
      issues.push(
        createCountryIssue(
          "invoice.lines",
          "MP_LINE_DESCRIPTION_REQUIRED",
          "Northern Mariana Islands invoices should describe the goods or services supplied.",
          "ERROR",
          "MP"
        )
      );
    }
    issues.push(
      createCountryIssue(
        "invoice.supportingDocuments",
        "MP_REVENUE_CUSTOMS_SUPPORT_NOTICE",
        "Retain invoice support for CNMI revenue, business-license, and customs review where applicable.",
        "WARNING",
        "MP"
      )
    );
    return issues;
  },
});
