import crypto from "crypto";
import { toMinorUnits } from "@/lib/payments/currency-allowlist";

type StripeCheckoutMetadata = Record<string, string | number | boolean | null | undefined>;

const STRIPE_BASE = "https://api.stripe.com/v1";
const STRIPE_SECRET = String(process.env.STRIPE_SECRET_KEY || "").trim();
const STRIPE_WEBHOOK_SECRET = String(process.env.STRIPE_WEBHOOK_SECRET || "").trim();

function getStripeSecret() {
  if (!STRIPE_SECRET) {
    throw new Error("Stripe secret key is not configured.");
  }
  return STRIPE_SECRET;
}

export function isStripeWebhookConfigured() {
  return Boolean(STRIPE_WEBHOOK_SECRET);
}

export async function initializeStripeCheckoutSession(input: {
  amount: number;
  currency: string;
  customerEmail: string;
  customerName?: string | null;
  reference: string;
  successUrl: string;
  cancelUrl: string;
  planName: string;
  interval: "monthly" | "yearly";
  metadata?: StripeCheckoutMetadata;
}) {
  const secret = getStripeSecret();
  const body = new URLSearchParams();
  body.set("mode", "subscription");
  body.set("success_url", input.successUrl);
  body.set("cancel_url", input.cancelUrl);
  body.set("client_reference_id", input.reference);
  body.set("customer_email", input.customerEmail);
  body.set("line_items[0][quantity]", "1");
  body.set("line_items[0][price_data][currency]", String(input.currency || "").toLowerCase());
  body.set("line_items[0][price_data][unit_amount]", String(toMinorUnits(input.amount, input.currency)));
  body.set(
    "line_items[0][price_data][recurring][interval]",
    input.interval === "yearly" ? "year" : "month"
  );
  body.set("line_items[0][price_data][product_data][name]", input.planName);

  if (input.customerName) {
    body.set("customer_update[name]", "auto");
  }

  for (const [key, value] of Object.entries(input.metadata || {})) {
    if (value === undefined || value === null) continue;
    body.set(`metadata[${key}]`, String(value));
  }

  const res = await fetch(`${STRIPE_BASE}/checkout/sessions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      (data as { error?: { message?: string } })?.error?.message ||
        "Stripe checkout session creation failed."
    );
  }

  return data as {
    id?: string;
    url?: string;
    metadata?: Record<string, string>;
  };
}

export async function createStripeBillingPortalSession(input: {
  customerId: string;
  returnUrl: string;
}) {
  const secret = getStripeSecret();
  const body = new URLSearchParams();
  body.set("customer", input.customerId);
  body.set("return_url", input.returnUrl);

  const res = await fetch(`${STRIPE_BASE}/billing_portal/sessions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      (data as { error?: { message?: string } })?.error?.message ||
        "Stripe billing portal session creation failed."
    );
  }

  return data as { id?: string; url?: string };
}

export function verifyStripeWebhookSignature(
  payload: string,
  signatureHeader: string | null,
  toleranceSeconds = 300
) {
  if (!STRIPE_WEBHOOK_SECRET) {
    throw new Error("Stripe webhook secret is not configured.");
  }
  if (!signatureHeader) {
    throw new Error("Missing Stripe-Signature header.");
  }

  const parts = signatureHeader.split(",").map((part) => part.trim());
  const timestamp = parts.find((part) => part.startsWith("t="))?.slice(2);
  const signatures = parts
    .filter((part) => part.startsWith("v1="))
    .map((part) => part.slice(3))
    .filter(Boolean);

  if (!timestamp || signatures.length === 0) {
    throw new Error("Invalid Stripe-Signature header.");
  }

  const ageSeconds = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp));
  if (!Number.isFinite(ageSeconds) || ageSeconds > toleranceSeconds) {
    throw new Error("Stripe webhook timestamp is outside the allowed tolerance.");
  }

  const signedPayload = `${timestamp}.${payload}`;
  const expected = crypto
    .createHmac("sha256", STRIPE_WEBHOOK_SECRET)
    .update(signedPayload)
    .digest("hex");

  const expectedBuffer = Buffer.from(expected, "hex");
  const matched = signatures.some((signature) => {
    try {
      const candidateBuffer = Buffer.from(signature, "hex");
      return (
        candidateBuffer.length === expectedBuffer.length &&
        crypto.timingSafeEqual(candidateBuffer, expectedBuffer)
      );
    } catch {
      return false;
    }
  });

  if (!matched) {
    throw new Error("Stripe webhook signature verification failed.");
  }
}
