import { buildDefaultCountryModule, createCountryIssue, hasValue } from "@/lib/invoicing/blueprint/module-factory";

export const philippinesComplianceModule = buildDefaultCountryModule("PH", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-06",
  evidence: [
    {
      label: "BIR Electronic Invoice System portal",
      url: "https://eis.bir.gov.ph/",
      reviewedAt: "2026-04-06",
    },
    {
      label: "BIR Revenue Regulations No. 11-2025 digest",
      url: "https://bir-cdn.bir.gov.ph/BIR/pdf/RR%2011-2025%20Digest.pdf",
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
          providerHint: "PH_EIS",
        },
      },
    };
  },
  extendValidation(issues, document) {
    if (!hasValue(document.supplier.taxId || document.supplier.vatId)) {
      issues.push(
        createCountryIssue(
          "supplier.taxId",
          "PH_TAX_ID_REQUIRED",
          "Philippine EIS invoices require the supplier tax identifier.",
          "ERROR",
          "PH"
        )
      );
    }
    issues.push(
      createCountryIssue(
        "invoice.deliveryModes",
        "PH_EIS_COVERED_TAXPAYER_CHECK",
        "The Philippines EIS applies to covered taxpayers such as large taxpayers, e-commerce taxpayers, and approved computerized invoicing users.",
        "INFO",
        "PH"
      )
    );
    return issues;
  },
});
