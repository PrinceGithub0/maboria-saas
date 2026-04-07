import {
  buildDefaultCountryModule,
  createCountryIssue,
  hasValue,
} from "@/lib/invoicing/blueprint/module-factory";

export const saoTomeAndPrincipeComplianceModule = buildDefaultCountryModule("ST", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-07",
  evidence: [
    {
      label: "Sao Tome tax directorate",
      url: "https://impostos.financas.gov.st/index.php/institucional/sobre-nos",
      reviewedAt: "2026-04-07",
    },
    {
      label: "Sao Tome business tax registration guidance",
      url: "https://impostos.financas.gov.st/index.php/investment-planning",
      reviewedAt: "2026-04-07",
    },
  ],
  extendValidation(issues, document) {
    if (document.lines.some((line) => !hasValue(line.description))) {
      issues.push(
        createCountryIssue(
          "invoice.lines",
          "ST_LINE_DESCRIPTION_REQUIRED",
          "Sao Tome and Principe invoices should describe the goods or services supplied.",
          "ERROR",
          "ST"
        )
      );
    }
    if (document.taxBreakdown.length === 0) {
      issues.push(
        createCountryIssue(
          "invoice.taxBreakdown",
          "ST_TAX_BREAKDOWN_REQUIRED",
          "Sao Tome and Principe invoices should show the applicable tax rate and amount.",
          "ERROR",
          "ST"
        )
      );
    }
    return issues;
  },
});
