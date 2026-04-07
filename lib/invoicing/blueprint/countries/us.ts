import { buildDefaultCountryModule, createCountryIssue, hasValue } from "@/lib/invoicing/blueprint/module-factory";

export const unitedStatesComplianceModule = buildDefaultCountryModule("US", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-06",
  evidence: [
    {
      label: "Sales tax is imposed by states and localities, not a federal VAT",
      url: "https://www.law.cornell.edu/wex/sales_tax",
      reviewedAt: "2026-04-06",
    },
  ],
  extendRequiredFields(fields, document) {
    if (document.countryContext.buyerCountryCode === "US") {
      fields.push("supplier.stateRegion");
      fields.push("customer.stateRegion");
    }
    return [...new Set(fields)];
  },
  extendValidation(issues, document) {
    if (
      document.countryContext.buyerCountryCode === "US" &&
      (!hasValue(document.supplier.stateRegion) || !hasValue(document.customer.stateRegion))
    ) {
      issues.push(
        createCountryIssue(
          "invoice.countryContext",
          "US_STATE_CONTEXT_RECOMMENDED",
          "US domestic invoices should capture supplier and customer state context for sales tax review.",
          "WARNING",
          "US"
        )
      );
    }
    return issues;
  },
  overrideSupportsEInvoicing() {
    return false;
  },
});
