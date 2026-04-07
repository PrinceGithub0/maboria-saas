import {
  buildDefaultCountryModule,
  createCountryIssue,
  hasValue,
} from "@/lib/invoicing/blueprint/module-factory";

export const grenadaComplianceModule = buildDefaultCountryModule("GD", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-07",
  evidence: [
    {
      label: "Grenada government tax filing and customs portal",
      url: "https://my.gov.gd/",
      reviewedAt: "2026-04-07",
    },
  ],
  extendValidation(issues, document) {
    if (document.lines.some((line) => !hasValue(line.description))) {
      issues.push(
        createCountryIssue(
          "invoice.lines",
          "GD_LINE_DESCRIPTION_REQUIRED",
          "Grenada business invoices should describe the goods or services supplied.",
          "ERROR",
          "GD"
        )
      );
    }
    issues.push(
      createCountryIssue(
        "invoice.supportingDocuments",
        "GD_CUSTOMS_TAX_PORTAL_NOTICE",
        "Maintain invoice support for Grenada tax filing and customs import duty obligations where applicable.",
        "WARNING",
        "GD"
      )
    );
    return issues;
  },
});
