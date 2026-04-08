import assert from "node:assert/strict";

import {
  getCountryLaunchReadiness,
  isCountryLaunchReady,
  listCountryLaunchReadiness,
} from "@/lib/invoicing/country-readiness";

const germany = getCountryLaunchReadiness("DE");
assert.equal(germany?.launchState, "LIVE");
assert.equal(isCountryLaunchReady("DE"), true);
assert.equal(germany?.evidenceCount ? germany.evidenceCount > 0 : false, true);

const romania = getCountryLaunchReadiness("RO");
assert.equal(romania?.launchState, "LIVE");
assert.equal(romania?.requiresEInvoicing, true);
assert.equal(romania?.eInvoiceProductionReady, true);
assert.equal(romania?.eInvoicePromotionState, "READY");
assert.equal(romania?.eInvoicePromotionPriority, 1);
assert.equal(romania?.blockers.length, 0);

const greece = getCountryLaunchReadiness("GR");
assert.equal(greece?.launchState, "LIVE");
assert.equal(greece?.requiresEInvoicing, true);
assert.equal(greece?.eInvoiceProductionReady, true);
assert.equal(greece?.eInvoicePromotionState, "READY");
assert.equal(greece?.eInvoicePromotionPriority, 2);
assert.equal(greece?.blockers.length, 0);

const saudi = getCountryLaunchReadiness("SA");
assert.equal(saudi?.launchState, "LIVE");
assert.equal(saudi?.requiresEInvoicing, true);
assert.equal(saudi?.eInvoiceProductionReady, true);
assert.equal(saudi?.eInvoicePromotionState, "READY");
assert.equal(saudi?.eInvoicePromotionPriority, 3);
assert.equal(saudi?.blockers.length, 0);

const italy = getCountryLaunchReadiness("IT");
assert.equal(italy?.launchState, "LIVE");
assert.equal(italy?.requiresEInvoicing, true);
assert.equal(italy?.eInvoiceProductionReady, true);
assert.equal(italy?.eInvoicePromotionState, "READY");
assert.equal(italy?.eInvoicePromotionPriority, 4);
assert.equal(italy?.blockers.length, 0);

const mexico = getCountryLaunchReadiness("MX");
assert.equal(mexico?.launchState, "LIVE");
assert.equal(mexico?.requiresEInvoicing, true);
assert.equal(mexico?.eInvoiceProductionReady, true);
assert.equal(mexico?.eInvoicePromotionState, "READY");
assert.equal(mexico?.eInvoicePromotionPriority, 5);
assert.equal(mexico?.blockers.length, 0);

const brazil = getCountryLaunchReadiness("BR");
assert.equal(brazil?.launchState, "LIVE");
assert.equal(brazil?.requiresEInvoicing, true);
assert.equal(brazil?.eInvoiceProductionReady, true);
assert.equal(brazil?.eInvoicePromotionState, "READY");
assert.equal(brazil?.eInvoicePromotionPriority, 6);
assert.equal(brazil?.blockers.length, 0);

const chile = getCountryLaunchReadiness("CL");
assert.equal(chile?.launchState, "LIVE");
assert.equal(chile?.requiresEInvoicing, true);
assert.equal(chile?.eInvoiceProductionReady, true);
assert.equal(chile?.eInvoicePromotionState, "READY");
assert.equal(chile?.eInvoicePromotionPriority, 7);
assert.equal(chile?.blockers.length, 0);

const colombia = getCountryLaunchReadiness("CO");
assert.equal(colombia?.launchState, "LIVE");
assert.equal(colombia?.requiresEInvoicing, true);
assert.equal(colombia?.eInvoiceProductionReady, true);
assert.equal(colombia?.eInvoicePromotionState, "READY");
assert.equal(colombia?.eInvoicePromotionPriority, 8);
assert.equal(colombia?.blockers.length, 0);

const peru = getCountryLaunchReadiness("PE");
assert.equal(peru?.launchState, "LIVE");
assert.equal(peru?.requiresEInvoicing, true);
assert.equal(peru?.eInvoiceProductionReady, true);
assert.equal(peru?.eInvoicePromotionState, "READY");
assert.equal(peru?.eInvoicePromotionPriority, 9);
assert.equal(peru?.blockers.length, 0);

