import { buildDefaultCountryModule, createCountryIssue, hasValue } from "@/lib/invoicing/blueprint/module-factory";

export const rwandaComplianceModule = buildDefaultCountryModule("RW", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-06",
  evidence: [
    {
      label: "Rwanda Revenue Authority EBM mandate overview",
      url: "https://www.rra.gov.rw/en/about-ebm",
      reviewedAt: "2026-04-06",
    },
    {
      label: "Rwanda Revenue Authority EBM services portal",
      url: "https://www.rra.gov.rw/en/ebm-electronic-billing-machine?cHash=20df14886c381bf2c65067586eae979c&l=79",
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
    deliveryModes.add("government_gateway_submission");
    return {
      ...document,
      deliveryModes: [...deliveryModes],
      metadata: {
        ...(document.metadata || {}),
        countryRuleDetail: {
          providerHint: "RW_EBM",
        },
      },
    };
  },
  extendValidation(issues, document) {
    if (!hasValue(document.supplier.taxId || document.supplier.vatId)) {
      issues.push(
        createCountryIssue(
          "supplier.taxId",
          "RW_TAX_ID_REQUIRED",
          "Rwanda EBM invoices require the supplier tax identifier.",
          "ERROR",
          "RW"
        )
      );
    }
    issues.push(
      createCountryIssue(
        "invoice.deliveryModes",
        "RW_EBM_REQUIRED",
        "Rwanda requires taxpayers to issue EBM invoices for each sale transaction.",
        "INFO",
        "RW"
      )
    );
    return issues;
  },
});
