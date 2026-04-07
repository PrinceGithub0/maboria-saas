import { buildDefaultCountryModule, createCountryIssue, hasValue } from "@/lib/invoicing/blueprint/module-factory";

export const guatemalaComplianceModule = buildDefaultCountryModule("GT", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-06",
  evidence: [
    {
      label: "SAT Guatemala FEL regime",
      url: "https://portal.sat.gob.gt/portal/efactura/",
      reviewedAt: "2026-04-06",
    },
    {
      label: "SAT Guatemala FEL frequently asked questions",
      url: "https://portal.sat.gob.gt/portal/preguntas-frecuentes/cumplimiento-tributario/",
      reviewedAt: "2026-04-06",
    },
  ],
  extendRequiredFields(fields) {
    fields.push("supplier.addressLine1");
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
          providerHint: "GT_FEL",
        },
      },
    };
  },
  extendValidation(issues, document) {
    if (!hasValue(document.supplier.taxId || document.supplier.vatId)) {
      issues.push(
        createCountryIssue(
          "supplier.taxId",
          "GT_NIT_REQUIRED",
          "Guatemalan FEL documents require the supplier NIT or tax identifier.",
          "ERROR",
          "GT"
        )
      );
    }
    if (document.lines.some((line) => !hasValue(line.description))) {
      issues.push(
        createCountryIssue(
          "invoice.lines",
          "GT_LINE_DESCRIPTION_REQUIRED",
          "Guatemalan tax documents should describe the goods or services supplied.",
          "ERROR",
          "GT"
        )
      );
    }
    issues.push(
      createCountryIssue(
        "invoice.deliveryModes",
        "GT_FEL_REQUIRED",
        "Guatemala FEL should be used for taxpayers required to issue DTE in the FEL regime.",
        "INFO",
        "GT"
      )
    );
    return issues;
  },
});
