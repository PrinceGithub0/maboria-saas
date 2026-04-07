import { buildDefaultCountryModule, createCountryIssue, hasValue } from "@/lib/invoicing/blueprint/module-factory";

export const nigeriaComplianceModule = buildDefaultCountryModule("NG", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-06",
  evidence: [
    {
      label: "Nigeria FIRS public notice introducing the national e-invoicing regime",
      url: "https://www.firs.gov.ng/pdf/FIRS_adv.pdf",
      reviewedAt: "2026-04-06",
    },
    {
      label: "FIRS ATRS e-invoice platform",
      url: "https://atrs.firs.gov.ng/",
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
          providerHint: "NG_FIRS_EFS",
        },
      },
    };
  },
  extendValidation(issues, document) {
    if (!hasValue(document.supplier.taxId || document.supplier.vatId)) {
      issues.push(
        createCountryIssue(
          "supplier.taxId",
          "NG_TAX_ID_REQUIRED",
          "Nigeria's e-invoicing regime requires the supplier tax identifier for FIRS onboarding and validation.",
          "ERROR",
          "NG"
        )
      );
    }
    issues.push(
      createCountryIssue(
        "invoice.deliveryModes",
        "NG_EINVOICE_REQUIRED_FOR_ELIGIBLE_TAXPAYERS",
        "Nigeria requires real-time electronic invoice generation and transmission for eligible taxpayers under the FIRS Electronic Fiscal System.",
        "INFO",
        "NG"
      )
    );
    return issues;
  },
});
