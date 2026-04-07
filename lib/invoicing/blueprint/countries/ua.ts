import { buildDefaultCountryModule, createCountryIssue, hasValue } from "@/lib/invoicing/blueprint/module-factory";

export const ukraineComplianceModule = buildDefaultCountryModule("UA", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-06",
  evidence: [
    {
      label: "State Tax Service of Ukraine: tax invoice form and registration",
      url: "https://tax.gov.ua/en/new-about-taxes--hotlines-/810111.html",
      reviewedAt: "2026-04-06",
    },
  ],
  extendRequiredFields(fields, document) {
    fields.push("supplier.taxId");
    fields.push("supplier.addressLine1");
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
          "UA_LINE_DESCRIPTION_REQUIRED",
          "Ukrainian tax invoices must describe the goods or services supplied.",
          "ERROR",
          "UA"
        )
      );
    }
    if (document.taxBreakdown.length === 0) {
      issues.push(
        createCountryIssue(
          "invoice.taxBreakdown",
          "UA_TAX_BREAKDOWN_REQUIRED",
          "Ukrainian tax invoices must show VAT rates and amounts.",
          "ERROR",
          "UA"
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
          "UA_BUYER_TAX_ID_REQUIRED",
          "B2B Ukrainian tax invoices must include the buyer's VAT tax number.",
          "ERROR",
          "UA"
        )
      );
    }
    issues.push(
      createCountryIssue(
        "invoice.metadata",
        "UA_REGISTER_TAX_INVOICE_REQUIRED",
        "Ukrainian VAT tax invoices must be registered in the Unified Register of Tax Invoices.",
        "INFO",
        "UA"
      )
    );
    return issues;
  },
});
