import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buildSubscriptionReceiptPdfBuffer } from "@/lib/subscription-receipt";
import { isPlatformRole } from "@/lib/global-role";

function mapPlanLabel(plan?: string | null) {
  if (!plan) return "Subscription";
  if (plan === "PRO") return "Pro";
  if (plan === "GROWTH") return "Growth";
  if (plan === "BUSINESS") return "Business";
  if (plan === "PREMIUM") return "Business";
  if (plan === "STARTER") return "Starter";
  if (plan === "ENTERPRISE") return "Enterprise";
  return "Subscription";
}

export const GET = async (req: Request) => {
  const { searchParams } = new URL(req.url);
  const paymentId = searchParams.get("paymentId");
  const sample = searchParams.get("sample") === "1";

  if (sample) {
    try {
      const now = new Date();
      const pdfBuffer = await buildSubscriptionReceiptPdfBuffer({
        receiptNumber: "MBR-SAMPLE-0001",
        paidAt: now,
        plan: "Pro",
        amount: 59,
        currency: "USD",
        customerName: "Sample Subscriber",
        customerEmail: "subscriber@example.com",
        provider: "PAYSTACK",
        reference: "MBR_SAMPLE_REF",
        interval: "monthly",
        paymentMethod: "Card",
      });
      const pdfBytes = new Uint8Array(pdfBuffer);
      return new NextResponse(pdfBytes, {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `inline; filename="Maboria_Receipt_Sample.pdf"`,
        },
      });
    } catch (error) {
      return NextResponse.json(
        { error: "Receipt preview failed", details: (error as Error).message },
        { status: 500 }
      );
    }
  }

  const session = await getServerSession(authOptions);
  if (!session?.user || !isPlatformRole(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

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
  const interval = (metadata.interval as string | undefined) === "yearly" ? "yearly" : "monthly";
  const paymentMethod = (metadata.paymentMethod as string | undefined) || "Card";

  let pdfBuffer: Buffer;
  try {
    pdfBuffer = await buildSubscriptionReceiptPdfBuffer({
      receiptNumber: payment.reference || payment.id,
      paidAt: payment.createdAt,
      plan: planLabel,
      amount: Number(payment.amount),
      currency: payment.currency,
      customerName: payment.user?.name || undefined,
      customerEmail: payment.user?.email || undefined,
      provider: payment.provider === "FLUTTERWAVE" ? "FLUTTERWAVE" : "PAYSTACK",
      reference: payment.reference || undefined,
      interval,
      paymentMethod,
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Receipt preview failed", details: (error as Error).message },
      { status: 500 }
    );
  }

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
