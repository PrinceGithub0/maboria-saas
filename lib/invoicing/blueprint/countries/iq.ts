import {
  buildDefaultCountryModule,
  createCountryIssue,
  hasValue,
} from "@/lib/invoicing/blueprint/module-factory";

export const iraqComplianceModule = buildDefaultCountryModule("IQ", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-07",
  evidence: [
    {
      label: "Iraq General Tax Authority",
      url: "https://www.mof.gov.iq/en/General-Tax-Authority.aspx",
      reviewedAt: "2026-04-07",
    },
    {
      label: "Iraq General Commission of Taxes contact and guidance",
      url: "https://tax.mof.gov.iq/contact-us/",
      reviewedAt: "2026-04-07",
    },
  ],
  extendValidation(issues, document) {
    if (document.lines.some((line) => !hasValue(line.description))) {
      issues.push(
        createCountryIssue(
          "invoice.lines",
          "IQ_LINE_DESCRIPTION_REQUIRED",
          "Iraq invoices should describe the goods or services supplied.",
          "ERROR",
          "IQ"
        )
      );
    }
    issues.push(
      createCountryIssue(
        "invoice.taxBreakdown",
        "IQ_TAX_CLASSIFICATION_NOTICE",
        "Confirm the applicable Iraq tax treatment, including income-tax withholding, customs, or sector-specific sales tax obligations where relevant.",
        "WARNING",
        "IQ"
      )
    );
    return issues;
  },
});
