import {
  buildDefaultCountryModule,
  createCountryIssue,
  hasValue,
} from "@/lib/invoicing/blueprint/module-factory";

export const southGeorgiaComplianceModule = buildDefaultCountryModule("GS", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-07",
  evidence: [
    {
      label: "Government of South Georgia and the South Sandwich Islands",
      url: "https://gov.gs/",
      reviewedAt: "2026-04-07",
    },
    {
      label: "South Georgia customs clearance and fees policy",
      url: "https://gov.gs/policies/",
      reviewedAt: "2026-04-07",
    },
  ],
  extendValidation(issues, document) {
    if (document.lines.some((line) => !hasValue(line.description))) {
      issues.push(
        createCountryIssue(
          "invoice.lines",
          "GS_LINE_DESCRIPTION_REQUIRED",
          "South Georgia and South Sandwich Islands invoices should describe the goods or services supplied.",
          "ERROR",
          "GS"
        )
      );
    }
    issues.push(
      createCountryIssue(
        "invoice.supportingDocuments",
        "GS_CUSTOMS_FEES_NOTICE",
        "Keep invoice values and shipping support aligned with South Georgia customs clearance, fee, and permit requirements.",
        "WARNING",
        "GS"
      )
    );
    return issues;
  },
});
