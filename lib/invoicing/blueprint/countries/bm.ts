import {
  buildDefaultCountryModule,
  createCountryIssue,
  hasValue,
} from "@/lib/invoicing/blueprint/module-factory";

export const bermudaComplianceModule = buildDefaultCountryModule("BM", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-07",
  evidence: [
    {
      label: "Government of Bermuda tax overview",
      url: "https://www.gov.bm/types-taxes-bermuda",
      reviewedAt: "2026-04-07",
    },
    {
      label: "Government of Bermuda customs payment guidance",
      url: "https://www.gov.bm/how-make-payments-customs",
      reviewedAt: "2026-04-07",
    },
  ],
  extendValidation(issues, document) {
    if (document.lines.some((line) => !hasValue(line.description))) {
      issues.push(
        createCountryIssue(
          "invoice.lines",
          "BM_LINE_DESCRIPTION_REQUIRED",
          "Bermuda commercial invoices should describe the goods or services supplied.",
          "ERROR",
          "BM"
        )
      );
    }
    issues.push(
      createCountryIssue(
        "invoice.supportingDocuments",
        "BM_CUSTOMS_INVOICE_SUPPORT",
        "Provide a copy of the invoice where customs duty or other Bermuda import charges are being paid.",
        "WARNING",
        "BM"
      )
    );
    return issues;
  },
});
