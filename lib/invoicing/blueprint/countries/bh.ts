import { buildDefaultCountryModule, createCountryIssue, hasValue } from "@/lib/invoicing/blueprint/module-factory";

export const bahrainComplianceModule = buildDefaultCountryModule("BH", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-06",
  evidence: [
    {
      label: "Bahrain NBR VAT laws and regulations",
      url: "https://www.nbr.gov.bh/laws_regulations/vat",
      reviewedAt: "2026-04-06",
    },
    {
      label: "Bahrain NBR VAT guidelines and publications",
      url: "https://www.nbr.gov.bh/vat_guideline",
      reviewedAt: "2026-04-06",
    },
  ],
  extendRequiredFields(fields) {
    fields.push("supplier.addressLine1");
    fields.push("supplier.city");
    fields.push("customer.legalName");
    return [...new Set(fields)];
  },
  extendValidation(issues, document) {
    if (document.lines.some((line) => !hasValue(line.description))) {
      issues.push(
        createCountryIssue(
          "invoice.lines",
          "BH_LINE_DESCRIPTION_REQUIRED",
          "Bahrain VAT invoices should describe the goods or services supplied.",
          "ERROR",
          "BH"
        )
      );
    }
    return issues;
  },
});
