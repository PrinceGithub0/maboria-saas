import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { getPlanPriceForInterval } from "@/lib/pricing";
import { normalizeCurrency } from "@/lib/payments/currency-allowlist";

export default async function BillingLockedPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect("/signup");
  }

  const subscription = await prisma.subscription.findFirst({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
  });

  const plan = subscription?.plan || "STARTER";
  const interval = subscription?.interval === "yearly" ? "yearly" : "monthly";
  const currency = normalizeCurrency(subscription?.currency || "USD");
  const price = getPlanPriceForInterval(plan, currency, interval);
  const status = subscription?.status || "INCOMPLETE";
  const statusReason =
    status === "PAST_DUE"
      ? "Payment failed. Update billing to restore access."
      : status === "REVOKED"
        ? "Payment was reversed or refunded."
        : status === "CANCELED"
          ? "Subscription was canceled."
          : "Complete payment to unlock the dashboard.";

  return (
    <div className="min-h-screen bg-background px-6 py-12 text-foreground">
      <div className="mx-auto w-full max-w-2xl rounded-3xl border border-border/70 bg-card/80 p-8 shadow-sm">
        <p className="text-xs uppercase tracking-[0.35em] text-muted-foreground">Billing</p>
        <h1 className="mt-3 text-3xl font-semibold">Subscription inactive</h1>
        <p className="mt-2 text-sm text-muted-foreground">{statusReason}</p>

        <div className="mt-6 rounded-2xl border border-border bg-background p-5">
          <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Status</p>
          <p className="mt-2 text-lg font-semibold">{status}</p>
          {plan && (
            <p className="mt-1 text-sm text-muted-foreground">
              Plan: {plan} · {interval} · {currency} {price?.toLocaleString() ?? "—"}
            </p>
          )}
          {subscription?.pendingPlan && (
            <p className="mt-2 text-sm text-muted-foreground">
              Downgrade scheduled: {subscription.pendingPlan}
            </p>
          )}
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          <Link
            href="/checkout"
            className="rounded-full bg-indigo-600 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500"
          >
            Retry payment
          </Link>
          <Link
            href="/logout"
            className="rounded-full border border-border px-5 py-2 text-sm font-semibold text-foreground hover:bg-muted/50"
          >
            Log out
          </Link>
        </div>
      </div>
    </div>
  );
}
