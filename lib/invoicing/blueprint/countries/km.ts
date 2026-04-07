import {
  buildDefaultCountryModule,
  createCountryIssue,
  hasValue,
} from "@/lib/invoicing/blueprint/module-factory";

export const comorosComplianceModule = buildDefaultCountryModule("KM", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-07",
  evidence: [
    {
      label: "Comoros Ministry of Finance",
      url: "https://finances.gouv.km/",
      reviewedAt: "2026-04-07",
    },
    {
      label: "Comoros Code general des impots 2023",
      url: "https://justice.gouv.km/texte/code-general-des-impots-2023/",
      reviewedAt: "2026-04-07",
    },
  ],
  extendValidation(issues, document) {
    if (document.lines.some((line) => !hasValue(line.description))) {
      issues.push(
        createCountryIssue(
          "invoice.lines",
          "KM_LINE_DESCRIPTION_REQUIRED",
          "Comoros invoices should describe the goods or services supplied.",
          "ERROR",
          "KM"
        )
      );
    }
    if (document.taxBreakdown.length === 0) {
      issues.push(
        createCountryIssue(
          "invoice.taxBreakdown",
          "KM_TAX_BREAKDOWN_REQUIRED",
          "Comoros invoices should show the applicable tax rate and amount.",
          "ERROR",
          "KM"
        )
      );
    }
    return issues;
  },
});
