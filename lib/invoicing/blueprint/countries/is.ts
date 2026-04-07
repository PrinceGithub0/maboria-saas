import { buildDefaultCountryModule, createCountryIssue, hasValue } from "@/lib/invoicing/blueprint/module-factory";

export const icelandComplianceModule = buildDefaultCountryModule("IS", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-06",
  evidence: [
    {
      label: "Iceland VAT guidance and invoicing requirements",
      url: "https://www.skatturinn.is/english/companies/value-added-tax/nr/1968",
      reviewedAt: "2026-04-06",
    },
    {
      label: "Iceland VAT rate guidance",
      url: "https://www.skatturinn.is/atvinnurekstur/virdisaukaskattur/skattskylda-og-skattprosentur/",
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
          "IS_LINE_DESCRIPTION_REQUIRED",
          "Icelandic VAT invoices should identify the supplied goods or services.",
          "ERROR",
          "IS"
        )
      );
    }
    return issues;
  },
});
