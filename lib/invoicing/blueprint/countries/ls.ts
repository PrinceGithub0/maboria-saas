import { buildDefaultCountryModule, createCountryIssue, hasValue } from "@/lib/invoicing/blueprint/module-factory";

export const lesothoComplianceModule = buildDefaultCountryModule("LS", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-06",
  evidence: [
    {
      label: "Lesotho VAT guidance",
      url: "https://www.rsl.org.ls/value-added-tax-vat",
      reviewedAt: "2026-04-06",
    },
    {
      label: "Lesotho Lekuka e-invoicing system announcement",
      url: "https://www.rsl.org.ls/rsl-hosts-chinese-business-community-lekuka-e-invoicing-system",
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
          "LS_LINE_DESCRIPTION_REQUIRED",
          "Lesotho VAT invoices should describe the goods or services supplied.",
          "ERROR",
          "LS"
        )
      );
    }
    return issues;
  },
});
