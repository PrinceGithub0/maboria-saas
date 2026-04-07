import { buildDefaultCountryModule, createCountryIssue, hasValue } from "@/lib/invoicing/blueprint/module-factory";

export const armeniaComplianceModule = buildDefaultCountryModule("AM", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-06",
  evidence: [
    {
      label: "Tax Code of the Republic of Armenia (tax invoices, electronic confirmation)",
      url: "https://www.arlis.am/documentview.aspx?docid=205620",
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
          "AM_LINE_DESCRIPTION_REQUIRED",
          "Armenian VAT tax invoices must describe the goods or services supplied.",
          "ERROR",
          "AM"
        )
      );
    }
    if (document.taxBreakdown.length === 0) {
      issues.push(
        createCountryIssue(
          "invoice.taxBreakdown",
          "AM_TAX_BREAKDOWN_REQUIRED",
          "Armenian VAT invoices must show VAT rates and amounts.",
          "ERROR",
          "AM"
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
          "AM_BUYER_TAX_ID_REQUIRED",
          "B2B Armenian VAT invoices must include the buyer's tax identification number.",
          "ERROR",
          "AM"
        )
      );
    }
    issues.push(
      createCountryIssue(
        "invoice.metadata",
        "AM_EINVOICE_CONFIRMATION_REQUIRED",
        "Armenian VAT invoices are issued and confirmed electronically with a digital signature.",
        "INFO",
        "AM"
      )
    );
    return issues;
  },
});
