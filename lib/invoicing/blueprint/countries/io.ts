import {
  buildDefaultCountryModule,
  createCountryIssue,
  hasValue,
} from "@/lib/invoicing/blueprint/module-factory";

export const britishIndianOceanTerritoryComplianceModule = buildDefaultCountryModule("IO", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-07",
  evidence: [
    {
      label: "British Indian Ocean Territory profile",
      url: "https://www.gov.uk/government/publications/british-indian-ocean-territory-knowledge-base-profile/british-indian-ocean-territory-knowledge-base-profile",
      reviewedAt: "2026-04-07",
    },
    {
      label: "British Indian Ocean Territory entry requirements",
      url: "https://www.gov.uk/foreign-travel-advice/british-indian-ocean-territory/entry-requirements",
      reviewedAt: "2026-04-07",
    },
  ],
  extendValidation(issues, document) {
    if (document.lines.some((line) => !hasValue(line.description))) {
      issues.push(
        createCountryIssue(
          "invoice.lines",
          "IO_LINE_DESCRIPTION_REQUIRED",
          "British Indian Ocean Territory invoices should describe the goods or services supplied.",
          "ERROR",
          "IO"
        )
      );
    }
    issues.push(
      createCountryIssue(
        "invoice.supportingDocuments",
        "IO_ACCESS_PERMIT_NOTICE",
        "Keep permit, access, logistics, and supporting records aligned with the restricted-access rules for the territory.",
        "WARNING",
        "IO"
      )
    );
    return issues;
  },
});
