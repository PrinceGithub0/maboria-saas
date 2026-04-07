import { buildDefaultCountryModule, createCountryIssue, hasValue } from "@/lib/invoicing/blueprint/module-factory";

export const switzerlandComplianceModule = buildDefaultCountryModule("CH", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-06",
  evidence: [
    {
      label: "Swiss federal administration e-billing requirement (threshold CHF 5,000)",
      url: "https://www.uvek.admin.ch/en/billing-and-payment-options",
      reviewedAt: "2026-04-06",
    },
  ],
  extendRequiredFields(fields) {
    fields.push("supplier.addressLine1");
    fields.push("supplier.postalCode");
    fields.push("supplier.city");
    fields.push("customer.addressLine1");
    fields.push("customer.postalCode");
    fields.push("customer.city");
    return [...new Set(fields)];
  },
  extendValidation(issues, document) {
    if (document.lines.some((line) => !hasValue(line.description))) {
      issues.push(
        createCountryIssue(
          "invoice.lines",
          "CH_LINE_DESCRIPTION_REQUIRED",
          "Swiss invoices must describe the goods or services supplied.",
          "ERROR",
          "CH"
        )
      );
    }
    issues.push(
      createCountryIssue(
        "invoice.deliveryModes",
        "CH_B2G_EBILLING_THRESHOLD",
        "Swiss federal administration requires electronic invoices above CHF 5,000; confirm applicability per contract.",
        "INFO",
        "CH"
      )
    );
    return issues;
  },
});
