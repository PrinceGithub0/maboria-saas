import { buildDefaultCountryModule, createCountryIssue, hasValue } from "@/lib/invoicing/blueprint/module-factory";

export const lebanonComplianceModule = buildDefaultCountryModule("LB", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-06",
  evidence: [
    {
      label: "Lebanon MoF: Issuance of the Tax Invoice and Book Keeping (VAT Law 379, Article 38)",
      url: "https://www.finance.gov.lb/ar-lb/Taxation/Companies/VAT/Pages/Issuance-of-the-Tax-Invoice-and-Book-Keeping.aspx",
      reviewedAt: "2026-04-06",
    },
  ],
  extendRequiredFields(fields, document) {
    fields.push("supplier.legalName");
    fields.push("supplier.addressLine1");
    fields.push("supplier.registrationNumber");
    fields.push("supplier.taxId");
    fields.push("customer.legalName");
    fields.push("customer.addressLine1");
    fields.push("invoice.invoiceNumber");
    fields.push("invoice.issueDate");
    return [...new Set(fields)];
  },
  extendValidation(issues, document) {
    if (document.lines.some((line) => !hasValue(line.description))) {
      issues.push(
        createCountryIssue(
          "invoice.lines",
          "LB_LINE_DESCRIPTION_REQUIRED",
          "Lebanese VAT invoices must describe the goods or services supplied.",
          "ERROR",
          "LB"
        )
      );
    }
    if (document.taxBreakdown.length === 0) {
      issues.push(
        createCountryIssue(
          "invoice.taxBreakdown",
          "LB_TAX_BREAKDOWN_REQUIRED",
          "Lebanese VAT invoices must show the tax rate and tax amount.",
          "ERROR",
          "LB"
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
          "LB_TAX_AMOUNT_REQUIRED",
          "Lebanese VAT invoices must show the VAT amount for each applicable rate.",
          "ERROR",
          "LB"
        )
      );
    }
    if (!hasValue(document.supplier.registrationNumber)) {
      issues.push(
        createCountryIssue(
          "supplier.registrationNumber",
          "LB_SUPPLIER_REGISTRATION_REQUIRED",
          "Lebanese VAT invoices must include the supplier's registration number with the Ministry of Finance.",
          "ERROR",
          "LB"
        )
      );
    }
    return issues;
  },
});
