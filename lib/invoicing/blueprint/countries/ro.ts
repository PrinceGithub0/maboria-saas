import { buildDefaultCountryModule, createCountryIssue, hasValue } from "@/lib/invoicing/blueprint/module-factory";

export const romaniaComplianceModule = buildDefaultCountryModule("RO", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-06",
  evidence: [
    {
      label: "Romania RO e-Factura mandate and B2B transmission (ANAF guidance)",
      url: "https://static.anaf.ro/static/3/Cluj/20240604162252_cj_e-factura_04iun2024.pdf",
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
          providerHint: "RO_EFACTURA",
        },
      },
    };
  },
  extendValidation(issues, document) {
    if (
      document.customer.classification === "BUSINESS" &&
      !hasValue(document.customer.taxId || document.customer.vatId)
    ) {
      issues.push(
        createCountryIssue(
          "customer.taxId",
          "RO_BUYER_TAX_ID_REQUIRED",
          "Romanian business invoices should capture the buyer tax identifier for e-Factura workflows.",
          "ERROR",
          "RO"
        )
      );
    }
    return issues;
  },
});
