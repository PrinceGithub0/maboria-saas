import {
  buildDefaultCountryModule,
  createCountryIssue,
  hasValue,
} from "@/lib/invoicing/blueprint/module-factory";

export const caymanIslandsComplianceModule = buildDefaultCountryModule("KY", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-07",
  evidence: [
    {
      label: "Cayman Islands Customs and Border Control service",
      url: "https://gov.ky/en/web/cbc",
      reviewedAt: "2026-04-07",
    },
    {
      label: "Cayman Islands import regulations",
      url: "https://www.gov.ky/cbc/trade/imports/regulations",
      reviewedAt: "2026-04-07",
    },
  ],
  extendValidation(issues, document) {
    if (document.lines.some((line) => !hasValue(line.description))) {
      issues.push(
        createCountryIssue(
          "invoice.lines",
          "KY_LINE_DESCRIPTION_REQUIRED",
          "Cayman Islands commercial invoices should describe the goods or services supplied.",
          "ERROR",
          "KY"
        )
      );
    }
    issues.push(
      createCountryIssue(
        "invoice.supportingDocuments",
        "KY_IMPORT_DECLARATION_NOTICE",
        "Keep the invoice ready for Cayman Islands customs declarations and import duty assessment where goods are imported.",
        "WARNING",
        "KY"
      )
    );
    return issues;
  },
});
