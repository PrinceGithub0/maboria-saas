import { buildDefaultCountryModule, createCountryIssue, hasValue } from "@/lib/invoicing/blueprint/module-factory";

export const israelComplianceModule = buildDefaultCountryModule("IL", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-06",
  evidence: [
    {
      label: "Israel Tax Authority: allocation number for tax invoices (B2B threshold)",
      url: "https://www.gov.il/en/service/request-assignment-number-for-tax-invoice",
      reviewedAt: "2026-04-06",
    },
    {
      label: "Israel Invoice Model (allocation number requirement)",
      url: "https://www.gov.il/BlobFolder/generalpage/israel-invoice-160723/he/vat_software-houses-180724-en.pdf",
      reviewedAt: "2026-04-06",
    },
  ],
  extendRequiredFields(fields, document) {
    fields.push("supplier.addressLine1");
    fields.push("supplier.city");
    fields.push("supplier.taxId");
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
          "IL_LINE_DESCRIPTION_REQUIRED",
          "Israeli VAT tax invoices must describe the goods or services supplied.",
          "ERROR",
          "IL"
        )
      );
    }
    if (document.taxBreakdown.length === 0) {
      issues.push(
        createCountryIssue(
          "invoice.taxBreakdown",
          "IL_TAX_BREAKDOWN_REQUIRED",
          "Israeli VAT invoices must show VAT rates and amounts.",
          "ERROR",
          "IL"
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
          "IL_BUYER_TAX_ID_REQUIRED",
          "B2B Israeli VAT invoices must include the customer's authorized dealer number.",
          "ERROR",
          "IL"
        )
      );
    }
    if (
      document.buyerType === "B2B" &&
      String(document.currency || "").toUpperCase() === "ILS" &&
      Number.isFinite(document.totals.subtotal) &&
      document.totals.subtotal >= 20000
    ) {
      issues.push(
        createCountryIssue(
          "invoice.metadata",
          "IL_ALLOCATION_NUMBER_REQUIRED",
          "Israeli VAT invoices above the allocation threshold require an ITA-issued allocation number.",
          "INFO",
          "IL"
        )
      );
    }
    return issues;
  },
});
