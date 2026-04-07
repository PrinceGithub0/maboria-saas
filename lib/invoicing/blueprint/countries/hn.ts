import { buildDefaultCountryModule, createCountryIssue, hasValue } from "@/lib/invoicing/blueprint/module-factory";

export const hondurasComplianceModule = buildDefaultCountryModule("HN", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-06",
  evidence: [
    {
      label: "Honduras SAR billing regime guidance",
      url: "https://www.sar.gob.hn/facturacion/",
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
    if (!hasValue(document.supplier.taxId || document.supplier.vatId)) {
      issues.push(
        createCountryIssue(
          "supplier.taxId",
          "HN_RTN_REQUIRED",
          "Honduran fiscal documents should include the supplier RTN or tax identifier.",
          "ERROR",
          "HN"
        )
      );
    }
    if (document.lines.some((line) => !hasValue(line.description))) {
      issues.push(
        createCountryIssue(
          "invoice.lines",
          "HN_LINE_DESCRIPTION_REQUIRED",
          "Honduran fiscal documents must identify the goods or services supplied.",
          "ERROR",
          "HN"
        )
      );
    }
    issues.push(
      createCountryIssue(
        "invoice.invoiceNumber",
        "HN_FISCAL_AUTHORIZATION_REVIEW",
        "Honduran invoices should be reviewed against SAR fiscal authorization and document-type rules.",
        "INFO",
        "HN"
      )
    );
    return issues;
  },
});
