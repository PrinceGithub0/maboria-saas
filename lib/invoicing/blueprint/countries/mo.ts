import {
  buildDefaultCountryModule,
  createCountryIssue,
  hasValue,
} from "@/lib/invoicing/blueprint/module-factory";

export const macaoComplianceModule = buildDefaultCountryModule("MO", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-07",
  evidence: [
    {
      label: "Macao SAR taxation portal",
      url: "https://www.gov.mo/en/browse/taxation/",
      reviewedAt: "2026-04-07",
    },
    {
      label: "Macao SAR Financial Services Bureau tax services",
      url: "https://www.gov.mo/en/entity-page/entity-256/",
      reviewedAt: "2026-04-07",
    },
  ],
  extendValidation(issues, document) {
    if (document.lines.some((line) => !hasValue(line.description))) {
      issues.push(
        createCountryIssue(
          "invoice.lines",
          "MO_LINE_DESCRIPTION_REQUIRED",
          "Macao invoices should describe the goods or services supplied.",
          "ERROR",
          "MO"
        )
      );
    }
    issues.push(
      createCountryIssue(
        "invoice.taxBreakdown",
        "MO_TAX_CLASSIFICATION_NOTICE",
        "Confirm the correct Macao tax classification, such as profits tax, business tax, or a stamp/consumption tax treatment where applicable.",
        "WARNING",
        "MO"
      )
    );
    return issues;
  },
});
