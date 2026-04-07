import { buildDefaultCountryModule, createCountryIssue, hasValue } from "@/lib/invoicing/blueprint/module-factory";

export const koreaComplianceModule = buildDefaultCountryModule("KR", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-06",
  evidence: [
    {
      label: "Korea National Tax Service e-Tax Invoice overview",
      url: "https://www.nts.go.kr/english/ad/adv_03_05.asp",
      reviewedAt: "2026-04-06",
    },
  ],
  extendRequiredFields(fields) {
    fields.push("supplier.addressLine1");
    fields.push("supplier.postalCode");
    fields.push("supplier.city");
    fields.push("customer.addressLine1");
    fields.push("customer.postalCode");
    fields.push("customer.city");
    return [...new Set(fields)];
  },
  extendValidation(issues, document) {
    if (document.lines.some((line) => !hasValue(line.description))) {
      issues.push(
        createCountryIssue(
          "invoice.lines",
          "KR_LINE_DESCRIPTION_REQUIRED",
          "Korean tax invoices must describe the goods or services supplied.",
          "ERROR",
          "KR"
        )
      );
    }
    issues.push(
      createCountryIssue(
        "invoice.deliveryModes",
        "KR_E_TAX_INVOICE_REQUIRED",
        "Korea requires electronic tax invoices for qualifying businesses; ensure e-tax invoice delivery is configured.",
        "INFO",
        "KR"
      )
    );
    return issues;
  },
});
