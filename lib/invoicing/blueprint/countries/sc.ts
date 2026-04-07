import { buildDefaultCountryModule, createCountryIssue, hasValue } from "@/lib/invoicing/blueprint/module-factory";

export const seychellesComplianceModule = buildDefaultCountryModule("SC", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-06",
  evidence: [
    {
      label: "Seychelles Revenue Commission tax system guidance",
      url: "https://src.gov.sc/seychelles-tax-system/",
      reviewedAt: "2026-04-06",
    },
    {
      label: "Seychelles customs and VAT guidance",
      url: "https://src.gov.sc/customs-and-excises/",
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
          "SC_LINE_DESCRIPTION_REQUIRED",
          "Seychelles VAT invoices should describe the supplied goods or services.",
          "ERROR",
          "SC"
        )
      );
    }
    return issues;
  },
});
