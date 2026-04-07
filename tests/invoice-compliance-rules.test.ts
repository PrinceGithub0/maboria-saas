import assert from "node:assert/strict";

import { countryCodes } from "@/lib/countries";
import { getCountryInvoiceRule } from "@/lib/invoicing/country-rules";
import {
  getComplianceInvoiceNote,
  getComplianceSendBlockingReason,
} from "@/lib/invoicing/note-templates";
import { getCountriesMissingWorldRegion, getWorldRegion } from "@/lib/invoicing/regions";
import { resolveInvoiceCompliance } from "@/lib/invoicing/resolve-compliance";

const missingRegions = getCountriesMissingWorldRegion();

assert.deepEqual(
  missingRegions,
  [],
  `every supported country should map to one of the six world regions, missing: ${missingRegions.join(", ")}`
);

for (const code of countryCodes) {
  assert.ok(getWorldRegion(code), `expected ${code} to resolve to a region`);
  assert.ok(getCountryInvoiceRule(code), `expected ${code} to resolve to a country rule`);
}

const germanyToFranceB2B = resolveInvoiceCompliance({
  sellerCountry: "DE",
  sellerTaxId: "DE123",
  buyerCountry: "FR",
  buyerTaxId: "FR456",
  buyerType: "B2B",
  supplyType: "SERVICES",
});

assert.equal(germanyToFranceB2B.sellerRegion, "EUROPE");
assert.equal(germanyToFranceB2B.buyerRegion, "EUROPE");
assert.equal(germanyToFranceB2B.taxSystem, "VAT");
assert.equal(germanyToFranceB2B.taxTreatment, "REVERSE_CHARGE");
assert.equal(germanyToFranceB2B.reverseChargeApplies, true);

const unitedStatesDomestic = resolveInvoiceCompliance({
  sellerCountry: "US",
  buyerCountry: "US",
  buyerType: "B2C",
  supplyType: "SERVICES",
});

assert.equal(unitedStatesDomestic.sellerRegion, "NORTH_AMERICA");
assert.equal(unitedStatesDomestic.taxSystem, "SALES_TAX");
assert.equal(unitedStatesDomestic.taxLabel, "Sales Tax");
assert.equal(unitedStatesDomestic.taxTreatment, "STANDARD_TAX");

const saudiInvoice = resolveInvoiceCompliance({
  sellerCountry: "SA",
  sellerTaxId: "SA123",
  buyerCountry: "AE",
  buyerType: "B2B",
  supplyType: "SAAS",
});

assert.equal(saudiInvoice.supportLevel, "LIMITED");
assert.equal(saudiInvoice.requiresEInvoicing, true);
assert.ok(
  saudiInvoice.warnings.some((warning) => warning.code === "country_requires_e_invoicing"),
  "Saudi Arabia should emit an e-invoicing warning"
);
assert.equal(saudiInvoice.taxTreatment, "MANUAL_REVIEW");

const netherlandsDomestic = resolveInvoiceCompliance({
  sellerCountry: "NL",
  sellerTaxId: "NL123",
  buyerCountry: "NL",
  buyerType: "B2B",
  buyerTaxId: "NL456",
  supplyType: "SERVICES",
});

assert.equal(netherlandsDomestic.supportLevel, "ADVANCED");
assert.equal(netherlandsDomestic.taxSystem, "VAT");
assert.equal(netherlandsDomestic.taxLabel, "VAT");

const indonesiaDomestic = resolveInvoiceCompliance({
  sellerCountry: "ID",
  sellerTaxId: "ID123",
  buyerCountry: "ID",
  buyerType: "B2C",
  supplyType: "SERVICES",
});

assert.equal(indonesiaDomestic.supportLevel, "ADVANCED");
assert.equal(indonesiaDomestic.taxSystem, "VAT");
assert.equal(indonesiaDomestic.taxLabel, "VAT");

const slovakiaDomestic = resolveInvoiceCompliance({
  sellerCountry: "SK",
  sellerTaxId: "SK123",
  buyerCountry: "SK",
  buyerType: "B2B",
  buyerTaxId: "SK456",
  supplyType: "SERVICES",
});

assert.equal(slovakiaDomestic.supportLevel, "ADVANCED");
assert.equal(slovakiaDomestic.taxSystem, "VAT");
assert.equal(slovakiaDomestic.taxLabel, "VAT");

