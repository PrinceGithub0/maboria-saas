import { buildDefaultCountryModule, createCountryIssue } from "@/lib/invoicing/blueprint/module-factory";

export const puertoRicoComplianceModule = buildDefaultCountryModule("PR", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-07",
  evidence: [
    {
      label: "Puerto Rico Hacienda: Impuesto sobre Ventas y Uso (IVU)",
      url: "https://hacienda.pr.gov/comerciantes/impuesto-sobre-ventas-y-uso-ivu",
      reviewedAt: "2026-04-07",
    },
  ],
  extendRequiredFields(fields) {
    fields.push("supplier.taxId");
    fields.push("supplier.legalName");
    return [...new Set(fields)];
  },
  extendValidation(issues, document) {
    if (document.taxBreakdown.length === 0) {
      issues.push(
        createCountryIssue(
          "invoice.taxBreakdown",
          "PR_IVU_DISCLOSURE_RECOMMENDED",
          "Puerto Rico imposes a Sales and Use Tax (IVU). Ensure IVU is calculated and disclosed when applicable.",
          "INFO",
          "PR"
        )
      );
    }
    issues.push(
      createCountryIssue(
        "invoice.metadata",
        "PR_IVU_REGISTRATION_REQUIRED",
        "Merchants selling taxable goods or services in Puerto Rico must be registered to collect and remit IVU.",
        "INFO",
        "PR"
      )
    );
    return issues;
  },
});
