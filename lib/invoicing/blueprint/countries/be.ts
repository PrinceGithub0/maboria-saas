import { buildDefaultCountryModule, createCountryIssue, hasValue } from "@/lib/invoicing/blueprint/module-factory";

export const belgiumComplianceModule = buildDefaultCountryModule("BE", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-06",
  evidence: [
    {
      label: "Belgium B2B e-invoicing mandatory from 1 Jan 2026",
      url: "https://einvoice.belgium.be/en/article/when-e-invoicing-mandatory",
      reviewedAt: "2026-04-06",
    },
    {
      label: "Belgium law adopting mandatory domestic B2B e-invoicing",
      url: "https://einvoice.belgium.be/en/news/law-implementing-mandatory-domestic-b2b-e-invoicing-formally-adopted",
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
          "BE_LINE_DESCRIPTION_REQUIRED",
          "Belgian invoices must describe the goods or services supplied.",
          "ERROR",
          "BE"
        )
      );
    }
    issues.push(
      createCountryIssue(
        "invoice.deliveryModes",
        "BE_EINVOICE_MANDATE_2026",
        "Belgium mandates structured B2B e-invoicing from 1 January 2026; ensure Peppol delivery is configured.",
        "INFO",
        "BE"
      )
    );
    return issues;
  },
});
