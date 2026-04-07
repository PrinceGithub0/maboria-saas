import { buildDefaultCountryModule, createCountryIssue, hasValue } from "@/lib/invoicing/blueprint/module-factory";

export const ghanaComplianceModule = buildDefaultCountryModule("GH", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-06",
  evidence: [
    {
      label: "Ghana GRA E-VAT",
      url: "https://gra.gov.gh/e-services/e-vat/",
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
          providerHint: "GH_EVAT",
        },
      },
    };
  },
  extendValidation(issues, document) {
    if (!hasValue(document.supplier.taxId || document.supplier.vatId)) {
      issues.push(
        createCountryIssue(
          "supplier.taxId",
          "GH_TAX_ID_REQUIRED",
          "Ghana E-VAT invoices should capture the supplier tax identifier.",
          "ERROR",
          "GH"
        )
      );
    }
    return issues;
  },
});
