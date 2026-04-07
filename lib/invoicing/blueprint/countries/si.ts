import { buildDefaultCountryModule, createCountryIssue, hasValue } from "@/lib/invoicing/blueprint/module-factory";

export const sloveniaComplianceModule = buildDefaultCountryModule("SI", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-06",
  evidence: [
    {
      label: "Slovenia public payments administration register of budget users and e-invoice context",
      url: "https://www.gov.si/teme/register-proracunskih-uporabnikov/",
      reviewedAt: "2026-04-06",
    },
    {
      label: "Slovenia UJP e-forms portal for public-sector invoicing",
      url: "https://ujp.gov.si/dokumenti/dokument.asp?id=127",
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
          "SI_LINE_DESCRIPTION_REQUIRED",
          "Slovenian invoices must describe the goods or services supplied.",
          "ERROR",
          "SI"
        )
      );
    }
    issues.push(
      createCountryIssue(
        "invoice.deliveryModes",
        "SI_B2G_EINVOICE_REQUIRED",
        "Supplies to Slovenian budget users require structured e-invoices through the public payments administration channel.",
        "INFO",
        "SI"
      )
    );
    return issues;
  },
});
