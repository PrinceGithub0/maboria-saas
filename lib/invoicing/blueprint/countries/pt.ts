import { buildDefaultCountryModule, createCountryIssue, hasValue } from "@/lib/invoicing/blueprint/module-factory";

export const portugalComplianceModule = buildDefaultCountryModule("PT", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-06",
  evidence: [
    {
      label: "Portugal B2G e-invoicing requirement from 1 Jan 2023 (CCP Article 299-B)",
      url: "https://igfej.justica.gov.pt/Noticias-do-IGFEJ/Fatura-Eletronica-obrigatoria-a-partir-de-1-de-janeiro-de-2023",
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
          "PT_LINE_DESCRIPTION_REQUIRED",
          "Portuguese invoices must describe the goods or services supplied.",
          "ERROR",
          "PT"
        )
      );
    }
    issues.push(
      createCountryIssue(
        "invoice.deliveryModes",
        "PT_B2G_EINVOICE_REQUIRED",
        "Supplies to the Portuguese public administration require structured e-invoices (B2G).",
        "INFO",
        "PT"
      )
    );
    return issues;
  },
});
