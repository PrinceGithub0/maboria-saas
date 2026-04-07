import {
  buildDefaultCountryModule,
  createCountryIssue,
  hasValue,
} from "@/lib/invoicing/blueprint/module-factory";

export const laosComplianceModule = buildDefaultCountryModule("LA", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-07",
  evidence: [
    {
      label: "Laos Ministry of Finance",
      url: "https://www.mof.gov.la/",
      reviewedAt: "2026-04-07",
    },
    {
      label: "Laos Ministry of Finance about page",
      url: "https://www.mof.gov.la/about",
      reviewedAt: "2026-04-07",
    },
  ],
  extendValidation(issues, document) {
    if (document.lines.some((line) => !hasValue(line.description))) {
      issues.push(
        createCountryIssue(
          "invoice.lines",
          "LA_LINE_DESCRIPTION_REQUIRED",
          "Laos invoices should describe the goods or services supplied.",
          "ERROR",
          "LA"
        )
      );
    }
    issues.push(
      createCountryIssue(
        "invoice.taxBreakdown",
        "LA_VAT_AND_CUSTOMS_NOTICE",
        "Confirm the applicable Laos VAT, excise, or customs treatment and retain the matching supporting documents.",
        "WARNING",
        "LA"
      )
    );
    return issues;
  },
});
