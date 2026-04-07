import {
  buildDefaultCountryModule,
  createCountryIssue,
  hasValue,
} from "@/lib/invoicing/blueprint/module-factory";

export const eritreaComplianceModule = buildDefaultCountryModule("ER", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-07",
  evidence: [
    {
      label: "Eritrea Ministry of Information",
      url: "https://shabait.com/",
      reviewedAt: "2026-04-07",
    },
    {
      label: "Eritrea finance and development agreement update",
      url: "https://shabait.com/2025/03/11/goe-and-african-development-bank-sign-20-million-agreement/",
      reviewedAt: "2026-04-07",
    },
  ],
  extendValidation(issues, document) {
    if (document.lines.some((line) => !hasValue(line.description))) {
      issues.push(
        createCountryIssue(
          "invoice.lines",
          "ER_LINE_DESCRIPTION_REQUIRED",
          "Eritrea invoices should describe the goods or services supplied.",
          "ERROR",
          "ER"
        )
      );
    }
    if (document.taxBreakdown.length === 0) {
      issues.push(
        createCountryIssue(
          "invoice.taxBreakdown",
          "ER_TAX_BREAKDOWN_REQUIRED",
          "Eritrea invoices should show the applicable tax rate and amount where tax is charged.",
          "ERROR",
          "ER"
        )
      );
    }
    return issues;
  },
});
