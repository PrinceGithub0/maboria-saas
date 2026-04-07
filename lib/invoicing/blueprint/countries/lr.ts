import { buildDefaultCountryModule, createCountryIssue, hasValue } from "@/lib/invoicing/blueprint/module-factory";

export const liberiaComplianceModule = buildDefaultCountryModule("LR", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-06",
  evidence: [
    {
      label: "Liberia Revenue Authority GST guidance",
      url: "https://revenue.lra.gov.lr/understanding-gst/",
      reviewedAt: "2026-04-06",
    },
  ],
  extendRequiredFields(fields) {
    fields.push("supplier.addressLine1");
    fields.push("supplier.city");
    fields.push("customer.legalName");
    return [...new Set(fields)];
  },
  extendValidation(issues, document) {
    if (document.taxBreakdown.length === 0) {
      issues.push(
        createCountryIssue(
          "invoice.taxBreakdown",
          "LR_TAX_BREAKDOWN_REQUIRED",
          "Liberia GST invoices should show the tax amount charged.",
          "ERROR",
          "LR"
        )
      );
    }
    return issues;
  },
});
