import {
  buildDefaultCountryModule,
  createCountryIssue,
  hasValue,
} from "@/lib/invoicing/blueprint/module-factory";

export const eswatiniComplianceModule = buildDefaultCountryModule("SZ", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-07",
  evidence: [
    {
      label: "Eswatini Revenue Service",
      url: "https://www.sra.org.sz/",
      reviewedAt: "2026-04-07",
    },
    {
      label: "Eswatini VAT guidance",
      url: "https://www.sra.org.sz/vat/",
      reviewedAt: "2026-04-07",
    },
  ],
  extendValidation(issues, document) {
    if (document.lines.some((line) => !hasValue(line.description))) {
      issues.push(
        createCountryIssue(
          "invoice.lines",
          "SZ_LINE_DESCRIPTION_REQUIRED",
          "Eswatini invoices should describe the goods or services supplied.",
          "ERROR",
          "SZ"
        )
      );
    }
    if (document.taxBreakdown.length === 0) {
      issues.push(
        createCountryIssue(
          "invoice.taxBreakdown",
          "SZ_VAT_BREAKDOWN_REQUIRED",
          "Eswatini VAT invoices should show the applicable VAT rate and amount.",
          "ERROR",
          "SZ"
        )
      );
    }
    return issues;
  },
});
