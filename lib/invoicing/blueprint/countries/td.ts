import {
  buildDefaultCountryModule,
  createCountryIssue,
  hasValue,
} from "@/lib/invoicing/blueprint/module-factory";

export const chadComplianceModule = buildDefaultCountryModule("TD", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-07",
  evidence: [
    {
      label: "Chad Ministry of Finance DGI",
      url: "https://finances.gouv.td/index.php/directions-generales/dgi",
      reviewedAt: "2026-04-07",
    },
    {
      label: "Chad teledeclaration instruction",
      url: "https://www.finances.gouv.td/index.php/le-ministere/le-ministre/item/660-ux",
      reviewedAt: "2026-04-07",
    },
  ],
  extendValidation(issues, document) {
    if (document.lines.some((line) => !hasValue(line.description))) {
      issues.push(
        createCountryIssue(
          "invoice.lines",
          "TD_LINE_DESCRIPTION_REQUIRED",
          "Chad invoices should describe the goods or services supplied.",
          "ERROR",
          "TD"
        )
      );
    }
    if (document.taxBreakdown.length === 0) {
      issues.push(
        createCountryIssue(
          "invoice.taxBreakdown",
          "TD_TAX_BREAKDOWN_REQUIRED",
          "Chad invoices should show the applicable tax rate and amount.",
          "ERROR",
          "TD"
        )
      );
    }
    return issues;
  },
});
