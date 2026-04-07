import {
  buildDefaultCountryModule,
  createCountryIssue,
  hasValue,
} from "@/lib/invoicing/blueprint/module-factory";

export const congoBrazzavilleComplianceModule = buildDefaultCountryModule("CG", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-07",
  evidence: [
    {
      label: "Republic of Congo official tax portal",
      url: "https://www.impots.gouv.cg/portail-client-web/",
      reviewedAt: "2026-04-07",
    },
    {
      label: "Republic of Congo taxpayer portal FAQ",
      url: "https://www.impots.gouv.cg/portail-client-web/public/ui/faq.xhtml",
      reviewedAt: "2026-04-07",
    },
  ],
  extendValidation(issues, document) {
    if (document.lines.some((line) => !hasValue(line.description))) {
      issues.push(
        createCountryIssue(
          "invoice.lines",
          "CG_LINE_DESCRIPTION_REQUIRED",
          "Republic of Congo invoices should describe the goods or services supplied.",
          "ERROR",
          "CG"
        )
      );
    }
    if (document.taxBreakdown.length === 0) {
      issues.push(
        createCountryIssue(
          "invoice.taxBreakdown",
          "CG_TAX_BREAKDOWN_REQUIRED",
          "Republic of Congo invoices should show the applicable tax rate and amount.",
          "ERROR",
          "CG"
        )
      );
    }
    return issues;
  },
});
