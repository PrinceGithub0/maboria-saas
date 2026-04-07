import {
  buildDefaultCountryModule,
  createCountryIssue,
  hasValue,
} from "@/lib/invoicing/blueprint/module-factory";

export const bruneiComplianceModule = buildDefaultCountryModule("BN", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-07",
  evidence: [
    {
      label: "Brunei Ministry of Finance and Economy Revenue Division",
      url: "https://www.mofe.gov.bn/div_revenue_aboutus/",
      reviewedAt: "2026-04-07",
    },
  ],
  extendValidation(issues, document) {
    if (document.lines.some((line) => !hasValue(line.description))) {
      issues.push(
        createCountryIssue(
          "invoice.lines",
          "BN_LINE_DESCRIPTION_REQUIRED",
          "Brunei business invoices should describe the goods or services supplied.",
          "ERROR",
          "BN"
        )
      );
    }
    issues.push(
      createCountryIssue(
        "invoice.taxBreakdown",
        "BN_TAX_TREATMENT_NOTICE",
        "Confirm whether Brunei income tax, withholding, or customs duties apply because Brunei does not operate a broad VAT regime.",
        "WARNING",
        "BN"
      )
    );
    return issues;
  },
});
