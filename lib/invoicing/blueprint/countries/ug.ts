import { buildDefaultCountryModule, createCountryIssue, hasValue } from "@/lib/invoicing/blueprint/module-factory";

export const ugandaComplianceModule = buildDefaultCountryModule("UG", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-06",
  evidence: [
    {
      label: "Uganda Revenue Authority EFRIS brochure",
      url: "https://ura.go.ug/download-category/efris-brochure/",
      reviewedAt: "2026-04-06",
    },
    {
      label: "Uganda Revenue Authority EFRIS documents",
      url: "https://ura.go.ug/download-category/efris-documents/",
      reviewedAt: "2026-04-06",
    },
  ],
  extendRequiredFields(fields) {
    fields.push("supplier.addressLine1");
    fields.push("supplier.city");
    fields.push("customer.addressLine1");
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
          providerHint: "UG_EFRIS",
        },
      },
    };
  },
  extendValidation(issues, document) {
    if (!hasValue(document.supplier.taxId || document.supplier.vatId)) {
      issues.push(
        createCountryIssue(
          "supplier.taxId",
          "UG_TAX_ID_REQUIRED",
          "Uganda EFRIS invoices require the supplier tax identifier.",
          "ERROR",
          "UG"
        )
      );
    }
    issues.push(
      createCountryIssue(
        "invoice.deliveryModes",
        "UG_EFRIS_REQUIRED",
        "Uganda requires in-scope taxpayers to issue fiscal receipts and invoices through EFRIS.",
        "INFO",
        "UG"
      )
    );
    return issues;
  },
});
