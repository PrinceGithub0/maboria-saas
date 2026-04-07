import { buildDefaultCountryModule, createCountryIssue, hasValue } from "@/lib/invoicing/blueprint/module-factory";

export const barbadosComplianceModule = buildDefaultCountryModule("BB", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-06",
  evidence: [
    {
      label: "Barbados Revenue Authority VAT rates",
      url: "https://bra.gov.bb/Popular-Topics/Value-Added-Tax/VAT-Rates",
      reviewedAt: "2026-04-06",
    },
    {
      label: "Barbados Revenue Authority VAT registration guidance",
      url: "https://bra.gov.bb/Popular-Topics/Value-Added-Tax/Who-Must-Register-for-VAT",
      reviewedAt: "2026-04-06",
    },
  ],
  extendRequiredFields(fields) {
    fields.push("supplier.addressLine1");
    fields.push("supplier.city");
    fields.push("customer.legalName");
    return [...new Set(fields)];
  },
  extendValidation(issues, document) {
    if (!hasValue(document.supplier.taxId || document.supplier.vatId)) {
      issues.push(
        createCountryIssue(
          "supplier.taxId",
          "BB_VAT_ID_REQUIRED",
          "Barbadian VAT invoices should identify the supplier VAT registration.",
          "ERROR",
          "BB"
        )
      );
    }
    if (document.lines.some((line) => !hasValue(line.description))) {
      issues.push(
        createCountryIssue(
          "invoice.lines",
          "BB_LINE_DESCRIPTION_REQUIRED",
          "Barbadian VAT records should describe the goods or services supplied.",
          "ERROR",
          "BB"
        )
      );
    }
    return issues;
  },
});