const bahrainDomestic = resolveInvoiceCompliance({
  sellerCountry: "BH",
  sellerTaxId: "BH123",
  buyerCountry: "BH",
  buyerType: "B2C",
  supplyType: "SERVICES",
});

assert.equal(bahrainDomestic.supportLevel, "ADVANCED");
assert.equal(bahrainDomestic.taxSystem, "VAT");
assert.equal(bahrainDomestic.taxLabel, "VAT");

const albaniaDomestic = resolveInvoiceCompliance({
  sellerCountry: "AL",
  sellerTaxId: "AL123",
  buyerCountry: "AL",
  buyerType: "B2C",
  supplyType: "SERVICES",
});

assert.equal(albaniaDomestic.supportLevel, "ADVANCED");
assert.equal(albaniaDomestic.taxSystem, "VAT");
assert.equal(albaniaDomestic.taxLabel, "VAT");

const bosniaDomestic = resolveInvoiceCompliance({
  sellerCountry: "BA",
  sellerTaxId: "BA123",
  buyerCountry: "BA",
  buyerType: "B2B",
  buyerTaxId: "BA456",
  supplyType: "SERVICES",
});

assert.equal(bosniaDomestic.supportLevel, "ADVANCED");
assert.equal(bosniaDomestic.taxSystem, "VAT");
assert.equal(bosniaDomestic.taxLabel, "VAT");

const icelandDomestic = resolveInvoiceCompliance({
  sellerCountry: "IS",
  sellerTaxId: "IS123",
  buyerCountry: "IS",
  buyerType: "B2C",
  supplyType: "SERVICES",
});

assert.equal(icelandDomestic.supportLevel, "ADVANCED");
assert.equal(icelandDomestic.taxSystem, "VAT");
assert.equal(icelandDomestic.taxLabel, "VAT");

const liechtensteinDomestic = resolveInvoiceCompliance({
  sellerCountry: "LI",
  sellerTaxId: "LI123",
  buyerCountry: "LI",
  buyerType: "B2B",
  buyerTaxId: "LI456",
  supplyType: "SERVICES",
});

assert.equal(liechtensteinDomestic.supportLevel, "ADVANCED");
assert.equal(liechtensteinDomestic.taxSystem, "VAT");
assert.equal(liechtensteinDomestic.taxLabel, "VAT");

const northMacedoniaDomestic = resolveInvoiceCompliance({
  sellerCountry: "MK",
  sellerTaxId: "MK123",
  buyerCountry: "MK",
  buyerType: "B2B",
  buyerTaxId: "MK456",
  supplyType: "SERVICES",
});

assert.equal(northMacedoniaDomestic.supportLevel, "ADVANCED");
assert.equal(northMacedoniaDomestic.taxSystem, "VAT");
assert.equal(northMacedoniaDomestic.taxLabel, "VAT");

const malawiDomestic = resolveInvoiceCompliance({
  sellerCountry: "MW",
  sellerTaxId: "MW123",
  buyerCountry: "MW",
  buyerType: "B2C",
  supplyType: "SERVICES",
});

assert.equal(malawiDomestic.supportLevel, "ADVANCED");
assert.equal(malawiDomestic.taxSystem, "VAT");
assert.equal(malawiDomestic.taxLabel, "VAT");

const jordanDomestic = resolveInvoiceCompliance({
  sellerCountry: "JO",
  sellerTaxId: "JO123",
  buyerCountry: "JO",
  buyerType: "B2C",
  supplyType: "SERVICES",
});

assert.equal(jordanDomestic.supportLevel, "ADVANCED");
assert.equal(jordanDomestic.taxSystem, "SALES_TAX");
assert.equal(jordanDomestic.taxLabel, "Sales Tax");

const mauritiusDomestic = resolveInvoiceCompliance({
  sellerCountry: "MU",
  sellerTaxId: "MU123",
  buyerCountry: "MU",
  buyerType: "B2C",
  supplyType: "SERVICES",
});

assert.equal(mauritiusDomestic.supportLevel, "ADVANCED");
assert.equal(mauritiusDomestic.taxSystem, "VAT");
assert.equal(mauritiusDomestic.taxLabel, "VAT");

const botswanaDomestic = resolveInvoiceCompliance({
  sellerCountry: "BW",
  sellerTaxId: "BW123",
  buyerCountry: "BW",
  buyerType: "B2B",
  buyerTaxId: "BW456",
  supplyType: "SERVICES",
});

assert.equal(botswanaDomestic.supportLevel, "ADVANCED");
assert.equal(botswanaDomestic.taxSystem, "VAT");
assert.equal(botswanaDomestic.taxLabel, "VAT");

