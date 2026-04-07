import { buildDefaultCountryModule, createCountryIssue, hasValue } from "@/lib/invoicing/blueprint/module-factory";

export const coteDIvoireComplianceModule = buildDefaultCountryModule("CI", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-06",
  evidence: [
    {
      label: "Cote d'Ivoire FNE official portal",
      url: "https://www.fne.dgi.gouv.ci/infos.php",
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
          providerHint: "CI_FNE",
        },
      },
    };
  },
  extendValidation(issues, document) {
    if (!hasValue(document.supplier.taxId || document.supplier.vatId)) {
      issues.push(
        createCountryIssue(
          "supplier.taxId",
          "CI_TAX_ID_REQUIRED",
          "Cote d'Ivoire FNE invoices should capture the supplier tax identifier.",
          "ERROR",
          "CI"
        )
      );
    }
    return issues;
  },
});
