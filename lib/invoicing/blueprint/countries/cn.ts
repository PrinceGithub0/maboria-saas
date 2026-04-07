import { buildDefaultCountryModule, createCountryIssue, hasValue } from "@/lib/invoicing/blueprint/module-factory";

export const chinaComplianceModule = buildDefaultCountryModule("CN", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-06",
  evidence: [
    {
      label: "China State Taxation Administration electronic VAT invoice framework",
      url: "https://fgk.chinatax.gov.cn/eng/c102962/c102967/c102998/c103019/c5242590/content.html",
      reviewedAt: "2026-04-06",
    },
    {
      label: "China STA legal effect of fully digitalized electronic invoices",
      url: "https://fgk.chinatax.gov.cn/zcfgk/c100012/c5194596/content.html",
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
    deliveryModes.add("xml_export");
    return {
      ...document,
      deliveryModes: [...deliveryModes],
      metadata: {
        ...(document.metadata || {}),
        countryRuleDetail: {
          providerHint: "CN_EVAT",
        },
      },
    };
  },
  extendValidation(issues, document) {
    if (!hasValue(document.supplier.taxId || document.supplier.vatId)) {
      issues.push(
        createCountryIssue(
          "supplier.taxId",
          "CN_TAX_ID_REQUIRED",
          "Chinese VAT invoices should capture the supplier tax registration identifier.",
          "ERROR",
          "CN"
        )
      );
    }
    if (document.lines.some((line) => !hasValue(line.description))) {
      issues.push(
        createCountryIssue(
          "invoice.lines",
          "CN_LINE_DESCRIPTION_REQUIRED",
          "Chinese invoices must describe the goods or services supplied.",
          "ERROR",
          "CN"
        )
      );
    }
    issues.push(
      createCountryIssue(
        "invoice.deliveryModes",
        "CN_EVAT_PLATFORM_CHECK",
        "China supports electronic VAT invoices with full legal effect; confirm local platform and taxpayer scope before issuance.",
        "INFO",
        "CN"
      )
    );
    return issues;
  },
});
