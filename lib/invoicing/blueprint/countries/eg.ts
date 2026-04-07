import { buildDefaultCountryModule, createCountryIssue, hasValue } from "@/lib/invoicing/blueprint/module-factory";

export const egyptComplianceModule = buildDefaultCountryModule("EG", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-06",
  evidence: [
    {
      label: "Egypt e-Invoice System (ETA portal)",
      url: "https://invoicing.eta.gov.eg/portal/",
      reviewedAt: "2026-04-06",
    },
    {
      label: "ETA e-Invoice system mandatory onboarding phases",
      url: "https://eta.gov.eg/en/einvoice",
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
          providerHint: "EG_EINVOICE",
        },
      },
    };
  },
  extendValidation(issues, document) {
    if (!hasValue(document.supplier.taxId || document.supplier.vatId)) {
      issues.push(
        createCountryIssue(
          "supplier.taxId",
          "EG_TAX_ID_REQUIRED",
          "Egypt e-Invoice requires the supplier tax registration number.",
          "ERROR",
          "EG"
        )
      );
    }
    issues.push(
      createCountryIssue(
        "invoice.deliveryModes",
        "EG_EINVOICE_REQUIRED",
        "Egypt requires electronic invoice submission via the ETA portal for onboarded taxpayers.",
        "INFO",
        "EG"
      )
    );
    return issues;
  },
});
