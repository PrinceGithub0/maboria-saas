import { buildDefaultCountryModule, createCountryIssue } from "@/lib/invoicing/blueprint/module-factory";

export const wallisAndFutunaComplianceModule = buildDefaultCountryModule("WF", {
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
        "WF_LOCAL_TAX_RULES",
        "Wallis and Futuna is outside EU VAT rules; apply local invoicing requirements.",
        "WARNING",
        "WF"
      )
    );
    return issues;
  },
});
