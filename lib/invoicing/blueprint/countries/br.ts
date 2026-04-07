import { buildDefaultCountryModule, createCountryIssue, hasValue } from "@/lib/invoicing/blueprint/module-factory";

export const brazilComplianceModule = buildDefaultCountryModule("BR", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-06",
  evidence: [
    {
      label: "Brazil NF-e portal (official guidance and mandate context)",
      url: "https://www.nfe.fazenda.gov.br/portal/perguntasFrequentes.aspx?tipoConteudo=4figqHYhYho%3D",
      reviewedAt: "2026-04-06",
    },
  ],
  extendTransform(document) {
    const deliveryModes = new Set(document.deliveryModes);
    deliveryModes.add("government_gateway_submission");
    return {
      ...document,
      deliveryModes: [...deliveryModes],
      metadata: {
        ...(document.metadata || {}),
        countryRuleDetail: {
          providerHint: "BR_NFE",
        },
      },
    };
  },
  extendValidation(issues, document) {
    if (!hasValue(document.supplier.taxId || document.supplier.vatId)) {
      issues.push(
        createCountryIssue(
          "supplier.taxId",
          "BR_CNPJ_REQUIRED",
          "Brazilian invoices should capture the supplier CNPJ for NF-e workflows.",
          "ERROR",
          "BR"
        )
      );
    }
    return issues;
  },
});
