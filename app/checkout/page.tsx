import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { CheckoutPanel } from "@/components/checkout/checkout-panel";
import {
  getPaystackEnabledCurrencies,
  isProviderCurrency,
  normalizeCurrency,
} from "@/lib/payments/currency-allowlist";
import { getPlanPriceForInterval } from "@/lib/pricing";

const planLabel = (plan: string) => {
  switch (plan) {
    case "STARTER":
      return "Starter";
    case "PRO":
      return "Pro";
    case "GROWTH":
      return "Growth";
    case "BUSINESS":
      return "Business";
    case "ENTERPRISE":
      return "Enterprise";
    default:
      return plan;
  }
};

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
      <div className="min-h-screen bg-background px-6 py-10 text-foreground">
        <div className="mx-auto w-full max-w-2xl rounded-3xl border border-border/70 bg-card/80 p-8 shadow-sm">
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

  const paystackEnabled = getPaystackEnabledCurrencies();
  const providers = [
    ...(isProviderCurrency("PAYSTACK", currency) && paystackEnabled.includes(currency) ? ["PAYSTACK"] : []),
    ...(isProviderCurrency("FLUTTERWAVE", currency) ? ["FLUTTERWAVE"] : []),
  ] as const;

  const monthlyPrice = getPlanPriceForInterval(subscription.plan, currency, "monthly");
  const yearlyPrice = getPlanPriceForInterval(subscription.plan, currency, "yearly");

  return (
    <div className="min-h-screen bg-background px-6 py-10 text-foreground">
      <div className="mx-auto w-full max-w-2xl rounded-3xl border border-border/70 bg-card/80 p-8 shadow-sm">
        <p className="text-xs uppercase tracking-[0.35em] text-muted-foreground">Checkout</p>
        <h1 className="mt-3 text-3xl font-semibold">Complete your subscription</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Your account is created. Activate your plan to access the dashboard.
        </p>
        <CheckoutPanel
          planLabel={planLabel(subscription.plan)}
          plan={subscription.plan}
          interval={subscription.interval === "yearly" ? "yearly" : "monthly"}
          currency={currency}
          monthlyPrice={monthlyPrice}
          yearlyPrice={yearlyPrice}
          providers={providers as any}
        />
      </div>
    </div>
  );
}
