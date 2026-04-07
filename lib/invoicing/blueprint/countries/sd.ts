import {
  buildDefaultCountryModule,
  createCountryIssue,
  hasValue,
} from "@/lib/invoicing/blueprint/module-factory";

export const sudanComplianceModule = buildDefaultCountryModule("SD", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-07",
  evidence: [
    {
      label: "Sudan Taxation Chamber",
      url: "https://tax.gov.sd/",
      reviewedAt: "2026-04-07",
    },
    {
      label: "Sudan VAT guidance",
      url: "https://tax.gov.sd/en/value-added-tax-vat/",
      reviewedAt: "2026-04-07",
    },
  ],
  extendValidation(issues, document) {
    if (document.lines.some((line) => !hasValue(line.description))) {
      issues.push(
        createCountryIssue(
          "invoice.lines",
          "SD_LINE_DESCRIPTION_REQUIRED",
          "Sudan invoices should describe the goods or services supplied.",
          "ERROR",
          "SD"
        )
      );
    }
    if (document.taxBreakdown.length === 0) {
      issues.push(
        createCountryIssue(
          "invoice.taxBreakdown",
          "SD_VAT_BREAKDOWN_REQUIRED",
          "Sudan VAT invoices should show the applicable VAT rate and amount.",
          "ERROR",
          "SD"
        )
      );
    }
    return issues;
  },
});
