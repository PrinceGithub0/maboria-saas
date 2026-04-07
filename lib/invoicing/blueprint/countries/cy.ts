import { buildDefaultCountryModule, createCountryIssue, hasValue } from "@/lib/invoicing/blueprint/module-factory";

export const cyprusComplianceModule = buildDefaultCountryModule("CY", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-06",
  evidence: [
    {
      label: "Cyprus Treasury e-invoicing function and public-sector PEPPOL framework",
      url: "https://www.mof.gov.cy/mof/treasury/treasurynew.nsf/index_en/index_en?OpenDocument",
      reviewedAt: "2026-04-06",
    },
    {
      label: "Cyprus Treasury circular on issuing electronic invoices via PEPPOL",
      url: "https://www.mof.gov.cy/mof/treasury/treasurynew.nsf/All/38BB3678D0AEFA4DC2258A760026E3C7/$file/8.%20%CE%9F%20%CF%80%CE%B5%CF%81%CE%AF%20%CF%84%CE%B7%CF%82%20%CE%88%CE%BA%CE%B4%CE%BF%CF%83%CE%B7%CF%82%20%CE%97%CE%BB%CE%B5%CE%BA%CF%84%CF%81%CE%BF%CE%BD%CE%B9%CE%BA%CF%8E%CE%BD%20%CE%A4%CE%B9%CE%BC%CE%BF%CE%BB%CE%BF%CE%B3%CE%AF%CF%89%CE%BD.pdf?OpenElement",
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
          "CY_LINE_DESCRIPTION_REQUIRED",
          "Cypriot invoices must describe the goods or services supplied.",
          "ERROR",
          "CY"
        )
      );
    }
    issues.push(
      createCountryIssue(
        "invoice.deliveryModes",
        "CY_B2G_PEPPOL_REQUIRED",
        "Cyprus public-sector e-invoicing uses the PEPPOL framework; confirm applicability for government customers.",
        "INFO",
        "CY"
      )
    );
    return issues;
  },
});
