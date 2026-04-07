import { buildDefaultCountryModule, createCountryIssue, hasValue } from "@/lib/invoicing/blueprint/module-factory";

export const northMacedoniaComplianceModule = buildDefaultCountryModule("MK", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-06",
  evidence: [
    {
      label: "North Macedonia Ministry of Finance VAT overview",
      url: "https://finance.gov.mk/en-GB/oblasti/danok-na-dodadena-vrednost",
      reviewedAt: "2026-04-06",
    },
    {
      label: "North Macedonia Public Revenue Office tax guide",
      url: "https://www.ujp.gov.mk/en/vodic",
      reviewedAt: "2026-04-06",
    },
  ],
  extendRequiredFields(fields) {
    fields.push("supplier.addressLine1", "supplier.city", "customer.addressLine1", "customer.city");
    return [...new Set(fields)];
  },
  extendValidation(issues, document) {
    if (document.lines.some((line) => !hasValue(line.description))) {
      issues.push(
        createCountryIssue(
          "invoice.lines",
          "MK_LINE_DESCRIPTION_REQUIRED",
          "North Macedonian VAT invoices should identify the supplied goods or services.",
          "ERROR",
          "MK"
        )
      );
    }
    return issues;
  },
});
