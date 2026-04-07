import { buildDefaultCountryModule, createCountryIssue, hasValue } from "@/lib/invoicing/blueprint/module-factory";

export const gambiaComplianceModule = buildDefaultCountryModule("GM", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-06",
  evidence: [
    {
      label: "Gambia Revenue Authority overview",
      url: "https://www.gra.gm/",
      reviewedAt: "2026-04-06",
    },
    {
      label: "Gambia Revenue Authority domestic tax FAQs including VAT",
      url: "https://www.gra.gm/domestic-faqs",
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
          "GM_VAT_ID_REQUIRED",
          "Gambian VAT records should include the supplier tax registration reference.",
          "ERROR",
          "GM"
        )
      );
    }
    if (document.lines.some((line) => !hasValue(line.description))) {
      issues.push(
        createCountryIssue(
          "invoice.lines",
          "GM_LINE_DESCRIPTION_REQUIRED",
          "Gambian VAT records should describe the goods or services supplied.",
          "ERROR",
          "GM"
        )
      );
    }
    return issues;
  },
});
