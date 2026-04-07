import {
  buildDefaultCountryModule,
  createCountryIssue,
  hasValue,
} from "@/lib/invoicing/blueprint/module-factory";

export const svalbardAndJanMayenComplianceModule = buildDefaultCountryModule("SJ", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-07",
  evidence: [
    {
      label: "Svalbard tax office",
      url: "https://www.skatteetaten.no/en/contact/offices/taxoffice/nord-norge/svalbard/",
      reviewedAt: "2026-04-07",
    },
    {
      label: "Svalbard tax rates",
      url: "https://www.skatteetaten.no/en/Rates/Tax-rates-on-Svalbard/",
      reviewedAt: "2026-04-07",
    },
  ],
  extendValidation(issues, document) {
    if (document.lines.some((line) => !hasValue(line.description))) {
      issues.push(
        createCountryIssue(
          "invoice.lines",
          "SJ_LINE_DESCRIPTION_REQUIRED",
          "Svalbard and Jan Mayen invoices should describe the goods or services supplied.",
          "ERROR",
          "SJ"
        )
      );
    }
    issues.push(
      createCountryIssue(
        "invoice.taxBreakdown",
        "SJ_SPECIAL_TAX_NOTICE",
        "Confirm whether the transaction is subject to the special Svalbard tax rules rather than mainland Norwegian tax treatment.",
        "WARNING",
        "SJ"
      )
    );
    return issues;
  },
});
