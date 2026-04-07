import {
  buildDefaultCountryModule,
  createCountryIssue,
  hasValue,
} from "@/lib/invoicing/blueprint/module-factory";

export const bouvetIslandComplianceModule = buildDefaultCountryModule("BV", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-07",
  evidence: [
    {
      label: "Bouvet Island overview",
      url: "https://npolar.no/en/themes/bouvetoya/",
      reviewedAt: "2026-04-07",
    },
    {
      label: "Bouvet Island nature reserve regulations",
      url: "https://npolar.no/en/regulations-bouvetoya-nature-reserve/",
      reviewedAt: "2026-04-07",
    },
  ],
  extendValidation(issues, document) {
    if (document.lines.some((line) => !hasValue(line.description))) {
      issues.push(
        createCountryIssue(
          "invoice.lines",
          "BV_LINE_DESCRIPTION_REQUIRED",
          "Bouvet Island invoices should describe the goods or services supplied.",
          "ERROR",
          "BV"
        )
      );
    }
    issues.push(
      createCountryIssue(
        "invoice.supportingDocuments",
        "BV_PERMIT_SUPPORT_NOTICE",
        "Keep Bouvet Island permit, transport, and protected-area support documents with the invoice record.",
        "WARNING",
        "BV"
      )
    );
    return issues;
  },
});
