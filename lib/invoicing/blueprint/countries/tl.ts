import {
  buildDefaultCountryModule,
  createCountryIssue,
  hasValue,
} from "@/lib/invoicing/blueprint/module-factory";

export const timorLesteComplianceModule = buildDefaultCountryModule("TL", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-07",
  evidence: [
    {
      label: "Timor-Leste Tax Authority",
      url: "https://attl.gov.tl/",
      reviewedAt: "2026-04-07",
    },
    {
      label: "Timor-Leste taxation documents",
      url: "https://attl.gov.tl/taxation-documents/",
      reviewedAt: "2026-04-07",
    },
  ],
  extendValidation(issues, document) {
    if (document.lines.some((line) => !hasValue(line.description))) {
      issues.push(
        createCountryIssue(
          "invoice.lines",
          "TL_LINE_DESCRIPTION_REQUIRED",
          "Timor-Leste invoices should describe the goods or services supplied.",
          "ERROR",
          "TL"
        )
      );
    }
    issues.push(
      createCountryIssue(
        "invoice.supportingDocuments",
        "TL_TAX_GUIDE_SUPPORT_NOTICE",
        "Retain invoice support consistent with Timor-Leste tax authority guidance for income tax, service tax, and customs obligations.",
        "WARNING",
        "TL"
      )
    );
    return issues;
  },
});
