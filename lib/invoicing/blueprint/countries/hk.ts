import { buildDefaultCountryModule, createCountryIssue, hasValue } from "@/lib/invoicing/blueprint/module-factory";

export const hongKongComplianceModule = buildDefaultCountryModule("HK", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-06",
  evidence: [
    {
      label: "Hong Kong IRD electronic filing for profits tax returns",
      url: "https://www.ird.gov.hk/eng/tax/bus_epf.htm",
      reviewedAt: "2026-04-06",
    },
  ],
  extendRequiredFields(fields) {
    fields.push("supplier.legalName");
    fields.push("supplier.addressLine1");
    fields.push("supplier.city");
    return [...new Set(fields)];
  },
  extendValidation(issues, document) {
    if (!hasValue(document.supplier.registrationNumber)) {
      issues.push(
        createCountryIssue(
          "supplier.registrationNumber",
          "HK_BUSINESS_REGISTRATION_RECOMMENDED",
          "Hong Kong business invoices are stronger when the business registration reference is captured.",
          "WARNING",
          "HK"
        )
      );
    }
    if (document.lines.some((line) => !hasValue(line.description))) {
      issues.push(
        createCountryIssue(
          "invoice.lines",
          "HK_LINE_DESCRIPTION_REQUIRED",
          "Hong Kong invoices should describe the goods or services supplied.",
          "ERROR",
          "HK"
        )
      );
    }
    return issues;
  },
});
