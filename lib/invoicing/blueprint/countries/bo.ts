import { buildDefaultCountryModule, createCountryIssue, hasValue } from "@/lib/invoicing/blueprint/module-factory";

export const boliviaComplianceModule = buildDefaultCountryModule("BO", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-06",
  evidence: [
    {
      label: "Bolivia SIAT factura electronica en linea",
      url: "https://siatanexo.impuestos.gob.bo/index.php/modalidades-facturación/facturación-electronica",
      reviewedAt: "2026-04-06",
    },
    {
      label: "Bolivia SIAT información general facturación electronica",
      url: "https://siatanexo.impuestos.gob.bo/index.php/información-gral",
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
          providerHint: "BO_SIAT",
        },
      },
    };
  },
  extendValidation(issues, document) {
    if (!hasValue(document.supplier.taxId || document.supplier.vatId)) {
      issues.push(
        createCountryIssue(
          "supplier.taxId",
          "BO_NIT_REQUIRED",
          "Bolivian electronic fiscal documents require the supplier NIT.",
          "ERROR",
          "BO"
        )
      );
    }
    return issues;
  },
});