const hungary = getCountryLaunchReadiness("HU");
assert.equal(hungary?.launchState, "LIVE");
assert.equal(hungary?.requiresEInvoicing, true);
assert.equal(hungary?.eInvoiceProductionReady, true);
assert.equal(hungary?.eInvoicePromotionState, "READY");
assert.equal(hungary?.eInvoicePromotionPriority, 10);
assert.equal(hungary?.blockers.length, 0);

const moldova = getCountryLaunchReadiness("MD");
assert.equal(moldova?.launchState, "LIVE");
assert.equal(moldova?.requiresEInvoicing, true);
assert.equal(moldova?.eInvoiceProductionReady, true);
assert.equal(moldova?.eInvoicePromotionState, "READY");
assert.equal(moldova?.eInvoicePromotionPriority, 11);
assert.equal(moldova?.blockers.length, 0);

const malaysia = getCountryLaunchReadiness("MY");
assert.equal(malaysia?.launchState, "LIVE");
assert.equal(malaysia?.requiresEInvoicing, true);
assert.equal(malaysia?.eInvoiceProductionReady, true);
assert.equal(malaysia?.eInvoicePromotionState, "READY");
assert.equal(malaysia?.eInvoicePromotionPriority, 12);
assert.equal(malaysia?.blockers.length, 0);

const australia = getCountryLaunchReadiness("AU");
assert.equal(australia?.launchState, "LIVE");
assert.equal(isCountryLaunchReady("AU"), true);

const poland = getCountryLaunchReadiness("PL");
assert.equal(poland?.launchState, "LIVE");
assert.equal(poland?.requiresEInvoicing, true);
assert.equal(poland?.eInvoiceCompletionStage, "CANCEL_READY");
assert.equal(poland?.eInvoicePromotionState, "READY");
assert.equal(poland?.eInvoicePromotionPriority, 40);
assert.equal(poland?.blockers.length, 0);

const unitedArabEmirates = getCountryLaunchReadiness("AE");
assert.equal(unitedArabEmirates?.launchState, "LIVE");
assert.equal(unitedArabEmirates?.requiresEInvoicing, true);
assert.equal(unitedArabEmirates?.eInvoiceCompletionStage, "CANCEL_READY");
assert.equal(unitedArabEmirates?.eInvoicePromotionState, "READY");
assert.equal(unitedArabEmirates?.eInvoicePromotionPriority, 13);
assert.equal(unitedArabEmirates?.blockers.length, 0);

const egypt = getCountryLaunchReadiness("EG");
assert.equal(egypt?.launchState, "LIVE");
assert.equal(egypt?.requiresEInvoicing, true);
assert.equal(egypt?.eInvoiceCompletionStage, "CANCEL_READY");
assert.equal(egypt?.eInvoicePromotionState, "READY");
assert.equal(egypt?.eInvoicePromotionPriority, 23);
assert.equal(egypt?.blockers.length, 0);

const mauritius = getCountryLaunchReadiness("MU");
assert.equal(mauritius?.launchState, "LIVE");
assert.equal(mauritius?.requiresEInvoicing, true);
assert.equal(mauritius?.eInvoiceCompletionStage, "CANCEL_READY");
assert.equal(mauritius?.eInvoicePromotionState, "READY");
assert.equal(mauritius?.eInvoicePromotionPriority, 33);
assert.equal(mauritius?.blockers.length, 0);

const rwanda = getCountryLaunchReadiness("RW");
assert.equal(rwanda?.launchState, "LIVE");
assert.equal(rwanda?.requiresEInvoicing, true);
assert.equal(rwanda?.eInvoiceCompletionStage, "CANCEL_READY");
assert.equal(rwanda?.eInvoicePromotionState, "READY");
assert.equal(rwanda?.eInvoicePromotionPriority, 43);
assert.equal(rwanda?.blockers.length, 0);

const jamaica = getCountryLaunchReadiness("JM");
assert.equal(jamaica?.launchState, "LIVE");
assert.equal(jamaica?.evidenceCount, 2);

const ethiopia = getCountryLaunchReadiness("ET");
assert.equal(ethiopia?.launchState, "LIVE");
assert.equal(ethiopia?.taxSystem, "VAT");

const angola = getCountryLaunchReadiness("AO");
assert.equal(angola?.launchState, "LIVE");
assert.equal(angola?.taxSystem, "VAT");

const guam = getCountryLaunchReadiness("GU");
assert.equal(guam?.launchState, "LIVE");
assert.equal(guam?.taxSystem, "GST");

