import { buildDefaultCountryModule, createCountryIssue, hasValue } from "@/lib/invoicing/blueprint/module-factory";

export const zimbabweComplianceModule = buildDefaultCountryModule("ZW", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-06",
  evidence: [
    {
      label: "Zimbabwe Revenue Authority fiscalisation guidance",
      url: "https://www.zimra.co.zw/domestic-taxes/corporate/fiscalisation-explained",
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
          providerHint: "ZW_FDMS",
        },
      },
    };
  },
  extendValidation(issues, document) {
    if (!hasValue(document.supplier.taxId || document.supplier.vatId)) {
      issues.push(
        createCountryIssue(
          "supplier.taxId",
          "ZW_TAX_ID_REQUIRED",
          "Zimbabwe fiscalised VAT invoices should capture the supplier tax identifier.",
          "ERROR",
          "ZW"
        )
      );
    }
    issues.push(
      createCountryIssue(
        "invoice.deliveryModes",
        "ZW_FISCALISATION_REQUIRED",
        "Zimbabwe requires VAT registered operators to fiscalise invoices through ZIMRA FDMS.",
        "INFO",
        "ZW"
      )
    );
    return issues;
  },
});
