import { buildDefaultCountryModule, createCountryIssue, hasValue } from "@/lib/invoicing/blueprint/module-factory";

export const estoniaComplianceModule = buildDefaultCountryModule("EE", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-06",
  evidence: [
    {
      label: "Estonia Accounting Act e-invoice rights and public sector obligation (Riigi Teataja)",
      url: "https://www.riigiteataja.ee/en/eli/529062023003/consolide",
      reviewedAt: "2026-04-06",
    },
    {
      label: "Estonia business register e-invoice recipient registry (RIK)",
      url: "https://ariregister.rik.ee/eng",
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
          "EE_LINE_DESCRIPTION_REQUIRED",
          "Estonian invoices must describe the goods or services supplied.",
          "ERROR",
          "EE"
        )
      );
    }
    issues.push(
      createCountryIssue(
        "invoice.deliveryModes",
        "EE_B2G_EINVOICE_REQUIRED",
        "Supplies to the Estonian public sector must be issued as structured e-invoices; B2B buyers can also demand e-invoices if registered.",
        "INFO",
        "EE"
      )
    );
    return issues;
  },
});
