import { buildDefaultCountryModule, createCountryIssue } from "@/lib/invoicing/blueprint/module-factory";

export const tongaComplianceModule = buildDefaultCountryModule("TO", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-07",
  evidence: [
    {
      label: "Tonga consumption tax overview",
      url: "https://www.revenue.gov.to/consumption-tax-overview",
      reviewedAt: "2026-04-07",
    },
    {
      label: "Tonga consumption tax obligations",
      url: "https://www.revenue.gov.to/consumption-tax-obligations",
      reviewedAt: "2026-04-07",
    },
  ],
  extendValidation(issues, document) {
    if (document.taxBreakdown.length === 0) {
      issues.push(
        createCountryIssue(
          "invoice.taxBreakdown",
          "TO_CT_BREAKDOWN_REQUIRED",
          "Tonga consumption tax invoices should show the applicable CT rate and amount.",
          "ERROR",
          "TO"
        )
      );
    }
    issues.push(
      createCountryIssue(
        "invoice.invoiceNumber",
        "TO_CT_INVOICE_NOTICE",
        "Tonga CT-registered businesses should issue proper consumption tax invoices and keep records for five years.",
        "WARNING",
        "TO"
      )
    );
    return issues;
  },
});
