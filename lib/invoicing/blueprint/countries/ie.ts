import { buildDefaultCountryModule, createCountryIssue, hasValue } from "@/lib/invoicing/blueprint/module-factory";

export const irelandComplianceModule = buildDefaultCountryModule("IE", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-06",
  evidence: [
    {
      label: "Ireland public sector e-invoicing (PEPPOL) implementation timeline",
      url: "https://www.gov.ie/en/office-of-government-procurement/publications/service-providers-and-einvoicing/",
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
          "IE_LINE_DESCRIPTION_REQUIRED",
          "Irish invoices must describe the goods or services supplied.",
          "ERROR",
          "IE"
        )
      );
    }
    issues.push(
      createCountryIssue(
        "invoice.deliveryModes",
        "IE_B2G_EINVOICE_REQUIRED",
        "Supplies to Irish public bodies must use PEPPOL e-invoicing per the EU directive timelines.",
        "INFO",
        "IE"
      )
    );
    return issues;
  },
});
