import { buildDefaultCountryModule, createCountryIssue, hasValue } from "@/lib/invoicing/blueprint/module-factory";

export const slovakiaComplianceModule = buildDefaultCountryModule("SK", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-06",
  evidence: [
    {
      label: "Slovakia e-Faktúra project timeline (Financial Administration)",
      url: "https://www.financnasprava.sk/en/elektronicke-sluzby/ereceipt/e-faktura",
      reviewedAt: "2026-04-06",
    },
    {
      label: "Slovakia e-Faktúra mandatory rollout (official FAQ PDF)",
      url: "https://www.financnasprava.sk/_img/pfsedit/Dokumenty_PFS/Sluzby/Elektronicke_sluzby/eFaktura/eFaktura_20240205.pdf",
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
  extendValidation(issues, document) {
    if (document.lines.some((line) => !hasValue(line.description))) {
      issues.push(
        createCountryIssue(
          "invoice.lines",
          "SK_LINE_DESCRIPTION_REQUIRED",
          "Slovak invoices must describe the goods or services supplied.",
          "ERROR",
          "SK"
        )
      );
    }
    issues.push(
      createCountryIssue(
        "invoice.deliveryModes",
        "SK_EFAKTURA_ROLLOUT",
        "Slovakia plans mandatory e-Faktúra for domestic transactions from 2027; prepare for structured e-invoicing.",
        "INFO",
        "SK"
      )
    );
    return issues;
  },
});
