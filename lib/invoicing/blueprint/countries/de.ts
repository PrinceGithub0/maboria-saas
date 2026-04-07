import { buildDefaultCountryModule, createCountryIssue, hasValue } from "@/lib/invoicing/blueprint/module-factory";

export const germanyComplianceModule = buildDefaultCountryModule("DE", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-06",
  evidence: [
    {
      label: "Germany UStG §14 invoice content requirements",
      url: "https://www.gesetze-im-internet.de/ustg_1980/__14.html",
      reviewedAt: "2026-04-06",
    },
    {
      label: "Germany UStG §14a special cases incl. reverse-charge wording",
      url: "https://www.gesetze-im-internet.de/ustg_1980/__14a.html",
      reviewedAt: "2026-04-06",
    },
    {
      label: "EU VAT Directive 2006/112/EC Article 226 invoice content",
      url: "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=celex%3A32006L0112",
      reviewedAt: "2026-04-06",
    },
    {
      label: "Germany UStG §12 VAT rates (standard/reduced)",
      url: "https://www.gesetze-im-internet.de/ustg_1980/__12.html",
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
  extendTransform(document) {
    const deliveryModes = new Set(document.deliveryModes);
    if (document.buyerType === "B2B" && document.countryContext.buyerCountryCode !== "DE") {
      deliveryModes.add("xml_export");
    }
    return {
      ...document,
      deliveryModes: [...deliveryModes],
      metadata: {
        ...(document.metadata || {}),
        countryRuleDetail: {
          reverseChargeTemplate: "EU_SERVICE_B2B",
        },
      },
    };
  },
  extendValidation(issues, document) {
    const allowedRates = new Set([0, 7, 19]);

    if (
      document.buyerType === "B2B" &&
      document.countryContext.buyerCountryCode &&
      document.countryContext.buyerCountryCode !== "DE" &&
      !hasValue(document.customer.vatId || document.customer.taxId)
    ) {
      issues.push(
        createCountryIssue(
          "customer.vatId",
          "DE_VAT_ID_REQUIRED_FOR_EU_B2B",
          "German cross-border B2B invoices should capture the customer VAT ID for reverse-charge treatment.",
          "ERROR",
          "DE"
        )
      );
    }
    if (document.lines.some((line) => !hasValue(line.description))) {
      issues.push(
        createCountryIssue(
          "invoice.lines",
          "DE_LINE_DESCRIPTION_REQUIRED",
          "German invoices must describe the goods or services supplied.",
          "ERROR",
          "DE"
        )
      );
    }
    if (document.taxBreakdown.length === 0) {
      issues.push(
        createCountryIssue(
          "invoice.taxBreakdown",
          "DE_TAX_BREAKDOWN_REQUIRED",
          "German invoices must show tax amounts per applicable rate or reverse-charge context.",
          "ERROR",
          "DE"
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
          "DE_TAX_AMOUNT_REQUIRED",
          "Tax amounts must be shown for each tax rate on German invoices.",
          "ERROR",
          "DE"
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
          "DE_TAX_RATE_REQUIRED",
          "German VAT invoices should show the VAT rate applied to each taxable amount.",
          "WARNING",
          "DE"
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
          "DE_TAX_RATE_INVALID",
          "German VAT invoices must use the standard 19% or reduced 7% VAT rates (or 0% with exemption).",
          "ERROR",
          "DE"
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
          "DE_ZERO_RATE_REASON_REQUIRED",
          "Zero-rated or exempt VAT entries should include the exemption or reverse-charge reference.",
          "WARNING",
          "DE"
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
            "DE_SUPPLY_DATE_INVALID",
            "Supply date must be a valid date when provided.",
            "WARNING",
            "DE"
          )
        );
      }
    } else {
      issues.push(
        createCountryIssue(
          "invoice.supplyDate",
          "DE_SUPPLY_DATE_RECOMMENDED",
          "Supply date should be stated when it differs from the invoice issue date.",
          "INFO",
          "DE"
        )
      );
    }
    if (document.complianceSnapshot?.reverseChargeApplies) {
      const hasReverseChargeReason = document.taxBreakdown.some((item) => hasValue(item.exemptionReason));
      if (!hasReverseChargeReason) {
        issues.push(
          createCountryIssue(
            "invoice.taxBreakdown",
            "DE_REVERSE_CHARGE_REFERENCE_REQUIRED",
            "Reverse-charge invoices should include the applicable legal reference.",
            "WARNING",
            "DE"
          )
        );
      }
    }
    return issues;
  },
});
