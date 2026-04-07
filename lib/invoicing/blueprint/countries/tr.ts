import { buildDefaultCountryModule, createCountryIssue, hasValue } from "@/lib/invoicing/blueprint/module-factory";

export const turkeyComplianceModule = buildDefaultCountryModule("TR", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-06",
  evidence: [
    {
      label: "Turkey e-Fatura/e-Arşiv portal and official guidance (GİB)",
      url: "https://ebelge.gib.gov.tr/anasayfa.html",
      reviewedAt: "2026-04-06",
    },
    {
      label: "Turkey e-Document (e-Fatura) regulations and communiqués (VUK)",
      url: "https://ebelge.gib.gov.tr/efaturamevzuat.html",
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
          providerHint: "TR_EFATURA",
        },
      },
    };
  },
  extendValidation(issues, document) {
    if (!hasValue(document.supplier.taxId || document.supplier.vatId)) {
      issues.push(
        createCountryIssue(
          "supplier.taxId",
          "TR_TAX_ID_REQUIRED",
          "Turkey e-Fatura requires the supplier tax identifier.",
          "ERROR",
          "TR"
        )
      );
    }
    issues.push(
      createCountryIssue(
        "invoice.deliveryModes",
        "TR_EFATURA_REQUIRED",
        "Turkey mandates e-Fatura/e-Arşiv for qualifying taxpayers; confirm applicability and use the GİB portal.",
        "INFO",
        "TR"
      )
    );
    return issues;
  },
});
