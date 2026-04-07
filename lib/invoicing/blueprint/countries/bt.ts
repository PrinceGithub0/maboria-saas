import {
  buildDefaultCountryModule,
  createCountryIssue,
  hasValue,
} from "@/lib/invoicing/blueprint/module-factory";

export const bhutanComplianceModule = buildDefaultCountryModule("BT", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-07",
  evidence: [
    {
      label: "Bhutan Ministry of Finance",
      url: "https://www.mof.gov.bt/",
      reviewedAt: "2026-04-07",
    },
    {
      label: "Bhutan Department of Revenue and Customs",
      url: "https://www.drc.gov.bt/",
      reviewedAt: "2026-04-07",
    },
  ],
  extendValidation(issues, document) {
    if (document.lines.some((line) => !hasValue(line.description))) {
      issues.push(
        createCountryIssue(
          "invoice.lines",
          "BT_LINE_DESCRIPTION_REQUIRED",
          "Bhutan invoices should describe the goods or services supplied.",
          "ERROR",
          "BT"
        )
      );
    }
    issues.push(
      createCountryIssue(
        "invoice.supportingDocuments",
        "BT_BST_SUPPORT_NOTICE",
        "Retain Bhutan Sales Tax, customs, or service-tax support where the transaction falls within those regimes.",
        "WARNING",
        "BT"
      )
    );
    return issues;
  },
});
