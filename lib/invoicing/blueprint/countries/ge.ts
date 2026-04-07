import { buildDefaultCountryModule, createCountryIssue, hasValue } from "@/lib/invoicing/blueprint/module-factory";

export const georgiaComplianceModule = buildDefaultCountryModule("GE", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-06",
  evidence: [
    {
      label: "Georgia Revenue Service VAT guidance",
      url: "https://old.rs.ge/en/5245",
      reviewedAt: "2026-04-06",
    },
    {
      label: "Georgia Revenue Service accounting documents portal",
      url: "https://www.rs.ge/LegalEntityAccountingDocuments-en",
      reviewedAt: "2026-04-06",
    },
  ],
  extendRequiredFields(fields) {
    fields.push("supplier.addressLine1", "supplier.city");
    return [...new Set(fields)];
  },
  extendValidation(issues, document) {
    if (document.lines.some((line) => !hasValue(line.description))) {
      issues.push(
        createCountryIssue(
          "invoice.lines",
          "GE_LINE_DESCRIPTION_REQUIRED",
          "Georgian VAT invoices should identify the supplied goods or services.",
          "ERROR",
          "GE"
        )
      );
    }
    return issues;
  },
});
