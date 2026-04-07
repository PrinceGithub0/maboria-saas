import { buildDefaultCountryModule, createCountryIssue, hasValue } from "@/lib/invoicing/blueprint/module-factory";

export const pakistanComplianceModule = buildDefaultCountryModule("PK", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-06",
  evidence: [
    {
      label: "Pakistan FBR digital invoicing FAQ and SRO 709 mandatory rollout",
      url: "https://www.fbr.gov.pk/faqs/173967/173969",
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
          providerHint: "PK_FBR_DIGITAL_INVOICING",
        },
      },
    };
  },
  extendValidation(issues, document) {
    if (!hasValue(document.supplier.taxId || document.supplier.vatId)) {
      issues.push(
        createCountryIssue(
          "supplier.taxId",
          "PK_TAX_ID_REQUIRED",
          "Pakistan digital invoicing requires the supplier tax registration identifier.",
          "ERROR",
          "PK"
        )
      );
    }
    issues.push(
      createCountryIssue(
        "invoice.deliveryModes",
        "PK_DIGITAL_INVOICING_REQUIRED",
        "Pakistan mandates FBR digital invoicing for covered registered persons under the official rollout.",
        "INFO",
        "PK"
      )
    );
    return issues;
  },
});
