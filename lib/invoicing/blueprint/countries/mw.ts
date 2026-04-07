import { buildDefaultCountryModule, createCountryIssue, hasValue } from "@/lib/invoicing/blueprint/module-factory";

export const malawiComplianceModule = buildDefaultCountryModule("MW", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-06",
  evidence: [
    {
      label: "Malawi Revenue Authority Electronic Invoicing System portal",
      url: "https://eis-portal.mra.mw/",
      reviewedAt: "2026-04-06",
    },
    {
      label: "Malawi Revenue Authority EIS terms and conditions",
      url: "https://eis-portal.mra.mw/Home/SignUp",
      reviewedAt: "2026-04-06",
    },
  ],
  extendRequiredFields(fields) {
    fields.push("supplier.addressLine1");
    fields.push("supplier.city");
    fields.push("customer.addressLine1");
    fields.push("customer.city");
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
          providerHint: "MW_MRA_EIS",
        },
      },
    };
  },
  extendValidation(issues, document) {
    if (!hasValue(document.supplier.taxId || document.supplier.vatId)) {
      issues.push(
        createCountryIssue(
          "supplier.taxId",
          "MW_TAX_ID_REQUIRED",
          "Malawi electronic tax invoices must include the supplier tax identification number.",
          "ERROR",
          "MW"
        )
      );
    }
    issues.push(
      createCountryIssue(
        "invoice.deliveryModes",
        "MW_EINVOICING_REQUIRED",
        "Malawi requires tax invoices to be generated through EIS or another approved tax invoicing system.",
        "INFO",
        "MW"
      )
    );
    return issues;
  },
});
