import { buildDefaultCountryModule, createCountryIssue, hasValue } from "@/lib/invoicing/blueprint/module-factory";

export const cambodiaComplianceModule = buildDefaultCountryModule("KH", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-06",
  evidence: [
    {
      label: "Cambodia General Department of Taxation e-services",
      url: "https://www.tax.gov.kh/en/e-service",
      reviewedAt: "2026-04-06",
    },
    {
      label: "Cambodia General Department of Taxation official portal",
      url: "https://www.tax.gov.kh/en/",
      reviewedAt: "2026-04-06",
    },
  ],
  extendRequiredFields(fields) {
    fields.push("supplier.addressLine1");
    fields.push("supplier.city");
    fields.push("customer.legalName");
    return [...new Set(fields)];
  },
  extendValidation(issues, document) {
    if (!hasValue(document.supplier.taxId || document.supplier.vatId)) {
      issues.push(
        createCountryIssue(
          "supplier.taxId",
          "KH_TAX_ID_REQUIRED",
          "Cambodian tax invoices should capture the supplier tax registration identifier.",
          "ERROR",
          "KH"
        )
      );
    }
    if (document.lines.some((line) => !hasValue(line.description))) {
      issues.push(
        createCountryIssue(
          "invoice.lines",
          "KH_LINE_DESCRIPTION_REQUIRED",
          "Cambodian invoices should describe the goods or services supplied.",
          "ERROR",
          "KH"
        )
      );
    }
    return issues;
  },
});
