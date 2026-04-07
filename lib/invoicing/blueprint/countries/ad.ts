import { buildDefaultCountryModule, createCountryIssue } from "@/lib/invoicing/blueprint/module-factory";

export const andorraComplianceModule = buildDefaultCountryModule("AD", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-06",
  evidence: [
    {
      label: "EU Commission: Andorra outside EU VAT rules",
      url: "https://taxation-customs.ec.europa.eu/taxation/vat/vat-directive/how-does-vat-work/territorial-scope_en",
      reviewedAt: "2026-04-06",
    },
  ],
  extendValidation(issues) {
    issues.push(
      createCountryIssue(
        "invoice.countryContext",
        "AD_LOCAL_TAX_RULES",
        "Andorra is outside EU VAT rules; apply local IGI invoicing requirements.",
        "WARNING",
        "AD"
      )
    );
    return issues;
  },
});
