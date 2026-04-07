import { buildDefaultCountryModule, createCountryIssue, hasValue } from "@/lib/invoicing/blueprint/module-factory";

export const liechtensteinComplianceModule = buildDefaultCountryModule("LI", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-06",
  evidence: [
    {
      label: "Liechtenstein e-MWST portal obligation",
      url: "https://www.llv.li/en/national-administration/fiscal-authority/value-added-tax/e-mwst",
      reviewedAt: "2026-04-06",
    },
    {
      label: "Liechtenstein public procurement e-invoicing guidance",
      url: "https://www.llv.li/de/landesverwaltung/amt-fuer-finanzen/wissenswertes/erechnung",
      reviewedAt: "2026-04-06",
    },
  ],
  extendRequiredFields(fields) {
    fields.push("supplier.addressLine1", "supplier.city", "customer.addressLine1", "customer.city");
    return [...new Set(fields)];
  },
  extendValidation(issues, document) {
    if (document.lines.some((line) => !hasValue(line.description))) {
      issues.push(
        createCountryIssue(
          "invoice.lines",
          "LI_LINE_DESCRIPTION_REQUIRED",
          "Liechtenstein VAT invoices should identify the supplied goods or services.",
          "ERROR",
          "LI"
        )
      );
    }
    issues.push(
      createCountryIssue(
        "invoice.deliveryModes",
        "LI_B2G_EINVOICE_REVIEW",
        "Liechtenstein accepts e-invoices for certain public contracts; confirm public-procurement applicability before submission.",
        "INFO",
        "LI"
      )
    );
    return issues;
  },
});
