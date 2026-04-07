import { buildDefaultCountryModule, createCountryIssue, hasValue } from "@/lib/invoicing/blueprint/module-factory";

export const polandComplianceModule = buildDefaultCountryModule("PL", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-06",
  evidence: [
    {
      label: "Poland KSeF e-invoicing rollout (government notice)",
      url: "https://www.gov.pl/web/pozytek/krajowy-system-e-faktur-ksef--nadchodza-zmiany-dla-organizacji-pozarzadowych",
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
          "PL_LINE_DESCRIPTION_REQUIRED",
          "Polish invoices must describe the goods or services supplied.",
          "ERROR",
          "PL"
        )
      );
    }
    if (document.taxBreakdown.length === 0) {
      issues.push(
        createCountryIssue(
          "invoice.taxBreakdown",
          "PL_TAX_BREAKDOWN_REQUIRED",
          "Polish VAT invoices must show VAT rates and amounts.",
          "ERROR",
          "PL"
        )
      );
    }
    if (
      document.taxBreakdown.some((item) => !Number.isFinite(item.taxAmount)) ||
      document.taxBreakdown.some((item) => item.taxAmount === null || item.taxAmount === undefined)
    ) {
      issues.push(
        createCountryIssue(
          "invoice.taxBreakdown",
          "PL_TAX_AMOUNT_REQUIRED",
          "VAT amounts must be shown for each VAT rate on Polish invoices.",
          "ERROR",
          "PL"
        )
      );
    }
    return issues;
  },
});
