import {
  buildDefaultCountryModule,
  createCountryIssue,
  hasValue,
} from "@/lib/invoicing/blueprint/module-factory";

export const centralAfricanRepublicComplianceModule = buildDefaultCountryModule("CF", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-07",
  evidence: [
    {
      label: "Central African Republic Ministry of Finance and Budget",
      url: "https://www.finances.gouv.cf/",
      reviewedAt: "2026-04-07",
    },
    {
      label: "Central African Republic finance user services",
      url: "https://www.finances.gouv.cf/projet/47/services-aux-usagers",
      reviewedAt: "2026-04-07",
    },
  ],
  extendValidation(issues, document) {
    if (document.lines.some((line) => !hasValue(line.description))) {
      issues.push(
        createCountryIssue(
          "invoice.lines",
          "CF_LINE_DESCRIPTION_REQUIRED",
          "Central African Republic invoices should describe the goods or services supplied.",
          "ERROR",
          "CF"
        )
      );
    }
    if (document.taxBreakdown.length === 0) {
      issues.push(
        createCountryIssue(
          "invoice.taxBreakdown",
          "CF_TAX_BREAKDOWN_REQUIRED",
          "Central African Republic invoices should show the applicable tax rate and amount.",
          "ERROR",
          "CF"
        )
      );
    }
    return issues;
  },
});
