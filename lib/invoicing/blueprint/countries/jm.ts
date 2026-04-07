import {
  buildDefaultCountryModule,
  createCountryIssue,
  hasValue,
} from "@/lib/invoicing/blueprint/module-factory";

export const jamaicaComplianceModule = buildDefaultCountryModule("JM", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-07",
  evidence: [
    {
      label: "Jamaica Customs Agency duties and taxes guidance",
      url: "https://jca.gov.jm/business/duties-and-taxes/",
      reviewedAt: "2026-04-07",
    },
    {
      label: "Jamaica Customs Agency customs valuation FAQ",
      url: "https://jca.gov.jm/faq/how-are-duties-calculated-by-customs/",
      reviewedAt: "2026-04-07",
    },
  ],
  extendValidation(issues, document) {
    if (document.lines.some((line) => !hasValue(line.description))) {
      issues.push(
        createCountryIssue(
          "invoice.lines",
          "JM_LINE_DESCRIPTION_REQUIRED",
          "Jamaican invoices should describe the goods or services supplied.",
          "ERROR",
          "JM"
        )
      );
    }
    issues.push(
      createCountryIssue(
        "invoice.supportingDocuments",
        "JM_CUSTOMS_VALUE_SUPPORT",
        "Keep the invoice or receipt available to support customs valuation where Jamaican duties and GCT apply.",
        "WARNING",
        "JM"
      )
    );
    return issues;
  },
});
