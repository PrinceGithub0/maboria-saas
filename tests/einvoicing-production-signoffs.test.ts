import assert from "node:assert/strict";

import {
  getEInvoiceCountryProductionSignoff,
  listEInvoiceCountryProductionSignoffs,
} from "@/lib/einvoicing/production-signoffs";

const romania = getEInvoiceCountryProductionSignoff("RO");
assert.ok(romania, "Romania should have a production signoff record");
assert.equal(romania?.nextPriority, 1);
assert.equal(romania?.productionReady, true);
assert.equal(romania?.promotionState, "READY");
assert.equal(romania?.reviewedAt, "2026-04-07");
assert.equal(romania?.blockers.length, 0);
assert.equal(romania?.evidenceCount, 6);
assert.ok(romania?.evidence.some((item) => item.type === "LEGAL_SIGNOFF_MEMO"));
assert.ok(romania?.evidence.some((item) => item.type === "PRODUCTION_CERTIFICATION_RECORD"));

const malaysia = getEInvoiceCountryProductionSignoff("MY");
assert.ok(malaysia, "Malaysia should have a production signoff record");
assert.equal(malaysia?.nextPriority, 12);
assert.equal(malaysia?.productionReady, true);
assert.equal(malaysia?.promotionState, "READY");
assert.equal(malaysia?.reviewedAt, "2026-04-07");
assert.equal(malaysia?.blockers.length, 0);
assert.equal(malaysia?.evidenceCount, 6);

const brazil = getEInvoiceCountryProductionSignoff("BR");
assert.ok(brazil, "Brazil should have a production signoff record");
assert.equal(brazil?.productionReady, true);
assert.equal(brazil?.promotionState, "READY");
assert.equal(brazil?.reviewedAt, "2026-04-07");

const chile = getEInvoiceCountryProductionSignoff("CL");
assert.ok(chile, "Chile should have a production signoff record");
assert.equal(chile?.productionReady, true);
assert.equal(chile?.promotionState, "READY");

const colombia = getEInvoiceCountryProductionSignoff("CO");
assert.ok(colombia, "Colombia should have a production signoff record");
assert.equal(colombia?.productionReady, true);
assert.equal(colombia?.promotionState, "READY");

const peru = getEInvoiceCountryProductionSignoff("PE");
assert.ok(peru, "Peru should have a production signoff record");
assert.equal(peru?.productionReady, true);
assert.equal(peru?.promotionState, "READY");

const hungary = getEInvoiceCountryProductionSignoff("HU");
assert.ok(hungary, "Hungary should have a production signoff record");
assert.equal(hungary?.productionReady, true);
assert.equal(hungary?.promotionState, "READY");

const moldova = getEInvoiceCountryProductionSignoff("MD");
assert.ok(moldova, "Moldova should have a production signoff record");
assert.equal(moldova?.productionReady, true);
assert.equal(moldova?.promotionState, "READY");

const greece = getEInvoiceCountryProductionSignoff("GR");
assert.ok(greece, "Greece should have a production signoff record");
assert.equal(greece?.nextPriority, 2);
assert.equal(greece?.productionReady, true);
assert.equal(greece?.promotionState, "READY");
assert.equal(greece?.reviewedAt, "2026-04-07");
assert.equal(greece?.blockers.length, 0);

const saudi = getEInvoiceCountryProductionSignoff("SA");
assert.ok(saudi, "Saudi Arabia should have a production signoff record");
assert.equal(saudi?.nextPriority, 3);
assert.equal(saudi?.productionReady, true);
assert.equal(saudi?.promotionState, "READY");
assert.equal(saudi?.reviewedAt, "2026-04-07");
assert.equal(saudi?.blockers.length, 0);

const italy = getEInvoiceCountryProductionSignoff("IT");
assert.ok(italy, "Italy should have a production signoff record");
assert.equal(italy?.nextPriority, 4);
assert.equal(italy?.productionReady, true);
assert.equal(italy?.promotionState, "READY");
assert.equal(italy?.reviewedAt, "2026-04-07");
assert.equal(italy?.blockers.length, 0);

const mexico = getEInvoiceCountryProductionSignoff("MX");
assert.ok(mexico, "Mexico should have a production signoff record");
assert.equal(mexico?.nextPriority, 5);
assert.equal(mexico?.productionReady, true);
assert.equal(mexico?.promotionState, "READY");
assert.equal(mexico?.reviewedAt, "2026-04-07");
assert.equal(mexico?.blockers.length, 0);

const poland = getEInvoiceCountryProductionSignoff("PL");
assert.ok(poland, "Poland should have a planned production signoff record");
assert.equal(poland?.nextPriority, 40);
assert.equal(poland?.promotionState, "IN_PROGRESS");
assert.equal(poland?.productionReady, false);
assert.equal(poland?.evidenceCount, 1);
assert.equal(poland?.evidence[0]?.type, "ROLLOUT_REVIEW");
assert.ok(
  poland?.blockers.every((blocker) => !blocker.includes("Authentication transport")),
  "Transport-ready Poland should no longer expose auth transport blockers"
);

const unitedArabEmirates = getEInvoiceCountryProductionSignoff("AE");
assert.ok(unitedArabEmirates, "UAE should have a production signoff record");
assert.equal(unitedArabEmirates?.nextPriority, 13);
assert.equal(unitedArabEmirates?.promotionState, "IN_PROGRESS");
assert.equal(unitedArabEmirates?.productionReady, false);
assert.equal(unitedArabEmirates?.evidenceCount, 1);
assert.ok(
  unitedArabEmirates?.blockers.every((blocker) => !blocker.includes("Authentication transport")),
  "Transport-ready countries should no longer be blocked on authentication transport"
);

const egypt = getEInvoiceCountryProductionSignoff("EG");
assert.ok(egypt, "Egypt should have a production signoff record");
assert.equal(egypt?.nextPriority, 23);
assert.equal(egypt?.promotionState, "IN_PROGRESS");
assert.equal(egypt?.productionReady, false);
assert.ok(
  egypt?.blockers.every((blocker) => !blocker.includes("Authentication transport")),
  "Second-wave transport-ready countries should no longer be blocked on authentication transport"
);

const mauritius = getEInvoiceCountryProductionSignoff("MU");
assert.ok(mauritius, "Mauritius should have a production signoff record");
assert.equal(mauritius?.nextPriority, 33);
assert.equal(mauritius?.promotionState, "IN_PROGRESS");
assert.equal(mauritius?.productionReady, false);
assert.ok(
  mauritius?.blockers.every((blocker) => !blocker.includes("Authentication transport")),
  "Third-wave transport-ready countries should no longer be blocked on authentication transport"
);

const rwanda = getEInvoiceCountryProductionSignoff("RW");
assert.ok(rwanda, "Rwanda should have a production signoff record");
assert.equal(rwanda?.nextPriority, 43);
assert.equal(rwanda?.promotionState, "IN_PROGRESS");
assert.equal(rwanda?.productionReady, false);
assert.ok(
  rwanda?.blockers.every((blocker) => !blocker.includes("Authentication transport")),
  "Final-wave transport-ready countries should no longer be blocked on authentication transport"
);

const all = listEInvoiceCountryProductionSignoffs();
assert.equal(all.length, 52);
assert.deepEqual(all.slice(0, 12).map((item) => item.countryCode), [
  "RO",
  "GR",
  "SA",
  "IT",
  "MX",
  "BR",
  "CL",
  "CO",
  "PE",
  "HU",
  "MD",
  "MY",
]);

console.log("einvoicing production signoffs passed");
