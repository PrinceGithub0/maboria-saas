import { buildDefaultCountryModule, createCountryIssue } from "@/lib/invoicing/blueprint/module-factory";

export const vaticanComplianceModule = buildDefaultCountryModule("VA", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-06",
  evidence: [
    {
      label: "EU Commission: Vatican City outside EU VAT rules",
      url: "https://taxation-customs.ec.europa.eu/taxation/vat/vat-directive/how-does-vat-work/territorial-scope_en",
      reviewedAt: "2026-04-06",
    },
  ],
  extendValidation(issues) {
    issues.push(
      createCountryIssue(
        "invoice.countryContext",
        "VA_LOCAL_TAX_RULES",
        "Vatican City is outside EU VAT rules; apply local invoicing requirements.",
        "WARNING",
        "VA"
      )
    );
    return issues;
  },
});
