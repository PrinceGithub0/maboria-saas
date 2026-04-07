import { buildDefaultCountryModule, createCountryIssue, hasValue } from "@/lib/invoicing/blueprint/module-factory";

export const panamaComplianceModule = buildDefaultCountryModule("PA", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-06",
  evidence: [
    {
      label: "Panama DGI factura electronica",
      url: "https://dgi.mef.gob.pa/_7FacturaElectronica/felectronica",
      reviewedAt: "2026-04-06",
    },
    {
      label: "Panama DGI factura electronica FAQ",
      url: "https://dgi.mef.gob.pa/Preguntas/FacturaElectronica",
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
          providerHint: "PA_DGI",
        },
      },
    };
  },
  extendValidation(issues, document) {
    if (!hasValue(document.supplier.taxId || document.supplier.vatId)) {
      issues.push(
        createCountryIssue(
          "supplier.taxId",
          "PA_RUC_REQUIRED",
          "Panamanian factura electronica requires the supplier RUC.",
          "ERROR",
          "PA"
        )
      );
    }
    return issues;
  },
});
