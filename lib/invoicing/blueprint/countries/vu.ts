import { buildDefaultCountryModule, createCountryIssue } from "@/lib/invoicing/blueprint/module-factory";

export const vanuatuComplianceModule = buildDefaultCountryModule("VU", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-07",
  evidence: [
    {
      label: "Vanuatu VAT introduction",
      url: "https://customsinlandrevenue.gov.vu/taxes-and-licensing/taxes/value-added-tax-vat/introduction.html",
      reviewedAt: "2026-04-07",
    },
    {
      label: "Vanuatu customs cargo clearance and VAT",
      url: "https://customsinlandrevenue.gov.vu/index.php/customs/customs-revenue/customs-clearance",
      reviewedAt: "2026-04-07",
    },
  ],
  extendValidation(issues, document) {
    if (document.taxBreakdown.length === 0) {
      issues.push(
        createCountryIssue(
          "invoice.taxBreakdown",
          "VU_VAT_BREAKDOWN_REQUIRED",
          "Vanuatu VAT invoices should show the applicable VAT rate and amount.",
          "ERROR",
          "VU"
        )
      );
    }
    issues.push(
      createCountryIssue(
        "invoice.invoiceNumber",
        "VU_TAX_INVOICE_NOTICE",
        "Vanuatu VAT-registered suppliers should issue tax invoices when requested by another registered person.",
        "WARNING",
        "VU"
      )
    );
    return issues;
  },
});
