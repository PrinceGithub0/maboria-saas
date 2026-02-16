import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { CheckoutPanel } from "@/components/checkout/checkout-panel";
import { normalizeCurrency } from "@/lib/payments/currency-allowlist";
import { getPlanPriceForInterval } from "@/lib/pricing";

export default async function CheckoutPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect("/signup");
  }

  const subscription = await prisma.subscription.findFirst({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
  });

  if (!subscription) {
    return (
      <div className="min-h-screen bg-white px-4 py-12 text-slate-900 sm:px-6">
        <div className="mx-auto w-full max-w-[980px] rounded-[14px] border border-[#EAEAEA] bg-white p-8 shadow-[0_12px_28px_-20px_rgba(15,23,42,0.14)] sm:p-10">
          <p className="text-xs uppercase tracking-[0.35em] text-muted-foreground">Checkout</p>
          <h1 className="mt-3 text-3xl font-semibold">Subscription not found</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            We couldn&apos;t locate an active or pending subscription for this account. Please contact
            support to restore billing or sign out and try again.
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            <Link
              href="/support"
              className="rounded-full bg-indigo-600 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500"
            >
              Contact support
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

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { preferredCurrency: true },
  });
  const currency = normalizeCurrency(user?.preferredCurrency || "USD");

  const monthlyPrice = getPlanPriceForInterval(subscription.plan, currency, "monthly");
  const yearlyPrice = getPlanPriceForInterval(subscription.plan, currency, "yearly");
  return (
    <div className="min-h-screen bg-white px-4 py-12 text-slate-900 sm:px-6">
      <div className="mx-auto w-full max-w-[980px]">
        <div className="rounded-[14px] border border-[#EAEAEA] bg-white p-8 shadow-[0_12px_28px_-20px_rgba(15,23,42,0.14)] sm:p-10">
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-slate-500">CHECKOUT</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight text-slate-900">Complete your subscription</h1>
          <p className="mt-3 text-sm text-slate-500 sm:text-base">
            Activate your selected plan to unlock automation, invoicing, WhatsApp workflows, and reporting.
          </p>
          <p className="mt-3 text-xs font-medium text-slate-500">
            Secure checkout {"\u00B7"} Cancel anytime {"\u00B7"} No hidden fees
          </p>
        </div>
        <CheckoutPanel
          userId={session.user.id}
          plan={subscription.plan}
          interval={subscription.interval === "yearly" ? "yearly" : "monthly"}
          currency={currency}
          monthlyPrice={monthlyPrice}
          yearlyPrice={yearlyPrice}
        />
      </div>
    </div>
  );
}
