import { buildDefaultCountryModule, createCountryIssue, hasValue } from "@/lib/invoicing/blueprint/module-factory";

export const indonesiaComplianceModule = buildDefaultCountryModule("ID", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-06",
  evidence: [
    {
      label: "Indonesia e-Faktur requirements (Direktorat Jenderal Pajak)",
      url: "https://www.pajak.go.id/en/node/80396",
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
          providerHint: "ID_EFAKTUR",
        },
      },
    };
  },
  extendValidation(issues, document) {
    if (!hasValue(document.supplier.taxId || document.supplier.vatId)) {
      issues.push(
        createCountryIssue(
          "supplier.taxId",
          "ID_TAX_ID_REQUIRED",
          "Indonesian VAT invoices require the supplier tax ID for e-Faktur.",
          "ERROR",
          "ID"
        )
      );
    }
    return issues;
  },
});
