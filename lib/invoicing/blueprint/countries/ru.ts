import { buildDefaultCountryModule, createCountryIssue, hasValue } from "@/lib/invoicing/blueprint/module-factory";

export const russiaComplianceModule = buildDefaultCountryModule("RU", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-06",
  evidence: [
    {
      label: "Federal Tax Service: VAT invoice requirement (Tax Code Article 169)",
      url: "https://www.nalog.gov.ru/rn60/news/tax_doc_news/5237168/",
      reviewedAt: "2026-04-06",
    },
    {
      label: "Tax Code of the Russian Federation, Article 169 (Invoice)",
      url: "http://www.consultant.ru/document/cons_doc_LAW_19671/4bcb23aa6a3b7c468808f4af6c52f2a0f8b5e6c5/",
      reviewedAt: "2026-04-06",
    },
  ],
  extendRequiredFields(fields, document) {
    fields.push("supplier.legalName");
    fields.push("supplier.taxId");
    fields.push("customer.legalName");
    if (document.buyerType === "B2B") {
      fields.push("customer.taxId");
    }
    fields.push("invoice.invoiceNumber");
    fields.push("invoice.issueDate");
    return [...new Set(fields)];
  },
  extendValidation(issues, document) {
    if (document.lines.some((line) => !hasValue(line.description))) {
      issues.push(
        createCountryIssue(
          "invoice.lines",
          "RU_LINE_DESCRIPTION_REQUIRED",
          "Russian VAT invoices must describe the goods or services supplied.",
          "ERROR",
          "RU"
        )
      );
    }
    if (document.taxBreakdown.length === 0) {
      issues.push(
        createCountryIssue(
          "invoice.taxBreakdown",
          "RU_TAX_BREAKDOWN_REQUIRED",
          "Russian VAT invoices must show VAT rates and amounts.",
          "ERROR",
          "RU"
        )
      );
    }
    if (
      document.buyerType === "B2B" &&
      !hasValue(document.customer.taxId || document.customer.vatId)
    ) {
      issues.push(
        createCountryIssue(
          "customer.taxId",
          "RU_BUYER_TAX_ID_REQUIRED",
          "B2B Russian VAT invoices must include the buyer's VAT tax number.",
          "ERROR",
          "RU"
        )
      );
    }
    return issues;
  },
});
