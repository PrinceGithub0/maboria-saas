import {
  buildDefaultCountryModule,
  createCountryIssue,
  hasValue,
} from "@/lib/invoicing/blueprint/module-factory";

export const falklandIslandsComplianceModule = buildDefaultCountryModule("FK", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-07",
  evidence: [
    {
      label: "Falkland Islands Taxation Office",
      url: "https://www.falklands.gov.fk/taxation/",
      reviewedAt: "2026-04-07",
    },
    {
      label: "Falkland Islands tax legislation",
      url: "https://www.falklands.gov.fk/taxation/legislation",
      reviewedAt: "2026-04-07",
    },
  ],
  extendValidation(issues, document) {
    if (document.lines.some((line) => !hasValue(line.description))) {
      issues.push(
        createCountryIssue(
          "invoice.lines",
          "FK_LINE_DESCRIPTION_REQUIRED",
          "Falkland Islands invoices should describe the goods or services supplied.",
          "ERROR",
          "FK"
        )
      );
    }
    issues.push(
      createCountryIssue(
        "invoice.taxBreakdown",
        "FK_DIRECT_TAX_NOTICE",
        "Confirm Falkland Islands direct-tax, customs, and import-duty treatment because the jurisdiction does not operate a broad VAT regime.",
        "WARNING",
        "FK"
      )
    );
    return issues;
  },
});
