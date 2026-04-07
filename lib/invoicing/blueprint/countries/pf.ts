import { buildDefaultCountryModule, createCountryIssue } from "@/lib/invoicing/blueprint/module-factory";

export const frenchPolynesiaComplianceModule = buildDefaultCountryModule("PF", {
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
        "PF_LOCAL_TAX_RULES",
        "French Polynesia is outside EU VAT rules; apply local invoicing requirements.",
        "WARNING",
        "PF"
      )
    );
    return issues;
  },
});
