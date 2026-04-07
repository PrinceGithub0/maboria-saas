import {
  buildDefaultCountryModule,
  createCountryIssue,
  hasValue,
} from "@/lib/invoicing/blueprint/module-factory";

export const antarcticaComplianceModule = buildDefaultCountryModule("AQ", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-07",
  evidence: [
    {
      label: "Australian Antarctic Territory overview",
      url: "https://www.antarctica.gov.au/about-antarctica/australia-in-antarctica/australian-antarctic-territory/",
      reviewedAt: "2026-04-07",
    },
    {
      label: "Australian Antarctic Territory law",
      url: "https://www.antarctica.gov.au/about-antarctica/australia-in-antarctica/law/",
      reviewedAt: "2026-04-07",
    },
  ],
  extendValidation(issues, document) {
    if (document.lines.some((line) => !hasValue(line.description))) {
      issues.push(
        createCountryIssue(
          "invoice.lines",
          "AQ_LINE_DESCRIPTION_REQUIRED",
          "Antarctic expedition invoices should describe the goods or services supplied.",
          "ERROR",
          "AQ"
        )
      );
    }
    issues.push(
      createCountryIssue(
        "invoice.supportingDocuments",
        "AQ_EXPEDITION_SUPPORT_NOTICE",
        "Keep Antarctic station, logistics, and contract support aligned with the governing territorial and expedition rules.",
        "WARNING",
        "AQ"
      )
    );
    return issues;
  },
});
