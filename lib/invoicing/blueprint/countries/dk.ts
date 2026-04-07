import { buildDefaultCountryModule, createCountryIssue, hasValue } from "@/lib/invoicing/blueprint/module-factory";

export const denmarkComplianceModule = buildDefaultCountryModule("DK", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-06",
  evidence: [
    {
      label: "Denmark OIOUBL requirement for electronic invoicing to public authorities (BEK 354/2010)",
      url: "https://www.retsinformation.dk/eli/lta/2010/354",
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
          "DK_LINE_DESCRIPTION_REQUIRED",
          "Danish invoices must describe the goods or services supplied.",
          "ERROR",
          "DK"
        )
      );
    }
    issues.push(
      createCountryIssue(
        "invoice.deliveryModes",
        "DK_B2G_OIOUBL_REQUIRED",
        "Public authorities in Denmark require structured OIOUBL e-invoices.",
        "INFO",
        "DK"
      )
    );
    return issues;
  },
});
