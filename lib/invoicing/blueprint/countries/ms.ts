import {
  buildDefaultCountryModule,
  createCountryIssue,
  hasValue,
} from "@/lib/invoicing/blueprint/module-factory";

export const montserratComplianceModule = buildDefaultCountryModule("MS", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-07",
  evidence: [
    {
      label: "Montserrat Customs and Revenue Service inland revenue",
      url: "https://mcrs.gov.ms/inland-revenue/",
      reviewedAt: "2026-04-07",
    },
    {
      label: "Montserrat inland revenue forms",
      url: "https://mcrs.gov.ms/ird-forms/",
      reviewedAt: "2026-04-07",
    },
  ],
  extendValidation(issues, document) {
    if (document.lines.some((line) => !hasValue(line.description))) {
      issues.push(
        createCountryIssue(
          "invoice.lines",
          "MS_LINE_DESCRIPTION_REQUIRED",
          "Montserrat invoices should describe the goods or services supplied.",
          "ERROR",
          "MS"
        )
      );
    }
    issues.push(
      createCountryIssue(
        "invoice.taxBreakdown",
        "MS_DIRECT_TAX_NOTICE",
        "Confirm Montserrat direct-tax, withholding, and customs treatment because the jurisdiction does not operate a broad VAT regime.",
        "WARNING",
        "MS"
      )
    );
    return issues;
  },
});