const kuwait = getCountryLaunchReadiness("KW");
assert.equal(kuwait?.launchState, "LIVE");
assert.equal(kuwait?.taxSystem, "MIXED");

const maldives = getCountryLaunchReadiness("MV");
assert.equal(maldives?.launchState, "LIVE");
assert.equal(maldives?.evidenceCount ? maldives.evidenceCount >= 1 : false, true);

const anguilla = getCountryLaunchReadiness("AI");
assert.equal(anguilla?.launchState, "LIVE");
assert.equal(anguilla?.evidenceCount, 2);

const vanuatu = getCountryLaunchReadiness("VU");
assert.equal(vanuatu?.launchState, "LIVE");
assert.equal(vanuatu?.evidenceCount, 2);

const kosovo = getCountryLaunchReadiness("XK");
assert.equal(kosovo?.launchState, "LIVE");
assert.equal(kosovo?.evidenceCount, 2);

const morocco = getCountryLaunchReadiness("MA");
assert.equal(morocco?.launchState, "LIVE");
assert.equal(morocco?.taxSystem, "VAT");

const usVirginIslands = getCountryLaunchReadiness("VI");
assert.equal(usVirginIslands?.launchState, "LIVE");
assert.equal(usVirginIslands?.evidenceCount, 2);

const americanSamoa = getCountryLaunchReadiness("AS");
assert.equal(americanSamoa?.launchState, "LIVE");
assert.equal(americanSamoa?.taxSystem, "GST");

const timorLeste = getCountryLaunchReadiness("TL");
assert.equal(timorLeste?.launchState, "LIVE");
assert.equal(timorLeste?.evidenceCount, 2);

const antarctica = getCountryLaunchReadiness("AQ");
assert.equal(antarctica?.launchState, "LIVE");
assert.equal(antarctica?.evidenceCount, 2);

const macao = getCountryLaunchReadiness("MO");
assert.equal(macao?.launchState, "LIVE");
assert.equal(macao?.taxSystem, "MIXED");

const niger = getCountryLaunchReadiness("NE");
assert.equal(niger?.launchState, "LIVE");
assert.equal(niger?.taxSystem, "VAT");

const afghanistanLive = getCountryLaunchReadiness("AF");
assert.equal(afghanistanLive?.launchState, "LIVE");
assert.equal(afghanistanLive?.evidenceCount, 2);

const guinea = getCountryLaunchReadiness("GN");
assert.equal(guinea?.launchState, "LIVE");
assert.equal(guinea?.evidenceCount, 2);

const tajikistan = getCountryLaunchReadiness("TJ");
assert.equal(tajikistan?.launchState, "LIVE");
assert.equal(tajikistan?.evidenceCount, 2);

const centralAfricanRepublic = getCountryLaunchReadiness("CF");
assert.equal(centralAfricanRepublic?.launchState, "LIVE");
assert.equal(centralAfricanRepublic?.evidenceCount, 2);

const iran = getCountryLaunchReadiness("IR");
assert.equal(iran?.launchState, "LIVE");
assert.equal(iran?.evidenceCount, 2);

const usOutlyingIslands = getCountryLaunchReadiness("UM");
assert.equal(usOutlyingIslands?.launchState, "LIVE");
assert.equal(usOutlyingIslands?.evidenceCount, 2);

const westernSahara = getCountryLaunchReadiness("EH");
assert.equal(westernSahara?.launchState, "LIVE");
assert.equal(westernSahara?.evidenceCount, 2);

const afghanistan = getCountryLaunchReadiness("AF");
assert.equal(afghanistan?.launchState, "LIVE");
assert.ok(
  afghanistan?.evidenceCount ? afghanistan.evidenceCount > 0 : false,
  "Countries promoted to launch-ready should carry attached evidence"
);

const allCountries = listCountryLaunchReadiness();
assert.ok(allCountries.length > 150, "the launch readiness registry should cover the supported country list");

const counts = allCountries.reduce(
  (accumulator, country) => {
    accumulator[country.launchState] += 1;
    return accumulator;
  },
  {
    LIVE: 0,
    BETA: 0,
    MANUAL_REVIEW: 0,
    NOT_READY: 0,
  }
);

assert.equal(counts.LIVE, 250);
assert.equal(counts.BETA, 0);
assert.equal(counts.MANUAL_REVIEW, 0);
assert.equal(counts.NOT_READY, 0);

console.log("country launch readiness passed");
