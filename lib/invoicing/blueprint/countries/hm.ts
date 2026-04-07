import {
  buildDefaultCountryModule,
  createCountryIssue,
  hasValue,
} from "@/lib/invoicing/blueprint/module-factory";

export const heardAndMcDonaldIslandsComplianceModule = buildDefaultCountryModule("HM", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-07",
  evidence: [
    {
      label: "Heard Island and McDonald Islands overview",
      url: "https://www.antarctica.gov.au/antarctic-operations/stations-and-field-locations/heard-island/",
      reviewedAt: "2026-04-07",
    },
    {
      label: "Heard Island and McDonald Islands campaign update",
      url: "https://www.antarctica.gov.au/news/2026/heard-island-and-mcdonald-islands-campaign-delivers-key-objectives/",
      reviewedAt: "2026-04-07",
    },
  ],
  extendValidation(issues, document) {
    if (document.lines.some((line) => !hasValue(line.description))) {
      issues.push(
        createCountryIssue(
          "invoice.lines",
          "HM_LINE_DESCRIPTION_REQUIRED",
          "Heard Island and McDonald Islands invoices should describe the goods or services supplied.",
          "ERROR",
          "HM"
        )
      );
    }
    issues.push(
      createCountryIssue(
        "invoice.supportingDocuments",
        "HM_RESEARCH_LOGISTICS_NOTICE",
        "Keep expedition, environmental, and shipping support aligned with Heard and McDonald Islands territory controls.",
        "WARNING",
        "HM"
      )
    );
    return issues;
  },
});
