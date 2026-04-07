import { buildDefaultCountryModule, createCountryIssue, hasValue } from "@/lib/invoicing/blueprint/module-factory";

export const canadaComplianceModule = buildDefaultCountryModule("CA", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-06",
  evidence: [
    {
      label: "CRA GST/HST receipts and invoices - required information",
      url: "https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/gst-hst-businesses/charge-collect-receipts-invoices.html",
      reviewedAt: "2026-04-06",
    },
    {
      label: "CRA GST/HST invoice information for ITC claims (News 106)",
      url: "https://www.canada.ca/en/revenue-agency/services/forms-publications/publications/news106/news106-excise-gst-hst-news-no-106-may-2019.html",
      reviewedAt: "2026-04-06",
    },
  ],
  extendRequiredFields(fields) {
    fields.push("supplier.addressLine1");
    fields.push("supplier.postalCode");
    fields.push("supplier.city");
    fields.push("customer.legalName");
    return [...new Set(fields)];
  },
  extendValidation(issues, document) {
    if (document.lines.some((line) => !hasValue(line.description))) {
      issues.push(
        createCountryIssue(
          "invoice.lines",
          "CA_LINE_DESCRIPTION_REQUIRED",
          "Canadian invoices should describe the goods or services supplied.",
          "ERROR",
          "CA"
        )
      );
    }
    if (document.taxBreakdown.length === 0) {
      issues.push(
        createCountryIssue(
          "invoice.taxBreakdown",
          "CA_TAX_BREAKDOWN_REQUIRED",
          "Canadian GST/HST invoices must show the tax rate and tax amount (or tax-included statement).",
          "ERROR",
          "CA"
        )
      );
    }
    return issues;
  },
});
