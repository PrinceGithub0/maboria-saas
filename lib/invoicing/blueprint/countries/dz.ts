import { buildDefaultCountryModule, createCountryIssue, hasValue } from "@/lib/invoicing/blueprint/module-factory";

export const algeriaComplianceModule = buildDefaultCountryModule("DZ", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-06",
  evidence: [
    {
      label: "Ministry of Commerce Algeria: mandatory invoice mentions",
      url: "https://www.commerce.gov.dz/fr/questions-frequentes/themes/facture",
      reviewedAt: "2026-04-06",
    },
  ],
  extendRequiredFields(fields, document) {
    fields.push("supplier.addressLine1");
    fields.push("supplier.registrationNumber");
    fields.push("supplier.taxId");
    if (document.buyerType === "B2B") {
      fields.push("customer.addressLine1");
      fields.push("customer.registrationNumber");
    }
    return [...new Set(fields)];
  },
  extendValidation(issues, document) {
    if (document.lines.some((line) => !hasValue(line.description))) {
      issues.push(
        createCountryIssue(
          "invoice.lines",
          "DZ_LINE_DESCRIPTION_REQUIRED",
          "Algerian invoices must describe the goods or services supplied.",
          "ERROR",
          "DZ"
        )
      );
    }
    if (document.taxBreakdown.length === 0) {
      issues.push(
        createCountryIssue(
          "invoice.taxBreakdown",
          "DZ_TAX_BREAKDOWN_REQUIRED",
          "Algerian invoices must show the applicable tax rate and tax amount.",
          "ERROR",
          "DZ"
        )
      );
    }
    if (
      document.taxBreakdown.some((item) => !Number.isFinite(item.taxAmount)) ||
      document.taxBreakdown.some((item) => item.taxAmount === null || item.taxAmount === undefined)
    ) {
      issues.push(
        createCountryIssue(
          "invoice.taxBreakdown",
          "DZ_TAX_AMOUNT_REQUIRED",
          "Algerian invoices must state the VAT amount for each applicable rate.",
          "ERROR",
          "DZ"
        )
      );
    }
    if (!hasValue(document.supplier.registrationNumber || document.supplier.taxId)) {
      issues.push(
        createCountryIssue(
          "supplier.registrationNumber",
          "DZ_SUPPLIER_REGISTRATION_REQUIRED",
          "Algerian invoices must include the seller's trade register or tax identification.",
          "ERROR",
          "DZ"
        )
      );
    }
    if (document.buyerType === "B2B" && !hasValue(document.customer.registrationNumber)) {
      issues.push(
        createCountryIssue(
          "customer.registrationNumber",
          "DZ_BUYER_REGISTRATION_REQUIRED",
          "B2B Algerian invoices must include the buyer's trade register number.",
          "ERROR",
          "DZ"
        )
      );
    }
    return issues;
  },
});
