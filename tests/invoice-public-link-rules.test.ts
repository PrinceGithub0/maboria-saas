import assert from "node:assert/strict";

import {
  INVOICE_PUBLIC_LINK_TTL_DAYS,
  getInvoicePublicLinkExpiresAt,
  isInvoicePublicLinkExpired,
} from "@/lib/invoice-public-link";

const createdAt = new Date("2026-04-01T00:00:00.000Z");
const expiresAt = getInvoicePublicLinkExpiresAt(createdAt);

assert.equal(
  expiresAt.toISOString(),
  new Date(createdAt.getTime() + INVOICE_PUBLIC_LINK_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString(),
  "invoice public links should receive a deterministic expiry timestamp"
);

assert.equal(
  isInvoicePublicLinkExpired({
    createdAt,
    expiresAt,
  }, new Date("2026-04-15T00:00:00.000Z")),
  false,
  "links should remain valid before their expiry"
);

assert.equal(
  isInvoicePublicLinkExpired({
    createdAt,
    expiresAt,
  }, new Date("2026-05-10T00:00:00.000Z")),
  true,
  "links should be rejected after expiry"
);

assert.equal(
  isInvoicePublicLinkExpired(
    {
      createdAt,
      expiresAt: null,
    },
    new Date("2026-05-10T00:00:00.000Z")
  ),
  true,
  "legacy links without expiresAt should expire based on creation time"
);

console.log("invoice public link rules passed");
