import { buildDefaultCountryModule, createCountryIssue, hasValue } from "@/lib/invoicing/blueprint/module-factory";

export const saudiArabiaComplianceModule = buildDefaultCountryModule("SA", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-06",
  evidence: [
    {
      label: "ZATCA e-invoicing phases and requirements (FATOORAH)",
      url: "https://zatca.gov.sa/en/MediaCenter/News/Pages/News_420.aspx",
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
          providerHint: "ZATCA",
          clearanceMode: true,
        },
      },
    };
  },
  extendValidation(issues, document) {
    if (!hasValue(document.supplier.taxId || document.supplier.vatId)) {
      issues.push(
        createCountryIssue(
          "supplier.taxId",
          "SA_TIN_REQUIRED",
          "Saudi invoices should capture the supplier TIN for ZATCA workflows.",
          "ERROR",
          "SA"
        )
      );
    }
    return issues;
  },
});
