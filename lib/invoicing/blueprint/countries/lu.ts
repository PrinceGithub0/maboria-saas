import { buildDefaultCountryModule, createCountryIssue, hasValue } from "@/lib/invoicing/blueprint/module-factory";

export const luxembourgComplianceModule = buildDefaultCountryModule("LU", {
  implementationType: "SPECIALIZED",
  ruleVersion: "2026-04-06",
  evidence: [
    {
      label: "Luxembourg public procurement e-invoicing standard and legal framework",
      url: "https://interoperabilite.public.lu/fr/actions-produits/norme-europeenne-facturation-electronique.html",
      reviewedAt: "2026-04-06",
    },
    {
      label: "Luxembourg supplier obligation for public-sector e-invoicing from 18 March 2023",
      url: "https://guichet.public.lu/en/entreprises/actualites/2022/decembre/13-efacturation.html",
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
          "LU_LINE_DESCRIPTION_REQUIRED",
          "Luxembourg invoices must describe the goods or services supplied.",
          "ERROR",
          "LU"
        )
      );
    }
    issues.push(
      createCountryIssue(
        "invoice.deliveryModes",
        "LU_B2G_EINVOICE_REQUIRED",
        "Luxembourg requires structured e-invoices for public-sector customers through Peppol or approved alternatives.",
        "INFO",
        "LU"
      )
    );
    return issues;
  },
});
