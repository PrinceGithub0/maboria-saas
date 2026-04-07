import { buildDefaultCountryModule, createCountryIssue, hasValue } from "@/lib/invoicing/blueprint/module-factory";

export const senegalComplianceModule = buildDefaultCountryModule("SN", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-06",
  evidence: [
    {
      label: "Senegal DGID official portal",
      url: "https://www.dgid.sn/",
      reviewedAt: "2026-04-06",
    },
    {
      label: "Senegal DGID tax legislation portal",
      url: "https://www.dgid.sn/fiscalite-senegalaise/",
      reviewedAt: "2026-04-06",
    },
  ],
  extendValidation(issues, document) {
    if (!hasValue(document.supplier.taxId || document.supplier.vatId)) {
      issues.push(
        createCountryIssue(
          "supplier.taxId",
          "SN_TAX_ID_REQUIRED",
          "Senegalese VAT invoices should capture the supplier tax identifier.",
          "ERROR",
          "SN"
        )
      );
    }
    return issues;
  },
});
