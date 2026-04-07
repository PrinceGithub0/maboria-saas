import { buildDefaultCountryModule, createCountryIssue, hasValue } from "@/lib/invoicing/blueprint/module-factory";

export const dominicaComplianceModule = buildDefaultCountryModule("DM", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-06",
  evidence: [
    {
      label: "Dominica VAT guidance and rates",
      url: "https://www.ird.gov.dm/tax-laws/value-added-tax",
      reviewedAt: "2026-04-06",
    },
    {
      label: "Dominica guide to filing VAT returns",
      url: "https://www.ird.gov.dm/customer-service/completing-your-vat-return",
      reviewedAt: "2026-04-06",
    },
  ],
  extendRequiredFields(fields) {
    fields.push("supplier.addressLine1", "supplier.city");
    return [...new Set(fields)];
  },
  extendValidation(issues, document) {
    if (document.lines.some((line) => !hasValue(line.description))) {
      issues.push(
        createCountryIssue(
          "invoice.lines",
          "DM_LINE_DESCRIPTION_REQUIRED",
          "Dominica VAT records should describe the goods or services supplied.",
          "ERROR",
          "DM"
        )
      );
    }
    return issues;
  },
});
