import { buildDefaultCountryModule, createCountryIssue, hasValue } from "@/lib/invoicing/blueprint/module-factory";

export const maltaComplianceModule = buildDefaultCountryModule("MT", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-06",
  evidence: [
    {
      label: "Malta Ministry for Finance e-invoicing service for central government",
      url: "https://finance.gov.mt/resources/einvoicing/",
      reviewedAt: "2026-04-06",
    },
    {
      label: "Malta e-invoicing FAQ and EN 16931 / PEPPOL adoption",
      url: "https://finance.gov.mt/resources/einvoicing_faqs/",
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
          "MT_LINE_DESCRIPTION_REQUIRED",
          "Maltese invoices must describe the goods or services supplied.",
          "ERROR",
          "MT"
        )
      );
    }
    issues.push(
      createCountryIssue(
        "invoice.deliveryModes",
        "MT_B2G_EINVOICE_ENABLED",
        "Malta central government receives structured e-invoices through PEPPOL; confirm applicability for government customers.",
        "INFO",
        "MT"
      )
    );
    return issues;
  },
});
