import {
  buildDefaultCountryModule,
  createCountryIssue,
  hasValue,
} from "@/lib/invoicing/blueprint/module-factory";

export const syriaComplianceModule = buildDefaultCountryModule("SY", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-07",
  evidence: [
    {
      label: "Syrian Ministry of Finance",
      url: "http://mof.gov.sy/",
      reviewedAt: "2026-04-07",
    },
    {
      label: "Syrian Ministry of Finance services",
      url: "http://mof.gov.sy/index.php?node=5512&cat=1168&",
      reviewedAt: "2026-04-07",
    },
  ],
  extendValidation(issues, document) {
    if (document.lines.some((line) => !hasValue(line.description))) {
      issues.push(
        createCountryIssue(
          "invoice.lines",
          "SY_LINE_DESCRIPTION_REQUIRED",
          "Syrian invoices should describe the goods or services supplied.",
          "ERROR",
          "SY"
        )
      );
    }
    issues.push(
      createCountryIssue(
        "invoice.supportingDocuments",
        "SY_SUPPORTING_RECORDS_NOTICE",
        "Keep Syrian tax registration and supporting commercial records attached for local review.",
        "WARNING",
        "SY"
      )
    );
    return issues;
  },
});
