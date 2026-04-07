import { buildDefaultCountryModule, createCountryIssue, hasValue } from "@/lib/invoicing/blueprint/module-factory";

export const nicaraguaComplianceModule = buildDefaultCountryModule("NI", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-06",
  evidence: [
    {
      label: "Nicaragua DGI digital fiscal stamp guidance",
      url: "https://timbrefiscal.dgi.gob.ni/?TEF=2e485dcba380cbaeae9408daaa9be441",
      reviewedAt: "2026-04-06",
    },
    {
      label: "Nicaragua DGI fiscal document verification notice",
      url: "https://www.dgi.gob.ni/pdfNoticia/4453",
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
          "NI_RUC_REQUIRED",
          "Nicaraguan fiscal documents should include the supplier RUC or tax identifier.",
          "ERROR",
          "NI"
        )
      );
    }
    if (document.lines.some((line) => !hasValue(line.description))) {
      issues.push(
        createCountryIssue(
          "invoice.lines",
          "NI_LINE_DESCRIPTION_REQUIRED",
          "Nicaraguan fiscal documents should identify the goods or services supplied.",
          "ERROR",
          "NI"
        )
      );
    }
    issues.push(
      createCountryIssue(
        "invoice.invoiceNumber",
        "NI_FISCAL_DOCUMENT_VALIDATION",
        "Nicaraguan fiscal documents should use DGI-valid document numbering and digital validation where applicable.",
        "INFO",
        "NI"
      )
    );
    return issues;
  },
});
