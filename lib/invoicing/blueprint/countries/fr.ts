import { buildDefaultCountryModule, createCountryIssue, hasValue } from "@/lib/invoicing/blueprint/module-factory";

export const franceComplianceModule = buildDefaultCountryModule("FR", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-06",
  evidence: [
    {
      label: "France e-invoicing rollout (DGFiP calendar)",
      url: "https://www.economie.gouv.fr/cedef/facturation-electronique-entreprises",
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
          "FR_LINE_DESCRIPTION_REQUIRED",
          "French invoices must describe the goods or services supplied.",
          "ERROR",
          "FR"
        )
      );
    }
    if (document.taxBreakdown.length === 0) {
      issues.push(
        createCountryIssue(
          "invoice.taxBreakdown",
          "FR_TAX_BREAKDOWN_REQUIRED",
          "French VAT invoices must show VAT rates and amounts.",
          "ERROR",
          "FR"
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
          "FR_TAX_AMOUNT_REQUIRED",
          "VAT amounts must be shown for each VAT rate on French invoices.",
          "ERROR",
          "FR"
        )
      );
    }
    return issues;
  },
});
