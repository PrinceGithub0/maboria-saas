import assert from "node:assert/strict";

import { resolveStripeOrgSubscriptionUpdate } from "../lib/payments/stripe-org-subscription";

function run() {
  const updated = resolveStripeOrgSubscriptionUpdate({
    providerCustomerId: "cus_123",
    localSubscriptionId: "sub_local_1",
    currentLinkedSubscriptionId: "sub_local_old",
  });
  assert.deepEqual(updated, {
    provider: "STRIPE",
    providerCustomerId: "cus_123",
    providerSubscriptionId: "sub_local_1",
  });

  const preserved = resolveStripeOrgSubscriptionUpdate({
    providerCustomerId: "cus_456",
    localSubscriptionId: null,
    currentLinkedSubscriptionId: "sub_local_existing",
  });
  assert.deepEqual(preserved, {
    provider: "STRIPE",
    providerCustomerId: "cus_456",
    providerSubscriptionId: "sub_local_existing",
  });

  const normalized = resolveStripeOrgSubscriptionUpdate({
    providerCustomerId: "   ",
    localSubscriptionId: " sub_local_trim ",
    currentLinkedSubscriptionId: null,
  });
  assert.deepEqual(normalized, {
    provider: "STRIPE",
    providerCustomerId: null,
    providerSubscriptionId: "sub_local_trim",
  });

  console.log("subscription stripe linking checks passed");
}

run();
