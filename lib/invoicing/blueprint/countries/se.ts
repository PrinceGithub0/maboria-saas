import { buildDefaultCountryModule, createCountryIssue, hasValue } from "@/lib/invoicing/blueprint/module-factory";

export const swedenComplianceModule = buildDefaultCountryModule("SE", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-06",
  evidence: [
    {
      label: "Sweden e-invoicing mandatory for public procurement (Act 2018:1277)",
      url: "https://www.digg.se/en/knowledge-and-support/e-commerce/mandatory-e-invoicing-in-the-public-sector",
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
          "SE_LINE_DESCRIPTION_REQUIRED",
          "Swedish invoices must describe the goods or services supplied.",
          "ERROR",
          "SE"
        )
      );
    }
    issues.push(
      createCountryIssue(
        "invoice.deliveryModes",
        "SE_B2G_EINVOICE_REQUIRED",
        "Public procurements in Sweden require structured e-invoices (B2G).",
        "INFO",
        "SE"
      )
    );
    return issues;
  },
});
