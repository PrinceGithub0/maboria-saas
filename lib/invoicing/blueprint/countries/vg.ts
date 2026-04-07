import {
  buildDefaultCountryModule,
  createCountryIssue,
  hasValue,
} from "@/lib/invoicing/blueprint/module-factory";

export const britishVirginIslandsComplianceModule = buildDefaultCountryModule("VG", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-07",
  evidence: [
    {
      label: "Virgin Islands Inland Revenue Department",
      url: "https://gov.vg/inland-revenue-department",
      reviewedAt: "2026-04-07",
    },
    {
      label: "Virgin Islands Inland Revenue services",
      url: "https://bvi.gov.vg/department-services/66",
      reviewedAt: "2026-04-07",
    },
  ],
  extendValidation(issues, document) {
    if (document.lines.some((line) => !hasValue(line.description))) {
      issues.push(
        createCountryIssue(
          "invoice.lines",
          "VG_LINE_DESCRIPTION_REQUIRED",
          "British Virgin Islands invoices should describe the goods or services supplied.",
          "ERROR",
          "VG"
        )
      );
    }
    issues.push(
      createCountryIssue(
        "invoice.taxBreakdown",
        "VG_DIRECT_TAX_NOTICE",
        "Confirm Virgin Islands payroll tax, stamp duty, hotel tax, or other fee treatment because the jurisdiction does not operate a broad VAT regime.",
        "WARNING",
        "VG"
      )
    );
    return issues;
  },
});
