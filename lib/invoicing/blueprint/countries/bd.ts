import { buildDefaultCountryModule, createCountryIssue, hasValue } from "@/lib/invoicing/blueprint/module-factory";

export const bangladeshComplianceModule = buildDefaultCountryModule("BD", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-06",
  evidence: [
    {
      label: "Bangladesh NBR VAT compliance guides and e-services",
      url: "https://nbr.gov.bd/taxtypes/vat-compliance-guides/details/8/eservices/e-services/eservices/taxefiling/",
      reviewedAt: "2026-04-06",
    },
    {
      label: "Bangladesh NBR e-services portal",
      url: "https://nbr.gov.bd/eservices/2/eng",
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
          "BD_VAT_REG_REQUIRED",
          "Bangladesh VAT invoices should capture the supplier VAT or tax registration identifier.",
          "ERROR",
          "BD"
        )
      );
    }
    return issues;
  },
});
