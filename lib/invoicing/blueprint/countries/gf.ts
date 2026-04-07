import { buildDefaultCountryModule, createCountryIssue } from "@/lib/invoicing/blueprint/module-factory";

export const frenchGuianaComplianceModule = buildDefaultCountryModule("GF", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-07",
  evidence: [
    {
      label: "EU Commission: French Guiana under French VAT rules",
      url: "https://taxation-customs.ec.europa.eu/taxation/vat/vat-directive/how-does-vat-work/territorial-scope_en",
      reviewedAt: "2026-04-07",
    },
  ],
  extendValidation(issues) {
    issues.push(
      createCountryIssue(
        "invoice.countryContext",
        "GF_FRENCH_VAT_RULES",
        "French Guiana applies French VAT rules. Follow French VAT invoice requirements.",
        "WARNING",
        "GF"
      )
    );
    return issues;
  },
});
