import { buildDefaultCountryModule, createCountryIssue, hasValue } from "@/lib/invoicing/blueprint/module-factory";

export const southAfricaComplianceModule = buildDefaultCountryModule("ZA", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-06",
  evidence: [
    {
      label: "SARS VAT vendor obligations and tax invoice requirement",
      url: "https://www.sars.gov.za/types-of-tax/value-added-tax/obligations-of-a-vat-vendor/",
      reviewedAt: "2026-04-06",
    },
  ],
  extendRequiredFields(fields) {
    fields.push("supplier.addressLine1");
    fields.push("supplier.postalCode");
    fields.push("supplier.city");
    fields.push("customer.legalName");
    return [...new Set(fields)];
  },
  extendValidation(issues, document) {
    if (document.lines.some((line) => !hasValue(line.description))) {
      issues.push(
        createCountryIssue(
          "invoice.lines",
          "ZA_LINE_DESCRIPTION_REQUIRED",
          "South African tax invoices must describe the goods or services supplied.",
          "ERROR",
          "ZA"
        )
      );
    }
    if (document.taxBreakdown.length === 0) {
      issues.push(
        createCountryIssue(
          "invoice.taxBreakdown",
          "ZA_TAX_BREAKDOWN_REQUIRED",
          "South African VAT invoices must show VAT or indicate VAT-inclusive pricing.",
          "ERROR",
          "ZA"
        )
      );
    }
    return issues;
  },
});
