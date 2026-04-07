import { buildDefaultCountryModule, createCountryIssue, hasValue } from "@/lib/invoicing/blueprint/module-factory";

export const arubaComplianceModule = buildDefaultCountryModule("AW", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-06",
  evidence: [
    {
      label: "Aruba Departamento di Impuesto BBO obligations",
      url: "https://www.impuesto.aw/bbo",
      reviewedAt: "2026-04-06",
    },
    {
      label: "Aruba Departamento di Impuesto online filing services",
      url: "https://www.impuesto.aw/boi-online-diensten",
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
          "AW_TAX_ID_REQUIRED",
          "Aruban turnover-tax filings require the supplier tax registration reference.",
          "ERROR",
          "AW"
        )
      );
    }
    if (document.lines.some((line) => !hasValue(line.description))) {
      issues.push(
        createCountryIssue(
          "invoice.lines",
          "AW_LINE_DESCRIPTION_REQUIRED",
          "Aruban invoices should identify the goods or services supplied for BBO/BAZV reporting.",
          "ERROR",
          "AW"
        )
      );
    }
    return issues;
  },
});
