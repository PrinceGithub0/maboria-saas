import { buildDefaultCountryModule, createCountryIssue, hasValue } from "@/lib/invoicing/blueprint/module-factory";

export const serbiaComplianceModule = buildDefaultCountryModule("RS", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-06",
  evidence: [
    {
      label: "Serbia Tax Administration VAT guidance",
      url: "https://www.purs.gov.rs/en/Legal-entities/Vat.html",
      reviewedAt: "2026-04-06",
    },
    {
      label: "Serbia Tax Administration eFiscalization portal",
      url: "https://www.purs.gov.rs/en/e-Fiscalization.html",
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
          providerHint: "RS_EFISKALIZACIJA",
        },
      },
    };
  },
  extendValidation(issues, document) {
    if (!hasValue(document.supplier.taxId || document.supplier.vatId)) {
      issues.push(
        createCountryIssue(
          "supplier.taxId",
          "RS_TAX_ID_REQUIRED",
          "Serbian VAT invoices should capture the supplier tax identifier.",
          "ERROR",
          "RS"
        )
      );
    }
    issues.push(
      createCountryIssue(
        "invoice.deliveryModes",
        "RS_FISCALIZATION_SCOPE_CHECK",
        "Serbia uses the eFiscalization platform; confirm whether the supplier is in scope for real-time fiscal receipt or invoice reporting.",
        "INFO",
        "RS"
      )
    );
    return issues;
  },
});
