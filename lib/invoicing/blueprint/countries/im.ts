import { buildDefaultCountryModule, createCountryIssue, hasValue } from "@/lib/invoicing/blueprint/module-factory";

export const isleOfManComplianceModule = buildDefaultCountryModule("IM", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-06",
  evidence: [
    {
      label: "HMRC: Isle of Man treated as part of the UK for VAT purposes",
      url: "https://www.gov.uk/guidance/vat-place-of-supply-of-services-notice-741a",
      reviewedAt: "2026-04-06",
    },
    {
      label: "HMRC VAT Notice 700/21: VAT invoice details required",
      url: "https://www.gov.uk/government/publications/vat-notice-70021-keeping-vat-records/vat-notice-70021-keeping-vat-records",
      reviewedAt: "2026-04-06",
    },
  ],
  extendRequiredFields(fields) {
    fields.push("supplier.legalName");
    fields.push("supplier.addressLine1");
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
          "IM_LINE_DESCRIPTION_REQUIRED",
          "Isle of Man VAT invoices must describe the goods or services supplied.",
          "ERROR",
          "IM"
        )
      );
    }
    if (document.taxBreakdown.length === 0) {
      issues.push(
        createCountryIssue(
          "invoice.taxBreakdown",
          "IM_TAX_BREAKDOWN_REQUIRED",
          "Isle of Man VAT invoices must show VAT rates and amounts.",
          "ERROR",
          "IM"
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
          "IM_TAX_AMOUNT_REQUIRED",
          "VAT amounts must be shown for each VAT rate on Isle of Man invoices.",
          "ERROR",
          "IM"
        )
      );
    }
    return issues;
  },
});
