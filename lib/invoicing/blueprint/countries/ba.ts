import { buildDefaultCountryModule, createCountryIssue, hasValue } from "@/lib/invoicing/blueprint/module-factory";

export const bosniaAndHerzegovinaComplianceModule = buildDefaultCountryModule("BA", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-06",
  evidence: [
    {
      label: "Bosnia and Herzegovina general VAT system guidance",
      url: "https://www.uino.gov.ba/portal/en/vat/general-information-on-vat-system-in-bosnia-and-herzegovina/",
      reviewedAt: "2026-04-06",
    },
    {
      label: "Bosnia and Herzegovina VAT regulations",
      url: "https://www.uino.gov.ba/portal/en/regulations/vat/",
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
          "BA_LINE_DESCRIPTION_REQUIRED",
          "Bosnian VAT invoices should describe the taxable supply.",
          "ERROR",
          "BA"
        )
      );
    }
    return issues;
  },
});
