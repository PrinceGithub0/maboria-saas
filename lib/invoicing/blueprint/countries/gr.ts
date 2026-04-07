import { buildDefaultCountryModule, createCountryIssue, hasValue } from "@/lib/invoicing/blueprint/module-factory";

export const greeceComplianceModule = buildDefaultCountryModule("GR", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-06",
  evidence: [
    {
      label: "Greece myDATA platform and e-invoicing updates (AADE)",
      url: "https://aade.gr/mydata",
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
          providerHint: "MYDATA",
        },
      },
    };
  },
  extendValidation(issues, document) {
    if (!hasValue(document.supplier.taxId || document.supplier.vatId)) {
      issues.push(
        createCountryIssue(
          "supplier.taxId",
          "GR_SUPPLIER_VAT_REQUIRED",
          "Greek invoices should capture the supplier VAT number for myDATA reporting.",
          "ERROR",
          "GR"
        )
      );
    }
    return issues;
  },
});
