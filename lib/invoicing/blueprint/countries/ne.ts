import {
  buildDefaultCountryModule,
  createCountryIssue,
  hasValue,
} from "@/lib/invoicing/blueprint/module-factory";

export const nigerComplianceModule = buildDefaultCountryModule("NE", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-07",
  evidence: [
    {
      label: "Niger tax directorate",
      url: "https://impots.gouv.ne/",
      reviewedAt: "2026-04-07",
    },
    {
      label: "Niger certified invoice system guidance",
      url: "https://impots.gouv.ne/",
      reviewedAt: "2026-04-07",
    },
  ],
  extendValidation(issues, document) {
    if (document.lines.some((line) => !hasValue(line.description))) {
      issues.push(
        createCountryIssue(
          "invoice.lines",
          "NE_LINE_DESCRIPTION_REQUIRED",
          "Niger invoices should describe the goods or services supplied.",
          "ERROR",
          "NE"
        )
      );
    }
    if (document.taxBreakdown.length === 0) {
      issues.push(
        createCountryIssue(
          "invoice.taxBreakdown",
          "NE_VAT_BREAKDOWN_REQUIRED",
          "Niger invoices should show the applicable VAT rate and amount.",
          "ERROR",
          "NE"
        )
      );
    }
    issues.push(
      createCountryIssue(
        "invoice.supportingDocuments",
        "NE_CERTIFIED_INVOICE_NOTICE",
        "Confirm whether the transaction must use a certified invoice workflow under Niger tax administration rules.",
        "WARNING",
        "NE"
      )
    );
    return issues;
  },
});
