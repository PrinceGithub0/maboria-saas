import {
  buildDefaultCountryModule,
  createCountryIssue,
  hasValue,
} from "@/lib/invoicing/blueprint/module-factory";

export const togoComplianceModule = buildDefaultCountryModule("TG", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-07",
  evidence: [
    {
      label: "Togo Revenue Office",
      url: "https://www.otr.tg/",
      reviewedAt: "2026-04-07",
    },
    {
      label: "Togo Revenue Office English portal",
      url: "https://otr.tg/index.php/en",
      reviewedAt: "2026-04-07",
    },
  ],
  extendValidation(issues, document) {
    if (document.lines.some((line) => !hasValue(line.description))) {
      issues.push(
        createCountryIssue(
          "invoice.lines",
          "TG_LINE_DESCRIPTION_REQUIRED",
          "Togo invoices should describe the goods or services supplied.",
          "ERROR",
          "TG"
        )
      );
    }
    if (document.taxBreakdown.length === 0) {
      issues.push(
        createCountryIssue(
          "invoice.taxBreakdown",
          "TG_TAX_BREAKDOWN_REQUIRED",
          "Togo invoices should show the applicable tax rate and amount.",
          "ERROR",
          "TG"
        )
      );
    }
    return issues;
  },
});
