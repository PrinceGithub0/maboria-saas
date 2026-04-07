import {
  buildDefaultCountryModule,
  createCountryIssue,
  hasValue,
} from "@/lib/invoicing/blueprint/module-factory";

export const guineaComplianceModule = buildDefaultCountryModule("GN", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-07",
  evidence: [
    {
      label: "Guinea General Directorate of Taxes",
      url: "https://dgi.gov.gn/",
      reviewedAt: "2026-04-07",
    },
    {
      label: "Guinea eTax rollout notice",
      url: "https://dgi.gov.gn/2020/09/16/portail-etax-guinee-la-direction-nationale-des-impots-au-coeur-du-lancement-preside-par-le-premier-ministre/",
      reviewedAt: "2026-04-07",
    },
  ],
  extendValidation(issues, document) {
    if (document.lines.some((line) => !hasValue(line.description))) {
      issues.push(
        createCountryIssue(
          "invoice.lines",
          "GN_LINE_DESCRIPTION_REQUIRED",
          "Guinea invoices should describe the goods or services supplied.",
          "ERROR",
          "GN"
        )
      );
    }
    if (document.taxBreakdown.length === 0) {
      issues.push(
        createCountryIssue(
          "invoice.taxBreakdown",
          "GN_VAT_BREAKDOWN_REQUIRED",
          "Guinea invoices should show the applicable tax rate and amount.",
          "ERROR",
          "GN"
        )
      );
    }
    return issues;
  },
});
