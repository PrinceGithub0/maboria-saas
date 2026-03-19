import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { enforceEntitlement } from "@/lib/entitlements";
import { requireBillingAccess } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { createPaystackRefund } from "@/lib/payments/paystack";
import {
  createFlutterwaveRefund,
  verifyFlutterwaveTransactionByReference,
} from "@/lib/payments/flutterwave";

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function normalizeReason(value: unknown) {
  const raw = String(value || "").trim();
  if (!raw) return "Customer requested refund.";
  return raw.slice(0, 500);
}

function parseRefundRequestMeta(value: unknown) {
  const meta = asRecord(value);
  const refundRequest = asRecord(meta.refundRequest);
  return String(refundRequest.status || "").toLowerCase();
}

function normalizeRefundRequestStatus(value: unknown) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return "pending";
  if (["completed", "refunded", "succeeded"].includes(normalized)) return "completed";
  if (["failed", "cancelled", "canceled", "rejected"].includes(normalized)) return "failed";
  return "pending";
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ paymentId: string }> | { paymentId: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const access = await requireBillingAccess(session.user.id);
  if (!access.ok) {
    return NextResponse.json({ error: access.message }, { status: 403 });
  }

  const entitlement = await enforceEntitlement(access.ownerUserId, {
    feature: "invoices",
    requiredPlan: "starter",
    allowTrial: false,
  });
  if (!entitlement.ok) {
    return NextResponse.json(
      {
        error: "Access denied",
        type: entitlement.type,
        requiredPlan: entitlement.requiredPlan,
        reason: entitlement.reason,
      },
      { status: 403 }
    );
  }

  const { paymentId } = await Promise.resolve(context.params);
  const body = await request.json().catch(() => ({}));
  const reason = normalizeReason(body?.reason);

  const payment = await prisma.invoicePayment.findFirst({
    where: {
      id: paymentId,
      userId: access.ownerUserId,
      status: "SUCCEEDED",
      refundOfId: null,
    },
    include: {
      invoice: {
        select: {
          id: true,
          invoiceNumber: true,
        },
      },
      refundEntries: {
        select: {
          id: true,
          status: true,
          amount: true,
          amountOriginal: true,
        },
      },
    },
  });

  if (!payment) {
    return NextResponse.json({ error: "Payment not found or not refundable." }, { status: 404 });
  }

  const existingRefundRequest = parseRefundRequestMeta(payment.metadata);
  if (["pending", "processing", "queued", "new"].includes(existingRefundRequest)) {
    return NextResponse.json({ error: "Refund already in progress." }, { status: 409 });
  }

  const originalAmount = Math.abs(Number(payment.amountOriginal ?? payment.amount ?? 0));
  const refundedAmount = payment.refundEntries.reduce((sum, entry) => {
    if (String(entry.status).toUpperCase() !== "REFUNDED") return sum;
    return sum + Math.abs(Number(entry.amountOriginal ?? entry.amount ?? 0));
  }, 0);

  if (originalAmount <= 0 || refundedAmount >= Math.max(0, Number((originalAmount - 0.01).toFixed(2)))) {
    return NextResponse.json({ error: "This payment has already been refunded." }, { status: 409 });
  }

  const metadata = asRecord(payment.metadata);
  let providerStatus: { requestId: string; status: string; response: unknown };
  if (payment.provider === "PAYSTACK") {
    providerStatus = await (async () => {
          const transaction = String(metadata.id || payment.reference || "").trim();
          if (!transaction) {
            throw new Error("Missing Paystack transaction reference.");
          }
          const response = await createPaystackRefund({
            transaction,
            amount: originalAmount,
            currency: String(payment.currencyOriginal || payment.currency || "").toUpperCase(),
            customerNote: reason,
            merchantNote: payment.invoice?.invoiceNumber
              ? `Refund for invoice ${payment.invoice.invoiceNumber}`
              : "Invoice refund",
          });
          return {
            requestId: String(response?.data?.id || response?.data?.refund_reference || payment.reference),
            status: normalizeRefundRequestStatus(response?.data?.status || response?.status),
            response,
          };
        })();
  } else if (payment.provider === "FLUTTERWAVE") {
    providerStatus = await (async () => {
          const transactionId =
            metadata.id ||
            (await verifyFlutterwaveTransactionByReference(payment.reference).then((result) => result?.data?.id));
          if (!transactionId) {
            throw new Error("Missing Flutterwave transaction id.");
          }
          const response = await createFlutterwaveRefund({
            transactionId,
            amount: originalAmount,
            comments: reason,
          });
          return {
            requestId: String(response?.data?.id || transactionId),
            status: normalizeRefundRequestStatus(response?.data?.status || response?.status),
            response,
          };
        })();
  } else {
    return NextResponse.json({ error: "Provider refunds are not supported for this payment." }, { status: 400 });
  }

  const nextMetadata = {
    ...metadata,
    refundRequest: {
      requestId: providerStatus.requestId,
      status: providerStatus.status,
      requestedAt: new Date().toISOString(),
      requestedByUserId: session.user.id,
      reason,
    },
  };

  await prisma.$transaction(async (tx) => {
    await tx.invoicePayment.update({
      where: { id: payment.id },
      data: { metadata: nextMetadata as any },
    });

    const relatedPayment = await tx.payment.findFirst({
      where: {
        userId: access.ownerUserId,
        provider: payment.provider,
        reference: payment.reference,
      },
      select: { id: true, metadata: true },
    });

    if (relatedPayment) {
      await tx.payment.update({
        where: { id: relatedPayment.id },
        data: {
          metadata: {
            ...(asRecord(relatedPayment.metadata) || {}),
            refundRequest: nextMetadata.refundRequest,
          } as any,
        },
      });
    }
  });

  return NextResponse.json({
    ok: true,
    status: providerStatus.status,
    requestId: providerStatus.requestId,
    message: "Refund requested. The payment will update after provider confirmation.",
  });
}
