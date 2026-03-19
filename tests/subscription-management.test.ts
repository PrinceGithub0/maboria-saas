import assert from "node:assert/strict";

import { deriveSubscriptionManagement } from "../lib/subscription-management";

function run() {
  const stripe = deriveSubscriptionManagement({
    provider: "STRIPE",
    providerCustomerId: "cus_123",
    stateSource: "subscription",
  });
  assert.equal(stripe.billingMode, "provider_portal");
  assert.equal(stripe.portalPath, "/api/payments/stripe/portal");
  assert.equal(stripe.canManageAutoRenewInApp, false);
  assert.equal(stripe.canScheduleDowngradeInApp, false);

  const paystack = deriveSubscriptionManagement({
    provider: "PAYSTACK",
    providerCustomerId: null,
    stateSource: "subscription",
  });
  assert.equal(paystack.billingMode, "provider_external");
  assert.equal(paystack.portalPath, null);
  assert.equal(paystack.canManageAutoRenewInApp, false);
  assert.equal(paystack.canScheduleDowngradeInApp, false);

  const none = deriveSubscriptionManagement({
    provider: null,
    providerCustomerId: null,
    stateSource: "none",
  });
  assert.equal(none.billingMode, "unmanaged");
  assert.equal(none.provider, null);
  assert.equal(none.canManageAutoRenewInApp, true);
  assert.equal(none.canScheduleDowngradeInApp, true);

  console.log("subscription management checks passed");
}

run();
