import {
  buildDefaultCountryModule,
  createCountryIssue,
  hasValue,
} from "@/lib/invoicing/blueprint/module-factory";

export const pitcairnIslandsComplianceModule = buildDefaultCountryModule("PN", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-07",
  evidence: [
    {
      label: "Pitcairn Islands government",
      url: "https://www.government.pn/",
      reviewedAt: "2026-04-07",
    },
    {
      label: "Pitcairn Islands laws",
      url: "https://www.government.pn/laws",
      reviewedAt: "2026-04-07",
    },
  ],
  extendValidation(issues, document) {
    if (document.lines.some((line) => !hasValue(line.description))) {
      issues.push(
        createCountryIssue(
          "invoice.lines",
          "PN_LINE_DESCRIPTION_REQUIRED",
          "Pitcairn Islands invoices should describe the goods or services supplied.",
          "ERROR",
          "PN"
        )
      );
    }
    issues.push(
      createCountryIssue(
        "invoice.supportingDocuments",
        "PN_LAWS_SUPPORT_NOTICE",
        "Retain invoice support consistent with Pitcairn permit, shipping, and ordinance requirements where applicable.",
        "WARNING",
        "PN"
      )
    );
    return issues;
  },
});
