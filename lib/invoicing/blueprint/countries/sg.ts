import { buildDefaultCountryModule, createCountryIssue, hasValue } from "@/lib/invoicing/blueprint/module-factory";

export const singaporeComplianceModule = buildDefaultCountryModule("SG", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-06",
  evidence: [
    {
      label: "Singapore InvoiceNow (PEPPOL) framework and government adoption",
      url: "https://www.imda.gov.sg/how-we-can-help/nationwide-e-invoicing-framework",
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
          "SG_LINE_DESCRIPTION_REQUIRED",
          "Singapore invoices must describe the goods or services supplied.",
          "ERROR",
          "SG"
        )
      );
    }
    issues.push(
      createCountryIssue(
        "invoice.deliveryModes",
        "SG_INVOICENOW_RECOMMENDED",
        "Singapore encourages InvoiceNow (PEPPOL) for e-invoicing; government agencies can receive via InvoiceNow.",
        "INFO",
        "SG"
      )
    );
    return issues;
  },
});
