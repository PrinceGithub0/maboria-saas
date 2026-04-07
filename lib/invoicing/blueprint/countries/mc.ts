import { buildDefaultCountryModule, createCountryIssue, hasValue } from "@/lib/invoicing/blueprint/module-factory";

export const monacoComplianceModule = buildDefaultCountryModule("MC", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-06",
  evidence: [
    {
      label: "Monaco Government: VAT levied on same basis and rate as France",
      url: "https://monentreprise.gouv.mc/en/thematiques/obligations-legales-et-fiscalite/fiscalite/la-taxe-sur-la-valeur-ajoutee-tva/tva",
      reviewedAt: "2026-04-06",
    },
    {
      label: "EU Commission: Monaco treated as territory of France for VAT",
      url: "https://taxation-customs.ec.europa.eu/taxation/vat/vat-directive/how-does-vat-work/territorial-scope_en",
      reviewedAt: "2026-04-06",
    },
  ],
  extendRequiredFields(fields, document) {
    fields.push("supplier.addressLine1");
    fields.push("supplier.postalCode");
    fields.push("supplier.city");
    fields.push("supplier.taxId");
    fields.push("customer.addressLine1");
    fields.push("customer.postalCode");
    fields.push("customer.city");
    if (document.buyerType === "B2B") {
      fields.push("customer.taxId");
    }
    return [...new Set(fields)];
  },
  extendValidation(issues, document) {
    if (document.lines.some((line) => !hasValue(line.description))) {
      issues.push(
        createCountryIssue(
          "invoice.lines",
          "MC_LINE_DESCRIPTION_REQUIRED",
          "Monaco VAT invoices must describe the goods or services supplied.",
          "ERROR",
          "MC"
        )
      );
    }
    if (document.taxBreakdown.length === 0) {
      issues.push(
        createCountryIssue(
          "invoice.taxBreakdown",
          "MC_TAX_BREAKDOWN_REQUIRED",
          "Monaco VAT invoices must show VAT rates and amounts.",
          "ERROR",
          "MC"
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
          "MC_TAX_AMOUNT_REQUIRED",
          "VAT amounts must be shown for each VAT rate on Monaco invoices.",
          "ERROR",
          "MC"
        )
      );
    }
    return issues;
  },
});
