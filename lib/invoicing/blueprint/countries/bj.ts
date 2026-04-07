import { buildDefaultCountryModule, createCountryIssue, hasValue } from "@/lib/invoicing/blueprint/module-factory";

export const beninComplianceModule = buildDefaultCountryModule("BJ", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-06",
  evidence: [
    {
      label: "Benin tax authority VAT guidance",
      url: "https://www.impots.finances.gouv.bj/tva/",
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
          "BJ_TAX_ID_REQUIRED",
          "Benin VAT invoices should capture the supplier tax identifier.",
          "ERROR",
          "BJ"
        )
      );
    }
    return issues;
  },
});
