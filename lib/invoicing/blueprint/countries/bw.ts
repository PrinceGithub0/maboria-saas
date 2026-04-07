import { buildDefaultCountryModule, createCountryIssue, hasValue } from "@/lib/invoicing/blueprint/module-factory";

export const botswanaComplianceModule = buildDefaultCountryModule("BW", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-06",
  evidence: [
    {
      label: "Botswana BURS VAT guidance",
      url: "https://www.burs.org.bw/index.php/tax/value-added-tax",
      reviewedAt: "2026-04-06",
    },
    {
      label: "Botswana BURS VAT FAQ",
      url: "https://www.burs.org.bw/index.php/about-us/faq/tax-faq/vat-faq",
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
    if (document.taxBreakdown.length === 0) {
      issues.push(
        createCountryIssue(
          "invoice.taxBreakdown",
          "BW_TAX_BREAKDOWN_REQUIRED",
          "Botswana VAT invoices should show the VAT amount charged.",
          "ERROR",
          "BW"
        )
      );
    }
    return issues;
  },
});
