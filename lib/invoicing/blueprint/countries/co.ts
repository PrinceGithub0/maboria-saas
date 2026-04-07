import { buildDefaultCountryModule, createCountryIssue, hasValue } from "@/lib/invoicing/blueprint/module-factory";

export const colombiaComplianceModule = buildDefaultCountryModule("CO", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-06",
  evidence: [
    {
      label: "Colombia electronic invoicing system (DIAN)",
      url: "https://www.dian.gov.co/impuestos/Paginas/Sistema-de-Factura-Electronica/Sistema-de-Factura-Electronica.aspx",
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
          providerHint: "CO_DIAN",
        },
      },
    };
  },
  extendValidation(issues, document) {
    if (document.lines.some((line) => !hasValue(line.description))) {
      issues.push(
        createCountryIssue(
          "invoice.lines",
          "CO_LINE_DESCRIPTION_REQUIRED",
          "Colombian electronic invoices must describe the goods or services supplied.",
          "ERROR",
          "CO"
        )
      );
    }
    return issues;
  },
});
