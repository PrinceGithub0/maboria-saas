import { buildDefaultCountryModule, createCountryIssue, hasValue } from "@/lib/invoicing/blueprint/module-factory";

export const taiwanComplianceModule = buildDefaultCountryModule("TW", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-06",
  evidence: [
    {
      label: "Taiwan Ministry of Finance electronic uniform invoice program",
      url: "https://www.einvoice.nat.gov.tw/index!main",
      reviewedAt: "2026-04-06",
    },
    {
      label: "Ministry of Finance recognition for electronic uniform invoice adoption",
      url: "https://www.mof.gov.tw/Eng/singlehtml/6665?cntId=c87bdc6900d14b57a62a400823d008c4",
      reviewedAt: "2026-04-06",
    },
  ],
  extendRequiredFields(fields) {
    fields.push("supplier.addressLine1");
    fields.push("supplier.postalCode");
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
          providerHint: "TW_EGUI",
        },
      },
    };
  },
  extendValidation(issues, document) {
    if (!hasValue(document.supplier.taxId || document.supplier.vatId)) {
      issues.push(
        createCountryIssue(
          "supplier.taxId",
          "TW_GUI_REQUIRED",
          "Taiwan electronic uniform invoices require the seller tax identifier.",
          "ERROR",
          "TW"
        )
      );
    }
    issues.push(
      createCountryIssue(
        "invoice.deliveryModes",
        "TW_ELECTRONIC_UNIFORM_INVOICE",
        "Taiwan uses the electronic uniform invoice framework; ensure structured invoice issuance is supported.",
        "INFO",
        "TW"
      )
    );
    return issues;
  },
});
