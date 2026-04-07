import { buildDefaultCountryModule, createCountryIssue, hasValue } from "@/lib/invoicing/blueprint/module-factory";

export const jordanComplianceModule = buildDefaultCountryModule("JO", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-06",
  evidence: [
    {
      label: "Jordan Income and Sales Tax Department electronic billing user manuals",
      url: "https://istd.gov.jo/EN/List/Electronic_billing_User_Manual",
      reviewedAt: "2026-04-06",
    },
    {
      label: "Jordan ISTD notice urging registration in the national billing system",
      url: "https://www.istd.gov.jo/EN/NewsDetails/The_Income_and_Sales_Tax_Department_urges_to_register_in_the_billing_system",
      reviewedAt: "2026-04-06",
    },
  ],
  extendRequiredFields(fields) {
    fields.push("supplier.addressLine1");
    fields.push("supplier.city");
    fields.push("customer.addressLine1");
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
          providerHint: "JO_JOFOTARA",
        },
      },
    };
  },
  extendValidation(issues, document) {
    if (!hasValue(document.supplier.taxId || document.supplier.vatId)) {
      issues.push(
        createCountryIssue(
          "supplier.taxId",
          "JO_TAX_ID_REQUIRED",
          "Jordanian tax invoices must include the supplier tax registration number.",
          "ERROR",
          "JO"
        )
      );
    }
    issues.push(
      createCountryIssue(
        "invoice.deliveryModes",
        "JO_EINVOICING_REQUIRED",
        "Jordan requires obligated taxpayers to join and issue invoices through the national electronic billing system.",
        "INFO",
        "JO"
      )
    );
    return issues;
  },
});
