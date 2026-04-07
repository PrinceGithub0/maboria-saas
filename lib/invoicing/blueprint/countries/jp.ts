import { buildDefaultCountryModule, createCountryIssue, hasValue } from "@/lib/invoicing/blueprint/module-factory";

export const japanComplianceModule = buildDefaultCountryModule("JP", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-06",
  evidence: [
    {
      label: "Japan Qualified Invoice System (invoice method) guidance",
      url: "https://www.nta.go.jp/taxes/shiraberu/zeimokubetsu/shohi/keigenzeiritsu/invoice_tebiki.htm",
      reviewedAt: "2026-04-06",
    },
  ],
  extendRequiredFields(fields) {
    fields.push("supplier.addressLine1");
    fields.push("supplier.postalCode");
    fields.push("supplier.city");
    return [...new Set(fields)];
  },
  extendValidation(issues, document) {
    if (document.lines.some((line) => !hasValue(line.description))) {
      issues.push(
        createCountryIssue(
          "invoice.lines",
          "JP_LINE_DESCRIPTION_REQUIRED",
          "Japanese invoices must describe the goods or services supplied.",
          "ERROR",
          "JP"
        )
      );
    }
    if (!hasValue(document.supplier.taxId || document.supplier.registrationNumber)) {
      issues.push(
        createCountryIssue(
          "supplier.taxId",
          "JP_QUALIFIED_INVOICE_REG_REQUIRED",
          "Qualified invoices in Japan require the issuer registration number.",
          "WARNING",
          "JP"
        )
      );
    }
    return issues;
  },
});
