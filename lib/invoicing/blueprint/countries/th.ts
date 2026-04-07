import { buildDefaultCountryModule, createCountryIssue, hasValue } from "@/lib/invoicing/blueprint/module-factory";

export const thailandComplianceModule = buildDefaultCountryModule("TH", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-06",
  evidence: [
    {
      label: "Thailand Revenue Department e-Tax Invoice and e-Receipt guidance",
      url: "https://www.rd.go.th/english/30115.html",
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
    deliveryModes.add("xml_export");
    return {
      ...document,
      deliveryModes: [...deliveryModes],
      metadata: {
        ...(document.metadata || {}),
        countryRuleDetail: {
          providerHint: "TH_ETAX",
        },
      },
    };
  },
  extendValidation(issues, document) {
    if (!hasValue(document.supplier.taxId || document.supplier.vatId)) {
      issues.push(
        createCountryIssue(
          "supplier.taxId",
          "TH_TAX_ID_REQUIRED",
          "Thai tax invoices should capture the supplier tax registration identifier.",
          "ERROR",
          "TH"
        )
      );
    }
    issues.push(
      createCountryIssue(
        "invoice.deliveryModes",
        "TH_ETAX_SCOPE_CHECK",
        "Thailand provides the e-Tax Invoice and e-Receipt system; confirm taxpayer eligibility and submission method.",
        "INFO",
        "TH"
      )
    );
    return issues;
  },
});
