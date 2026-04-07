import { buildDefaultCountryModule, createCountryIssue, hasValue } from "@/lib/invoicing/blueprint/module-factory";

export const kazakhstanComplianceModule = buildDefaultCountryModule("KZ", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-06",
  evidence: [
    {
      label: "Kazakhstan State Revenue Committee electronic invoices (IS ESF)",
      url: "https://kgd.gov.kz/en/section/elektronnye-scheta-faktury",
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
          providerHint: "KZ_IS_ESF",
        },
      },
    };
  },
  extendValidation(issues, document) {
    if (!hasValue(document.supplier.taxId || document.supplier.vatId)) {
      issues.push(
        createCountryIssue(
          "supplier.taxId",
          "KZ_TAX_ID_REQUIRED",
          "Kazakhstan electronic invoices should capture the supplier tax registration identifier.",
          "ERROR",
          "KZ"
        )
      );
    }
    issues.push(
      createCountryIssue(
        "invoice.deliveryModes",
        "KZ_IS_ESF_SCOPE_CHECK",
        "Kazakhstan uses the IS ESF electronic invoice system; confirm taxpayer scope and submission path.",
        "INFO",
        "KZ"
      )
    );
    return issues;
  },
});
