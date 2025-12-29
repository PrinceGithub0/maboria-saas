import Link from "next/link";
import Image from "next/image";
import { ChevronDown, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { pricingTableDualCurrency } from "@/lib/pricing";
import { MarketingCta } from "@/components/ui/marketing-cta";
import { marketingCountries } from "@/lib/payments/currency-allowlist";

const planMeta: Record<string, { desc: string; cta: string; href: string; featured?: boolean }> = {
  STARTER: { desc: "For founders and solo operators", cta: "Subscribe", href: "/dashboard/subscription?plan=starter" },
  GROWTH: {
    desc: "For teams running automation daily",
    cta: "Subscribe",
    href: "/dashboard/subscription?plan=pro",
    featured: true,
  },
  ENTERPRISE: { desc: "For advanced controls and support", cta: "Contact sales", href: "/contact" },
};

const plans = pricingTableDualCurrency().map((p) => ({ ...p, ...planMeta[p.plan] }));
const paystackCountries = marketingCountries.PAYSTACK;
const flutterwaveCountries = marketingCountries.FLUTTERWAVE;
const paystackMethods = [
  { label: "Cards", icon: "/payment-method-icons/card.svg" },
  { label: "Bank transfer", icon: "/payment-method-icons/bank-transfer.svg" },
  { label: "Local methods", icon: "/payment-method-icons/wallet.svg" },
];

function formatMoney(amount: number, currency: "NGN" | "USD") {
  const locale = currency === "NGN" ? "en-NG" : "en-US";
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

export default function LandingPage() {
  const logoSrc = "/branding/Maboria%20Company%20logo.png";
  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-muted to-background text-foreground max-md:overflow-x-hidden">
      <div className="fixed inset-x-0 top-0 z-50 border-b border-border bg-background/90 px-4 py-3 backdrop-blur md:hidden">
        <div className="flex w-full max-w-none items-center justify-between">
          <div className="flex items-center gap-3">
            <details className="relative [&>summary::-webkit-details-marker]:hidden">
              <summary className="list-none rounded-lg border border-border bg-card/80 p-2 text-slate-950 dark:text-foreground">
                <Menu className="h-5 w-5" />
              </summary>
              <div className="absolute left-0 top-12 w-44 rounded-xl border border-border bg-card p-2 shadow-lg">
                <Link href="/pricing" className="block rounded-lg px-3 py-2 text-sm hover:bg-muted/60">
                  Pricing
                </Link>
                <Link href="/about" className="block rounded-lg px-3 py-2 text-sm hover:bg-muted/60">
                  About
                </Link>
                <Link href="/support" className="block rounded-lg px-3 py-2 text-sm hover:bg-muted/60">
                  Support
                </Link>
                <Link href="/signup" className="block rounded-lg px-3 py-2 text-sm hover:bg-muted/60">
                  Get started
                </Link>
              </div>
            </details>
            <Link href="/" className="flex items-center gap-2">
              <div className="relative h-8 w-8 overflow-hidden rounded-xl border border-border bg-card">
                <Image src={logoSrc} alt="Maboria" fill className="object-contain p-0 scale-110" priority />
              </div>
              <span className="text-sm font-semibold text-foreground">Maboria</span>
            </Link>
          </div>
          <Link href="/login">
            <Button size="sm">Sign in</Button>
          </Link>
        </div>
      </div>

      <header className="mx-auto hidden max-w-6xl items-center justify-between px-6 py-6 md:flex">
        <Link href="/" className="flex items-center gap-3">
          <div className="relative h-10 w-10 overflow-hidden rounded-2xl border border-border bg-card">
            <Image src={logoSrc} alt="Maboria" fill className="object-contain p-0 scale-110" priority />
          </div>
          <div className="leading-tight">
            <p className="text-xs uppercase tracking-[0.25em] text-indigo-800 dark:text-indigo-300">Maboria</p>
            <p className="text-lg font-semibold text-foreground">Automation Cloud</p>
          </div>
        </Link>
        <div className="hidden items-center gap-3 sm:flex">
          <MarketingCta variant="header" />
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 pb-12 pt-20 md:pb-16 md:pt-0 max-md:mx-0 max-md:w-full max-md:max-w-none max-md:px-4 max-md:pt-16 max-md:pb-24">
        <section className="grid gap-8 md:gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-center max-md:gap-5">
          <div className="space-y-6 text-left max-md:space-y-5 max-md:text-center">
            <Badge variant="success" className="max-md:mx-auto max-md:w-fit font-semibold text-slate-900 dark:text-emerald-200">
              {"Global payments \u2022 AI automation"}
            </Badge>
            <h1 className="text-3xl font-semibold leading-tight text-foreground sm:text-4xl md:text-5xl max-md:text-2xl max-[480px]:text-[22px]">
              Automate revenue operations with AI-native workflows.
            </h1>
            <p className="text-lg text-slate-900 dark:text-slate-300 max-md:text-base max-[480px]:text-sm">
              Maboria unifies automations, billing, invoicing, and AI insights. Build flows in seconds, accept local and
              international payments, and keep admins in control with a full audit stack.
            </p>
            <MarketingCta variant="hero" />
            <div className="flex flex-wrap gap-4 text-sm text-slate-900 dark:text-slate-300 max-md:grid max-md:gap-2">
              <div className="rounded-xl border border-border bg-card/60 px-4 py-3">
                Dual payments: Flutterwave + Paystack
              </div>
              <div className="rounded-xl border border-border bg-card/60 px-4 py-3">
                AI automations with diagnosis & insights
              </div>
            </div>
          </div>
          <div className="relative max-md:mx-0 max-md:w-full max-md:max-w-none">
            <div className="glass rounded-2xl border border-indigo-500/30 p-4 shadow-2xl max-md:border-border max-md:bg-card/70 max-md:shadow-none">
              <div className="rounded-xl bg-card/80 p-4 max-md:bg-transparent max-md:p-0">
                <div className="flex items-center justify-between text-xs text-slate-900 dark:text-slate-300">
                  <span>Automation Builder</span>
                  <span>Live</span>
                </div>
                <div className="mt-3 space-y-2">
                  <div className="rounded-lg border border-border bg-muted/60 p-3">
                    <p className="text-sm text-foreground">Trigger: Invoice overdue</p>
                    <p className="text-xs text-slate-900 dark:text-slate-300">Wait 3 days, send reminder, log payment status</p>
                  </div>
                  <div className="rounded-lg border border-border bg-muted/60 p-3">
                    <p className="text-sm text-foreground">AI: Suggest improvements</p>
                    <p className="text-xs text-slate-900 dark:text-slate-300">&quot;Add WhatsApp nudge and retry twice&quot;</p>
                  </div>
                  <div className="rounded-lg border border-border bg-muted/60 p-3">
                    <p className="text-sm text-foreground">Billing</p>
                    <p className="text-xs text-slate-900 dark:text-slate-300">Flutterwave + Paystack in sync - PDF invoices</p>
                  </div>
                </div>
              </div>
            </div>
            <div className="absolute -left-8 -bottom-10 hidden h-24 w-24 rounded-full bg-indigo-500/20 blur-3xl lg:block" />
          </div>
        </section>

        <section className="mt-8 md:hidden">
          <div className="rounded-2xl border border-border bg-card/70 px-4 py-4 text-center">
            <p className="text-sm font-semibold text-foreground">Get started in 2 minutes</p>
            <p className="mt-1 text-xs text-slate-900 dark:text-slate-300">Create your workspace and launch your first automation.</p>
            <MarketingCta variant="mobileCard" />
          </div>
        </section>

        <section className="mt-10 space-y-6 md:mt-12">
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-[0.25em] text-indigo-800 dark:text-indigo-300">
              Payment coverage
            </p>
            <h2 className="text-2xl font-semibold text-foreground md:text-2xl max-md:text-xl">
              Payment coverage & supported countries
            </h2>
            <p className="text-sm text-slate-900 dark:text-slate-300 md:hidden">
              Local and international payments supported across key markets.
            </p>
            <p className="hidden text-sm text-slate-900 dark:text-slate-300 md:block">
              Pay with local cards or bank transfer in supported African countries. International customers can pay
              securely with Visa, Mastercard, and Verve. Multi-currency billing handled automatically.
            </p>
          </div>

          {/* Source: Paystack and Flutterwave official coverage docs (client-provided lists). */}
          <div className="mx-auto w-full max-w-7xl max-md:mx-0 max-md:max-w-none">
            <div className="grid gap-3 md:hidden">
              <details className="group rounded-2xl border border-border/70 bg-background/70 p-3 sm:p-4 [&>summary::-webkit-details-marker]:hidden">
                <summary className="flex cursor-pointer items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-foreground">Paystack coverage</p>
                    <p className="text-xs text-slate-900 dark:text-slate-300">Cards, bank transfer, local methods.</p>
                  </div>
                  <ChevronDown className="h-4 w-4 text-slate-900 dark:text-slate-300 transition group-open:rotate-180" />
                </summary>
                <div className="overflow-hidden transition-[max-height] duration-300 max-h-0 group-open:max-h-[720px]">
                  <div className="pt-3 space-y-3 text-sm text-slate-900 dark:text-slate-300">
                    <p>Countries where Paystack operates fully:</p>
                    <div className="grid grid-cols-2 gap-2">
                      {paystackCountries.map((country) => (
                        <Badge key={country} variant="country" className="text-[11px]">
                          {country}
                        </Badge>
                      ))}
                    </div>
                    <p>Beta programs: Egypt, Rwanda.</p>
                    <div className="grid grid-cols-2 gap-2">
                      {paystackMethods.map((item) => (
                        <div
                          key={item.label}
                          className="flex items-center gap-2 rounded-xl border border-border/60 bg-background/60 px-2 py-2"
                        >
                          <Image
                            src={item.icon}
                            alt={item.label}
                            width={22}
                            height={22}
                            className="payment-method-icon h-5 w-5"
                          />
                          <span className="text-[11px] font-medium text-slate-900 dark:text-slate-300">{item.label}</span>
                        </div>
                      ))}
                    </div>
                    <p>USD support available in Nigeria and Kenya.</p>
                  </div>
                </div>
              </details>

              <details className="group rounded-2xl border border-border/70 bg-background/70 p-3 sm:p-4 [&>summary::-webkit-details-marker]:hidden">
                <summary className="flex cursor-pointer items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-foreground">Flutterwave coverage</p>
                    <p className="text-xs text-slate-900 dark:text-slate-300">Visa, Mastercard, Verve accepted.</p>
                  </div>
                  <ChevronDown className="h-4 w-4 text-slate-900 dark:text-slate-300 transition group-open:rotate-180" />
                </summary>
                <div className="overflow-hidden transition-[max-height] duration-300 max-h-0 group-open:max-h-[900px]">
                  <div className="pt-3 space-y-3 text-sm text-slate-900 dark:text-slate-300">
                    <p>Selected countries where Flutterwave enables merchant payments:</p>
                    <div className="grid grid-cols-2 gap-2">
                      {flutterwaveCountries.map((country) => (
                        <Badge key={country} variant="country" className="text-[11px]">
                          {country}
                        </Badge>
                      ))}
                    </div>
                    <p>Accept payments from Customers in the US, UK, and Europe (Germany, France, Spain).</p>
                    <div className="flex items-center justify-center gap-3">
                      <Image
                        src="/payment-logos/visa.svg"
                        alt="Visa"
                        width={96}
                        height={28}
                        className="payment-logo h-6 w-auto"
                      />
                      <Image
                        src="/payment-logos/mastercard.svg"
                        alt="Mastercard"
                        width={140}
                        height={28}
                        className="payment-logo h-6 w-auto"
                      />
                      <Image
                        src="/payment-logos/verve.svg"
                        alt="Verve"
                        width={96}
                        height={28}
                        className="payment-logo h-6 w-auto"
                      />
                    </div>
                    <p>Supports USD plus local African currencies where available.</p>
                  </div>
                </div>
              </details>
            </div>

            <div className="hidden gap-6 md:grid md:grid-cols-2 xl:gap-8">
              <Card
                title="Paystack coverage"
                className="relative flex aspect-square flex-col overflow-hidden border border-border/70 bg-gradient-to-br from-background via-muted/40 to-background p-8 ring-1 ring-slate-200/40 shadow-[0_0_24px_rgba(148,163,184,0.12)] dark:ring-slate-800/40 xl:p-10"
              >
                <div className="absolute -right-16 -top-16 h-32 w-32 rounded-full bg-slate-500/10 blur-3xl" />
                <div className="relative space-y-4 text-sm text-slate-900 dark:text-slate-300">
                  <p>Countries where Paystack operates fully:</p>
                  <div className="flex flex-wrap gap-2">
                    {paystackCountries.map((country) => (
                      <Badge key={country} variant="country">
                        {country}
                      </Badge>
                    ))}
                  </div>
                  <p>Beta programs: Egypt, Rwanda.</p>
                  <div className="grid grid-cols-3 gap-2">
                    {paystackMethods.map((item) => (
                      <div
                        key={item.label}
                        className="group flex flex-col items-center gap-2 rounded-xl border border-border/60 bg-background/60 px-3 py-2 transition hover:border-indigo-400/50"
                      >
                        <Image
                          src={item.icon}
                          alt={item.label}
                          width={26}
                          height={26}
                          className="payment-method-icon h-5 w-5 transition"
                        />
                        <span className="text-[11px] font-medium text-slate-900 dark:text-slate-300">{item.label}</span>
                      </div>
                    ))}
                  </div>
                  <p>USD support available in Nigeria and Kenya.</p>
                </div>
              </Card>

              <Card
                title="Flutterwave coverage"
                className="relative flex aspect-square flex-col overflow-hidden border border-border/70 bg-gradient-to-br from-background via-muted/40 to-background p-8 ring-1 ring-slate-200/40 shadow-[0_0_24px_rgba(148,163,184,0.12)] dark:ring-slate-800/40 xl:p-10"
              >
                <div className="absolute -right-16 -top-16 h-32 w-32 rounded-full bg-slate-500/10 blur-3xl" />
                <div className="relative space-y-4 text-sm text-slate-900 dark:text-slate-300">
                  <p>Selected countries where Flutterwave enables merchant payments:</p>
                  <div className="flex flex-wrap gap-2">
                    {flutterwaveCountries.map((country) => (
                      <Badge key={country} variant="country">
                        {country}
                      </Badge>
                    ))}
                  </div>
                  <p>Accept payments from Customers in the US, UK, and Europe (Germany, France, Spain).</p>
                  <div className="flex flex-col gap-3">
                    <div className="h-px w-full bg-border/40" />
                    <div className="flex flex-wrap items-center justify-start gap-6">
                      <Image
                        src="/payment-logos/visa.svg"
                        alt="Visa"
                        width={96}
                        height={28}
                        className="payment-logo h-6 w-auto"
                      />
                      <Image
                        src="/payment-logos/mastercard.svg"
                        alt="Mastercard"
                        width={140}
                        height={28}
                        className="payment-logo h-6 w-auto"
                      />
                      <Image
                        src="/payment-logos/verve.svg"
                        alt="Verve"
                        width={96}
                        height={28}
                        className="payment-logo h-6 w-auto"
                      />
                    </div>
                    <div className="h-px w-full bg-border/40" />
                  </div>
                  <p>Supports USD plus local African currencies where available.</p>
                </div>
              </Card>
            </div>
          </div>
        </section>

        <section className="mt-12 space-y-6 md:mt-16">
          <h2 className="text-2xl font-semibold text-foreground max-md:text-xl">Pricing</h2>

          <div className="grid gap-4 md:grid-cols-3 max-md:gap-3">
            {plans.map((plan) => (
              <Card
                key={plan.plan}
                title={plan.label}
                className={`relative h-full p-5 md:p-6 max-md:p-4 ${plan.featured ? "border-indigo-500/60 shadow-lg shadow-indigo-500/20" : ""}`}
              >
                {plan.featured && (
                  <div className="absolute right-4 top-4">
                    <Badge variant="success" className="font-bold text-slate-900 dark:text-emerald-200">
                      Popular
                    </Badge>
                  </div>
                )}
                <div className="space-y-2">
                  <div className="text-3xl font-semibold text-foreground max-md:text-2xl">
                    {plan.ngn == null ? (
                      "Contact sales"
                    ) : (
                      <div className="flex flex-col gap-1">
                        <div>
                          {formatMoney(plan.ngn, "NGN")}
                          <span className="text-sm text-slate-900 dark:text-slate-300">/mo</span>
                        </div>
                        {plan.usd != null && (
                          <div className="text-sm font-medium text-slate-900 dark:text-slate-300">{formatMoney(plan.usd, "USD")}/mo</div>
                        )}
                      </div>
                    )}
                  </div>

                  <p className="text-sm text-slate-900 dark:text-slate-300">{plan.desc}</p>
                </div>

                <Link href={plan.href}>
                  <Button className="mt-3 w-full max-md:h-11" variant="primary">
                    {plan.cta}
                  </Button>
                </Link>
              </Card>
            ))}
          </div>
        </section>

        <section className="mt-12 rounded-2xl border border-border bg-card/60 p-6 md:mt-16 md:p-8 max-md:p-4">
          <div className="grid gap-5 md:gap-6 lg:grid-cols-2">
            <div>
              <h3 className="text-xl font-semibold text-foreground">Loved by operators</h3>
              <p className="text-sm text-slate-900 dark:text-slate-300 max-md:text-xs">
                Maboria replaced 4 tools. Billing, automations, AI insights, and admin observability just work.
              </p>
            </div>
            <div className="space-y-3">
              <div className="rounded-xl border border-border bg-muted/60 p-4">
                <p className="text-sm text-slate-900 dark:text-slate-300 max-md:text-xs">
                  We ship faster with AI-generated flows and get paid faster with dual-currency billing.
                </p>
                <p className="text-xs text-slate-900 dark:text-slate-300">- Elizabeth Bassey, Beta Tester</p>
              </div>
              <div className="rounded-xl border border-border bg-muted/60 p-4">
                <p className="text-sm text-slate-900 dark:text-slate-300 max-md:text-xs">
                  Admin panel feels like a dedicated billing control room - amazing visibility.
                </p>
                <p className="text-xs text-slate-900 dark:text-slate-300">- Michael Osas Omoregie</p>
              </div>
            </div>
          </div>
        </section>

      </main>

      <footer className="border-t border-border bg-background/80 px-4 py-8 backdrop-blur md:px-6">
        <div className="mx-auto flex max-w-[420px] flex-col gap-3 text-sm text-slate-900 dark:text-slate-300 sm:max-w-6xl sm:flex-row sm:items-center sm:justify-between max-md:mx-0 max-md:w-full max-md:max-w-none">
          <div className="flex gap-3">
            <Link href="/faq" className="hover:text-foreground">
              FAQ
            </Link>
            <Link href="/terms" className="hover:text-foreground">
              Terms
            </Link>
            <Link href="/privacy" className="hover:text-foreground">
              Privacy
            </Link>
            <Link href="/support" className="hover:text-foreground">
              Support
            </Link>
          </div>
          <div className="flex flex-col items-start gap-1 sm:items-end">
            <a href="mailto:info@maboria.com" className="hover:text-foreground">
              info@maboria.com
            </a>
            <p>
              {"\u00A9"} {new Date().getFullYear()} Maboria Inc.
            </p>
          </div>
        </div>
      </footer>
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 px-4 py-3 backdrop-blur md:hidden">
        <MarketingCta variant="mobileBar" />
      </div>
    </div>
  );
}
