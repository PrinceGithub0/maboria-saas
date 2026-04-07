import { buildDefaultCountryModule, createCountryIssue, hasValue } from "@/lib/invoicing/blueprint/module-factory";

export const uaeComplianceModule = buildDefaultCountryModule("AE", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-06",
  evidence: [
    {
      label: "UAE Ministry of Finance e-invoicing system roadmap (multi-phase, 2026 rollout)",
      url: "https://mof.gov.ae/en/news/ministry-of-finance-showcases-8-innovative-digital-projects-and-services-at-gitex-global-2024/",
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
          "AE_LINE_DESCRIPTION_REQUIRED",
          "UAE invoices must describe the goods or services supplied.",
          "ERROR",
          "AE"
        )
      );
    }
    issues.push(
      createCountryIssue(
        "invoice.deliveryModes",
        "AE_EINVOICE_ROLLOUT",
        "The UAE Ministry of Finance has announced a phased e-invoicing rollout expected to start in 2026; confirm applicability and delivery format.",
        "INFO",
        "AE"
      )
    );
    return issues;
  },
});
