import { buildDefaultCountryModule, createCountryIssue, hasValue } from "@/lib/invoicing/blueprint/module-factory";

export const chileComplianceModule = buildDefaultCountryModule("CL", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-06",
  evidence: [
    {
      label: "Chile electronic tax document system (SII)",
      url: "https://www.sii.cl/factura_electronica/",
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
  extendTransform(document) {
    const deliveryModes = new Set(document.deliveryModes);
    deliveryModes.add("government_gateway_submission");
    return {
      ...document,
      deliveryModes: [...deliveryModes],
      metadata: {
        ...(document.metadata || {}),
        countryRuleDetail: {
          providerHint: "CL_DTE",
        },
      },
    };
  },
  extendValidation(issues, document) {
    if (document.lines.some((line) => !hasValue(line.description))) {
      issues.push(
        createCountryIssue(
          "invoice.lines",
          "CL_LINE_DESCRIPTION_REQUIRED",
          "Chilean electronic tax documents must describe the goods or services supplied.",
          "ERROR",
          "CL"
        )
      );
    }
    return issues;
  },
});