const colombiaInvoice = resolveInvoiceCompliance({
  sellerCountry: "CO",
  sellerTaxId: "CO123",
  buyerCountry: "CO",
  buyerType: "B2B",
  buyerTaxId: "CO456",
  supplyType: "SERVICES",
});

assert.equal(colombiaInvoice.supportLevel, "LIMITED");
assert.equal(colombiaInvoice.requiresEInvoicing, true);
assert.equal(colombiaInvoice.taxLabel, "VAT/IVA");
assert.equal(
  getComplianceInvoiceNote(colombiaInvoice),
  "Colombia may require DIAN electronic invoicing in addition to this PDF invoice."
);

const romaniaInvoice = resolveInvoiceCompliance({
  sellerCountry: "RO",
  sellerTaxId: "RO123",
  buyerCountry: "RO",
  buyerType: "B2B",
  buyerTaxId: "RO456",
  supplyType: "SERVICES",
});

assert.equal(romaniaInvoice.supportLevel, "LIMITED");
assert.equal(romaniaInvoice.requiresEInvoicing, true);
assert.equal(
  getComplianceInvoiceNote(romaniaInvoice),
  "Romania may require RO e-Factura electronic invoicing in addition to this PDF invoice."
);

const greeceInvoice = resolveInvoiceCompliance({
  sellerCountry: "GR",
  sellerTaxId: "GR123",
  buyerCountry: "GR",
  buyerType: "B2B",
  buyerTaxId: "GR456",
  supplyType: "SERVICES",
});

assert.equal(greeceInvoice.supportLevel, "LIMITED");
assert.equal(greeceInvoice.requiresEInvoicing, true);
assert.equal(
  getComplianceInvoiceNote(greeceInvoice),
  "Greece may require myDATA electronic reporting or e-invoicing in addition to this PDF invoice."
);

const malaysiaInvoice = resolveInvoiceCompliance({
  sellerCountry: "MY",
  sellerTaxId: "MY123",
  buyerCountry: "MY",
  buyerType: "B2C",
  supplyType: "SERVICES",
});

assert.equal(malaysiaInvoice.supportLevel, "LIMITED");
assert.equal(malaysiaInvoice.taxSystem, "SALES_TAX");
assert.equal(malaysiaInvoice.taxLabel, "SST");
assert.equal(malaysiaInvoice.requiresEInvoicing, true);
assert.equal(
  getComplianceInvoiceNote(malaysiaInvoice),
  "Malaysia may require MyInvois electronic invoicing in addition to this PDF invoice."
);

const moldovaInvoice = resolveInvoiceCompliance({
  sellerCountry: "MD",
  sellerTaxId: "MD123",
  buyerCountry: "MD",
  buyerType: "B2B",
  buyerTaxId: "MD456",
  supplyType: "SERVICES",
});

assert.equal(moldovaInvoice.supportLevel, "LIMITED");
assert.equal(moldovaInvoice.requiresEInvoicing, true);
assert.equal(
  getComplianceInvoiceNote(moldovaInvoice),
  "Moldova may require e-Factura or other electronic fiscal workflows in addition to this PDF invoice."
);

const blockedB2bInvoice = resolveInvoiceCompliance({
  sellerCountry: "DE",
  sellerTaxId: "DE123",
  buyerCountry: "FR",
  buyerType: "B2B",
  supplyType: "SERVICES",
});

assert.ok(
  blockedB2bInvoice.warnings.some((warning) => warning.code === "buyer_tax_id_recommended"),
  "B2B invoices without a buyer tax ID should emit a blocking recommendation"
);
assert.equal(
  getComplianceSendBlockingReason(blockedB2bInvoice),
  "Customer VAT ID is required before sending this B2B invoice."
);

const euReverseChargeNote = getComplianceInvoiceNote(germanyToFranceB2B);
assert.equal(
  euReverseChargeNote,
  "VAT reverse charge applies. Customer to account for VAT under the applicable cross-border B2B rules."
);

const saudiComplianceNote = getComplianceInvoiceNote(saudiInvoice);
assert.equal(
  saudiComplianceNote,
  "Saudi Arabia may require ZATCA-compliant e-invoicing and clearance in addition to this PDF invoice."
);

const usDomesticNote = getComplianceInvoiceNote(unitedStatesDomestic);
assert.equal(usDomesticNote, null);

console.log("invoice compliance rules passed");
