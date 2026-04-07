import {
  buildDefaultCountryModule,
  createCountryIssue,
  hasValue,
} from "@/lib/invoicing/blueprint/module-factory";

export const equatorialGuineaComplianceModule = buildDefaultCountryModule("GQ", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-07",
  evidence: [
    {
      label: "Equatorial Guinea public finance reforms",
      url: "https://www.guineaecuatorialpress.com/noticias/la_primera_ministra_se_reune_con_los_tecnicos_del_programa_confin",
      reviewedAt: "2026-04-07",
    },
    {
      label: "Equatorial Guinea treasury reform meeting",
      url: "https://www.guineaecuatorialpress.com/noticias/tesoreria_presenta_al_fondo_monetario_internacional_el_programa_de_reformas_economicas_y_financieras",
      reviewedAt: "2026-04-07",
    },
  ],
  extendValidation(issues, document) {
    if (document.lines.some((line) => !hasValue(line.description))) {
      issues.push(
        createCountryIssue(
          "invoice.lines",
          "GQ_LINE_DESCRIPTION_REQUIRED",
          "Equatorial Guinea invoices should describe the goods or services supplied.",
          "ERROR",
          "GQ"
        )
      );
    }
    if (document.taxBreakdown.length === 0) {
      issues.push(
        createCountryIssue(
          "invoice.taxBreakdown",
          "GQ_TAX_BREAKDOWN_REQUIRED",
          "Equatorial Guinea invoices should show the applicable tax rate and amount.",
          "ERROR",
          "GQ"
        )
      );
    }
    return issues;
  },
});
