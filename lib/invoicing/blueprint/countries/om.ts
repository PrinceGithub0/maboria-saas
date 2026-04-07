import { buildDefaultCountryModule, createCountryIssue, hasValue } from "@/lib/invoicing/blueprint/module-factory";

export const omanComplianceModule = buildDefaultCountryModule("OM", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-06",
  evidence: [
    {
      label: "Oman Tax Authority e-invoicing overview",
      url: "https://www.taxoman.gov.om/portal/web/taxportal/e-invoicing",
      reviewedAt: "2026-04-06",
    },
    {
      label: "Oman Tax Authority e-invoicing FAQs",
      url: "https://taxoman.gov.om/portal/e-invoicing-faq",
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
  extendValidation(issues, document) {
    if (!hasValue(document.supplier.taxId || document.supplier.vatId)) {
      issues.push(
        createCountryIssue(
          "supplier.taxId",
          "OM_VAT_ID_REQUIRED",
          "Oman e-invoicing rollout targets VAT-registered taxpayers, so the supplier VAT identifier should be present.",
          "ERROR",
          "OM"
        )
      );
    }
    issues.push(
      createCountryIssue(
        "invoice.deliveryModes",
        "OM_EINVOICING_ROLLOUT",
        "Oman is implementing phased e-invoicing through the Tax Authority platform; confirm phase applicability and structured delivery.",
        "INFO",
        "OM"
      )
    );
    return issues;
  },
});
