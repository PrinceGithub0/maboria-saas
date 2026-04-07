import { buildDefaultCountryModule, createCountryIssue, hasValue } from "@/lib/invoicing/blueprint/module-factory";

export const croatiaComplianceModule = buildDefaultCountryModule("HR", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-06",
  evidence: [
    {
      label: "Croatia public procurement e-invoicing (FINA e-Račun)",
      url: "https://www.fina.hr/e-racun",
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
          "HR_LINE_DESCRIPTION_REQUIRED",
          "Croatian invoices must describe the goods or services supplied.",
          "ERROR",
          "HR"
        )
      );
    }
    issues.push(
      createCountryIssue(
        "invoice.deliveryModes",
        "HR_B2G_EINVOICE_REQUIRED",
        "Supplies to Croatian public authorities require structured e-invoices (e-Račun via FINA).",
        "INFO",
        "HR"
      )
    );
    return issues;
  },
});
