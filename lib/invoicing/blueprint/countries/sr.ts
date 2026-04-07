import { buildDefaultCountryModule, createCountryIssue, hasValue } from "@/lib/invoicing/blueprint/module-factory";

export const surinameComplianceModule = buildDefaultCountryModule("SR", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-06",
  evidence: [
    {
      label: "Suriname government turnover tax guidance",
      url: "https://gov.sr/thema/omzetbelasting/",
      reviewedAt: "2026-04-06",
    },
    {
      label: "Suriname government VAT implementation notice",
      url: "https://gov.sr/wet-op-de-belasting-over-de-toegevoegde-waarde-btw-goedgekeurd-in-dna-tarief-vastgesteld-op-10/",
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
          "SR_TAX_ID_REQUIRED",
          "Surinamese turnover-tax or VAT invoices should identify the supplier tax registration.",
          "ERROR",
          "SR"
        )
      );
    }
    if (document.lines.some((line) => !hasValue(line.description))) {
      issues.push(
        createCountryIssue(
          "invoice.lines",
          "SR_LINE_DESCRIPTION_REQUIRED",
          "Surinamese tax documents should describe the goods or services supplied.",
          "ERROR",
          "SR"
        )
      );
    }
    return issues;
  },
});
