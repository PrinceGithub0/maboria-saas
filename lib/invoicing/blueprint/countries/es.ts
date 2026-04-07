import { buildDefaultCountryModule, createCountryIssue, hasValue } from "@/lib/invoicing/blueprint/module-factory";

export const spainComplianceModule = buildDefaultCountryModule("ES", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-06",
  evidence: [
    {
      label: "Spain Law 18/2022 (B2B e-invoicing obligation framework)",
      url: "https://www.boe.es/diario_boe/txt.php?id=BOE-A-2022-15818",
      reviewedAt: "2026-04-06",
    },
  ],
  extendRequiredFields(fields) {
    fields.push("supplier.addressLine1");
    fields.push("supplier.postalCode");
    fields.push("supplier.city");
    fields.push("customer.addressLine1");
    fields.push("customer.postalCode");
    fields.push("customer.city");
    return [...new Set(fields)];
  },
  extendValidation(issues, document) {
    if (document.lines.some((line) => !hasValue(line.description))) {
      issues.push(
        createCountryIssue(
          "invoice.lines",
          "ES_LINE_DESCRIPTION_REQUIRED",
          "Spanish invoices must describe the goods or services supplied.",
          "ERROR",
          "ES"
        )
      );
    }
    if (document.taxBreakdown.length === 0) {
      issues.push(
        createCountryIssue(
          "invoice.taxBreakdown",
          "ES_TAX_BREAKDOWN_REQUIRED",
          "Spanish VAT invoices must show VAT rates and amounts.",
          "ERROR",
          "ES"
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
          "ES_TAX_AMOUNT_REQUIRED",
          "VAT amounts must be shown for each VAT rate on Spanish invoices.",
          "ERROR",
          "ES"
        )
      );
    }
    issues.push(
      createCountryIssue(
        "invoice.deliveryModes",
        "ES_EINVOICE_MANDATE_UPCOMING",
        "Spain has a statutory B2B e-invoicing mandate; confirm rollout applicability and required delivery formats.",
        "INFO",
        "ES"
      )
    );
    return issues;
  },
});
