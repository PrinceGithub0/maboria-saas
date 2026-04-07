import {
  buildDefaultCountryModule,
  createCountryIssue,
  hasValue,
} from "@/lib/invoicing/blueprint/module-factory";

export const kuwaitComplianceModule = buildDefaultCountryModule("KW", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-07",
  evidence: [
    {
      label: "Kuwait Ministry of Finance tax electronic services",
      url: "https://www.mof.gov.kw/TCRS_Public/en",
      reviewedAt: "2026-04-07",
    },
    {
      label: "Kuwait Ministry of Finance tax legislation portal",
      url: "https://www.mof.gov.kw/MOFServices/TaxMultinationalLegislation.aspx",
      reviewedAt: "2026-04-07",
    },
  ],
  extendValidation(issues, document) {
    if (document.lines.some((line) => !hasValue(line.description))) {
      issues.push(
        createCountryIssue(
          "invoice.lines",
          "KW_LINE_DESCRIPTION_REQUIRED",
          "Kuwaiti business invoices should describe the goods or services supplied.",
          "ERROR",
          "KW"
        )
      );
    }
    issues.push(
      createCountryIssue(
        "invoice.taxBreakdown",
        "KW_TAX_REGISTRATION_NOTICE",
        "Confirm whether Kuwait income tax, retention, or other tax-registration obligations apply because Kuwait does not operate a broad VAT regime.",
        "WARNING",
        "KW"
      )
    );
    return issues;
  },
});
