import { buildDefaultCountryModule, createCountryIssue, hasValue } from "@/lib/invoicing/blueprint/module-factory";

export const azerbaijanComplianceModule = buildDefaultCountryModule("AZ", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-06",
  evidence: [
    {
      label: "Azerbaijan State Tax Service e-tax invoice service",
      url: "https://www.taxes.gov.az/en/page/e-vergi-hesab-fakturasi",
      reviewedAt: "2026-04-06",
    },
    {
      label: "Azerbaijan State Tax Service e-invoicing scope notice",
      url: "https://www.taxes.gov.az/en/page/elektron-qaime-faktura",
      reviewedAt: "2026-04-06",
    },
  ],
  extendTransform(document) {
    const deliveryModes = new Set(document.deliveryModes);
    deliveryModes.add("government_gateway_submission");
    return {
      ...document,
      deliveryModes: [...deliveryModes],
      metadata: {
        ...(document.metadata || {}),
        countryRuleDetail: {
          providerHint: "AZ_ETAX_INVOICE",
        },
      },
    };
  },
  extendValidation(issues, document) {
    if (!hasValue(document.supplier.taxId || document.supplier.vatId)) {
      issues.push(
        createCountryIssue(
          "supplier.taxId",
          "AZ_TAX_ID_REQUIRED",
          "Azerbaijani e-tax invoices should capture the supplier tax identifier.",
          "ERROR",
          "AZ"
        )
      );
    }
    issues.push(
      createCountryIssue(
        "invoice.deliveryModes",
        "AZ_ETAX_INVOICE_REQUIRED",
        "Azerbaijan requires VAT payers in scope to issue electronic tax invoices through the tax administration platform.",
        "INFO",
        "AZ"
      )
    );
    return issues;
  },
});
