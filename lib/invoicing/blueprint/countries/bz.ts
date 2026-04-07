import { buildDefaultCountryModule, createCountryIssue, hasValue } from "@/lib/invoicing/blueprint/module-factory";

export const belizeComplianceModule = buildDefaultCountryModule("BZ", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-06",
  evidence: [
    {
      label: "Belize Customs GST and customs calculation guidance",
      url: "https://www.customs.gov.bz/Customs.html",
      reviewedAt: "2026-04-06",
    },
    {
      label: "Belize Customs government links listing the GST department",
      url: "https://www.customs.gov.bz/links.html",
      reviewedAt: "2026-04-06",
    },
  ],
  extendRequiredFields(fields) {
    fields.push("supplier.addressLine1", "supplier.city");
    return [...new Set(fields)];
  },
  extendValidation(issues, document) {
    if (!hasValue(document.supplier.taxId)) {
      issues.push(
        createCountryIssue(
          "supplier.taxId",
          "BZ_GST_ID_REQUIRED",
          "Belize GST records should include the supplier tax registration reference.",
          "ERROR",
          "BZ"
        )
      );
    }
    if (document.lines.some((line) => !hasValue(line.description))) {
      issues.push(
        createCountryIssue(
          "invoice.lines",
          "BZ_LINE_DESCRIPTION_REQUIRED",
          "Belize GST-supporting invoices should describe the supplied goods or services.",
          "ERROR",
          "BZ"
        )
      );
    }
    return issues;
  },
});
