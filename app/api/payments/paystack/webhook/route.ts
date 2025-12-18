import { NextResponse } from "next/server";
import { verifyPaystackWebhook, recordPaystackPayment } from "@/lib/payments/paystack";
import { withErrorHandling } from "@/lib/api-handler";
import { prisma } from "@/lib/prisma";
import { log } from "@/lib/logger";
import { sendTemplateEmail } from "@/lib/email";
import { createAdminNotification } from "@/lib/notifications";

export const POST = withErrorHandling(async (req: Request) => {
  const signature = req.headers.get("x-paystack-signature") || undefined;
  const body = await req.text();
  const valid = verifyPaystackWebhook(signature, body);
  if (!valid) return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  const data = JSON.parse(body).data;
  const existing = await prisma.payment.findFirst({ where: { reference: data.reference } });
  if (existing) return NextResponse.json({ received: true, idempotent: true });
  await recordPaystackPayment(data);
  await prisma.payment.create({
    data: {
      userId: data.metadata?.userId || "",
      amount: data.amount / 100,
      currency: data.currency || "NGN",
      provider: "PAYSTACK",
      status: data.status === "success" ? "SUCCEEDED" : "PENDING",
      reference: data.reference,
      metadata: data,
    },
  }).catch((e) => log("error", "Paystack payment write failed", { error: e }));

  if (data.metadata?.userId) {
    const user = await prisma.user.findUnique({ where: { id: data.metadata.userId } });
    if (user) {
      await sendTemplateEmail(
        user.email,
        "Payment received",
        `<p>Your payment was successful for ${data.currency} ${(data.amount / 100).toFixed(2)}. Thank you.</p>`
      );
    }
  }

  if (data.status !== "success") {
    await createAdminNotification("Paystack payment failed");
  }

  if (data.event === "invoice.create") {
    await prisma.activityLog.create({
      data: { action: "PAYSTACK_INVOICE", metadata: data },
    });
  }
  return NextResponse.json({ received: true });
});

export const dynamic = "force-dynamic";
