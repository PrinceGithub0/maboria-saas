import { buildDefaultCountryModule, createCountryIssue } from "@/lib/invoicing/blueprint/module-factory";

export const caribbeanNetherlandsComplianceModule = buildDefaultCountryModule("BQ", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-07",
  evidence: [
    {
      label: "EU Commission: Dutch Caribbean territories outside EU VAT rules",
      url: "https://taxation-customs.ec.europa.eu/taxation/vat/vat-directive/how-does-vat-work/territorial-scope_en",
      reviewedAt: "2026-04-07",
    },
  ],
  extendValidation(issues) {
    issues.push(
      createCountryIssue(
        "invoice.countryContext",
        "BQ_LOCAL_TAX_RULES",
        "Caribbean Netherlands are outside EU VAT rules; apply local invoicing requirements.",
        "WARNING",
        "BQ"
      )
    );
    return issues;
  },
});
