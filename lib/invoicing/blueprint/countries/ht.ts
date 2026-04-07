import {
  buildDefaultCountryModule,
  createCountryIssue,
  hasValue,
} from "@/lib/invoicing/blueprint/module-factory";

export const haitiComplianceModule = buildDefaultCountryModule("HT", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-07",
  evidence: [
    {
      label: "Haiti Direction Generale des Impots",
      url: "https://dgi.gouv.ht/",
      reviewedAt: "2026-04-07",
    },
    {
      label: "Haiti DGI administrative attributions",
      url: "https://dgi.gouv.ht/attributions/",
      reviewedAt: "2026-04-07",
    },
  ],
  extendValidation(issues, document) {
    if (document.lines.some((line) => !hasValue(line.description))) {
      issues.push(
        createCountryIssue(
          "invoice.lines",
          "HT_LINE_DESCRIPTION_REQUIRED",
          "Haitian business invoices should describe the goods or services supplied.",
          "ERROR",
          "HT"
        )
      );
    }
    issues.push(
      createCountryIssue(
        "invoice.taxBreakdown",
        "HT_LOCAL_TAX_NOTICE",
        "Confirm whether Haitian turnover, registration, or documentary tax obligations apply to the transaction.",
        "WARNING",
        "HT"
      )
    );
    return issues;
  },
});
