import assert from "node:assert/strict";

import { resolveCheckoutRequestScope } from "../lib/payments/checkout-request-scope";

function run() {
  assert.deepEqual(
    resolveCheckoutRequestScope({
      sessionUserId: "user_self",
      access: { ok: false, code: "ORG_ACCESS_DENIED", message: "No org yet" },
    }),
    {
      ok: true,
      userId: "user_self",
      orgId: null,
    }
  );

  assert.deepEqual(
    resolveCheckoutRequestScope({
      sessionUserId: "user_member",
      access: {
        ok: true,
        context: {
          ownerUserId: "user_owner",
          orgId: "org_123",
        },
      },
    }),
    {
      ok: true,
      userId: "user_owner",
      orgId: "org_123",
    }
  );

  assert.deepEqual(
    resolveCheckoutRequestScope({
      sessionUserId: "user_member",
      requestedUserId: "user_other",
      access: {
        ok: true,
        context: {
          ownerUserId: "user_owner",
          orgId: "org_123",
        },
      },
    }),
    {
      ok: false,
      status: 403,
      code: "FORBIDDEN",
      message: "Forbidden",
    }
  );

  assert.deepEqual(
    resolveCheckoutRequestScope({
      sessionUserId: "user_member",
      access: {
        ok: false,
        code: "SUBSCRIPTION_MANAGE_REQUIRED",
        message: "Not allowed",
        status: 403,
      },
    }),
    {
      ok: false,
      status: 403,
      code: "SUBSCRIPTION_MANAGE_REQUIRED",
      message: "Not allowed",
    }
  );

  console.log("checkout request scope checks passed");
}

run();
