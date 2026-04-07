import { buildDefaultCountryModule, createCountryIssue, hasValue } from "@/lib/invoicing/blueprint/module-factory";

export const saintVincentComplianceModule = buildDefaultCountryModule("VC", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-06",
  evidence: [
    {
      label: "St. Vincent and the Grenadines tax overview",
      url: "https://ird.gov.vc/index.php/taxes",
      reviewedAt: "2026-04-06",
    },
    {
      label: "St. Vincent and the Grenadines VAT FAQ including invoice versus receipt",
      url: "https://ird.gov.vc/index.php/faqs",
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
          "VC_VAT_ID_REQUIRED",
          "St. Vincent and the Grenadines VAT invoices should identify the registered supplier.",
          "ERROR",
          "VC"
        )
      );
    }
    if (document.lines.some((line) => !hasValue(line.description))) {
      issues.push(
        createCountryIssue(
          "invoice.lines",
          "VC_LINE_DESCRIPTION_REQUIRED",
          "St. Vincent and the Grenadines VAT invoices should describe the supplied goods or services.",
          "ERROR",
          "VC"
        )
      );
    }
    return issues;
  },
});
