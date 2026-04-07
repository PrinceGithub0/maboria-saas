import { buildDefaultCountryModule, createCountryIssue, hasValue } from "@/lib/invoicing/blueprint/module-factory";

export const unitedKingdomComplianceModule = buildDefaultCountryModule("GB", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-06",
  evidence: [
    {
      label: "HMRC VAT Notice 700: VAT invoice requirements",
      url: "https://www.gov.uk/government/publications/vat-notice-700-the-vat-guide",
      reviewedAt: "2026-04-06",
    },
    {
      label: "HMRC VAT rates (standard/reduced/zero)",
      url: "https://www.gov.uk/vat-rates",
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
    const allowedRates = new Set([0, 5, 20]);

    if (
      document.countryContext.buyerCountryCode === "GB" &&
      document.countryContext.sellerCountryCode === "GB" &&
      !hasValue(document.supplier.registrationNumber)
    ) {
      issues.push(
        createCountryIssue(
          "supplier.registrationNumber",
          "GB_COMPANY_NUMBER_RECOMMENDED",
          "UK invoices are stronger when the supplier company registration number is captured.",
          "WARNING",
          "GB"
        )
      );
    }
    if (document.lines.some((line) => !hasValue(line.description))) {
      issues.push(
        createCountryIssue(
          "invoice.lines",
          "GB_LINE_DESCRIPTION_REQUIRED",
          "UK VAT invoices must describe the goods or services supplied.",
          "ERROR",
          "GB"
        )
      );
    }
    if (document.taxBreakdown.length === 0) {
      issues.push(
        createCountryIssue(
          "invoice.taxBreakdown",
          "GB_TAX_BREAKDOWN_REQUIRED",
          "UK VAT invoices must show VAT rates and amounts.",
          "ERROR",
          "GB"
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
          "GB_TAX_AMOUNT_REQUIRED",
          "VAT amounts must be shown for each VAT rate on UK VAT invoices.",
          "ERROR",
          "GB"
        )
      );
    }
    if (
      document.taxBreakdown.some(
        (item) =>
          Number(item.taxAmount || 0) > 0 &&
          (item.taxRate === null || item.taxRate === undefined || Number.isNaN(item.taxRate))
      )
    ) {
      issues.push(
        createCountryIssue(
          "invoice.taxBreakdown",
          "GB_TAX_RATE_REQUIRED",
          "UK VAT invoices should show the VAT rate applied to each taxable amount.",
          "WARNING",
          "GB"
        )
      );
    }
    if (
      document.taxBreakdown.some(
        (item) =>
          item.taxRate !== null &&
          item.taxRate !== undefined &&
          !Number.isNaN(item.taxRate) &&
          !allowedRates.has(Number(item.taxRate))
      )
    ) {
      issues.push(
        createCountryIssue(
          "invoice.taxBreakdown",
          "GB_TAX_RATE_INVALID",
          "UK VAT invoices must use 20% standard or 5% reduced VAT rates (or 0% where applicable).",
          "ERROR",
          "GB"
        )
      );
    }
    if (
      document.taxBreakdown.some(
        (item) =>
          Number(item.taxRate || 0) === 0 &&
          Number(item.taxAmount || 0) === 0 &&
          !hasValue(item.exemptionReason)
      )
    ) {
      issues.push(
        createCountryIssue(
          "invoice.taxBreakdown",
          "GB_ZERO_RATE_REASON_RECOMMENDED",
          "Zero-rated VAT lines should include the exemption or reverse-charge reference.",
          "WARNING",
          "GB"
        )
      );
    }
    const supplyDate = (document.metadata as any)?.supplyDate;
    if (supplyDate) {
      const parsedSupplyDate = new Date(String(supplyDate));
      if (Number.isNaN(parsedSupplyDate.getTime())) {
        issues.push(
          createCountryIssue(
            "invoice.supplyDate",
            "GB_SUPPLY_DATE_INVALID",
            "Supply date must be a valid date when provided.",
            "WARNING",
            "GB"
          )
        );
      }
    } else {
      issues.push(
        createCountryIssue(
          "invoice.supplyDate",
          "GB_SUPPLY_DATE_RECOMMENDED",
          "Supply date should be stated when it differs from the invoice issue date.",
          "INFO",
          "GB"
        )
      );
    }
    if (document.complianceSnapshot?.reverseChargeApplies) {
      const hasReverseChargeReason = document.taxBreakdown.some((item) => hasValue(item.exemptionReason));
      if (!hasReverseChargeReason) {
        issues.push(
          createCountryIssue(
            "invoice.taxBreakdown",
            "GB_REVERSE_CHARGE_REFERENCE_REQUIRED",
            "Reverse-charge invoices should include the applicable legal reference.",
            "WARNING",
            "GB"
          )
        );
      }
    }
    return issues;
  },
});
