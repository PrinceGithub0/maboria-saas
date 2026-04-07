import {
  buildDefaultCountryModule,
  createCountryIssue,
  hasValue,
} from "@/lib/invoicing/blueprint/module-factory";

export const venezuelaComplianceModule = buildDefaultCountryModule("VE", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-07",
  evidence: [
    {
      label: "Venezuela SENIAT",
      url: "http://declaraciones.seniat.gob.ve/portal/page/portal/MANEJADOR_CONTENIDO_SENIAT/01MENU_SENIAT",
      reviewedAt: "2026-04-07",
    },
    {
      label: "Venezuela finance and tax portal",
      url: "http://www.seniat.gob.ve/",
      reviewedAt: "2026-04-07",
    },
  ],
  extendValidation(issues, document) {
    if (document.lines.some((line) => !hasValue(line.description))) {
      issues.push(
        createCountryIssue(
          "invoice.lines",
          "VE_LINE_DESCRIPTION_REQUIRED",
          "Venezuelan invoices should describe the goods or services supplied.",
          "ERROR",
          "VE"
        )
      );
    }
    if (document.taxBreakdown.length === 0) {
      issues.push(
        createCountryIssue(
          "invoice.taxBreakdown",
          "VE_TAX_BREAKDOWN_REQUIRED",
          "Venezuelan invoices should show the applicable tax rate and amount.",
          "ERROR",
          "VE"
        )
      );
    }
    return issues;
  },
});
