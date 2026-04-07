import { buildDefaultCountryModule, createCountryIssue, hasValue } from "@/lib/invoicing/blueprint/module-factory";

export const sriLankaComplianceModule = buildDefaultCountryModule("LK", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-06",
  evidence: [
    {
      label: "Sri Lanka VAT Act (tax invoice particulars)",
      url: "https://www.ird.gov.lk/attachments/978_RVAT%20Act.pdf",
      reviewedAt: "2026-04-06",
    },
  ],
  extendRequiredFields(fields, document) {
    fields.push("supplier.addressLine1");
    fields.push("supplier.city");
    fields.push("supplier.taxId");
    fields.push("customer.addressLine1");
    fields.push("customer.city");
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
          "LK_LINE_DESCRIPTION_REQUIRED",
          "Sri Lankan VAT invoices must describe the goods or services supplied.",
          "ERROR",
          "LK"
        )
      );
    }
    if (document.taxBreakdown.length === 0) {
      issues.push(
        createCountryIssue(
          "invoice.taxBreakdown",
          "LK_TAX_BREAKDOWN_REQUIRED",
          "Sri Lankan VAT invoices must show VAT rates and amounts.",
          "ERROR",
          "LK"
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
          "LK_TAX_AMOUNT_REQUIRED",
          "VAT amounts must be shown for each VAT rate on Sri Lankan invoices.",
          "ERROR",
          "LK"
        )
      );
    }
    issues.push(
      createCountryIssue(
        "invoice.metadata",
        "LK_TAX_INVOICE_LABEL_REQUIRED",
        'Sri Lankan VAT invoices must be labeled as "Tax Invoice".',
        "INFO",
        "LK"
      )
    );
    return issues;
  },
});
