import {
  buildDefaultCountryModule,
  createCountryIssue,
  hasValue,
} from "@/lib/invoicing/blueprint/module-factory";

export const moroccoComplianceModule = buildDefaultCountryModule("MA", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-07",
  evidence: [
    {
      label: "Morocco General Tax Directorate",
      url: "https://www.tax.gov.ma/wps/portal/DGI/Accueil",
      reviewedAt: "2026-04-07",
    },
    {
      label: "Morocco VAT information",
      url: "https://www.tax.gov.ma/wps/portal/DGI/Particulier/TVA",
      reviewedAt: "2026-04-07",
    },
  ],
  extendValidation(issues, document) {
    if (document.lines.some((line) => !hasValue(line.description))) {
      issues.push(
        createCountryIssue(
          "invoice.lines",
          "MA_LINE_DESCRIPTION_REQUIRED",
          "Morocco invoices should describe the goods or services supplied.",
          "ERROR",
          "MA"
        )
      );
    }
    if (document.taxBreakdown.length === 0) {
      issues.push(
        createCountryIssue(
          "invoice.taxBreakdown",
          "MA_VAT_BREAKDOWN_REQUIRED",
          "Morocco VAT invoices should show the applicable VAT rate and amount.",
          "ERROR",
          "MA"
        )
      );
    }
    return issues;
  },
});
