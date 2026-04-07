import { buildDefaultCountryModule, createCountryIssue } from "@/lib/invoicing/blueprint/module-factory";

export const faroeIslandsComplianceModule = buildDefaultCountryModule("FO", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-06",
  evidence: [
    {
      label: "EU Commission: Faroe Islands outside EU VAT rules",
      url: "https://taxation-customs.ec.europa.eu/taxation/vat/vat-directive/how-does-vat-work/territorial-scope_en",
      reviewedAt: "2026-04-06",
    },
  ],
  extendValidation(issues) {
    issues.push(
      createCountryIssue(
        "invoice.countryContext",
        "FO_LOCAL_TAX_RULES",
        "Faroe Islands are outside EU VAT rules; apply local invoicing requirements.",
        "WARNING",
        "FO"
      )
    );
    return issues;
  },
});
