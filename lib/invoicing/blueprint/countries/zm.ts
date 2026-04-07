import { buildDefaultCountryModule, createCountryIssue, hasValue } from "@/lib/invoicing/blueprint/module-factory";

export const zambiaComplianceModule = buildDefaultCountryModule("ZM", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-06",
  evidence: [
    {
      label: "Zambia Revenue Authority Smart Invoice deadline notice",
      url: "https://www.zra.org.zm/smart-invoice-deadline/",
      reviewedAt: "2026-04-06",
    },
    {
      label: "Zambia Revenue Authority Smart Invoice registration guide",
      url: "https://www.zra.org.zm/smart-invoice-registration-guide/",
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
          providerHint: "ZM_SMART_INVOICE",
        },
      },
    };
  },
  extendValidation(issues, document) {
    if (!hasValue(document.supplier.taxId || document.supplier.vatId)) {
      issues.push(
        createCountryIssue(
          "supplier.taxId",
          "ZM_TAX_ID_REQUIRED",
          "Zambia Smart Invoice records require the supplier tax identifier.",
          "ERROR",
          "ZM"
        )
      );
    }
    issues.push(
      createCountryIssue(
        "invoice.deliveryModes",
        "ZM_SMART_INVOICE_REQUIRED",
        "Zambia requires VAT taxpayers to register for and use Smart Invoice.",
        "INFO",
        "ZM"
      )
    );
    return issues;
  },
});
