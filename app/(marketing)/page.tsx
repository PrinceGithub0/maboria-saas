import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { pricingTableDualCurrency, TRIAL_DAYS } from "@/lib/pricing";

const features = [
  { title: "AI Automation", desc: "Generate flows, optimize steps, and run with resilience." },
  { title: "Dual-currency billing", desc: "Stripe (USD) and Paystack (NGN) with subscriptions + usage." },
  { title: "Invoices & Payments", desc: "Invoice generator, PDF, payments, and webhook monitoring." },
  { title: "Admin control center", desc: "Full logs, flags, impersonation, and revenue analytics." },
];

const planMeta: Record<string, { desc: string; cta: string; href: string; featured?: boolean }> = {
  STARTER: { desc: "For founders and solo operators", cta: "Start free trial", href: "/signup" },
  GROWTH: { desc: "For teams running automation daily", cta: "Start free trial", href: "/signup", featured: true },
  ENTERPRISE: { desc: "For advanced controls and support", cta: "Contact sales", href: "/contact" },
};

const plans = pricingTableDualCurrency().map((p) => ({ ...p, ...planMeta[p.plan] }));

function formatMoney(amount: number, currency: "NGN" | "USD") {
  const locale = currency === "NGN" ? "en-NG" : "en-US";
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <Link href="/" className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-2xl bg-indigo-500/20 text-lg font-bold text-indigo-300">
            M
          </div>
          <div className="leading-tight">
            <p className="text-xs uppercase tracking-[0.25em] text-indigo-300">Maboria</p>
            <p className="text-lg font-semibold text-white">Automation Cloud</p>
          </div>
        </Link>
        <div className="hidden items-center gap-3 sm:flex">
          <Link href="/login">
            <Button variant="ghost">Login</Button>
          </Link>
          <Link href="/signup">
            <Button>Get Started</Button>
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 pb-16">
        <section className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <div className="space-y-6">
            <Badge variant="success">{"USD + NGN billing \u2022 AI automation"}</Badge>
            <h1 className="text-4xl font-semibold leading-tight text-white sm:text-5xl">
              Automate revenue operations with AI-native workflows.
            </h1>
            <p className="text-lg text-slate-300">
              Maboria unifies automations, billing, invoicing, and AI insights. Build flows in seconds, get paid in
              USD/NGN, and keep admins in control with a full audit stack.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link href="/signup">
                <Button size="md">Start free trial</Button>
              </Link>
              <Link href="/pricing">
                <Button variant="secondary" size="md">
                  View pricing
                </Button>
              </Link>
            </div>
            <p className="text-sm text-slate-400">No credit card required. Trial is {TRIAL_DAYS} days.</p>
            <div className="flex flex-wrap gap-4 text-sm text-slate-300">
              <div className="rounded-xl border border-slate-800/60 bg-slate-900/50 px-4 py-3">
                Dual payments: Stripe (USD/EUR) + Paystack (NGN)
              </div>
              <div className="rounded-xl border border-slate-800/60 bg-slate-900/50 px-4 py-3">
                AI automations with diagnosis & insights
              </div>
            </div>
          </div>
          <div className="relative">
            <div className="glass rounded-2xl border border-indigo-500/30 p-4 shadow-2xl">
              <div className="rounded-xl bg-slate-950/70 p-4">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>Automation Builder</span>
                  <span>Live</span>
                </div>
                <div className="mt-3 space-y-2">
                  <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
                    <p className="text-sm text-slate-200">Trigger: Invoice overdue</p>
                    <p className="text-xs text-slate-500">Wait 3 days, send reminder, log payment status</p>
                  </div>
                  <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
                    <p className="text-sm text-slate-200">AI: Suggest improvements</p>
                    <p className="text-xs text-slate-500">"Add WhatsApp nudge and retry twice"</p>
                  </div>
                  <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
                    <p className="text-sm text-slate-200">Billing</p>
                    <p className="text-xs text-slate-500">Stripe + Paystack in sync - PDF invoices</p>
                  </div>
                </div>
              </div>
            </div>
            <div className="absolute -left-8 -bottom-10 hidden h-24 w-24 rounded-full bg-indigo-500/20 blur-3xl lg:block" />
          </div>
        </section>

        <section className="mt-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((f) => (
            <Card key={f.title} title={f.title}>
              <p className="text-sm text-slate-300">{f.desc}</p>
            </Card>
          ))}
        </section>

        <section className="mt-16 space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-semibold text-white">Pricing</h2>
            <Badge variant="success">{TRIAL_DAYS}-day free trial</Badge>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {plans.map((plan) => (
              <Card
                key={plan.plan}
                title={plan.label}
                className={`h-full ${plan.featured ? "border-indigo-500/60 shadow-lg shadow-indigo-500/20" : ""}`}
              >
                <div className="space-y-2">
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

                  <p className="text-sm text-slate-400">{plan.desc}</p>
                </div>

                <Link href={plan.href}>
                  <Button className="mt-3 w-full" variant={plan.featured ? "primary" : "secondary"}>
                    {plan.cta}
                  </Button>
                </Link>
              </Card>
            ))}
          </div>
        </section>

        <section className="mt-16 rounded-2xl border border-slate-900 bg-slate-950/70 p-8">
          <div className="grid gap-6 lg:grid-cols-2">
            <div>
              <h3 className="text-xl font-semibold text-white">Loved by operators</h3>
              <p className="text-sm text-slate-400">
                "Maboria replaced 4 tools. Billing, automations, AI insights, and admin observability just work."
              </p>
            </div>
            <div className="space-y-3">
              <div className="rounded-xl border border-slate-900 bg-slate-900/60 p-4">
                <p className="text-sm text-slate-300">
                  "We ship faster with AI-generated flows and get paid faster with dual-currency billing."
                </p>
                <p className="text-xs text-slate-500">- Future Customer</p>
              </div>
              <div className="rounded-xl border border-slate-900 bg-slate-900/60 p-4">
                <p className="text-sm text-slate-300">"Admin panel feels like Stripe's - amazing visibility."</p>
                <p className="text-xs text-slate-500">- Future Admin</p>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-900 bg-slate-950/80 px-6 py-8">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 text-sm text-slate-400 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-3">
            <Link href="/faq" className="hover:text-white">
              FAQ
            </Link>
            <Link href="/terms" className="hover:text-white">
              Terms
            </Link>
            <Link href="/privacy" className="hover:text-white">
              Privacy
            </Link>
            <Link href="/support" className="hover:text-white">
              Support
            </Link>
          </div>
          <p>
            {"\u00A9"} {new Date().getFullYear()} Maboria Inc.
          </p>
        </div>
      </footer>
    </div>
  );
}
