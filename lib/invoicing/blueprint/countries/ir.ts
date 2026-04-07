import {
  buildDefaultCountryModule,
  createCountryIssue,
  hasValue,
} from "@/lib/invoicing/blueprint/module-factory";

export const iranComplianceModule = buildDefaultCountryModule("IR", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-07",
  evidence: [
    {
      label: "Iran National Tax Administration",
      url: "https://www.intamedia.ir/",
      reviewedAt: "2026-04-07",
    },
    {
      label: "Iran tax administration portal",
      url: "https://tax.gov.ir/Pages/HomePage",
      reviewedAt: "2026-04-07",
    },
  ],
  extendValidation(issues, document) {
    if (document.lines.some((line) => !hasValue(line.description))) {
      issues.push(
        createCountryIssue(
          "invoice.lines",
          "IR_LINE_DESCRIPTION_REQUIRED",
          "Iran invoices should describe the goods or services supplied.",
          "ERROR",
          "IR"
        )
      );
    }
    if (document.taxBreakdown.length === 0) {
      issues.push(
        createCountryIssue(
          "invoice.taxBreakdown",
          "IR_TAX_BREAKDOWN_REQUIRED",
          "Iran invoices should show the applicable tax rate and amount.",
          "ERROR",
          "IR"
        )
      );
    }
    issues.push(
      createCountryIssue(
        "invoice.customerTaxId",
        "IR_TAXPAYER_SYSTEM_NOTICE",
        "Keep Iran taxpayer registration and electronic invoice references aligned with the active tax system workflow.",
        "WARNING",
        "IR"
      )
    );
    return issues;
  },
});
