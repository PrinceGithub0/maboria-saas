import { buildDefaultCountryModule, createCountryIssue, hasValue } from "@/lib/invoicing/blueprint/module-factory";

export const mauritiusComplianceModule = buildDefaultCountryModule("MU", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-06",
  evidence: [
    {
      label: "Mauritius Revenue Authority e-Invoicing guidance",
      url: "https://mra.mu/index.php/e-invoicing",
      reviewedAt: "2026-04-06",
    },
    {
      label: "Mauritius Revenue Authority e-Invoicing portal",
      url: "https://vfiscportal.mra.mu/einvoice-portal/home",
      reviewedAt: "2026-04-06",
    },
  ],
  extendRequiredFields(fields) {
    fields.push("supplier.addressLine1");
    fields.push("supplier.city");
    fields.push("customer.addressLine1");
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
          providerHint: "MU_MRA_EINVOICE",
        },
      },
    };
  },
  extendValidation(issues, document) {
    if (!hasValue(document.supplier.taxId || document.supplier.vatId)) {
      issues.push(
        createCountryIssue(
          "supplier.taxId",
          "MU_TAX_ID_REQUIRED",
          "Mauritius fiscal invoices must include the supplier VAT registration number.",
          "ERROR",
          "MU"
        )
      );
    }
    issues.push(
      createCountryIssue(
        "invoice.deliveryModes",
        "MU_EINVOICING_REQUIRED",
        "Mauritius requires in-scope economic operators to fiscalise invoices in real time with MRA before issuance.",
        "INFO",
        "MU"
      )
    );
    return issues;
  },
});
