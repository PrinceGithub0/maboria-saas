import Link from "next/link";
import Image from "next/image";
import {
  BarChart3,
  Bell,
  CheckCircle2,
  ChevronDown,
  Gauge,
  Lock,
  Menu,
  MessageSquare,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { pricingTableDualCurrency } from "@/lib/pricing";
import { MarketingCta } from "@/components/ui/marketing-cta";
import { marketingCountries } from "@/lib/payments/currency-allowlist";
import { PaystackLogo } from "@/components/ui/paystack-logo";

const planMeta: Record<string, { desc: string; cta: string; href: string; featured?: boolean }> = {
  STARTER: { desc: "Simple invoicing + basic reminders", cta: "Subscribe", href: "/dashboard/subscription?plan=starter" },
  GROWTH: {
    desc: "AI suggestions, WhatsApp nudges, advanced automations",
    cta: "Subscribe",
    href: "/dashboard/subscription?plan=pro",
    featured: true,
  },
  ENTERPRISE: { desc: "Full automation control, team access, deeper governance", cta: "Contact sales", href: "/contact" },
};

const plans = pricingTableDualCurrency().map((p) => ({ ...p, ...planMeta[p.plan] }));
const paystackCountries = marketingCountries.PAYSTACK;
const flutterwaveCountries = marketingCountries.FLUTTERWAVE;
const highlights = [
  {
    title: "Get paid faster",
    description: "Automatic reminders before and after due dates keep cashflow moving.",
    icon: Sparkles,
  },
  {
    title: "Send receipts instantly",
    description: "Customers receive invoices and receipts without manual follow-up.",
    icon: CheckCircle2,
  },
  {
    title: "Stay on top of collections",
    description: "Track paid and unpaid invoices in a clear, shared view.",
    icon: BarChart3,
  },
];
const whyMaboria = [
  {
    title: "Built for African operations",
    description: "Run local and multi-currency billing with Paystack and Flutterwave.",
    icon: Gauge,
  },
  {
    title: "Team visibility",
    description: "Keep activity history and approvals visible as your team scales.",
    icon: BarChart3,
  },
  {
    title: "Privacy-first by default",
    description: "Your business records stay private and under your control.",
    icon: Lock,
  },
];
const playbooks = [
  {
    title: "Invoice reminders",
    description: "Automatically remind customers before due dates.",
    icon: Bell,
  },
  {
    title: "Payment receipts",
    description: "Send receipts instantly after payment is confirmed.",
    icon: CheckCircle2,
  },
  {
    title: "Follow-up nudges",
    description: "Get paid faster with WhatsApp and email nudges.",
    icon: MessageSquare,
  },
  {
    title: "Weekly summaries",
    description: "See what was paid and what needs a follow-up.",
    icon: BarChart3,
  },
];
const howItWorks = [
  {
    step: "01",
    title: "Create invoice",
    description: "Generate an invoice with your business details in minutes.",
  },
  {
    step: "02",
    title: "Customer pays",
    description: "Share the invoice and accept payments via Paystack or Flutterwave.",
  },
  {
    step: "03",
    title: "Automatic follow-up",
    description: "Maboria sends reminders and receipts without manual chasing.",
  },
];
const securityItems = [
  {
    title: "Audit-ready activity logs",
    description: "Track key activity across billing, invoices, and automations.",
    icon: BarChart3,
  },
  {
    title: "Role-based access control",
    description: "Keep sensitive operations restricted to the right people.",
    icon: Lock,
  },
  {
    title: "Operational monitoring",
    description: "System visibility across usage, limits, and payment events.",
    icon: CheckCircle2,
  },
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
    <div className="relative min-h-screen bg-gradient-to-br from-background via-muted to-background text-foreground max-md:overflow-x-hidden">
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -left-24 top-24 h-56 w-56 rounded-full bg-indigo-500/10 blur-[90px]" />
        <div className="absolute right-0 top-0 h-72 w-72 rounded-full bg-slate-500/10 blur-[110px]" />
      </div>
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
        <section className="grid gap-8 md:gap-10 lg:grid-cols-[1.12fr_0.88fr] lg:items-center max-md:gap-5">
          <div className="space-y-6 text-left max-md:space-y-5 max-md:text-center">
            <Badge
              variant="success"
              className="max-md:mx-auto max-md:w-fit border border-emerald-400/60 bg-emerald-100 text-xs font-semibold text-emerald-900 dark:bg-emerald-500/10 dark:text-emerald-200"
            >
              {"Get paid faster \u2022 Automatic follow-ups"}
            </Badge>
            <h1 className="text-3xl font-semibold leading-[1.1] tracking-tight text-foreground sm:text-4xl md:text-6xl max-md:text-3xl max-[480px]:text-[24px]">
              Automate invoicing, follow-ups, and receipts to get paid on time.
            </h1>
            <p className="text-lg text-slate-900 dark:text-slate-300 max-md:text-base max-[480px]:text-sm">
              Maboria helps you send invoices, collect payments, and follow up automatically across email and WhatsApp.
              Keep customers informed and cashflow predictable from one dashboard.
            </p>
            <MarketingCta variant="hero" />
          <div className="flex flex-wrap gap-4 text-sm text-slate-900 dark:text-slate-300 max-md:grid max-md:gap-2">
              <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card/70 px-4 py-3 shadow-sm">
                <span className="text-sm text-slate-900 dark:text-slate-300">Payments:</span>
                <div className="flex items-center gap-3">
                  <PaystackLogo className="payment-logo-color h-6 w-auto" />
                  <Image
                    src="/payment-logos/flutterwave.png"
                    alt="Flutterwave"
                    width={144}
                    height={40}
                    className="payment-logo-color h-9 w-auto"
                  />
                </div>
              </div>
              <div className="rounded-xl border border-border bg-card/70 px-4 py-3 shadow-sm">
                Automatic reminders and receipts
              </div>
            </div>
          </div>
          <div className="relative max-md:mx-0 max-md:w-full max-md:max-w-none">
            <div className="glass rounded-2xl border border-indigo-500/30 p-4 shadow-2xl max-md:border-border max-md:bg-card/70 max-md:shadow-none">
              <div className="rounded-xl bg-card/80 p-4 max-md:bg-transparent max-md:p-0">
                <div className="flex items-center justify-between text-xs text-slate-900 dark:text-slate-300">
                  <span>Invoice follow-ups</span>
                  <span>Auto</span>
                </div>
                <div className="mt-3 space-y-2">
                  <div className="rounded-lg border border-border bg-muted/60 p-3">
                    <p className="text-sm text-foreground">Before due date reminder</p>
                    <p className="text-xs text-slate-900 dark:text-slate-300">Nudge customers 3 days before a payment is due.</p>
                  </div>
                  <div className="rounded-lg border border-border bg-muted/60 p-3">
                    <p className="text-sm text-foreground">Receipt after payment</p>
                    <p className="text-xs text-slate-900 dark:text-slate-300">Send a thank-you + receipt instantly.</p>
                  </div>
                  <div className="rounded-lg border border-border bg-muted/60 p-3">
                    <p className="text-sm text-foreground">Overdue follow-up</p>
                    <p className="text-xs text-slate-900 dark:text-slate-300">Escalate with WhatsApp and email nudges.</p>
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
          <div className="grid gap-3 md:grid-cols-3 md:gap-4">
            {highlights.map((item) => (
              <Card
                key={item.title}
                className="group flex items-start gap-3 border border-border bg-card/80 p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-border bg-muted/70 text-indigo-700 dark:text-indigo-200">
                  <item.icon className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">{item.title}</p>
                  <p className="mt-1 text-xs text-slate-900 dark:text-slate-300">{item.description}</p>
                </div>
              </Card>
            ))}
          </div>
          <div className="mt-6 space-y-4">
            <div className="flex flex-col gap-2">
              <p className="text-xs uppercase tracking-[0.25em] text-indigo-800 dark:text-indigo-300">
                Prebuilt automations
              </p>
              <h2 className="text-2xl font-semibold text-foreground max-md:text-xl">
                Prebuilt automations included
              </h2>
              <p className="text-sm text-slate-900 dark:text-slate-300">
                Start with ready-made reminders and receipts, then tailor them as you grow.
              </p>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {playbooks.map((item) => (
                <Card key={item.title} className="border border-border bg-card/80 p-4 shadow-sm">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-border bg-muted/70 text-indigo-700 dark:text-indigo-200">
                      <item.icon className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">{item.title}</p>
                      <p className="mt-1 text-xs text-slate-900 dark:text-slate-300">{item.description}</p>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
            <div className="flex flex-wrap gap-2 text-xs text-slate-900 dark:text-slate-300">
              {["Email notifications", "WhatsApp automation", "Payment updates", "Team activity logs"].map((item) => (
                <div
                  key={item}
                  className="rounded-full border border-border bg-card/70 px-4 py-2 font-medium"
                >
                  {item}
                </div>
              ))}
            </div>
            <p className="text-xs text-slate-900 dark:text-slate-300">
              Advanced automation is available on Pro & Enterprise plans.
            </p>
          </div>
          <div className="mt-10 space-y-2">
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
              <details className="coverage-card group rounded-2xl border border-border/70 bg-white p-3 sm:p-4 [&>summary::-webkit-details-marker]:hidden dark:bg-slate-950/60">
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
                    <div className="flex flex-wrap items-center justify-center gap-4 text-center">
                      <div className="flex flex-col items-center">
                        <div className="flex h-10 items-center justify-center">
                          <Image
                            src="/payment-logos/visa-10.svg"
                            alt="Visa"
                            width={52}
                            height={18}
                            className="payment-logo h-5 w-auto"
                          />
                        </div>
                        <span className="mt-1 text-[11px] font-medium text-slate-900 dark:text-slate-300">Visa</span>
                      </div>
                      <div className="flex flex-col items-center">
                        <div className="flex h-10 items-center justify-center">
                          <Image
                            src="/payment-logos/mastercardnew.png"
                            alt="Mastercard"
                            width={78}
                            height={28}
                            className="payment-logo payment-logo-boost h-7 w-auto"
                          />
                        </div>
                        <span className="mt-1 text-[11px] font-medium text-slate-900 dark:text-slate-300">
                          Mastercard
                        </span>
                      </div>
                      <div className="flex flex-col items-center">
                        <div className="flex h-10 items-center justify-center">
                          <Image
                            src="/payment-logos/verve.png"
                            alt="Verve"
                            width={52}
                            height={18}
                            className="payment-logo payment-logo-boost h-5 w-auto"
                          />
                        </div>
                        <span className="mt-1 text-[11px] font-medium text-slate-900 dark:text-slate-300">
                          Verve
                        </span>
                      </div>
                      <div className="flex flex-col items-center">
                        <div className="flex h-10 items-center justify-center">
                          <Image
                            src="/payment-logos/america%20express.svg"
                            alt="American Express"
                            width={98}
                            height={34}
                            className="payment-logo payment-logo-boost h-8 w-auto"
                          />
                        </div>
                        <span className="mt-1 text-[11px] font-medium text-slate-900 dark:text-slate-300">Amex</span>
                      </div>
                      <div className="flex flex-col items-center">
                        <div className="flex h-10 items-center justify-center">
                          <Image
                            src="/payment-logos/bank%20transfer.png"
                            alt="Bank transfer"
                            width={80}
                            height={80}
                            className="payment-method-icon payment-icon-blend h-14 w-14 object-contain"
                          />
                        </div>
                        <span className="mt-1 text-[11px] font-medium text-slate-900 dark:text-slate-300">
                          Bank transfer
                        </span>
                      </div>
                    </div>
                    <p>USD support available in Nigeria and Kenya.</p>
                  </div>
                </div>
              </details>

              <details className="coverage-card group rounded-2xl border border-border/70 bg-white p-3 sm:p-4 [&>summary::-webkit-details-marker]:hidden dark:bg-slate-950/60">
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
                    <div className="flex items-center justify-center gap-6">
                      <Image
                        src="/payment-logos/visa-10.svg"
                        alt="Visa"
                        width={120}
                        height={32}
                        className="payment-logo h-7 w-auto"
                      />
                      <Image
                        src="/payment-logos/mastercardnew.png"
                        alt="Mastercard"
                        width={320}
                        height={60}
                        className="payment-logo payment-logo-boost h-11 w-auto"
                      />
                      <Image
                        src="/payment-logos/verve.png"
                        alt="Verve"
                        width={150}
                        height={40}
                        className="payment-logo payment-logo-boost h-8 w-auto"
                      />
                    </div>
                    <p>Supports USD plus local African currencies where available.</p>
                  </div>
                </div>
              </details>
            </div>

            <div className="hidden gap-6 md:grid md:grid-cols-2 xl:gap-8">
              <div className="coverage-card relative flex aspect-square flex-col overflow-hidden rounded-3xl border border-slate-200/70 bg-white p-8 text-card-foreground shadow-[0_18px_48px_rgba(15,23,42,0.08)] ring-1 ring-white/70 dark:border-slate-800/70 dark:bg-slate-950/60 dark:text-slate-100 dark:ring-slate-800/60 dark:shadow-[0_18px_48px_rgba(0,0,0,0.35)] dark:backdrop-blur-sm xl:p-10">
                <div className="absolute -right-16 -top-16 hidden h-32 w-32 rounded-full bg-slate-500/10 blur-3xl dark:block" />
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
                    <div className="flex flex-wrap items-center justify-center gap-6 text-center">
                      <div className="flex flex-col items-center">
                        <div className="flex h-12 items-center justify-center">
                          <Image
                            src="/payment-logos/visa-10.svg"
                            alt="Visa"
                            width={72}
                            height={26}
                            className="payment-logo h-7 w-auto"
                          />
                        </div>
                        <span className="mt-1 text-[11px] font-medium text-slate-900 dark:text-slate-300">Visa</span>
                      </div>
                      <div className="flex flex-col items-center">
                        <div className="flex h-12 items-center justify-center">
                          <Image
                            src="/payment-logos/mastercardnew.png"
                            alt="Mastercard"
                            width={100}
                            height={36}
                            className="payment-logo payment-logo-boost h-9 w-auto"
                          />
                        </div>
                        <span className="mt-1 text-[11px] font-medium text-slate-900 dark:text-slate-300">
                          Mastercard
                        </span>
                      </div>
                      <div className="flex flex-col items-center">
                        <div className="flex h-12 items-center justify-center">
                          <Image
                            src="/payment-logos/verve.png"
                            alt="Verve"
                            width={72}
                            height={26}
                            className="payment-logo payment-logo-boost h-7 w-auto"
                          />
                        </div>
                        <span className="mt-1 text-[11px] font-medium text-slate-900 dark:text-slate-300">Verve</span>
                      </div>
                      <div className="flex flex-col items-center">
                        <div className="flex h-12 items-center justify-center">
                          <Image
                            src="/payment-logos/america%20express.svg"
                            alt="American Express"
                            width={120}
                            height={42}
                            className="payment-logo payment-logo-boost h-10 w-auto"
                          />
                        </div>
                        <span className="mt-1 text-[11px] font-medium text-slate-900 dark:text-slate-300">Amex</span>
                      </div>
                      <div className="flex flex-col items-center">
                        <div className="flex h-12 items-center justify-center">
                          <Image
                            src="/payment-logos/bank%20transfer.png"
                            alt="Bank transfer"
                            width={104}
                            height={104}
                            className="payment-method-icon payment-icon-blend h-16 w-16 object-contain transition"
                          />
                        </div>
                        <span className="mt-1 text-[11px] font-medium text-slate-900 dark:text-slate-300">
                          Bank transfer
                        </span>
                      </div>
                    </div>
                  <p>USD support available in Nigeria and Kenya.</p>
                </div>
              </div>

              <div className="coverage-card relative flex aspect-square flex-col overflow-hidden rounded-3xl border border-slate-200/70 bg-white p-8 text-card-foreground shadow-[0_18px_48px_rgba(15,23,42,0.08)] ring-1 ring-white/70 dark:border-slate-800/70 dark:bg-slate-950/60 dark:text-slate-100 dark:ring-slate-800/60 dark:shadow-[0_18px_48px_rgba(0,0,0,0.35)] dark:backdrop-blur-sm xl:p-10">
                <div className="absolute -right-16 -top-16 hidden h-32 w-32 rounded-full bg-slate-500/10 blur-3xl dark:block" />
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
                    <div className="flex flex-wrap items-center justify-start gap-8">
                      <Image
                        src="/payment-logos/visa-10.svg"
                        alt="Visa"
                        width={120}
                        height={32}
                        className="payment-logo h-7 w-auto"
                      />
                      <Image
                        src="/payment-logos/mastercardnew.png"
                        alt="Mastercard"
                        width={320}
                        height={60}
                        className="payment-logo payment-logo-boost h-11 w-auto"
                      />
                      <Image
                        src="/payment-logos/verve.png"
                        alt="Verve"
                        width={150}
                        height={40}
                        className="payment-logo payment-logo-boost h-8 w-auto"
                      />
                    </div>
                    <div className="h-px w-full bg-border/40" />
                  </div>
                  <p>Supports USD plus local African currencies where available.</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-12 space-y-6 md:mt-16">
          <div className="flex flex-col gap-2">
            <p className="text-xs uppercase tracking-[0.25em] text-indigo-800 dark:text-indigo-300">
              Why Maboria
            </p>
            <h2 className="text-2xl font-semibold text-foreground max-md:text-xl">
              Built for teams that care about reliability
            </h2>
            <p className="text-sm text-slate-900 dark:text-slate-300 max-md:text-xs">
              Everything you need to automate revenue operations while staying in control.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {whyMaboria.map((item) => (
              <Card key={item.title} className="border border-border bg-card/80 p-5 shadow-sm">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-border bg-muted/70 text-indigo-700 dark:text-indigo-200">
                    <item.icon className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">{item.title}</p>
                    <p className="mt-1 text-xs text-slate-900 dark:text-slate-300">{item.description}</p>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </section>

        <section className="mt-12 space-y-6 md:mt-16">
          <div className="flex flex-col gap-2">
            <p className="text-xs uppercase tracking-[0.25em] text-indigo-800 dark:text-indigo-300">
              How it works
            </p>
            <h2 className="text-2xl font-semibold text-foreground max-md:text-xl">
              From signup to payment in minutes
            </h2>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {howItWorks.map((item) => (
              <Card key={item.step} className="border border-border bg-card/80 p-5 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-border bg-muted/70 text-sm font-semibold text-indigo-700 dark:text-indigo-200">
                    {item.step}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">{item.title}</p>
                    <p className="mt-1 text-xs text-slate-900 dark:text-slate-300">{item.description}</p>
                  </div>
                </div>
              </Card>
            ))}
          </div>
          <div className="flex flex-wrap gap-3 text-sm text-slate-900 dark:text-slate-300">
            {["No credit card required for trial", "7-day trial access", "Cancel anytime"].map((item) => (
              <div
                key={item}
                className="flex items-center gap-2 rounded-full border border-border bg-card/70 px-4 py-2 text-xs font-medium"
              >
                <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-300" />
                {item}
              </div>
            ))}
          </div>
        </section>

        <section className="mt-12 space-y-6 md:mt-16">
          <div className="flex flex-col gap-2">
            <p className="text-xs uppercase tracking-[0.25em] text-indigo-800 dark:text-indigo-300">
              Security & reliability
            </p>
            <h2 className="text-2xl font-semibold text-foreground max-md:text-xl">
              Built for trust from day one
            </h2>
            <p className="text-sm text-slate-900 dark:text-slate-300">
              Keep teams accountable while protecting revenue operations.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {securityItems.map((item) => (
              <Card key={item.title} className="border border-border bg-card/80 p-5 shadow-sm">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-border bg-muted/70 text-indigo-700 dark:text-indigo-200">
                    <item.icon className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">{item.title}</p>
                    <p className="mt-1 text-xs text-slate-900 dark:text-slate-300">{item.description}</p>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </section>

        <section className="mt-12 space-y-6 md:mt-16">
          <h2 className="text-2xl font-semibold text-foreground max-md:text-xl">Pricing</h2>

          <div className="grid gap-4 md:grid-cols-3 max-md:gap-3">
            {plans.map((plan) => (
              <Card
                key={plan.plan}
                title={plan.label}
                className={`relative h-full p-5 md:p-6 max-md:p-4 ${plan.featured ? "border-indigo-500/60 shadow-lg shadow-indigo-500/20" : "shadow-sm"}`}
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

        <section className="mt-12 rounded-2xl border border-border bg-card/70 p-6 md:mt-16 md:p-8 max-md:p-4 shadow-sm">
          <div className="grid gap-5 md:gap-6 lg:grid-cols-2">
            <div>
              <h3 className="text-xl font-semibold text-foreground">Loved by operators</h3>
              <p className="text-sm text-slate-900 dark:text-slate-300 max-md:text-xs">
                Maboria replaced 4 tools. Billing, automations, AI insights, and admin visibility just work.
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
