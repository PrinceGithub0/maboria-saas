import { buildDefaultCountryModule, createCountryIssue, hasValue } from "@/lib/invoicing/blueprint/module-factory";

export const tanzaniaComplianceModule = buildDefaultCountryModule("TZ", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-06",
  evidence: [
    {
      label: "Tanzania Revenue Authority EFDMS external portal",
      url: "https://efdmsportal.tra.go.tz/",
      reviewedAt: "2026-04-06",
    },
    {
      label: "Tanzania Revenue Authority EFD receipt verification portal",
      url: "https://verify.tra.go.tz/",
      reviewedAt: "2026-04-06",
    },
  ],
  extendRequiredFields(fields) {
    fields.push("supplier.addressLine1");
    fields.push("supplier.city");
    return [...new Set(fields)];
  },
  extendValidation(issues, document) {
    if (!hasValue(document.supplier.taxId || document.supplier.vatId)) {
      issues.push(
        createCountryIssue(
          "supplier.taxId",
          "TZ_TAX_ID_REQUIRED",
          "Tanzania tax invoices and EFD receipts must include the supplier tax identifier.",
          "ERROR",
          "TZ"
        )
      );
    }
    return issues;
  },
});
