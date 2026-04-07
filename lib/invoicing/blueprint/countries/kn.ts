import { buildDefaultCountryModule, createCountryIssue, hasValue } from "@/lib/invoicing/blueprint/module-factory";

export const saintKittsAndNevisComplianceModule = buildDefaultCountryModule("KN", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-06",
  evidence: [
    {
      label: "St. Kitts and Nevis Inland Revenue VAT overview",
      url: "https://www.sknird.com/TOR/Default.aspx",
      reviewedAt: "2026-04-06",
    },
    {
      label: "St. Kitts and Nevis VAT introduction guide",
      url: "https://www.sknird.com/wp-content/uploads/2020/09/IRD-VAT-VAT-Introduction.pdf",
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
          "KN_VAT_ID_REQUIRED",
          "St. Kitts and Nevis VAT invoices should identify the registered supplier.",
          "ERROR",
          "KN"
        )
      );
    }
    if (document.lines.some((line) => !hasValue(line.description))) {
      issues.push(
        createCountryIssue(
          "invoice.lines",
          "KN_LINE_DESCRIPTION_REQUIRED",
          "St. Kitts and Nevis VAT invoices should describe the supplied goods or services.",
          "ERROR",
          "KN"
        )
      );
    }
    return issues;
  },
});
