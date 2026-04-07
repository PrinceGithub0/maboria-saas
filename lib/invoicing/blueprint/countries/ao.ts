import {
  buildDefaultCountryModule,
  createCountryIssue,
  hasValue,
} from "@/lib/invoicing/blueprint/module-factory";

export const angolaComplianceModule = buildDefaultCountryModule("AO", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-07",
  evidence: [
    {
      label: "Angola AGT VAT FAQ",
      url: "https://portaldocontribuinte.minfin.gov.ao/perguntas-frequentes/impostos-sobre-valor-acrescentado",
      reviewedAt: "2026-04-07",
    },
    {
      label: "Angola AGT mandatory requirements for the general VAT regime",
      url: "https://portaldocontribuinte.minfin.gov.ao/noticias/requisitos-obrigatorios-regime-geral-iva",
      reviewedAt: "2026-04-07",
    },
  ],
  extendValidation(issues, document) {
    if (document.taxBreakdown.length === 0) {
      issues.push(
        createCountryIssue(
          "invoice.taxBreakdown",
          "AO_TAX_BREAKDOWN_REQUIRED",
          "Angolan VAT invoices should show the applicable IVA rate and amount.",
          "ERROR",
          "AO"
        )
      );
    }
    if (document.lines.some((line) => !hasValue(line.description))) {
      issues.push(
        createCountryIssue(
          "invoice.lines",
          "AO_LINE_DESCRIPTION_REQUIRED",
          "Angolan invoices should describe the goods or services supplied.",
          "ERROR",
          "AO"
        )
      );
    }
    issues.push(
      createCountryIssue(
        "invoice.deliveryModes",
        "AO_AGT_SOFTWARE_NOTICE",
        "Confirm whether invoice issuance falls within the AGT-approved VAT software regime for the taxpayer.",
        "WARNING",
        "AO"
      )
    );
    return issues;
  },
});
