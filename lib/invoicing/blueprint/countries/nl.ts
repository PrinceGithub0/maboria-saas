import { buildDefaultCountryModule, createCountryIssue, hasValue } from "@/lib/invoicing/blueprint/module-factory";

export const netherlandsComplianceModule = buildDefaultCountryModule("NL", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-06",
  evidence: [
    {
      label: "Netherlands B2G e-invoicing requirement for central government suppliers",
      url: "https://ondernemersplein.overheid.nl/een-e-factuur-versturen-naar-de-overheid/",
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
          "NL_LINE_DESCRIPTION_REQUIRED",
          "Dutch invoices must describe the goods or services supplied.",
          "ERROR",
          "NL"
        )
      );
    }
    issues.push(
      createCountryIssue(
        "invoice.deliveryModes",
        "NL_B2G_EINVOICE_REQUIRED",
        "Supplies to the Dutch central government require structured e-invoices (B2G).",
        "INFO",
        "NL"
      )
    );
    return issues;
  },
});
