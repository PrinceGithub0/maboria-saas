import { buildDefaultCountryModule, createCountryIssue, hasValue } from "@/lib/invoicing/blueprint/module-factory";

export const czechComplianceModule = buildDefaultCountryModule("CZ", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-06",
  evidence: [
    {
      label: "Czech VAT Control Statement obligation (Financial Administration)",
      url: "https://financnisprava.gov.cz/en/taxes/VAT-Control-Statement",
      reviewedAt: "2026-04-06",
    },
    {
      label: "Czech VAT control statement service overview (gov.cz)",
      url: "https://portal.gov.cz/en/sluzby-vs/vat-control-statement-S20031",
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
          "CZ_LINE_DESCRIPTION_REQUIRED",
          "Czech invoices must describe the goods or services supplied.",
          "ERROR",
          "CZ"
        )
      );
    }
    if (document.taxBreakdown.length === 0) {
      issues.push(
        createCountryIssue(
          "invoice.taxBreakdown",
          "CZ_TAX_BREAKDOWN_REQUIRED",
          "Czech VAT invoices must show VAT rates and amounts.",
          "ERROR",
          "CZ"
        )
      );
    }
    issues.push(
      createCountryIssue(
        "invoice.deliveryModes",
        "CZ_VAT_CONTROL_STATEMENT_REPORTING",
        "Czech VAT payers must report invoice data via the VAT Control Statement (XML submission).",
        "INFO",
        "CZ"
      )
    );
    return issues;
  },
});
