import { buildDefaultCountryModule, createCountryIssue, hasValue } from "@/lib/invoicing/blueprint/module-factory";

export const hungaryComplianceModule = buildDefaultCountryModule("HU", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-06",
  evidence: [
    {
      label: "Hungary NAV Online Invoice system (official portal)",
      url: "https://nav.gov.hu/ugyfeliranytu/nav-online",
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
          providerHint: "HU_NAV",
        },
      },
    };
  },
  extendValidation(issues, document) {
    if (!hasValue(document.supplier.taxId || document.supplier.vatId)) {
      issues.push(
        createCountryIssue(
          "supplier.taxId",
          "HU_SUPPLIER_TAX_ID_REQUIRED",
          "Hungarian invoices require the supplier tax identifier for NAV Online Invoice reporting.",
          "ERROR",
          "HU"
        )
      );
    }
    issues.push(
      createCountryIssue(
        "invoice.deliveryModes",
        "HU_ONLINE_INVOICE_REPORTING",
        "Hungary requires online invoice reporting to NAV; ensure real-time reporting is configured.",
        "INFO",
        "HU"
      )
    );
    return issues;
  },
});
