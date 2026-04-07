import { buildDefaultCountryModule, createCountryIssue, hasValue } from "@/lib/invoicing/blueprint/module-factory";

export const uzbekistanComplianceModule = buildDefaultCountryModule("UZ", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-06",
  evidence: [
    {
      label: "Uzbekistan State Tax Committee electronic invoice references",
      url: "https://old.soliq.uz/page/operatorlar",
      reviewedAt: "2026-04-06",
    },
    {
      label: "Uzbekistan Soliq e-services and electronic signatures references",
      url: "https://old.soliq.uz/page/elektron-raqamli-imzo",
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
          providerHint: "UZ_EINVOICE",
        },
      },
    };
  },
  extendValidation(issues, document) {
    if (!hasValue(document.supplier.taxId || document.supplier.vatId)) {
      issues.push(
        createCountryIssue(
          "supplier.taxId",
          "UZ_TAX_ID_REQUIRED",
          "Uzbekistan electronic invoices should capture the supplier tax registration identifier.",
          "ERROR",
          "UZ"
        )
      );
    }
    return issues;
  },
});
