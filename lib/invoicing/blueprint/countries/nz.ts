import { buildDefaultCountryModule, createCountryIssue, hasValue } from "@/lib/invoicing/blueprint/module-factory";

export const newZealandComplianceModule = buildDefaultCountryModule("NZ", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-06",
  evidence: [
    {
      label: "IRD taxable supply information requirements (GST invoicing)",
      url: "https://www.ird.govt.nz/gst/gst-for-businesses/taxable-supplies",
      reviewedAt: "2026-04-06",
    },
    {
      label: "IRD GST record-keeping and invoice details",
      url: "https://www.ird.govt.nz/gst/gst-for-businesses/gst-record-keeping",
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
          "NZ_LINE_DESCRIPTION_REQUIRED",
          "New Zealand taxable supply information must describe the goods or services supplied.",
          "ERROR",
          "NZ"
        )
      );
    }
    if (document.taxBreakdown.length === 0) {
      issues.push(
        createCountryIssue(
          "invoice.taxBreakdown",
          "NZ_TAX_BREAKDOWN_REQUIRED",
          "New Zealand invoices must show GST or indicate GST-inclusive amounts where required.",
          "ERROR",
          "NZ"
        )
      );
    }
    return issues;
  },
});
