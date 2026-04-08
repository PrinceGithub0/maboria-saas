import {
  buildDefaultCountryModule,
  createCountryIssue,
  hasValue,
} from "@/lib/invoicing/blueprint/module-factory";

export const guamComplianceModule = buildDefaultCountryModule("GU", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-07",
  evidence: [
    {
      label: "Guam tax structure",
      url: "https://www.guamtax.com/info/structure.html",
      reviewedAt: "2026-04-07",
    },
    {
      label: "Guam groß receipts tax filing instructions",
      url: "https://www.guamtax.com/help/pops/instructions.html",
      reviewedAt: "2026-04-07",
    },
  ],
  extendValidation(issues, document) {
    if (document.lines.some((line) => !hasValue(line.description))) {
      issues.push(
        createCountryIssue(
          "invoice.lines",
          "GU_LINE_DESCRIPTION_REQUIRED",
          "Guam business invoices should describe the goods or services supplied.",
          "ERROR",
          "GU"
        )
      );
    }
    issues.push(
      createCountryIssue(
        "invoice.taxBreakdown",
        "GU_GRT_NOTICE",
        "Confirm whether the transaction is subject to Guam groß receipts tax reporting and monthly return filing.",
        "WARNING",
        "GU"
      )
    );
    return issues;
  },
});
