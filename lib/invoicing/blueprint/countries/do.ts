import { buildDefaultCountryModule, createCountryIssue, hasValue } from "@/lib/invoicing/blueprint/module-factory";

export const dominicanRepublicComplianceModule = buildDefaultCountryModule("DO", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-06",
  evidence: [
    {
      label: "DGII electronic fiscal receipt framework",
      url: "https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Paginas/marcoLegal.aspx",
      reviewedAt: "2026-04-06",
    },
    {
      label: "DGII electronic fiscal receipt structure and rules",
      url: "https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Paginas/TipoyEstructurae-CF.aspx",
      reviewedAt: "2026-04-06",
    },
  ],
  extendRequiredFields(fields, document) {
    fields.push("supplier.addressLine1");
    fields.push("supplier.city");
    fields.push("customer.legalName");
    if (document.buyerType === "B2B") {
      fields.push("customer.taxId");
    }
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
          providerHint: "DO_DGII_ECF",
        },
      },
    };
  },
  extendValidation(issues, document) {
    if (!hasValue(document.supplier.taxId || document.supplier.vatId)) {
      issues.push(
        createCountryIssue(
          "supplier.taxId",
          "DO_RNC_REQUIRED",
          "Dominican electronic tax receipts require the issuer RNC or tax identifier.",
          "ERROR",
          "DO"
        )
      );
    }
    if (document.buyerType === "B2B" && !hasValue(document.customer.taxId || document.customer.vatId)) {
      issues.push(
        createCountryIssue(
          "customer.taxId",
          "DO_BUYER_RNC_REQUIRED",
          "Dominican B2B invoices should include the buyer RNC or tax identifier.",
          "ERROR",
          "DO"
        )
      );
    }
    issues.push(
      createCountryIssue(
        "invoice.deliveryModes",
        "DO_ECF_REQUIRED",
        "Dominican Republic e-CF workflows should be used where DGII electronic fiscal receipt rules apply.",
        "INFO",
        "DO"
      )
    );
    return issues;
  },
});
