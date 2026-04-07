import { buildDefaultCountryModule, createCountryIssue, hasValue } from "@/lib/invoicing/blueprint/module-factory";

export const moldovaComplianceModule = buildDefaultCountryModule("MD", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-06",
  evidence: [
    {
      label: "State Fiscal Service of Moldova: obligation to issue fiscal invoices (VAT Code art. 117)",
      url: "https://sfs.md/ro/ordinele-de-baze-de-date-de-generalizare/48",
      reviewedAt: "2026-04-06",
    },
    {
      label: "Moldova e-Factura (public e-invoice platform)",
      url: "https://efactura.gov.md/",
      reviewedAt: "2026-04-06",
    },
  ],
  extendRequiredFields(fields, document) {
    fields.push("supplier.legalName");
    fields.push("supplier.taxId");
    fields.push("supplier.addressLine1");
    fields.push("customer.legalName");
    fields.push("invoice.invoiceNumber");
    fields.push("invoice.issueDate");
    if (document.buyerType === "B2B") {
      fields.push("customer.taxId");
    }
    return [...new Set(fields)];
  },
  extendValidation(issues, document) {
    if (document.lines.some((line) => !hasValue(line.description))) {
      issues.push(
        createCountryIssue(
          "invoice.lines",
          "MD_LINE_DESCRIPTION_REQUIRED",
          "Moldovan VAT invoices must describe the goods or services supplied.",
          "ERROR",
          "MD"
        )
      );
    }
    if (document.taxBreakdown.length === 0) {
      issues.push(
        createCountryIssue(
          "invoice.taxBreakdown",
          "MD_TAX_BREAKDOWN_REQUIRED",
          "Moldovan VAT invoices must show VAT rates and amounts.",
          "ERROR",
          "MD"
        )
      );
    }
    if (
      document.buyerType === "B2B" &&
      !hasValue(document.customer.taxId || document.customer.vatId)
    ) {
      issues.push(
        createCountryIssue(
          "customer.taxId",
          "MD_BUYER_TAX_ID_REQUIRED",
          "B2B Moldovan VAT invoices must include the buyer's tax identification number.",
          "ERROR",
          "MD"
        )
      );
    }
    issues.push(
      createCountryIssue(
        "invoice.deliveryModes",
        "MD_EFACTURA_REQUIRED",
        "Moldova requires e-Factura for certain transactions; prepare XML export and platform submission.",
        "INFO",
        "MD"
      )
    );
    return issues;
  },
});
