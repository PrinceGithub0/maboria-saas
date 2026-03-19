import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { getPlanPriceForInterval } from "@/lib/pricing";
import { getCheckoutPlanConfig } from "@/lib/checkout-plan-config";
import { normalizeCurrency } from "@/lib/payments/currency-allowlist";
import { CheckCircle2 } from "lucide-react";
import { RetrySecurePaymentButton } from "./retry-secure-payment-button";
import { resolveImpersonationFromRequestContext } from "@/lib/admin/impersonation";
import { ExitImpersonationButton } from "./exit-impersonation-button";

function TrustLockIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-[18px] w-[18px] text-[#6B7280] sm:h-5 sm:w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="5" y="10" width="14" height="10" rx="3" />
      <path d="M8 10V8a4 4 0 0 1 8 0v2" />
      <circle cx="12" cy="15" r="1.2" />
      <path d="M12 16.2V17.4" />
    </svg>
  );
}

function TrustShieldCheckIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-[18px] w-[18px] text-[#6B7280] sm:h-5 sm:w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 3.8L18 6.3v5.5c0 3.7-2.3 7-6 8.4-3.7-1.4-6-4.7-6-8.4V6.3L12 3.8Z" />
      <path d="m9.6 12.4 1.8 1.8 3.2-3.2" />
    </svg>
  );
}

function formatPlanPrice(currency: string, price: number | null) {
  if (price == null) return "-";
  const formatted = price.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (currency === "USD") return `$${formatted}`;
  return `${currency} ${formatted}`;
}

export default async function BillingLockedPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect("/signup");
  }

  const impersonation = await resolveImpersonationFromRequestContext(session.user.id);

  const subscription = await prisma.subscription.findFirst({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
  });

  const plan = subscription?.plan || "STARTER";
  const interval = subscription?.interval === "yearly" ? "yearly" : "monthly";
  const currency = normalizeCurrency(subscription?.currency || "USD");
  const price = getPlanPriceForInterval(plan, currency, interval);
  const planConfig = getCheckoutPlanConfig(plan);
  const selectedPlanName = planConfig.planName.replace(/\s+Plan$/i, "");
  const planDescription = planConfig.positioning || "Continue with your selected plan to unlock all premium features.";

  return (
    <div className="min-h-screen bg-[#F8FAFC] px-4 py-16 text-slate-900 sm:px-6 sm:py-20">
      <div className="mx-auto w-full max-w-[720px]">
        <div className="relative rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_14px_40px_-28px_rgba(15,23,42,0.28)] sm:p-8">
          {impersonation ? (
            <div className="impersonation-banner mb-5 rounded-xl border p-3 text-sm font-semibold">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="font-medium">
                  {`Impersonating: ${impersonation.targetEmail || impersonation.targetName || "Tenant user"} (Tenant: ${impersonation.tenantName || "Unknown tenant"})`}
                </p>
                <ExitImpersonationButton />
              </div>
            </div>
          ) : null}

          <div className="absolute right-6 top-6 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">
            Subscription Incomplete
          </div>

          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-slate-500">Billing</p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">Complete Your Subscription</h1>
          <p className="mt-3 text-sm text-slate-600 sm:text-base">
            Your account is almost ready. Complete payment to unlock full access.
          </p>

          <section className="mt-8 rounded-xl border border-slate-200 bg-slate-50 p-5 sm:p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Selected Plan</p>
            <p className="mt-3 text-xl font-semibold text-slate-900">{selectedPlanName}</p>
            <p className="mt-1 text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">{formatPlanPrice(currency, price)}</p>
            <p className="mt-2 text-sm font-medium text-slate-600">Billed {interval}</p>
            <p className="mt-4 text-sm leading-relaxed text-slate-600">{planDescription}</p>
          </section>

          <section className="mt-6">
            <ul className="space-y-3">
              {planConfig.features.map((feature) => (
                <li key={feature} className="flex items-start gap-3 text-sm text-slate-700 sm:text-base">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[#16A34A]" strokeWidth={2} />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="mt-8 border-t border-slate-200 pt-6">
            <h2 className="text-base font-semibold text-slate-900">Payment Status</h2>
            <p className="mt-2 text-sm text-slate-600">Your previous payment attempt was not completed.</p>
            <p className="mt-1 text-sm text-slate-500">Retry below to activate your subscription instantly.</p>
          </section>

          <div className="mt-6">
            <RetrySecurePaymentButton />
            <div className="mt-3 text-center">
              <Link href="/logout" className="text-sm font-medium text-slate-500 transition hover:text-slate-700">
                Log out
              </Link>
            </div>
          </div>

          <div className="mt-8 border-t border-slate-200 pt-6">
            <div className="flex items-center justify-center gap-2 whitespace-nowrap text-[11px] font-medium text-[#6B7280] sm:px-2 sm:text-sm sm:whitespace-normal">
              <TrustLockIcon />
              <span>SSL Encrypted</span>
              <span aria-hidden="true">{"\u00B7"}</span>
              <TrustShieldCheckIcon />
              <span>Secure global payment processing</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

