import { buildDefaultCountryModule, createCountryIssue, hasValue } from "@/lib/invoicing/blueprint/module-factory";

export const namibiaComplianceModule = buildDefaultCountryModule("NA", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-06",
  evidence: [
    {
      label: "NamRA VAT brochure",
      url: "https://itas.namra.org.na/assets/documents/other-forms/Value_Added_Tax_Brochure.pdf",
      reviewedAt: "2026-04-06",
    },
    {
      label: "NamRA VAT legislation portal",
      url: "https://www.itas.namra.org.na/legislations",
      reviewedAt: "2026-04-06",
    },
  ],
  extendRequiredFields(fields) {
    fields.push("supplier.addressLine1");
    fields.push("supplier.city");
    fields.push("customer.addressLine1");
    fields.push("customer.city");
    return [...new Set(fields)];
  },
  extendValidation(issues, document) {
    if (!hasValue(document.supplier.taxId || document.supplier.vatId)) {
      issues.push(
        createCountryIssue(
          "supplier.taxId",
          "NA_VAT_ID_REQUIRED",
          "Namibia tax invoices must include the supplier VAT registration number.",
          "ERROR",
          "NA"
        )
      );
    }
    return issues;
  },
});
