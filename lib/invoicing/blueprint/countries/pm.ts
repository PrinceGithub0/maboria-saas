import { buildDefaultCountryModule, createCountryIssue } from "@/lib/invoicing/blueprint/module-factory";

export const saintPierreComplianceModule = buildDefaultCountryModule("PM", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-07",
  evidence: [
    {
      label: "EU Commission: French overseas territories outside EU VAT rules",
      url: "https://taxation-customs.ec.europa.eu/taxation/vat/vat-directive/how-does-vat-work/territorial-scope_en",
      reviewedAt: "2026-04-07",
    },
  ],
  extendValidation(issues) {
    issues.push(
      createCountryIssue(
        "invoice.countryContext",
        "PM_LOCAL_TAX_RULES",
        "Saint Pierre and Miquelon is outside EU VAT rules; apply local invoicing requirements.",
        "WARNING",
        "PM"
      )
    );
    return issues;
  },
});
