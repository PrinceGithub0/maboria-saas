import {
  buildDefaultCountryModule,
  createCountryIssue,
  hasValue,
} from "@/lib/invoicing/blueprint/module-factory";

export const solomonIslandsComplianceModule = buildDefaultCountryModule("SB", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-07",
  evidence: [
    {
      label: "Solomon Islands IRD goods tax",
      url: "https://www.ird.gov.sb/Article.aspx?ID=607",
      reviewedAt: "2026-04-07",
    },
    {
      label: "Solomon Islands IRD homepage",
      url: "https://www.ird.gov.sb/",
      reviewedAt: "2026-04-07",
    },
  ],
  extendValidation(issues, document) {
    if (document.lines.some((line) => !hasValue(line.description))) {
      issues.push(
        createCountryIssue(
          "invoice.lines",
          "SB_LINE_DESCRIPTION_REQUIRED",
          "Solomon Islands invoices should describe the goods or services supplied.",
          "ERROR",
          "SB"
        )
      );
    }
    issues.push(
      createCountryIssue(
        "invoice.taxBreakdown",
        "SB_GOODS_TAX_NOTICE",
        "Confirm Solomon Islands goods tax or sales tax treatment and keep invoice support for import goods tax where applicable.",
        "WARNING",
        "SB"
      )
    );
    return issues;
  },
});
