import {
  buildDefaultCountryModule,
  createCountryIssue,
  hasValue,
} from "@/lib/invoicing/blueprint/module-factory";

export const tajikistanComplianceModule = buildDefaultCountryModule("TJ", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-07",
  evidence: [
    {
      label: "Tajikistan Tax Committee",
      url: "https://www.andoz.tj/",
      reviewedAt: "2026-04-07",
    },
    {
      label: "Tajikistan VAT registration for digital services",
      url: "https://secure.andoz.tj/Login/Registration",
      reviewedAt: "2026-04-07",
    },
  ],
  extendValidation(issues, document) {
    if (document.lines.some((line) => !hasValue(line.description))) {
      issues.push(
        createCountryIssue(
          "invoice.lines",
          "TJ_LINE_DESCRIPTION_REQUIRED",
          "Tajikistan invoices should describe the goods or services supplied.",
          "ERROR",
          "TJ"
        )
      );
    }
    issues.push(
      createCountryIssue(
        "invoice.taxBreakdown",
        "TJ_TAX_CLASSIFICATION_NOTICE",
        "Confirm the applicable Tajikistan VAT, withholding, or simplified-tax treatment and retain the supporting records.",
        "WARNING",
        "TJ"
      )
    );
    return issues;
  },
});
