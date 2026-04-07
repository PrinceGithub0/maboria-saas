import {
  buildDefaultCountryModule,
  createCountryIssue,
  hasValue,
} from "@/lib/invoicing/blueprint/module-factory";

export const tokelauComplianceModule = buildDefaultCountryModule("TK", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-07",
  evidence: [
    {
      label: "Tokelau government",
      url: "https://www.tokelau.org.nz/Tokelau%2BGovernment.html",
      reviewedAt: "2026-04-07",
    },
    {
      label: "Tokelau government structure",
      url: "https://www.tokelau.org.nz/About%2BUs/Government.html",
      reviewedAt: "2026-04-07",
    },
  ],
  extendValidation(issues, document) {
    if (document.lines.some((line) => !hasValue(line.description))) {
      issues.push(
        createCountryIssue(
          "invoice.lines",
          "TK_LINE_DESCRIPTION_REQUIRED",
          "Tokelau invoices should describe the goods or services supplied.",
          "ERROR",
          "TK"
        )
      );
    }
    issues.push(
      createCountryIssue(
        "invoice.supportingDocuments",
        "TK_GOVERNMENT_SUPPORT_NOTICE",
        "Retain invoice support consistent with Tokelau government, shipping, and island administration requirements where applicable.",
        "WARNING",
        "TK"
      )
    );
    return issues;
  },
});
