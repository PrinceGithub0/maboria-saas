import { buildDefaultCountryModule, createCountryIssue } from "@/lib/invoicing/blueprint/module-factory";

export const saintBarthelemyComplianceModule = buildDefaultCountryModule("BL", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-07",
  evidence: [
    {
      label: "EU Commission: Saint Barthelemy outside EU VAT rules",
      url: "https://taxation-customs.ec.europa.eu/taxation/vat/vat-directive/how-does-vat-work/territorial-scope_en",
      reviewedAt: "2026-04-07",
    },
  ],
  extendValidation(issues) {
    issues.push(
      createCountryIssue(
        "invoice.countryContext",
        "BL_LOCAL_TAX_RULES",
        "Saint Barthelemy is outside EU VAT rules; apply local invoicing requirements.",
        "WARNING",
        "BL"
      )
    );
    return issues;
  },
});
