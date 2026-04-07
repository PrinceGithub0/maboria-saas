import { buildDefaultCountryModule, createCountryIssue, hasValue } from "@/lib/invoicing/blueprint/module-factory";

export const ecuadorComplianceModule = buildDefaultCountryModule("EC", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-06",
  evidence: [
    {
      label: "Ecuador SRI facturacion electronica",
      url: "https://www.sri.gob.ec/facturacion-electronica",
      reviewedAt: "2026-04-06",
    },
    {
      label: "Ecuador SRI comprobantes electronicos",
      url: "https://www.sri.gob.ec/comprobantes-electronicos",
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
          providerHint: "EC_SRI",
        },
      },
    };
  },
  extendValidation(issues, document) {
    if (!hasValue(document.supplier.taxId || document.supplier.vatId)) {
      issues.push(
        createCountryIssue(
          "supplier.taxId",
          "EC_RUC_REQUIRED",
          "Ecuadorian electronic documents require the supplier RUC for SRI authorization.",
          "ERROR",
          "EC"
        )
      );
    }
    return issues;
  },
});
