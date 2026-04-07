import { buildDefaultCountryModule, createCountryIssue, hasValue } from "@/lib/invoicing/blueprint/module-factory";

export const paraguayComplianceModule = buildDefaultCountryModule("PY", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-06",
  evidence: [
    {
      label: "Paraguay DNIT factura electronica",
      url: "https://www.dnit.gov.py/web/portal-institucional/factura-electronica",
      reviewedAt: "2026-04-06",
    },
    {
      label: "Paraguay e-Kuatia / SIFEN portal",
      url: "https://www.dnit.gov.py/web/e-kuatia",
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
          providerHint: "PY_SIFEN",
        },
      },
    };
  },
  extendValidation(issues, document) {
    if (!hasValue(document.supplier.taxId || document.supplier.vatId)) {
      issues.push(
        createCountryIssue(
          "supplier.taxId",
          "PY_RUC_REQUIRED",
          "Paraguayan SIFEN issuance requires the supplier RUC.",
          "ERROR",
          "PY"
        )
      );
    }
    return issues;
  },
});
