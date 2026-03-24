import assert from "node:assert/strict";

import { resolveSubscriptionPaymentScope } from "../lib/payments/subscription-payment-scope";

function run() {
  assert.deepEqual(
    resolveSubscriptionPaymentScope({
      ownedBusinessCount: 1,
      linkedSubscriptionId: null,
      orgSubscriptionStatus: "ACTIVE",
    }),
    { mode: "owner_wide", subscriptionId: null }
  );

  assert.deepEqual(
    resolveSubscriptionPaymentScope({
      ownedBusinessCount: 3,
      linkedSubscriptionId: "sub_local_1",
      bridgedSubscriptionId: null,
      orgSubscriptionStatus: "ACTIVE",
    }),
    { mode: "scoped_subscription", subscriptionId: "sub_local_1" }
  );

  assert.deepEqual(
    resolveSubscriptionPaymentScope({
      ownedBusinessCount: 2,
      linkedSubscriptionId: null,
      bridgedSubscriptionId: "sub_bridged_1",
      orgSubscriptionStatus: "PAST_DUE",
    }),
    { mode: "scoped_subscription", subscriptionId: "sub_bridged_1" }
  );

  assert.deepEqual(
    resolveSubscriptionPaymentScope({
      ownedBusinessCount: 2,
      linkedSubscriptionId: null,
      bridgedSubscriptionId: null,
      orgSubscriptionStatus: "ACTIVE",
    }),
    { mode: "empty", subscriptionId: null }
  );

  assert.deepEqual(
    resolveSubscriptionPaymentScope({
      ownedBusinessCount: 2,
      linkedSubscriptionId: null,
      bridgedSubscriptionId: null,
      orgSubscriptionStatus: "CANCELED",
    }),
    { mode: "empty", subscriptionId: null }
  );

  console.log("subscription payment scope checks passed");
}

run();
