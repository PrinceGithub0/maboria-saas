import { buildDefaultCountryModule, createCountryIssue, hasValue } from "@/lib/invoicing/blueprint/module-factory";

export const mexicoComplianceModule = buildDefaultCountryModule("MX", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-06",
  evidence: [
    {
      label: "SAT CFDI electronic invoicing (legal basis and requirements)",
      url: "https://wwwmat.sat.gob.mx/aplicación/26989/factura-electronica-en-mis-cuentas",
      reviewedAt: "2026-04-06",
    },
  ],
  extendTransform(document) {
    const deliveryModes = new Set(document.deliveryModes);
    deliveryModes.add("government_gateway_submission");
    return {
      ...document,
      deliveryModes: [...deliveryModes],
      metadata: {
        ...(document.metadata || {}),
        countryRuleDetail: {
          providerHint: "MX_CFDI",
        },
      },
    };
  },
  extendValidation(issues, document) {
    if (!hasValue(document.supplier.taxId || document.supplier.vatId)) {
      issues.push(
        createCountryIssue(
          "supplier.taxId",
          "MX_RFC_REQUIRED",
          "Mexican invoices should capture the supplier RFC for CFDI issuance.",
          "ERROR",
          "MX"
        )
      );
    }
    return issues;
  },
});
