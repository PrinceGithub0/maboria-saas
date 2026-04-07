import { buildDefaultCountryModule, createCountryIssue, hasValue } from "@/lib/invoicing/blueprint/module-factory";

export const bahamasComplianceModule = buildDefaultCountryModule("BS", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-06",
  evidence: [
    {
      label: "Bahamas VAT overview",
      url: "https://inlandrevenue.finance.gov.bs/value-added-tax/about-vat/",
      reviewedAt: "2026-04-06",
    },
    {
      label: "Bahamas VAT payment and online filing guidance",
      url: "https://inlandrevenue.finance.gov.bs/value-added-tax/payment-vat/",
      reviewedAt: "2026-04-06",
    },
  ],
  extendRequiredFields(fields) {
    fields.push("supplier.addressLine1", "supplier.city");
    return [...new Set(fields)];
  },
  extendValidation(issues, document) {
    if (!hasValue(document.supplier.taxId)) {
      issues.push(
        createCountryIssue(
          "supplier.taxId",
          "BS_VAT_ID_REQUIRED",
          "Bahamian VAT invoices should identify the VAT-registered supplier.",
          "ERROR",
          "BS"
        )
      );
    }
    if (document.lines.some((line) => !hasValue(line.description))) {
      issues.push(
        createCountryIssue(
          "invoice.lines",
          "BS_LINE_DESCRIPTION_REQUIRED",
          "Bahamian VAT records should describe the supplied goods or services.",
          "ERROR",
          "BS"
        )
      );
    }
    return issues;
  },
});
