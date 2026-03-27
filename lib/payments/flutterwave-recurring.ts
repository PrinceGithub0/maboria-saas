import "server-only";

import type { Prisma } from "@prisma/client";

import { env } from "@/lib/env";
import { normalizeCountryCode } from "@/lib/payments/payment-providers";

const FLUTTERWAVE_BASE = "https://api.flutterwave.com/v3";

export type FlutterwaveStoredPaymentMethod = {
  token: string;
  email: string;
  fullName: string | null;
  country: string | null;
  type: string | null;
  brand: string | null;
  last4: string | null;
  expiry: string | null;
  traceId: string | null;
  authorizedAt: string | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function normalizeEmail(value: unknown) {
  const email = String(value || "").trim().toLowerCase();
  return email || null;
}

function toFullName(input: { fullName?: unknown; firstName?: unknown; lastName?: unknown }) {
  const fullName = String(input.fullName || "").trim();
  if (fullName) return fullName;
  const firstName = String(input.firstName || "").trim();
  const lastName = String(input.lastName || "").trim();
  const combined = `${firstName} ${lastName}`.trim();
  return combined || null;
}

export function extractFlutterwaveStoredPaymentMethod(
  rawPayload: unknown
): FlutterwaveStoredPaymentMethod | null {
  const payload = asRecord(rawPayload);
  if (!payload) return null;

  const payloadMeta = asRecord(payload.meta);
  const payloadData = asRecord(payload.data);
  const payloadRaw = asRecord(payload.raw) ?? asRecord(payloadMeta?.raw);
  const payloadDataMeta = asRecord(payloadData?.meta);
  const payloadDataRaw = asRecord(payloadData?.raw) ?? asRecord(payloadDataMeta?.raw);
  const candidates = [payload, payloadData, payloadRaw, payloadDataRaw].filter(
    (value, index, list): value is Record<string, unknown> => Boolean(value) && list.indexOf(value) === index
  );

  for (const candidate of candidates) {
    const card = asRecord(candidate.card) ?? asRecord(payload.card) ?? asRecord(payloadData?.card);
    const customer =
      asRecord(candidate.customer) ?? asRecord(payload.customer) ?? asRecord(payloadData?.customer);
    const token = String(card?.token || "").trim();
    const email = normalizeEmail(customer?.email);
    if (!token || !email) {
      continue;
    }

    return {
      token,
      email,
      fullName: toFullName({
        fullName: customer?.name ?? customer?.full_name,
        firstName: customer?.first_name,
        lastName: customer?.last_name,
      }),
      country:
        normalizeCountryCode(String(card?.country || "")) ??
        normalizeCountryCode(String(customer?.country || "")) ??
        null,
      type: String(card?.type || card?.card_type || "").trim() || null,
      brand: String(card?.issuer || card?.brand || card?.card_brand || "").trim() || null,
      last4: String(card?.last_4digits || card?.last4 || "").trim() || null,
      expiry: String(card?.expiry || card?.exp_date || "").trim() || null,
      traceId:
        String(
          candidate.trace_id ||
            candidate.flw_ref ||
            payloadData?.trace_id ||
            payloadData?.flw_ref ||
            payload.trace_id ||
            payload.flw_ref ||
            ""
        ).trim() ||
        null,
      authorizedAt:
        String(
          candidate.charged_at ||
            candidate.paid_at ||
            candidate.created_at ||
            payloadData?.charged_at ||
            payloadData?.paid_at ||
            payloadData?.created_at ||
            payload.charged_at ||
            payload.paid_at ||
            payload.created_at ||
            ""
        ).trim() || null,
    };
  }

  return null;
}

export function parseFlutterwaveStoredPaymentMethod(
  value: Prisma.JsonValue | null | undefined
): FlutterwaveStoredPaymentMethod | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const record = value as Record<string, unknown>;
  const token = String(record.token || "").trim();
  const email = normalizeEmail(record.email);
  if (!token || !email) return null;

  return {
    token,
    email,
    fullName: String(record.fullName || "").trim() || null,
    country: normalizeCountryCode(String(record.country || "")) ?? null,
    type: String(record.type || "").trim() || null,
    brand: String(record.brand || "").trim() || null,
    last4: String(record.last4 || "").trim() || null,
    expiry: String(record.expiry || "").trim() || null,
    traceId: String(record.traceId || "").trim() || null,
    authorizedAt: String(record.authorizedAt || "").trim() || null,
  };
}

export async function createFlutterwaveTokenizedCharge(input: {
  token: string;
  email: string;
  fullName?: string | null;
  country: string;
  currency: string;
  amount: number;
  txRef: string;
  redirectUrl: string;
  narration: string;
  traceId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const res = await fetch(`${FLUTTERWAVE_BASE}/tokenized-charges`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.flutterwaveSecret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      token: input.token,
      currency: input.currency,
      country: input.country,
      amount: input.amount,
      email: input.email,
      full_name: input.fullName || undefined,
      tx_ref: input.txRef,
      narration: input.narration,
      redirect_url: input.redirectUrl,
      is_unscheduled: true,
      trace_id: input.traceId || undefined,
      meta: input.metadata,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Flutterwave tokenized charge failed: ${err}`);
  }

  return res.json();
}
