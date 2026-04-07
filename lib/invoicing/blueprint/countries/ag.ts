import { buildDefaultCountryModule, createCountryIssue, hasValue } from "@/lib/invoicing/blueprint/module-factory";

export const antiguaAndBarbudaComplianceModule = buildDefaultCountryModule("AG", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-06",
  evidence: [
    {
      label: "Antigua and Barbuda Sales Tax registration guide",
      url: "https://ird.gov.ag/wp-content/uploads/2019/09/ABST_Registration_Guide.pdf",
      reviewedAt: "2026-04-06",
    },
    {
      label: "Antigua and Barbuda Sales Tax registration form",
      url: "https://ird.gov.ag/wp-content/uploads/2019/09/ABST_001_Application_for_Registration.pdf",
      reviewedAt: "2026-04-06",
    },
  ],
  extendRequiredFields(fields) {
    fields.push("supplier.addressLine1", "supplier.city");
    return [...new Set(fields)];
  },
  extendValidation(issues, document) {
    if (!hasValue(document.supplier.taxId)) {
      issues.push(
        createCountryIssue(
          "supplier.taxId",
          "AG_ABST_ID_REQUIRED",
          "Antigua and Barbuda sales tax invoices should reference the supplier tax identification number.",
          "ERROR",
          "AG"
        )
      );
    }
    if (document.lines.some((line) => !hasValue(line.description))) {
      issues.push(
        createCountryIssue(
          "invoice.lines",
          "AG_LINE_DESCRIPTION_REQUIRED",
          "Antigua and Barbuda sales tax records should describe the goods or services supplied.",
          "ERROR",
          "AG"
        )
      );
    }
    return issues;
  },
});
