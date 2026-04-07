import {
  buildDefaultCountryModule,
  createCountryIssue,
  hasValue,
} from "@/lib/invoicing/blueprint/module-factory";

export const marshallIslandsComplianceModule = buildDefaultCountryModule("MH", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-07",
  evidence: [
    {
      label: "Marshall Islands customs department",
      url: "https://mof.gov.mh/department-of-customs/",
      reviewedAt: "2026-04-07",
    },
    {
      label: "U.S. DOI insular areas and freely associated states",
      url: "https://www.doi.gov/library/internet/insular",
      reviewedAt: "2026-04-07",
    },
  ],
  extendValidation(issues, document) {
    if (document.lines.some((line) => !hasValue(line.description))) {
      issues.push(
        createCountryIssue(
          "invoice.lines",
          "MH_LINE_DESCRIPTION_REQUIRED",
          "Marshall Islands invoices should describe the goods or services supplied.",
          "ERROR",
          "MH"
        )
      );
    }
    issues.push(
      createCountryIssue(
        "invoice.supportingDocuments",
        "MH_CUSTOMS_TAX_NOTICE",
        "Retain invoice support for Marshall Islands customs declarations and applicable local sales or business tax treatment.",
        "WARNING",
        "MH"
      )
    );
    return issues;
  },
});
