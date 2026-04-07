import { buildDefaultCountryModule, createCountryIssue, hasValue } from "@/lib/invoicing/blueprint/module-factory";

export const guyanaComplianceModule = buildDefaultCountryModule("GY", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-06",
  evidence: [
    {
      label: "Guyana Revenue Authority VAT invoices guidance",
      url: "https://www.gra.gov.gy/vat-invoices/",
      reviewedAt: "2026-04-06",
    },
    {
      label: "Guyana Revenue Authority VAT registration guidance",
      url: "https://www.gra.gov.gy/quick-links-2/start-your-business/register-for-vat/",
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
          "GY_VAT_ID_REQUIRED",
          "Guyanese tax invoices must include the supplier VAT registration number.",
          "ERROR",
          "GY"
        )
      );
    }
    if (document.lines.some((line) => !hasValue(line.description))) {
      issues.push(
        createCountryIssue(
          "invoice.lines",
          "GY_LINE_DESCRIPTION_REQUIRED",
          "Guyanese VAT invoices must describe the goods or services sold.",
          "ERROR",
          "GY"
        )
      );
    }
    return issues;
  },
});
