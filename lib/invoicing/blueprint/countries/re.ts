import { buildDefaultCountryModule, createCountryIssue } from "@/lib/invoicing/blueprint/module-factory";

export const reunionComplianceModule = buildDefaultCountryModule("RE", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-07",
  evidence: [
    {
      label: "EU Commission: Reunion under French VAT rules",
      url: "https://taxation-customs.ec.europa.eu/taxation/vat/vat-directive/how-does-vat-work/territorial-scope_en",
      reviewedAt: "2026-04-07",
    },
  ],
  extendValidation(issues) {
    issues.push(
      createCountryIssue(
        "invoice.countryContext",
        "RE_FRENCH_VAT_RULES",
        "Reunion applies French VAT rules. Follow French VAT invoice requirements.",
        "WARNING",
        "RE"
      )
    );
    return issues;
  },
});
