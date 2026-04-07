import { buildDefaultCountryModule, createCountryIssue, hasValue } from "@/lib/invoicing/blueprint/module-factory";

export const kenyaComplianceModule = buildDefaultCountryModule("KE", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-06",
  evidence: [
    {
      label: "Kenya eTIMS mandatory electronic tax invoicing (KRA)",
      url: "https://www.kra.go.ke/online-services/etims",
      reviewedAt: "2026-04-06",
    },
    {
      label: "KRA eTIMS requirement for all businesses (FAQ)",
      url: "https://www.kra.go.ke/helping-tax-payers/faqs/learn-about-etims",
      reviewedAt: "2026-04-06",
    },
  ],
  extendRequiredFields(fields) {
    fields.push("supplier.addressLine1");
    fields.push("supplier.postalCode");
    fields.push("supplier.city");
    fields.push("customer.addressLine1");
    fields.push("customer.postalCode");
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
          providerHint: "KE_ETIMS",
        },
      },
    };
  },
  extendValidation(issues, document) {
    if (!hasValue(document.supplier.taxId || document.supplier.vatId)) {
      issues.push(
        createCountryIssue(
          "supplier.taxId",
          "KE_TAX_ID_REQUIRED",
          "Kenya eTIMS requires the supplier tax identifier for electronic tax invoices.",
          "ERROR",
          "KE"
        )
      );
    }
    issues.push(
      createCountryIssue(
        "invoice.deliveryModes",
        "KE_ETIMS_REQUIRED",
        "Kenya requires electronic tax invoices through eTIMS for businesses.",
        "INFO",
        "KE"
      )
    );
    return issues;
  },
});
