import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { PaymentProvider, PaymentStatus } from "@prisma/client";
import path from "path";
import { promises as fs } from "fs";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withErrorHandling } from "@/lib/api-handler";
import { requireOrgPermission } from "@/lib/org-auth";
import { buildSubscriptionReceiptPdfBuffer } from "@/lib/subscription-receipt";

function mapReceiptPlanLabel(plan: string | null | undefined) {
  const value = String(plan || "").toUpperCase();
  if (value === "PRO") return "Pro";
  if (value === "GROWTH") return "Growth";
  if (value === "BUSINESS" || value === "PREMIUM") return "Business";
  if (value === "STARTER") return "Starter";
  if (value === "ENTERPRISE") return "Enterprise";
  return "Subscription";
}

function readPaymentMethod(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const value = (metadata as Record<string, unknown>).paymentMethod;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

async function buildReceiptPdfFromDb(userId: string) {
  const subscription = await prisma.subscription.findFirst({
    where: { userId, receiptNumber: { not: null } },
    orderBy: [{ receiptIssuedAt: "desc" }, { updatedAt: "desc" }, { createdAt: "desc" }],
    select: {
      plan: true,
      currency: true,
      interval: true,
      receiptNumber: true,
      receiptIssuedAt: true,
      lastPaymentReference: true,
      lastPaymentProvider: true,
    },
  });

  if (!subscription?.receiptNumber) {
    return null;
  }

  const paymentWhere =
    subscription.lastPaymentReference && subscription.lastPaymentProvider
      ? {
          userId,
          reference: subscription.lastPaymentReference,
          provider: subscription.lastPaymentProvider,
          status: PaymentStatus.SUCCEEDED,
        }
      : {
          userId,
          status: PaymentStatus.SUCCEEDED,
          OR: [
            { metadata: { path: ["type"], equals: "subscription_payment" } },
            { metadata: { path: ["type"], equals: "checkout_session" } },
            { metadata: { path: ["receiptNumber"], equals: subscription.receiptNumber } },
          ],
        };

  const [payment, user, businessProfile] = await Promise.all([
    prisma.payment.findFirst({
      where: paymentWhere,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: {
        amount: true,
        currency: true,
        provider: true,
        reference: true,
        createdAt: true,
        metadata: true,
      },
    }),
    prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, email: true },
    }),
    prisma.businessProfile.findUnique({
      where: { userId },
      select: { businessName: true },
    }),
  ]);

  const provider = (subscription.lastPaymentProvider ?? payment?.provider ?? null) as PaymentProvider | null;
  if (!payment || (provider !== "PAYSTACK" && provider !== "FLUTTERWAVE")) {
    return null;
  }

  return buildSubscriptionReceiptPdfBuffer({
    receiptNumber: subscription.receiptNumber,
    paidAt: subscription.receiptIssuedAt ?? payment.createdAt,
    plan: mapReceiptPlanLabel(subscription.plan),
    amount: Number(payment.amount),
    currency: subscription.currency || payment.currency,
    customerName: user?.name,
    customerEmail: user?.email,
    customerCompany: businessProfile?.businessName || undefined,
    provider,
    paymentMethod: readPaymentMethod(payment.metadata),
    reference: subscription.lastPaymentReference || payment.reference || undefined,
    interval: String(subscription.interval || "monthly").toLowerCase() === "yearly" ? "yearly" : "monthly",
  });
}

export const GET = withErrorHandling(async (req: Request) => {
  const { searchParams } = new URL(req.url);
  const inline = searchParams.get("inline") === "1";
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const access = await requireOrgPermission(session.user.id, {
    permission: "subscription:manage",
    requireActiveSubscription: false,
  });
  if (!access.ok) {
    return NextResponse.json({ error: access.message, code: access.code }, { status: access.status });
  }

  const subscription = await prisma.subscription.findFirst({
    where: { userId: access.context.ownerUserId, receiptUrl: { not: null } },
    orderBy: { receiptIssuedAt: "desc" },
    select: { receiptUrl: true, receiptNumber: true },
  });

  if (!subscription?.receiptUrl) {
    return NextResponse.json({ error: "No receipt found" }, { status: 404 });
  }

  const receiptPath = subscription.receiptUrl.replace(/^\/+/, "");
  const filePath = path.join(process.cwd(), "public", receiptPath);

  let pdfBuffer: Buffer;
  try {
    pdfBuffer = await fs.readFile(filePath);
  } catch {
    const fallback = await buildReceiptPdfFromDb(access.context.ownerUserId);
    if (!fallback) {
      return NextResponse.json({ error: "Receipt file missing" }, { status: 404 });
    }
    pdfBuffer = fallback;
  }

  const filename = `Maboria_Receipt_${subscription.receiptNumber || "subscription"}.pdf`;
  return new NextResponse(pdfBuffer as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${filename}"`,
    },
  });
});

export const dynamic = "force-dynamic";
