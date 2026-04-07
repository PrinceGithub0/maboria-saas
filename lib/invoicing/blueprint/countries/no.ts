import { buildDefaultCountryModule, createCountryIssue, hasValue } from "@/lib/invoicing/blueprint/module-factory";

export const norwayComplianceModule = buildDefaultCountryModule("NO", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-06",
  evidence: [
    {
      label: "Norway EHF e-invoicing requirement for public sector suppliers",
      url: "https://www.anskaffelser.no/nn/avtaler-og-regelverk/krav-til-digitalisering-i-offentleg-regelverk",
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
          "NO_LINE_DESCRIPTION_REQUIRED",
          "Norwegian invoices must describe the goods or services supplied.",
          "ERROR",
          "NO"
        )
      );
    }
    issues.push(
      createCountryIssue(
        "invoice.deliveryModes",
        "NO_B2G_EHF_REQUIRED",
        "Public sector suppliers in Norway must use EHF e-invoices.",
        "INFO",
        "NO"
      )
    );
    return issues;
  },
});
