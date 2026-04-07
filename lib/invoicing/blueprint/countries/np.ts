import { buildDefaultCountryModule, createCountryIssue, hasValue } from "@/lib/invoicing/blueprint/module-factory";

export const nepalComplianceModule = buildDefaultCountryModule("NP", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-06",
  evidence: [
    {
      label: "Nepal IRD e-Billing notice",
      url: "https://www.ird.gov.np/public/notice/ebilling",
      reviewedAt: "2026-04-06",
    },
    {
      label: "Nepal IRD electronic invoice notices",
      url: "https://ird.gov.np/category/electronic-invoice/",
      reviewedAt: "2026-04-06",
    },
  ],
  extendRequiredFields(fields) {
    fields.push("supplier.addressLine1");
    fields.push("supplier.city");
    fields.push("customer.legalName");
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
          providerHint: "NP_EBILLING",
        },
      },
    };
  },
  extendValidation(issues, document) {
    if (!hasValue(document.supplier.taxId || document.supplier.vatId)) {
      issues.push(
        createCountryIssue(
          "supplier.taxId",
          "NP_TAX_ID_REQUIRED",
          "Nepal electronic billing should capture the supplier tax registration identifier.",
          "ERROR",
          "NP"
        )
      );
    }
    return issues;
  },
});
