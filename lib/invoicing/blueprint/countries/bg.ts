import { buildDefaultCountryModule, createCountryIssue, hasValue } from "@/lib/invoicing/blueprint/module-factory";

export const bulgariaComplianceModule = buildDefaultCountryModule("BG", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-06",
  evidence: [
    {
      label: "Bulgaria National Revenue Agency VAT overview",
      url: "https://nra.bg/wps/portal/nra-en/taxes.en/vat.in.bulgaria.en",
      reviewedAt: "2026-04-06",
    },
    {
      label: "Bulgaria VAT refund guidance under the VATA",
      url: "https://nra.bg/wps/portal/nra-en/taxes.en/vat.in.bulgaria.en/refund-on-the-basis-of-the-tax-return.en",
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
          "BG_LINE_DESCRIPTION_REQUIRED",
          "Bulgarian VAT invoices should identify the supplied goods or services.",
          "ERROR",
          "BG"
        )
      );
    }
    return issues;
  },
});
