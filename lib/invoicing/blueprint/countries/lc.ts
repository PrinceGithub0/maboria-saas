import { buildDefaultCountryModule, createCountryIssue, hasValue } from "@/lib/invoicing/blueprint/module-factory";

export const saintLuciaComplianceModule = buildDefaultCountryModule("LC", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-06",
  evidence: [
    {
      label: "Saint Lucia VAT FAQ",
      url: "https://ird.gov.lc/index.php/component/content/article/33-faqs-vat/65-faqs-vat?Itemid=101",
      reviewedAt: "2026-04-06",
    },
    {
      label: "Saint Lucia VAT registration guidance",
      url: "https://ird.gov.lc/index.php/vat/69-when-to-register-for-vat",
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
          "LC_VAT_ID_REQUIRED",
          "Saint Lucia VAT invoices should identify the registered supplier.",
          "ERROR",
          "LC"
        )
      );
    }
    if (document.lines.some((line) => !hasValue(line.description))) {
      issues.push(
        createCountryIssue(
          "invoice.lines",
          "LC_LINE_DESCRIPTION_REQUIRED",
          "Saint Lucia VAT invoices should describe the supplied goods or services.",
          "ERROR",
          "LC"
        )
      );
    }
    return issues;
  },
});
