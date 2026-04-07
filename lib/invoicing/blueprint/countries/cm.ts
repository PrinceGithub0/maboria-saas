import { buildDefaultCountryModule, createCountryIssue, hasValue } from "@/lib/invoicing/blueprint/module-factory";

export const cameroonComplianceModule = buildDefaultCountryModule("CM", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-06",
  evidence: [
    {
      label: "Cameroon tax authority VAT information sheet",
      url: "https://impots.cm/sites/default/files/documents/FICHE%20TVA.pdf",
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
          "CM_LINE_DESCRIPTION_REQUIRED",
          "Cameroon VAT invoices should describe the goods or services supplied.",
          "ERROR",
          "CM"
        )
      );
    }
    return issues;
  },
});
