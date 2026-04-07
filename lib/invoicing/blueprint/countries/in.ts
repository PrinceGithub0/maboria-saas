import { buildDefaultCountryModule, createCountryIssue, hasValue } from "@/lib/invoicing/blueprint/module-factory";

export const indiaComplianceModule = buildDefaultCountryModule("IN", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-06",
  evidence: [
    {
      label: "CBIC Notification 10/2023-Central Tax (e-invoicing threshold 5 Cr from 1 Aug 2023)",
      url: "https://einvoice6.gst.gov.in/content/wp-content/uploads/2023/05/GST-notification-10-central-tax-english-2023.pdf",
      reviewedAt: "2026-04-06",
    },
    {
      label: "GSTN e-invoice overview and threshold guidance",
      url: "https://tutorial.gst.gov.in/downloads/news/e_invoice_overview.pdf",
      reviewedAt: "2026-04-06",
    },
  ],
  extendRequiredFields(fields) {
    fields.push("supplier.addressLine1");
    fields.push("supplier.postalCode");
    fields.push("supplier.city");
    fields.push("customer.addressLine1");
    fields.push("customer.postalCode");
    fields.push("customer.city");
    return [...new Set(fields)];
  },
  extendValidation(issues, document) {
    if (document.lines.some((line) => !hasValue(line.description))) {
      issues.push(
        createCountryIssue(
          "invoice.lines",
          "IN_LINE_DESCRIPTION_REQUIRED",
          "Indian invoices must describe the goods or services supplied.",
          "ERROR",
          "IN"
        )
      );
    }
    issues.push(
      createCountryIssue(
        "invoice.deliveryModes",
        "IN_EINVOICE_THRESHOLD_CHECK",
        "India e-invoicing applies based on turnover thresholds; confirm if IRN generation is required for this seller.",
        "INFO",
        "IN"
      )
    );
    return issues;
  },
});
