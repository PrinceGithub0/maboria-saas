import {
  buildDefaultCountryModule,
  createCountryIssue,
  hasValue,
} from "@/lib/invoicing/blueprint/module-factory";

export const cubaComplianceModule = buildDefaultCountryModule("CU", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-07",
  evidence: [
    {
      label: "Cuba Ministry of Finance and Prices",
      url: "https://www.mfp.gob.cu/",
      reviewedAt: "2026-04-07",
    },
    {
      label: "Cuba national tax administration ONAT",
      url: "https://www.onat.gob.cu/",
      reviewedAt: "2026-04-07",
    },
  ],
  extendValidation(issues, document) {
    if (document.lines.some((line) => !hasValue(line.description))) {
      issues.push(
        createCountryIssue(
          "invoice.lines",
          "CU_LINE_DESCRIPTION_REQUIRED",
          "Cuba invoices should describe the goods or services supplied.",
          "ERROR",
          "CU"
        )
      );
    }
    issues.push(
      createCountryIssue(
        "invoice.taxBreakdown",
        "CU_TRIBUTARY_SYSTEM_NOTICE",
        "Confirm the applicable Cuba tax regime, including sales, service, or enterprise tax treatment, and retain the matching support.",
        "WARNING",
        "CU"
      )
    );
    return issues;
  },
});
