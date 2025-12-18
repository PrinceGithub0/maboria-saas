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

  await recordPaystackPayment(data);

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

  // If payment was for a plan purchase, sync/extend subscription (simplified monthly renewal).
  if (data.status === "success" && data.metadata?.userId && (data.metadata?.plan === "STARTER" || data.metadata?.plan === "GROWTH")) {
    const renewalDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await prisma.subscription.create({
      data: {
        userId: data.metadata.userId,
        plan: data.metadata.plan,
        status: "ACTIVE",
        renewalDate,
        currency: "NGN",
        interval: "monthly",
      },
    }).catch((e) => log("warn", "Paystack subscription sync skipped", { error: e?.message }));
  }

  if (data.event === "invoice.create") {
    await prisma.activityLog.create({
      data: { action: "PAYSTACK_INVOICE", metadata: data },
    });
  }
  return NextResponse.json({ received: true });
});

export const dynamic = "force-dynamic";
