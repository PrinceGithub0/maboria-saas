import { buildDefaultCountryModule, createCountryIssue } from "@/lib/invoicing/blueprint/module-factory";

export const sanMarinoComplianceModule = buildDefaultCountryModule("SM", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-06",
  evidence: [
    {
      label: "EU Commission: San Marino not under EU VAT rules",
      url: "https://taxation-customs.ec.europa.eu/taxation/vat/vat-directive/how-does-vat-work/territorial-scope_en",
      reviewedAt: "2026-04-06",
    },
  ],
  extendValidation(issues) {
    issues.push(
      createCountryIssue(
        "invoice.countryContext",
        "SM_LOCAL_TAX_RULES",
        "San Marino is outside EU VAT rules; apply local invoicing rules and indirect tax requirements.",
        "WARNING",
        "SM"
      )
    );
    return issues;
  },
});
