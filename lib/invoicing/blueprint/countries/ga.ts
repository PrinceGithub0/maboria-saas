import { buildDefaultCountryModule, createCountryIssue } from "@/lib/invoicing/blueprint/module-factory";

export const gabonComplianceModule = buildDefaultCountryModule("GA", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-06",
  evidence: [
    {
      label: "Gabon DGI VAT guidance",
      url: "https://demo.dgi.gouv.ga/imposition-des-personnes-morales/taxes-sur-le-chiffre-daffaires/tva/",
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
    if (document.taxBreakdown.length === 0) {
      issues.push(
        createCountryIssue(
          "invoice.taxBreakdown",
          "GA_TAX_BREAKDOWN_REQUIRED",
          "Gabon VAT invoices should show the applicable VAT rate and amount.",
          "ERROR",
          "GA"
        )
      );
    }
    return issues;
  },
});
