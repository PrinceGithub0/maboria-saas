import assert from "node:assert/strict";

import {
  CHECKOUT_PROVIDER_VALUES,
  PAYOUT_PROVIDER_VALUES,
  formatPaymentProviderLabel,
  isCheckoutProvider,
  isPayoutProvider,
} from "../lib/payments/payment-providers";

function run() {
  assert.ok(CHECKOUT_PROVIDER_VALUES.includes("STRIPE"), "Stripe should be a first-class checkout provider");
  assert.equal(isCheckoutProvider("STRIPE"), true, "Stripe should pass checkout-provider validation");
  assert.equal(isPayoutProvider("STRIPE"), false, "Stripe should not be treated as a payout provider");
  assert.ok(PAYOUT_PROVIDER_VALUES.includes("PAYSTACK"), "Paystack should remain available for payouts");
  assert.equal(formatPaymentProviderLabel("STRIPE"), "Stripe", "Stripe labels should format correctly");

  console.log("payment provider registry checks passed");
}

run();
