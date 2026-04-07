import {
  buildDefaultCountryModule,
  createCountryIssue,
  hasValue,
} from "@/lib/invoicing/blueprint/module-factory";

export const burkinaFasoComplianceModule = buildDefaultCountryModule("BF", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-07",
  evidence: [
    {
      label: "Burkina Faso normalized invoice guidance",
      url: "https://www.impots.gov.bf/facture-normalisee/",
      reviewedAt: "2026-04-07",
    },
    {
      label: "Burkina Faso new tax measures",
      url: "https://www.finances.gov.bf/forum/detail-actualites?cHash=a148dfec5b753054d566775c37bf1071&tx_news_pi1%5Baction%5D=detail&tx_news_pi1%5Bcontroller%5D=news&tx_news_pi1%5Bnews%5D=658",
      reviewedAt: "2026-04-07",
    },
  ],
  extendValidation(issues, document) {
    if (document.lines.some((line) => !hasValue(line.description))) {
      issues.push(
        createCountryIssue(
          "invoice.lines",
          "BF_LINE_DESCRIPTION_REQUIRED",
          "Burkina Faso invoices should describe the goods or services supplied.",
          "ERROR",
          "BF"
        )
      );
    }
    if (document.taxBreakdown.length === 0) {
      issues.push(
        createCountryIssue(
          "invoice.taxBreakdown",
          "BF_VAT_BREAKDOWN_REQUIRED",
          "Burkina Faso invoices should show the applicable tax rate and amount.",
          "ERROR",
          "BF"
        )
      );
    }
    return issues;
  },
});
