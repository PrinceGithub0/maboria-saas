import { buildDefaultCountryModule, createCountryIssue, hasValue } from "@/lib/invoicing/blueprint/module-factory";

export const australiaComplianceModule = buildDefaultCountryModule("AU", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-06",
  evidence: [
    {
      label: "ATO GST tax invoice requirements (mandatory information)",
      url: "https://www.ato.gov.au/businesses-and-organisations/gst-excise-and-indirect-taxes/gst/tax-invoices",
      reviewedAt: "2026-04-06",
    },
    {
      label: "ATO tax invoice details and GST rounding/eInvoicing guidance",
      url: "https://www.ato.gov.au/Business/GST/Tax-invoices/",
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
          "AU_LINE_DESCRIPTION_REQUIRED",
          "Australian tax invoices must describe the goods or services supplied.",
          "ERROR",
          "AU"
        )
      );
    }
    if (document.taxBreakdown.length === 0) {
      issues.push(
        createCountryIssue(
          "invoice.taxBreakdown",
          "AU_TAX_BREAKDOWN_REQUIRED",
          "Australian tax invoices must show the GST amount payable (or include a GST-included statement).",
          "ERROR",
          "AU"
        )
      );
    }
    return issues;
  },
});
