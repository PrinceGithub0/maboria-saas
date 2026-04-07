import { buildDefaultCountryModule, createCountryIssue, hasValue } from "@/lib/invoicing/blueprint/module-factory";

export const malaysiaComplianceModule = buildDefaultCountryModule("MY", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-06",
  evidence: [
    {
      label: "Malaysia MyInvois SDK and implementation guidance",
      url: "https://sdk.myinvois.hasil.gov.my/einvoicingapi/",
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
          providerHint: "MYINVOIS",
        },
      },
    };
  },
  extendValidation(issues, document) {
    if (document.buyerType === "B2B" && !hasValue(document.customer.taxId || document.customer.vatId)) {
      issues.push(
        createCountryIssue(
          "customer.taxId",
          "MY_BUYER_TIN_REQUIRED",
          "Malaysia B2B e-invoices should capture the buyer TIN.",
          "ERROR",
          "MY"
        )
      );
    }
    return issues;
  },
});
