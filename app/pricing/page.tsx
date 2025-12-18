import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { pricingTableDualCurrency, TRIAL_DAYS } from "@/lib/pricing";

const plans = pricingTableDualCurrency();

function formatMoney(amount: number, currency: "NGN" | "USD") {
  const locale = currency === "NGN" ? "en-NG" : "en-US";
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-50">
      <div className="mx-auto max-w-5xl space-y-10 px-6 py-16">
        <div className="space-y-3 text-center">
          <Badge variant="success">Stripe + Paystack</Badge>
          <h1 className="text-4xl font-semibold text-white">Pricing</h1>
          <p className="text-slate-400">
            Start with a {TRIAL_DAYS}-day free trial, then pick the plan that fits your business. Prices are shown in
            NGN and USD.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {plans.map((plan) => {
            const featured = plan.plan === "GROWTH";
            const href = plan.plan === "ENTERPRISE" ? "/contact" : "/signup";
            const cta = plan.plan === "ENTERPRISE" ? "Contact sales" : "Start free trial";

            return (
              <Card
                key={plan.plan}
                className={`h-full border-slate-800 bg-slate-900/60 ${
                  featured ? "border-indigo-500/60 shadow-lg shadow-indigo-500/20" : ""
                }`}
                title={plan.label}
                actions={featured ? <Badge variant="success">Popular</Badge> : undefined}
              >
                <div className="space-y-4">
                  <div className="text-3xl font-semibold text-white">
                    {plan.ngn == null ? (
                      "Contact sales"
                    ) : (
                      <div className="flex flex-col gap-1">
                        <div>
                          {formatMoney(plan.ngn, "NGN")}
                          <span className="text-sm text-slate-400">/mo</span>
                        </div>
                        {plan.usd != null && (
                          <div className="text-sm font-medium text-slate-400">{formatMoney(plan.usd, "USD")}/mo</div>
                        )}
                      </div>
                    )}
                  </div>

                  <ul className="space-y-2 text-sm text-slate-200">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-center gap-2">
                        <span className="h-1.5 w-1.5 rounded-full bg-indigo-400" />
                        {feature}
                      </li>
                    ))}
                  </ul>

                  <Link href={href}>
                    <Button variant={featured ? "primary" : "secondary"} className="w-full">
                      {cta}
                    </Button>
                  </Link>
                </div>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
