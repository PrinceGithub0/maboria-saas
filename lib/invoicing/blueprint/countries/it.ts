import { buildDefaultCountryModule, createCountryIssue, hasValue } from "@/lib/invoicing/blueprint/module-factory";

export const italyComplianceModule = buildDefaultCountryModule("IT", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-06",
  evidence: [
    {
      label: "Italy e-invoicing mandate (Agenzia delle Entrate)",
      url: "https://www1.agenziaentrate.gov.it/web_app_entrate/fatturazione_elettronica.html",
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
          providerHint: "IT_SDI",
        },
      },
    };
  },
  extendValidation(issues, document) {
    if (document.customer.classification === "BUSINESS" && !hasValue(document.customer.taxId || document.customer.vatId)) {
      issues.push(
        createCountryIssue(
          "customer.taxId",
          "IT_BUYER_VAT_REQUIRED",
          "Italian business invoices should capture the buyer VAT or tax identifier for SdI exchange.",
          "ERROR",
          "IT"
        )
      );
    }
    return issues;
  },
});
