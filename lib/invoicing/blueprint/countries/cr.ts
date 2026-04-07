import { buildDefaultCountryModule, createCountryIssue, hasValue } from "@/lib/invoicing/blueprint/module-factory";

export const costaRicaComplianceModule = buildDefaultCountryModule("CR", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-06",
  evidence: [
    {
      label: "Costa Rica comprobantes electronicos API",
      url: "https://www.hacienda.go.cr/docs/ComprobantesElectronicosAPI.html",
      reviewedAt: "2026-04-06",
    },
    {
      label: "Costa Rica informacion tributaria comprobantes electronicos",
      url: "https://www.hacienda.go.cr/ATV/ComprobanteElectronico/frmAnexosyEstructuras.aspx",
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
          providerHint: "CR_HACIENDA",
        },
      },
    };
  },
  extendValidation(issues, document) {
    if (!hasValue(document.supplier.taxId || document.supplier.vatId)) {
      issues.push(
        createCountryIssue(
          "supplier.taxId",
          "CR_TAX_ID_REQUIRED",
          "Costa Rica electronic receipts require the supplier tax identifier.",
          "ERROR",
          "CR"
        )
      );
    }
    return issues;
  },
});
