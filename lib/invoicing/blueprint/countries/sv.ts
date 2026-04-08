import { buildDefaultCountryModule, createCountryIssue, hasValue } from "@/lib/invoicing/blueprint/module-factory";

export const elSalvadorComplianceModule = buildDefaultCountryModule("SV", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-06",
  evidence: [
    {
      label: "El Salvador facturación electronica portal",
      url: "https://www.mh.gob.sv/facturación-electronica/",
      reviewedAt: "2026-04-06",
    },
    {
      label: "El Salvador DTE legal reform notice",
      url: "https://www.mh.gob.sv/reformas-al-código-tributario-relativas-a-la-facturación-electronica-documentos-tributarios-electronicos-dte/",
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
          providerHint: "SV_DTE",
        },
      },
    };
  },
  extendValidation(issues, document) {
    if (!hasValue(document.supplier.taxId || document.supplier.vatId)) {
      issues.push(
        createCountryIssue(
          "supplier.taxId",
          "SV_NIT_REQUIRED",
          "El Salvador DTE issuance requires the supplier tax identifier.",
          "ERROR",
          "SV"
        )
      );
    }
    return issues;
  },
});
