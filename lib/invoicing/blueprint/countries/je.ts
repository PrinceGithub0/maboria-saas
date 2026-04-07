import { buildDefaultCountryModule, createCountryIssue } from "@/lib/invoicing/blueprint/module-factory";

export const jerseyComplianceModule = buildDefaultCountryModule("JE", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-06",
  evidence: [
    {
      label: "HMRC: Channel Islands are outside the UK VAT system",
      url: "https://www.gov.uk/guidance/vat-place-of-supply-of-services-notice-741a",
      reviewedAt: "2026-04-06",
    },
  ],
  extendValidation(issues) {
    issues.push(
      createCountryIssue(
        "invoice.countryContext",
        "JE_NO_UK_VAT",
        "Jersey is outside the UK VAT system. Local GST rules may apply; verify local invoicing requirements.",
        "WARNING",
        "JE"
      )
    );
    return issues;
  },
});
