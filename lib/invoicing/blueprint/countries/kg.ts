import { buildDefaultCountryModule, createCountryIssue } from "@/lib/invoicing/blueprint/module-factory";

export const kyrgyzstanComplianceModule = buildDefaultCountryModule("KG", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-07",
  evidence: [
    {
      label: "Kyrgyz tax service VAT invoice verification portal",
      url: "https://ws3.sti.gov.kg/STS.Invoice.web/main.mvc",
      reviewedAt: "2026-04-07",
    },
    {
      label: "Kyrgyz tax service VAT invoice search portal",
      url: "https://ws3.sti.gov.kg/externalinfo/main.mvc",
      reviewedAt: "2026-04-07",
    },
  ],
  extendValidation(issues, document) {
    issues.push(
      createCountryIssue(
        "invoice.externalReference",
        "KG_VAT_INVOICE_TRACEABILITY",
        "Kyrgyz taxpayers should keep VAT invoice identifiers traceable to the state tax service verification systems.",
        "WARNING",
        "KG"
      )
    );
    return issues;
  },
});
