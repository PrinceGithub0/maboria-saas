import {
  buildDefaultCountryModule,
  createCountryIssue,
  hasValue,
} from "@/lib/invoicing/blueprint/module-factory";

export const kiribatiComplianceModule = buildDefaultCountryModule("KI", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-07",
  evidence: [
    {
      label: "Kiribati Tax VAT guidance",
      url: "https://tax.gov.ki/vat/",
      reviewedAt: "2026-04-07",
    },
    {
      label: "Kiribati Tax services guidance",
      url: "https://tax.gov.ki/our-services/",
      reviewedAt: "2026-04-07",
    },
  ],
  extendValidation(issues, document) {
    if (document.lines.some((line) => !hasValue(line.description))) {
      issues.push(
        createCountryIssue(
          "invoice.lines",
          "KI_LINE_DESCRIPTION_REQUIRED",
          "Kiribati business invoices should describe the goods or services supplied.",
          "ERROR",
          "KI"
        )
      );
    }
    issues.push(
      createCountryIssue(
        "invoice.supportingDocuments",
        "KI_IMPORT_SUPPORTING_DOCS",
        "For customs release in Kiribati, keep the invoice and bill of lading available with the taxpayer record.",
        "WARNING",
        "KI"
      )
    );
    return issues;
  },
});
