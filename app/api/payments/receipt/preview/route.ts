import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buildSubscriptionReceiptPdfBuffer } from "@/lib/subscription-receipt";

function mapPlanLabel(plan?: string | null) {
  if (!plan) return "Subscription";
  if (plan === "GROWTH") return "Pro";
  if (plan === "STARTER") return "Starter";
  if (plan === "ENTERPRISE") return "Enterprise";
  return "Subscription";
}

export const GET = async (req: Request) => {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const paymentId = searchParams.get("paymentId");

  const payment = await prisma.payment.findFirst({
    where: paymentId ? { id: paymentId } : { status: "SUCCEEDED" },
    orderBy: { createdAt: "desc" },
    include: { user: { select: { name: true, email: true } } },
  });

  if (!payment) {
    return NextResponse.json({ error: "No payment found" }, { status: 404 });
  }

  const metadata = (payment.metadata as Record<string, unknown> | null) || {};
  const planLabel = mapPlanLabel(metadata.plan as string | undefined);

  const pdfBuffer = await buildSubscriptionReceiptPdfBuffer({
    receiptNumber: payment.reference || payment.id,
    paidAt: payment.createdAt,
    plan: planLabel,
    amount: Number(payment.amount),
    currency: payment.currency,
    customerName: payment.user?.name || undefined,
    customerEmail: payment.user?.email || undefined,
    provider: payment.provider === "FLUTTERWAVE" ? "FLUTTERWAVE" : "PAYSTACK",
    reference: payment.reference || undefined,
  });

  const pdfBytes = new Uint8Array(pdfBuffer);
  return new NextResponse(pdfBytes, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="Maboria_Receipt_${payment.reference || payment.id}.pdf"`,
    },
  });
};

export const dynamic = "force-dynamic";
