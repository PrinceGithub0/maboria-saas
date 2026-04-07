import { buildDefaultCountryModule, createCountryIssue, hasValue } from "@/lib/invoicing/blueprint/module-factory";

export const fijiComplianceModule = buildDefaultCountryModule("FJ", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-06",
  evidence: [
    {
      label: "Fiji VAT guide",
      url: "https://frcs.org.fj/our-services/taxation/value-added-tax-vat/",
      reviewedAt: "2026-04-06",
    },
    {
      label: "Fiji clarification on valid VAT tax invoices",
      url: "https://frcs.org.fj/public-notice/vat-registered-taxpayers-clarification-on-tax-invoices-and-proforma-invoices-for-input-tax-credit-claims/",
      reviewedAt: "2026-04-06",
    },
  ],
  extendRequiredFields(fields) {
    fields.push("supplier.addressLine1", "supplier.city");
    return [...new Set(fields)];
  },
  extendValidation(issues, document) {
    if (document.lines.some((line) => !hasValue(line.description))) {
      issues.push(
        createCountryIssue(
          "invoice.lines",
          "FJ_LINE_DESCRIPTION_REQUIRED",
          "Fijian VAT tax invoices should describe the supplied goods or services.",
          "ERROR",
          "FJ"
        )
      );
    }
    issues.push(
      createCountryIssue(
        "invoice.metadata",
        "FJ_VMS_REVIEW",
        "Fiji is modernizing VAT monitoring; confirm any fiscal device obligations for the seller segment.",
        "INFO",
        "FJ"
      )
    );
    return issues;
  },
});
