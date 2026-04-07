import { buildDefaultCountryModule, createCountryIssue, hasValue } from "@/lib/invoicing/blueprint/module-factory";

export const finlandComplianceModule = buildDefaultCountryModule("FI", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-06",
  evidence: [
    {
      label: "Finland E-invoice Act (241/2019) summary and public procurement obligation",
      url: "https://www.valtiokonttori.fi/en/service/invoicing-the-state/",
      reviewedAt: "2026-04-06",
    },
    {
      label: "Invoicing the Finnish state (European standard required)",
      url: "https://www.valtiokonttori.fi/en/services/government-e-invoices/invoicing-the-state/",
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
          "FI_LINE_DESCRIPTION_REQUIRED",
          "Finnish invoices must describe the goods or services supplied.",
          "ERROR",
          "FI"
        )
      );
    }
    issues.push(
      createCountryIssue(
        "invoice.deliveryModes",
        "FI_B2G_EINVOICE_REQUIRED",
        "Public sector suppliers in Finland must use structured e-invoices.",
        "INFO",
        "FI"
      )
    );
    return issues;
  },
});
