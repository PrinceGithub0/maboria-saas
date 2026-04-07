import { buildDefaultCountryModule, createCountryIssue, hasValue } from "@/lib/invoicing/blueprint/module-factory";

export const uruguayComplianceModule = buildDefaultCountryModule("UY", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-06",
  evidence: [
    {
      label: "Uruguay DGI e-Factura portal",
      url: "https://www.efactura.dgi.gub.uy/",
      reviewedAt: "2026-04-06",
    },
    {
      label: "Uruguay DGI CFE frequently asked questions",
      url: "https://www.efactura.dgi.gub.uy/principal/ampliacion_de_factura_electronica?es",
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
          providerHint: "UY_CFE",
        },
      },
    };
  },
  extendValidation(issues, document) {
    if (!hasValue(document.supplier.taxId || document.supplier.vatId)) {
      issues.push(
        createCountryIssue(
          "supplier.taxId",
          "UY_RUT_REQUIRED",
          "Uruguayan CFE issuance requires the supplier RUT.",
          "ERROR",
          "UY"
        )
      );
    }
    return issues;
  },
});
