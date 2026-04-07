import { buildDefaultCountryModule, createCountryIssue } from "@/lib/invoicing/blueprint/module-factory";

export const gibraltarComplianceModule = buildDefaultCountryModule("GI", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-06",
  evidence: [
    {
      label: "HMRC: Gibraltar is outside the UK VAT system",
      url: "https://www.gov.uk/guidance/vat-place-of-supply-of-services-notice-741a",
      reviewedAt: "2026-04-06",
    },
  ],
  extendValidation(issues) {
    issues.push(
      createCountryIssue(
        "invoice.countryContext",
        "GI_NO_UK_VAT",
        "Gibraltar is outside the UK VAT system. Local indirect tax rules may apply; verify local invoicing requirements.",
        "WARNING",
        "GI"
      )
    );
    return issues;
  },
});
