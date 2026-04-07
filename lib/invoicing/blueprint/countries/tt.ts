import { buildDefaultCountryModule, createCountryIssue, hasValue } from "@/lib/invoicing/blueprint/module-factory";

export const trinidadAndTobagoComplianceModule = buildDefaultCountryModule("TT", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-06",
  evidence: [
    {
      label: "Trinidad and Tobago IRD VAT guidance",
      url: "https://www.ird.gov.tt/VAT",
      reviewedAt: "2026-04-06",
    },
    {
      label: "Trinidad and Tobago IRD vehicle transfer VAT invoice requirements",
      url: "https://www.ird.gov.tt/vat-requirements-for-transfer-of-vehicle-vat-registered-companies-only",
      reviewedAt: "2026-04-06",
    },
  ],
  extendRequiredFields(fields) {
    fields.push("supplier.addressLine1");
    fields.push("supplier.city");
    fields.push("customer.addressLine1");
    return [...new Set(fields)];
  },
  extendValidation(issues, document) {
    if (!hasValue(document.supplier.taxId || document.supplier.vatId)) {
      issues.push(
        createCountryIssue(
          "supplier.taxId",
          "TT_VAT_ID_REQUIRED",
          "Trinidad and Tobago tax invoices must include the supplier VAT registration number.",
          "ERROR",
          "TT"
        )
      );
    }
    if (document.lines.some((line) => !hasValue(line.description))) {
      issues.push(
        createCountryIssue(
          "invoice.lines",
          "TT_LINE_DESCRIPTION_REQUIRED",
          "Trinidad and Tobago tax invoices must describe the goods or services sold.",
          "ERROR",
          "TT"
        )
      );
    }
    return issues;
  },
});
