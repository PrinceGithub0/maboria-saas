import { NextResponse } from "next/server";
import Stripe from "stripe";
import { verifyStripeWebhook, recordStripePayment } from "@/lib/payments/stripe";
import { withErrorHandling } from "@/lib/api-handler";
import { prisma } from "@/lib/prisma";
import { log } from "@/lib/logger";
import { sendTemplateEmail } from "@/lib/email";
import { createAdminNotification } from "@/lib/notifications";

export const POST = withErrorHandling(async (req: Request) => {
  const signature = req.headers.get("stripe-signature") || undefined;
  const payload = await req.text();
  const event = verifyStripeWebhook(signature, payload);

  // idempotency check
  const existing = await prisma.payment.findFirst({
    where: { reference: event.id },
  });
  if (existing) {
    return NextResponse.json({ received: true, idempotent: true });
  }

  if (
    event.type === "checkout.session.completed" ||
    event.type === "payment_intent.succeeded" ||
    event.type === "invoice.paid"
  ) {
    const sessionObj = event.data.object as any;
    const userId = sessionObj.metadata?.userId;
    const amount = (sessionObj.amount_total || 0) / 100;
    const currency = sessionObj.currency || "usd";
    await recordStripePayment(event);
    if (userId) {
      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (user) {
        await sendTemplateEmail(
          user.email,
          "Payment received",
          `<p>Your payment was successful for ${currency.toUpperCase()} ${amount.toFixed(2)}. Thank you.</p>`
        );
      }
    }
  } else if (event.type === "invoice.payment_failed" || event.type === "payment_intent.payment_failed") {
    await prisma.activityLog.create({
      data: { action: "STRIPE_PAYMENT_FAILED", metadata: { event: event as any } },
    });
    await createAdminNotification("Stripe payment failed");
    const obj = event.data.object as any;
    const userId = obj.metadata?.userId;
    if (userId) {
      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (user) {
        await sendTemplateEmail(
          user.email,
          "Payment failed",
          `<p>Your payment could not be processed. Please update your billing details.</p>`
        );
      }
    }
  } else if (
    event.type === "customer.subscription.created" ||
    event.type === "customer.subscription.updated" ||
    event.type === "customer.subscription.deleted"
  ) {
    const sub = event.data.object as Stripe.Subscription;
    const userId = sub.metadata?.userId;
    if (userId) {
      await prisma.subscription.upsert({
        where: { id: sub.id },
        update: {
          status: sub.status.toUpperCase() as any,
          renewalDate: new Date(((sub as any).current_period_end || 0) * 1000),
        },
        create: {
          id: sub.id,
          userId,
          plan: "GROWTH",
          status: sub.status.toUpperCase() as any,
          renewalDate: new Date(((sub as any).current_period_end || 0) * 1000),
        },
      });
    }
  } else {
    log("warn", "Unhandled Stripe event", { type: event.type });
  }

  await prisma.payment
    .create({
      data: {
        userId: (event.data.object as any)?.metadata?.userId || "",
        amount: ((event.data.object as any)?.amount_total || 0) / 100,
        currency: (event.data.object as any)?.currency || "usd",
        provider: "STRIPE",
        status: "PENDING",
        reference: event.id,
        metadata: event as any,
      },
    })
    .catch(() => undefined);

  return NextResponse.json({ received: true });
});

export const dynamic = "force-dynamic";
