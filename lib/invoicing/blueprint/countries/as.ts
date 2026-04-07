import {
  buildDefaultCountryModule,
  createCountryIssue,
  hasValue,
} from "@/lib/invoicing/blueprint/module-factory";

export const americanSamoaComplianceModule = buildDefaultCountryModule("AS", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-07",
  evidence: [
    {
      label: "American Samoa Tax Office",
      url: "https://www.americansamoa.gov/tax-office",
      reviewedAt: "2026-04-07",
    },
    {
      label: "American Samoa Government portal",
      url: "https://www.americansamoa.gov/",
      reviewedAt: "2026-04-07",
    },
  ],
  extendValidation(issues, document) {
    if (document.lines.some((line) => !hasValue(line.description))) {
      issues.push(
        createCountryIssue(
          "invoice.lines",
          "AS_LINE_DESCRIPTION_REQUIRED",
          "American Samoa invoices should describe the goods or services supplied.",
          "ERROR",
          "AS"
        )
      );
    }
    issues.push(
      createCountryIssue(
        "invoice.supportingDocuments",
        "AS_TAX_OFFICE_SUPPORT_NOTICE",
        "Retain invoice support consistent with American Samoa Tax Office filing and territorial tax records.",
        "WARNING",
        "AS"
      )
    );
    return issues;
  },
});
