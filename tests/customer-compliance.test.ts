import assert from "node:assert/strict";

import { resolveCustomerContactPolicy } from "@/lib/customers/compliance";

const bothAllowed = resolveCustomerContactPolicy({
  email: "billing@example.com",
  phone: "+15555550123",
  deliveryPreference: "BOTH",
});

assert.equal(bothAllowed.shouldEmail, true);
assert.equal(bothAllowed.shouldWhatsapp, true);
assert.equal(bothAllowed.blockedReason, null);

const emailOptOut = resolveCustomerContactPolicy({
  email: "billing@example.com",
  deliveryPreference: "EMAIL",
  emailOptOut: true,
});

assert.equal(emailOptOut.shouldEmail, false);
assert.equal(emailOptOut.blockedReason, "Customer has opted out of email contact.");

const restrictedCustomer = resolveCustomerContactPolicy({
  email: "billing@example.com",
  phone: "+15555550123",
  deliveryPreference: "BOTH",
  processingRestrictedAt: "2026-04-07T10:00:00.000Z",
});

assert.equal(restrictedCustomer.canProcess, false);
assert.equal(restrictedCustomer.shouldEmail, false);
assert.equal(restrictedCustomer.shouldWhatsapp, false);
assert.equal(restrictedCustomer.blockedReason, "Customer processing is restricted.");

const erasedCustomer = resolveCustomerContactPolicy({
  email: "billing@example.com",
  deliveryPreference: "EMAIL",
  erasedAt: "2026-04-07T11:00:00.000Z",
});

assert.equal(erasedCustomer.isErased, true);
assert.equal(erasedCustomer.canProcess, false);
assert.equal(erasedCustomer.blockedReason, "Customer personal data has been erased.");

const whatsappOnlyNoFallback = resolveCustomerContactPolicy({
  email: "billing@example.com",
  phone: "+15555550123",
  deliveryPreference: "WHATSAPP",
  whatsappOptOut: true,
});

assert.equal(whatsappOnlyNoFallback.shouldEmail, false);
assert.equal(whatsappOnlyNoFallback.shouldWhatsapp, false);
assert.equal(
  whatsappOnlyNoFallback.blockedReason,
  "Customer has opted out of WhatsApp contact."
);

console.log("customer compliance policy passed");
