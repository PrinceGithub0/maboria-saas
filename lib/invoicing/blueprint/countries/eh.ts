import {
  buildDefaultCountryModule,
  createCountryIssue,
  hasValue,
} from "@/lib/invoicing/blueprint/module-factory";

export const westernSaharaComplianceModule = buildDefaultCountryModule("EH", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-07",
  evidence: [
    {
      label: "Morocco Ministry of Economy and Finance",
      url: "https://www.finances.gov.ma/",
      reviewedAt: "2026-04-07",
    },
    {
      label: "Morocco tax administration portal",
      url: "https://www.tax.gov.ma/wps/portal/DGI/Accueil",
      reviewedAt: "2026-04-07",
    },
  ],
  extendValidation(issues, document) {
    if (document.lines.some((line) => !hasValue(line.description))) {
      issues.push(
        createCountryIssue(
          "invoice.lines",
          "EH_LINE_DESCRIPTION_REQUIRED",
          "Western Sahara invoices should describe the goods or services supplied.",
          "ERROR",
          "EH"
        )
      );
    }
    issues.push(
      createCountryIssue(
        "invoice.supportingDocuments",
        "EH_TERRITORIAL_REGIME_NOTICE",
        "Keep territorial tax and customs support records attached for Western Sahara billing because administering rules depend on the applied local regime.",
        "WARNING",
        "EH"
      )
    );
    return issues;
  },
});
