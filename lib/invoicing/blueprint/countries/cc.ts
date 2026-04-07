import {
  buildDefaultCountryModule,
  createCountryIssue,
  hasValue,
} from "@/lib/invoicing/blueprint/module-factory";

export const cocosKeelingIslandsComplianceModule = buildDefaultCountryModule("CC", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-07",
  evidence: [
    {
      label: "ATO legal determination for Cocos (Keeling) Islands GST treatment",
      url: "https://www.ato.gov.au/law/view/view.htm?PiT=99991231235958&docid=AID%2FAID2002294%2F00001",
      reviewedAt: "2026-04-07",
    },
    {
      label: "ATO GST ruling on exports and external territories",
      url: "https://www.ato.gov.au/law/view/pdf?DocID=GST%2FGSTR20026%2FNAT%2FATO%2F00001&PiT=20240118000001&filename=law%2Fview%2Fpdf%2Fpbr%2Fgstr2002-006c7.pdf",
      reviewedAt: "2026-04-07",
    },
  ],
  extendValidation(issues, document) {
    if (document.lines.some((line) => !hasValue(line.description))) {
      issues.push(
        createCountryIssue(
          "invoice.lines",
          "CC_LINE_DESCRIPTION_REQUIRED",
          "Cocos (Keeling) Islands invoices should describe the goods or services supplied.",
          "ERROR",
          "CC"
        )
      );
    }
    issues.push(
      createCountryIssue(
        "invoice.taxBreakdown",
        "CC_EXTERNAL_TERRITORY_GST_NOTICE",
        "Confirm whether the supply is treated as an external-territory export or as a mainland-connected Australian GST transaction.",
        "WARNING",
        "CC"
      )
    );
    return issues;
  },
});
