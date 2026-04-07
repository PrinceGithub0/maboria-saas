import {
  buildDefaultCountryModule,
  createCountryIssue,
  hasValue,
} from "@/lib/invoicing/blueprint/module-factory";

export const myanmarComplianceModule = buildDefaultCountryModule("MM", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-07",
  evidence: [
    {
      label: "Myanmar Customs Department",
      url: "https://www.customs.gov.mm/",
      reviewedAt: "2026-04-07",
    },
    {
      label: "Myanmar Customs procedures",
      url: "https://www.customs.gov.mm/procedures",
      reviewedAt: "2026-04-07",
    },
  ],
  extendValidation(issues, document) {
    if (document.lines.some((line) => !hasValue(line.description))) {
      issues.push(
        createCountryIssue(
          "invoice.lines",
          "MM_LINE_DESCRIPTION_REQUIRED",
          "Myanmar invoices should describe the goods or services supplied.",
          "ERROR",
          "MM"
        )
      );
    }
    issues.push(
      createCountryIssue(
        "invoice.taxBreakdown",
        "MM_COMMERCIAL_TAX_NOTICE",
        "Confirm the applicable Myanmar commercial-tax, special-goods-tax, or customs treatment and retain matching support.",
        "WARNING",
        "MM"
      )
    );
    return issues;
  },
});
