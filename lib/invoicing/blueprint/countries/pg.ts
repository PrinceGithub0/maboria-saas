import { buildDefaultCountryModule, createCountryIssue, hasValue } from "@/lib/invoicing/blueprint/module-factory";

export const papuaNewGuineaComplianceModule = buildDefaultCountryModule("PG", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-06",
  evidence: [
    {
      label: "Papua New Guinea GST section 65A fact sheet",
      url: "https://static.irc.gov.pg/2021/December/5ExWcL-media-GST-Section-65A-Fact-Sheet.pdf",
      reviewedAt: "2026-04-06",
    },
    {
      label: "Papua New Guinea GST return form",
      url: "https://static.irc.gov.pg/2023/October/P0Jjks-media-g1_2023.pdf",
      reviewedAt: "2026-04-06",
    },
  ],
  extendRequiredFields(fields) {
    fields.push("supplier.addressLine1", "supplier.city");
    return [...new Set(fields)];
  },
  extendValidation(issues, document) {
    if (!hasValue(document.supplier.taxId)) {
      issues.push(
        createCountryIssue(
          "supplier.taxId",
          "PG_GST_ID_REQUIRED",
          "Papua New Guinea GST records should include the supplier TIN.",
          "ERROR",
          "PG"
        )
      );
    }
    if (document.lines.some((line) => !hasValue(line.description))) {
      issues.push(
        createCountryIssue(
          "invoice.lines",
          "PG_LINE_DESCRIPTION_REQUIRED",
          "Papua New Guinea GST records should describe the supplied goods or services.",
          "ERROR",
          "PG"
        )
      );
    }
    return issues;
  },
});
