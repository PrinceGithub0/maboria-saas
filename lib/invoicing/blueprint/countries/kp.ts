import {
  buildDefaultCountryModule,
  createCountryIssue,
  hasValue,
} from "@/lib/invoicing/blueprint/module-factory";

export const northKoreaComplianceModule = buildDefaultCountryModule("KP", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-07",
  evidence: [
    {
      label: "DPRK Maritime Administration",
      url: "https://www.ma.gov.kp/",
      reviewedAt: "2026-04-07",
    },
    {
      label: "DPRK maritime laws portal",
      url: "https://www.ma.gov.kp/index.php/laws/index/en",
      reviewedAt: "2026-04-07",
    },
  ],
  extendValidation(issues, document) {
    if (document.lines.some((line) => !hasValue(line.description))) {
      issues.push(
        createCountryIssue(
          "invoice.lines",
          "KP_LINE_DESCRIPTION_REQUIRED",
          "DPRK invoices should describe the goods or services supplied.",
          "ERROR",
          "KP"
        )
      );
    }
    issues.push(
      createCountryIssue(
        "invoice.supportingDocuments",
        "KP_PUBLIC_SOURCE_LIMITATION_NOTICE",
        "Keep DPRK invoice support records and governing approvals attached because public tax source coverage is limited.",
        "WARNING",
        "KP"
      )
    );
    return issues;
  },
});
