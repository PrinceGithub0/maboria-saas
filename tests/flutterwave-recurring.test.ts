import assert from "node:assert/strict";

import {
  extractFlutterwaveStoredPaymentMethod,
  parseFlutterwaveStoredPaymentMethod,
} from "../lib/payments/flutterwave-recurring";
import { deriveSubscriptionManagement } from "../lib/subscription-management";

function run() {
  const extracted = extractFlutterwaveStoredPaymentMethod({
    charged_at: "2026-03-24T10:00:00.000Z",
    customer: {
      email: "owner@example.com",
      name: "Maboria Owner",
    },
    card: {
      token: "flw_tok_123",
      country: "ng",
      type: "VISA",
      issuer: "visa",
      last_4digits: "4242",
      expiry: "12/30",
    },
    trace_id: "trace_123",
  });

  assert.ok(extracted, "flutterwave card token should be extracted from verified payload");
  assert.equal(extracted?.token, "flw_tok_123");
  assert.equal(extracted?.email, "owner@example.com");
  assert.equal(extracted?.country, "NG");
  assert.equal(extracted?.traceId, "trace_123");

  const extractedFromNestedPayload = extractFlutterwaveStoredPaymentMethod({
    event: "charge.completed",
    data: {
      charged_at: "2026-03-24T12:00:00.000Z",
      customer: {
        email: "nested@example.com",
        first_name: "Nested",
        last_name: "Owner",
      },
      card: {
        token: "flw_tok_nested",
        country: "gh",
        card_brand: "mastercard",
        card_type: "DEBIT",
        last4: "1111",
        exp_date: "01/31",
      },
      flw_ref: "flw_nested_ref",
    },
  });

  assert.ok(extractedFromNestedPayload, "flutterwave token should also be extracted from nested webhook payloads");
  assert.equal(extractedFromNestedPayload?.token, "flw_tok_nested");
  assert.equal(extractedFromNestedPayload?.email, "nested@example.com");
  assert.equal(extractedFromNestedPayload?.brand, "mastercard");
  assert.equal(extractedFromNestedPayload?.last4, "1111");
  assert.equal(extractedFromNestedPayload?.traceId, "flw_nested_ref");

  const extractedFromRawWrapper = extractFlutterwaveStoredPaymentMethod({
    raw: {
      customer: {
        email: "wrapped@example.com",
        name: "Wrapped Owner",
      },
      card: {
        token: "flw_tok_wrapped",
        country: "za",
        issuer: "visa",
        last_4digits: "9876",
        expiry: "09/29",
      },
      trace_id: "trace_wrapped",
    },
  });

  assert.ok(extractedFromRawWrapper, "flutterwave token should survive raw-wrapper payload storage");
  assert.equal(extractedFromRawWrapper?.token, "flw_tok_wrapped");
  assert.equal(extractedFromRawWrapper?.email, "wrapped@example.com");
  assert.equal(extractedFromRawWrapper?.country, "ZA");

  const parsed = parseFlutterwaveStoredPaymentMethod(extracted as any);
  assert.equal(parsed?.token, "flw_tok_123");
  assert.equal(parsed?.last4, "4242");

  const management = deriveSubscriptionManagement({
    provider: "FLUTTERWAVE",
    providerCustomerId: null,
    hasReusablePaymentMethod: true,
    stateSource: "org_subscription",
  });

  assert.equal(management.canManageAutoRenewInApp, true, "saved Flutterwave method should unlock in-app auto-renew controls");
  assert.equal(management.canScheduleDowngradeInApp, true, "saved Flutterwave method should keep dashboard downgrade controls available");
  assert.equal(management.billingMode, "unmanaged");

  console.log("flutterwave recurring checks passed");
}

run();
