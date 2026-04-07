import { buildDefaultCountryModule, createCountryIssue, hasValue } from "@/lib/invoicing/blueprint/module-factory";

export const argentinaComplianceModule = buildDefaultCountryModule("AR", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-06",
  evidence: [
    {
      label: "AFIP electronic invoicing vs fiscal controller requirements",
      url: "https://www.afip.gov.ar/facturacion/comprobantes/fe-vs-cf.asp",
      reviewedAt: "2026-04-06",
    },
  ],
  extendRequiredFields(fields) {
    fields.push("supplier.addressLine1");
    fields.push("supplier.postalCode");
    fields.push("supplier.city");
    fields.push("customer.legalName");
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
          providerHint: "AR_AFIP",
        },
      },
    };
  },
  extendValidation(issues, document) {
    if (document.lines.some((line) => !hasValue(line.description))) {
      issues.push(
        createCountryIssue(
          "invoice.lines",
          "AR_LINE_DESCRIPTION_REQUIRED",
          "Argentinian invoices must describe the goods or services supplied.",
          "ERROR",
          "AR"
        )
      );
    }
    issues.push(
      createCountryIssue(
        "invoice.deliveryModes",
        "AR_EINVOICE_REQUIRED",
        "Argentina requires electronic invoicing or fiscal controller for qualifying taxpayers; ensure AFIP e-invoice is configured where applicable.",
        "INFO",
        "AR"
      )
    );
    return issues;
  },
});
