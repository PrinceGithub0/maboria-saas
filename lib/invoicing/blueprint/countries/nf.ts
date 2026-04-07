import {
  buildDefaultCountryModule,
  createCountryIssue,
  hasValue,
} from "@/lib/invoicing/blueprint/module-factory";

export const norfolkIslandComplianceModule = buildDefaultCountryModule("NF", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-07",
  evidence: [
    {
      label: "ATO Norfolk Island guidance",
      url: "https://www.ato.gov.au/norfolk-island",
      reviewedAt: "2026-04-07",
    },
    {
      label: "ATO Norfolk Island GST transactions with mainland Australia",
      url: "https://www.ato.gov.au/norfolk-island/tax-for-businesses/gst-transactions-with-mainland-australia",
      reviewedAt: "2026-04-07",
    },
  ],
  extendValidation(issues, document) {
    if (document.lines.some((line) => !hasValue(line.description))) {
      issues.push(
        createCountryIssue(
          "invoice.lines",
          "NF_LINE_DESCRIPTION_REQUIRED",
          "Norfolk Island invoices should describe the goods or services supplied.",
          "ERROR",
          "NF"
        )
      );
    }
    issues.push(
      createCountryIssue(
        "invoice.taxBreakdown",
        "NF_GST_SCOPE_NOTICE",
        "Confirm whether the supply is on Norfolk Island, where GST does not apply, or connected to mainland Australia where GST consequences may arise.",
        "WARNING",
        "NF"
      )
    );
    return issues;
  },
});
