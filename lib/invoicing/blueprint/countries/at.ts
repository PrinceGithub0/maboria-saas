import { buildDefaultCountryModule, createCountryIssue, hasValue } from "@/lib/invoicing/blueprint/module-factory";

export const austriaComplianceModule = buildDefaultCountryModule("AT", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-06",
  evidence: [
    {
      label: "Austria federal administration requires e-invoices (USP guidance)",
      url: "https://www.usp.gv.at/en/themen/steuern-finanzen/umsatzsteuer-überblick/weitere-informationen-zur-umsatzsteuer/vorsteuerabzug-und-rechnung/e-rechnung-an-die-oeffentliche-verwaltung.html",
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
          "AT_LINE_DESCRIPTION_REQUIRED",
          "Austrian invoices must describe the goods or services supplied.",
          "ERROR",
          "AT"
        )
      );
    }
    issues.push(
      createCountryIssue(
        "invoice.deliveryModes",
        "AT_B2G_EINVOICE_REQUIRED",
        "Invoices to the Austrian federal administration must be transmitted electronically.",
        "INFO",
        "AT"
      )
    );
    return issues;
  },
});
