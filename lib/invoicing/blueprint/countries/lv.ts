import { buildDefaultCountryModule, createCountryIssue, hasValue } from "@/lib/invoicing/blueprint/module-factory";

export const latviaComplianceModule = buildDefaultCountryModule("LV", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-06",
  evidence: [
    {
      label: "Latvia official e-address platform for structured e-invoices to authorities",
      url: "https://www.varam.gov.lv/lv/e-adrese",
      reviewedAt: "2026-04-06",
    },
    {
      label: "Latvia legal portal on mandatory e-invoices in public administration",
      url: "https://likumi.lv/ta/id/359037-grozijumi-publisko-iepirkumu-likuma",
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
          "LV_LINE_DESCRIPTION_REQUIRED",
          "Latvian invoices must describe the goods or services supplied.",
          "ERROR",
          "LV"
        )
      );
    }
    issues.push(
      createCountryIssue(
        "invoice.deliveryModes",
        "LV_EINVOICE_PHASED_MANDATE",
        "Latvia requires structured e-invoices in public administration and is rolling out broader e-invoice and reporting obligations in phases.",
        "INFO",
        "LV"
      )
    );
    return issues;
  },
});
