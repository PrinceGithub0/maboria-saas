import { buildDefaultCountryModule, createCountryIssue, hasValue } from "@/lib/invoicing/blueprint/module-factory";

export const caboVerdeComplianceModule = buildDefaultCountryModule("CV", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-06",
  evidence: [
    {
      label: "Cabo Verde IVA legislation portal",
      url: "https://www.mf.gov.cv/web/dnre/legislacao/-/document_library/kawUcttkhMXD/view/64715?_com_liferay_document_library_web_portlet_DLPortlet_INSTANCE_kawUcttkhMXD_navigation=recent",
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
          "CV_TAX_ID_REQUIRED",
          "Cabo Verde IVA invoices should capture the supplier tax identifier.",
          "ERROR",
          "CV"
        )
      );
    }
    return issues;
  },
});
