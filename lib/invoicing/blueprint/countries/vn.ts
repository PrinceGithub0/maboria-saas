import { buildDefaultCountryModule, createCountryIssue, hasValue } from "@/lib/invoicing/blueprint/module-factory";

export const vietnamComplianceModule = buildDefaultCountryModule("VN", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-06",
  evidence: [
    {
      label: "Vietnam General Department of Taxation e-invoice portal",
      url: "https://hoadondientu.gdt.gov.vn/",
      reviewedAt: "2026-04-06",
    },
    {
      label: "Vietnam General Department of Taxation legal framework for invoices",
      url: "https://gdt.gov.vn/wps/portal/english",
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
          providerHint: "VN_EINVOICE",
        },
      },
    };
  },
  extendValidation(issues, document) {
    if (!hasValue(document.supplier.taxId || document.supplier.vatId)) {
      issues.push(
        createCountryIssue(
          "supplier.taxId",
          "VN_TAX_ID_REQUIRED",
          "Vietnam electronic invoices require the seller tax identifier.",
          "ERROR",
          "VN"
        )
      );
    }
    issues.push(
      createCountryIssue(
        "invoice.deliveryModes",
        "VN_EINVOICE_REQUIRED",
        "Vietnam requires electronic invoices through the tax authority e-invoice system.",
        "INFO",
        "VN"
      )
    );
    return issues;
  },
});
