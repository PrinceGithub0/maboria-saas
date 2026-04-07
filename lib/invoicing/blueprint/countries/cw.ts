import { buildDefaultCountryModule, createCountryIssue, hasValue } from "@/lib/invoicing/blueprint/module-factory";

export const curacaoComplianceModule = buildDefaultCountryModule("CW", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-06",
  evidence: [
    {
      label: "Curacao Belastingdienst omzetbelasting guidance",
      url: "https://belastingdienst.cw/ondernemer/themas/omzetbelasting/",
      reviewedAt: "2026-04-06",
    },
    {
      label: "Curacao Belastingdienst CRIB registration guidance",
      url: "https://belastingdienst.cw/ondernemer/themas/crib-nummer/",
      reviewedAt: "2026-04-06",
    },
  ],
  extendRequiredFields(fields) {
    fields.push("supplier.addressLine1");
    fields.push("supplier.city");
    fields.push("customer.legalName");
    return [...new Set(fields)];
  },
  extendValidation(issues, document) {
    if (!hasValue(document.supplier.taxId || document.supplier.vatId)) {
      issues.push(
        createCountryIssue(
          "supplier.taxId",
          "CW_CRIB_REQUIRED",
          "Curacao turnover-tax compliance requires the supplier CRIB or tax registration number.",
          "ERROR",
          "CW"
        )
      );
    }
    if (document.lines.some((line) => !hasValue(line.description))) {
      issues.push(
        createCountryIssue(
          "invoice.lines",
          "CW_LINE_DESCRIPTION_REQUIRED",
          "Curacao invoices should describe the taxable goods or services supplied.",
          "ERROR",
          "CW"
        )
      );
    }
    return issues;
  },
});
