
"use client";

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
import { PricingSection } from "@/components/pricing/pricing-section";
import { MarketingCta } from "@/components/ui/marketing-cta";
import { MarketingHeaderActions } from "@/components/ui/marketing-header-actions";
import { getPaystackEnabledCurrencies, providerSupport } from "@/lib/payments/currency-allowlist";
import { PaystackLogo } from "@/components/ui/paystack-logo";
import { LangText } from "@/components/ui/lang-text";

const plans = pricingTableDualCurrency();
const paystackEnabledCurrencies = getPaystackEnabledCurrencies();
const paystackCoverageLabel = "Paystack currencies";
const paystackCurrencies = paystackEnabledCurrencies;
const flutterwaveCurrencies = providerSupport.FLUTTERWAVE;
const highlights = [
  {
    title: { en: "Get paid faster", fr: "Etre paye plus vite" },
    description: {
      en: "Automatic reminders before and after due dates keep cashflow moving.",
      fr: "Des rappels automatiques avant et apres les echeances gardent la tresorerie active.",
    },
    icon: Sparkles,
  },
  {
    title: { en: "Send receipts instantly", fr: "Envoyer des recus instantanement" },
    description: {
      en: "Customers receive invoices and receipts without manual follow-up.",
      fr: "Les clients recoivent factures et recus sans relance manuelle.",
    },
    icon: CheckCircle2,
  },
  {
    title: { en: "Stay on top of collections", fr: "Suivre les encaissements" },
    description: {
      en: "Track paid and unpaid invoices in a clear, shared view.",
      fr: "Suivez les factures payees et impayees dans une vue claire.",
    },
    icon: BarChart3,
  },
];
const whyMaboria = [
  {
    title: { en: "Built for modern operations", fr: "Concu pour des operations modernes" },
    description: {
      en: "Run billing in supported currencies and multi-currency billing with Flutterwave.",
      fr: "Facturation en devises prises en charge et multi-devises avec Flutterwave.",
    },
    icon: Gauge,
  },
  {
    title: { en: "Team visibility", fr: "Visibilite equipe" },
    description: {
      en: "Keep activity history and approvals visible as your team scales.",
      fr: "Gardez l historique et les validations visibles a mesure que l equipe grandit.",
    },
    icon: BarChart3,
  },
  {
    title: { en: "Privacy-first by default", fr: "Confidentialite par defaut" },
    description: {
      en: "Your business records stay private and under your control.",
      fr: "Vos donnees restent privees et sous votre controle.",
    },
    icon: Lock,
  },
];
const playbooks = [
  {
    title: { en: "Invoice reminders", fr: "Rappels de facture" },
    description: {
      en: "Automatically remind customers before due dates.",
      fr: "Rappels automatiques avant les echeances.",
    },
    icon: Bell,
  },
  {
    title: { en: "Payment receipts", fr: "Recus de paiement" },
    description: {
      en: "Send receipts instantly after payment is confirmed.",
      fr: "Envoyez les recus des la confirmation du paiement.",
    },
    icon: CheckCircle2,
  },
  {
    title: { en: "Follow-up nudges", fr: "Relances" },
    description: {
      en: "Get paid faster with WhatsApp and email nudges.",
      fr: "Etre paye plus vite avec WhatsApp et email.",
    },
    icon: MessageSquare,
  },
  {
    title: { en: "Weekly summaries", fr: "Resume hebdo" },
    description: {
      en: "See what was paid and what needs a follow-up.",
      fr: "Voyez ce qui a ete paye et ce qui reste.",
    },
    icon: BarChart3,
  },
];
const howItWorks = [
  {
    step: "01",
    title: { en: "Create invoice", fr: "Creer une facture" },
    description: {
      en: "Generate an invoice with your business details in minutes.",
      fr: "Generez une facture avec vos details en quelques minutes.",
    },
  },
  {
    step: "02",
    title: { en: "Customer pays", fr: "Le client paie" },
    description: {
      en: "Share the invoice and accept payments via Paystack or Flutterwave.",
      fr: "Partagez la facture et acceptez les paiements via Paystack ou Flutterwave.",
    },
  },
  {
    step: "03",
    title: { en: "Automatic follow-up", fr: "Relance automatique" },
    description: {
      en: "Maboria sends reminders and receipts without manual chasing.",
      fr: "Maboria envoie rappels et recus sans relance manuelle.",
    },
  },
];
const securityItems = [
  {
    title: { en: "Audit-ready activity logs", fr: "Journaux d activite prets audit" },
    description: {
      en: "Track key activity across billing, invoices, and automations.",
      fr: "Suivez l activite cle sur facturation, factures et automatisations.",
    },
    icon: BarChart3,
  },
  {
    title: { en: "Role-based access control", fr: "Acces par roles" },
    description: {
      en: "Keep sensitive operations restricted to the right people.",
      fr: "Limitez les operations sensibles aux bonnes personnes.",
    },
    icon: Lock,
  },
  {
    title: { en: "Operational monitoring", fr: "Surveillance operationnelle" },
    description: {
      en: "System visibility across usage, limits, and payment events.",
      fr: "Visibilite systeme sur usage, limites et paiements.",
    },
    icon: CheckCircle2,
  },
];

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
                  <LangText en="Pricing" fr="Tarifs" />
                </Link>
                <Link href="/about" className="block rounded-lg px-3 py-2 text-sm hover:bg-muted/60">
                  <LangText en="About" fr="A propos" />
                </Link>
                <Link href="/support" className="block rounded-lg px-3 py-2 text-sm hover:bg-muted/60">
                  <LangText en="Support" fr="Support" />
                </Link>
                <Link href="/signup" className="block rounded-lg px-3 py-2 text-sm hover:bg-muted/60">
                  <LangText en="Get started" fr="Commencer" />
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
            <Button size="sm">
              <LangText en="Sign in" fr="Se connecter" />
            </Button>
          </Link>
        </div>
      </div>

      <header className="relative z-50 mx-auto hidden max-w-6xl items-center justify-between overflow-visible px-6 py-6 md:flex pointer-events-auto">
        <Link href="/" className="flex items-center gap-3">
          <div className="relative h-10 w-10 overflow-hidden rounded-2xl border border-border bg-card">
            <Image src={logoSrc} alt="Maboria" fill className="object-contain p-0 scale-110" priority />
          </div>
          <div className="leading-tight">
            <p className="text-xs uppercase tracking-[0.25em] text-indigo-800 dark:text-indigo-300">Maboria</p>
            <p className="text-lg font-semibold text-foreground">
              <LangText en="Automation Cloud" fr="Cloud automation" />
            </p>
          </div>
        </Link>
        <div className="relative z-50 hidden items-center gap-3 sm:flex">
          <MarketingHeaderActions />
          <MarketingCta variant="header" />
        </div>
      </header>

      <main className="relative z-10 pointer-events-auto mx-auto max-w-6xl px-6 pb-12 pt-20 md:pb-16 md:pt-0 max-md:mx-0 max-md:w-full max-md:max-w-none max-md:px-4 max-md:pt-16 max-md:pb-24">
        <section className="grid gap-8 md:gap-10 lg:grid-cols-[1.12fr_0.88fr] lg:items-center max-md:gap-5">
          <div className="space-y-6 text-left max-md:space-y-5 max-md:text-center">
            <Badge
              variant="success"
              className="max-md:mx-auto max-md:w-fit border border-emerald-400/60 bg-emerald-100 text-xs font-semibold text-emerald-900 dark:bg-emerald-500/10 dark:text-emerald-200"
            >
              <LangText en="Get paid faster - Automatic follow-ups" fr="Encaissez plus vite - Relances automatiques" />
            </Badge>
            <h1 className="text-3xl font-semibold leading-[1.1] tracking-tight text-foreground sm:text-4xl md:text-6xl max-md:text-3xl max-[480px]:text-[24px]">
              <LangText
                en="Automate invoicing, follow-ups, and receipts to get paid on time."
                fr="Automatisez factures, relances et recus pour etre paye a temps."
              />
            </h1>
            <p className="text-lg text-slate-900 dark:text-slate-300 max-md:text-base max-[480px]:text-sm">
              <LangText
                en="Maboria helps you send invoices, collect payments, and follow up automatically across email and WhatsApp. Keep customers informed and cashflow predictable from one dashboard."
                fr="Maboria vous aide a envoyer des factures, encaisser et relancer automatiquement via email et WhatsApp. Gardez les clients informes et une tresorerie previsible depuis un seul tableau de bord."
              />
            </p>
            <MarketingCta variant="hero" />
            <div className="flex flex-wrap gap-4 text-sm text-slate-900 dark:text-slate-300 max-md:grid max-md:gap-2">
              <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card/70 px-4 py-3 shadow-sm">
                <span className="text-sm text-slate-900 dark:text-slate-300">
                  <LangText en="Payments:" fr="Paiements:" />
                </span>
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
                <LangText en="Automatic reminders and receipts" fr="Rappels et recus automatiques" />
              </div>
            </div>
          </div>
          <div className="relative max-md:mx-0 max-md:w-full max-md:max-w-none">
            <div className="glass rounded-2xl border border-indigo-500/30 p-4 shadow-2xl max-md:border-border max-md:bg-card/70 max-md:shadow-none">
            <div className="rounded-xl bg-card/80 p-4 max-md:bg-transparent max-md:p-0">
              <div className="flex items-center justify-between text-xs text-slate-900 dark:text-slate-300">
                <span>
                  <LangText en="Invoice follow-ups" fr="Relances de factures" />
                </span>
                <span>
                  <LangText en="Auto" fr="Auto" />
                </span>
              </div>
              <div className="mt-3 space-y-2">
                <div className="rounded-lg border border-border bg-muted/60 p-3">
                    <p className="text-sm text-foreground">
                      <LangText en="Before due date reminder" fr="Rappel avant echeance" />
                    </p>
                    <p className="text-xs text-slate-900 dark:text-slate-300">
                      <LangText en="Nudge customers 3 days before a payment is due." fr="Relance 3 jours avant l echeance." />
                    </p>
                  </div>
                  <div className="rounded-lg border border-border bg-muted/60 p-3">
                    <p className="text-sm text-foreground">
                      <LangText en="Receipt after payment" fr="Recu apres paiement" />
                    </p>
                    <p className="text-xs text-slate-900 dark:text-slate-300">
                      <LangText en="Send a thank-you + receipt instantly." fr="Envoyer un merci + recu immediatement." />
                    </p>
                  </div>
                  <div className="rounded-lg border border-border bg-muted/60 p-3">
                    <p className="text-sm text-foreground">
                      <LangText en="Overdue follow-up" fr="Relance en retard" />
                    </p>
                    <p className="text-xs text-slate-900 dark:text-slate-300">
                      <LangText en="Escalate with WhatsApp and email nudges." fr="Relance via WhatsApp et email." />
                    </p>
                  </div>
                </div>
              </div>
            </div>
            <div className="absolute -left-8 -bottom-10 hidden h-24 w-24 rounded-full bg-indigo-500/20 blur-3xl lg:block" />
          </div>
        </section>

        <section className="mt-8 md:hidden">
          <div className="rounded-2xl border border-border bg-card/70 px-4 py-4 text-center">
            <p className="text-sm font-semibold text-foreground">
              <LangText en="Get started in 2 minutes" fr="Demarrage en 2 minutes" />
            </p>
            <p className="mt-1 text-xs text-slate-900 dark:text-slate-300">
              <LangText
                en="Create your workspace and launch your first automation."
                fr="Creez votre espace et lancez votre premiere automatisation."
              />
            </p>
            <MarketingCta variant="mobileCard" />
          </div>
        </section>

        <section className="mt-10 space-y-6 md:mt-12">
          <div className="grid gap-3 md:grid-cols-3 md:gap-4">
            {highlights.map((item) => (
              <Card
                key={item.title.en}
                className="group flex items-start gap-3 border border-border bg-card/80 p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-border bg-muted/70 text-indigo-700 dark:text-indigo-200">
                  <item.icon className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    <LangText en={item.title.en} fr={item.title.fr} />
                  </p>
                  <p className="mt-1 text-xs text-slate-900 dark:text-slate-300">
                    <LangText en={item.description.en} fr={item.description.fr} />
                  </p>
                </div>
              </Card>
            ))}
          </div>
          <div className="mt-6 space-y-4">
            <div className="flex flex-col gap-2">
              <p className="text-xs uppercase tracking-[0.25em] text-indigo-800 dark:text-indigo-300">
                <LangText en="Prebuilt automations" fr="Automatisations pretes" />
              </p>
              <h2 className="text-2xl font-semibold text-foreground max-md:text-xl">
                <LangText en="Prebuilt automations included" fr="Automatisations pretes incluses" />
              </h2>
              <p className="text-sm text-slate-900 dark:text-slate-300">
                <LangText
                  en="Start with ready-made reminders and receipts, then tailor them as you grow."
                  fr="Commencez avec des rappels et recus prets, puis adaptez en grandissant."
                />
              </p>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {playbooks.map((item) => (
                <Card key={item.title.en} className="border border-border bg-card/80 p-4 shadow-sm">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-border bg-muted/70 text-indigo-700 dark:text-indigo-200">
                      <item.icon className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">
                        <LangText en={item.title.en} fr={item.title.fr} />
                      </p>
                      <p className="mt-1 text-xs text-slate-900 dark:text-slate-300">
                        <LangText en={item.description.en} fr={item.description.fr} />
                      </p>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
            <div className="flex flex-wrap gap-2 text-xs text-slate-900 dark:text-slate-300">
              {[
                { en: "Email notifications", fr: "Notifications email" },
                { en: "WhatsApp automation", fr: "Automatisation WhatsApp" },
                { en: "Payment updates", fr: "Mises a jour paiement" },
                { en: "Team activity logs", fr: "Historique equipe" },
              ].map((item) => (
                <div
                  key={item.en}
                  className="rounded-full border border-border bg-card/70 px-4 py-2 font-medium"
                >
                  <LangText en={item.en} fr={item.fr} />
                </div>
              ))}
            </div>
            <p className="text-xs text-slate-900 dark:text-slate-300">
              <LangText
                en="Advanced automation is available on Pro, Growth, Business & Enterprise plans."
                fr="Automatisation avancee disponible sur Pro, Growth, Business et Enterprise."
              />
            </p>
          </div>
          <div className="mt-10 space-y-2">
            <p className="text-xs uppercase tracking-[0.25em] text-indigo-800 dark:text-indigo-300">
              <LangText en="Payment coverage" fr="Couverture de paiement" />
            </p>
            <h2 className="text-2xl font-semibold text-foreground md:text-2xl max-md:text-xl">
              <LangText en="Payment coverage & supported currencies" fr="Couverture de paiement & devises prises en charge" />
            </h2>
            <p className="text-sm text-slate-900 dark:text-slate-300 md:hidden">
              <LangText
                en="Local and international payments supported through enabled providers."
                fr="Paiements locaux et internationaux via les prestataires actives."
              />
            </p>
            <p className="hidden text-sm text-slate-900 dark:text-slate-300 md:block">
              <LangText
                en="Accept cards and bank transfers where enabled. International cards are supported by Flutterwave where available. Multi-currency billing is handled through Flutterwave."
                fr="Acceptez cartes et virements la ou disponible. Les cartes internationales sont supportees via Flutterwave. La facturation multi-devise passe par Flutterwave."
              />
            </p>
          </div>

          {/* Source: Paystack and Flutterwave official coverage docs (client-provided lists). */}
          <div className="mx-auto w-full max-w-7xl max-md:mx-0 max-md:max-w-none">
            <div className="grid gap-3 md:hidden">
              <details className="coverage-card group rounded-2xl border border-border/70 bg-white p-3 sm:p-4 [&>summary::-webkit-details-marker]:hidden dark:bg-slate-950/60">
                <summary className="flex cursor-pointer items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      <LangText en={paystackCoverageLabel} fr="Devises Paystack" />
                    </p>
                    <p className="text-xs text-slate-900 dark:text-slate-300">
                      <LangText en="Cards, bank transfer, local methods." fr="Cartes, virement, moyens locaux." />
                    </p>
                  </div>
                  <ChevronDown className="h-4 w-4 text-slate-900 dark:text-slate-300 transition group-open:rotate-180" />
                </summary>
                <div className="overflow-hidden transition-[max-height] duration-300 max-h-0 group-open:max-h-[720px]">
                  <div className="pt-3 space-y-3 text-sm text-slate-900 dark:text-slate-300">
                    <p>
                      <LangText en="Currencies enabled for Paystack:" fr="Devises activees pour Paystack :" />
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      {paystackCurrencies.map((code) => (
                        <Badge key={code} variant="country" className="text-[11px]">
                          {code}
                        </Badge>
                      ))}
                    </div>
                    <p>
                      <LangText en="Additional markets may be in beta." fr="Des marches supplementaires peuvent etre en beta." />
                    </p>
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
                    <p>
                      <LangText en="USD availability depends on provider settings." fr="Disponibilite USD selon la configuration du prestataire." />
                    </p>
                  </div>
                </div>
              </details>

              <details className="coverage-card group rounded-2xl border border-border/70 bg-white p-3 sm:p-4 [&>summary::-webkit-details-marker]:hidden dark:bg-slate-950/60">
                <summary className="flex cursor-pointer items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      <LangText en="Flutterwave currencies" fr="Devises Flutterwave" />
                    </p>
                    <p className="text-xs text-slate-900 dark:text-slate-300">
                      <LangText en="Visa, Mastercard, Verve accepted." fr="Visa, Mastercard, Verve acceptes." />
                    </p>
                  </div>
                  <ChevronDown className="h-4 w-4 text-slate-900 dark:text-slate-300 transition group-open:rotate-180" />
                </summary>
                <div className="overflow-hidden transition-[max-height] duration-300 max-h-0 group-open:max-h-[900px]">
                  <div className="pt-3 space-y-3 text-sm text-slate-900 dark:text-slate-300">
                    <p>
                      <LangText
                        en="Currencies enabled for Flutterwave:"
                        fr="Devises activees pour Flutterwave :"
                      />
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      {flutterwaveCurrencies.map((code) => (
                        <Badge key={code} variant="country" className="text-[11px]">
                          {code}
                        </Badge>
                      ))}
                    </div>
                    <p>
                      <LangText
                        en="Accept payments from international customers with major cards."
                        fr="Acceptez des paiements internationaux avec les principales cartes."
                      />
                    </p>
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
                    <p>
                      <LangText
                        en="Supports USD and other supported currencies where available."
                        fr="Supporte USD et autres devises prises en charge si disponibles."
                      />
                    </p>
                  </div>
                </div>
              </details>
            </div>

            <div className="hidden gap-6 md:grid md:grid-cols-2 xl:gap-8">
              <div className="coverage-card relative flex aspect-square flex-col overflow-hidden rounded-3xl border border-slate-200/70 bg-white p-8 text-card-foreground shadow-[0_18px_48px_rgba(15,23,42,0.08)] ring-1 ring-white/70 dark:border-slate-800/70 dark:bg-slate-950/60 dark:text-slate-100 dark:ring-slate-800/60 dark:shadow-[0_18px_48px_rgba(0,0,0,0.35)] dark:backdrop-blur-sm xl:p-10">
                <div className="absolute -right-16 -top-16 hidden h-32 w-32 rounded-full bg-slate-500/10 blur-3xl dark:block" />
                <div className="relative space-y-4 text-sm text-slate-900 dark:text-slate-300">
                  <p>
                    <LangText en="Currencies enabled for Paystack:" fr="Devises activees pour Paystack :" />
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {paystackCurrencies.map((code) => (
                      <Badge key={code} variant="country">
                        {code}
                      </Badge>
                    ))}
                  </div>
                  <p>
                    <LangText en="Additional markets may be in beta." fr="Des marches supplementaires peuvent etre en beta." />
                  </p>
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
                  <p>
                    <LangText en="USD availability depends on provider settings." fr="Disponibilite USD selon la configuration du prestataire." />
                  </p>
                </div>
              </div>

              <div className="coverage-card relative flex aspect-square flex-col overflow-hidden rounded-3xl border border-slate-200/70 bg-white p-8 text-card-foreground shadow-[0_18px_48px_rgba(15,23,42,0.08)] ring-1 ring-white/70 dark:border-slate-800/70 dark:bg-slate-950/60 dark:text-slate-100 dark:ring-slate-800/60 dark:shadow-[0_18px_48px_rgba(0,0,0,0.35)] dark:backdrop-blur-sm xl:p-10">
                <div className="absolute -right-16 -top-16 hidden h-32 w-32 rounded-full bg-slate-500/10 blur-3xl dark:block" />
                <div className="relative space-y-4 text-sm text-slate-900 dark:text-slate-300">
                  <p>
                    <LangText
                      en="Currencies enabled for Flutterwave:"
                      fr="Devises activees pour Flutterwave :"
                    />
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {flutterwaveCurrencies.map((code) => (
                      <Badge key={code} variant="country">
                        {code}
                      </Badge>
                    ))}
                  </div>
                  <p>
                    <LangText
                      en="Accept payments from international customers with major cards."
                      fr="Acceptez des paiements internationaux avec les principales cartes."
                    />
                  </p>
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
                  <p>
                    <LangText
                      en="Supports USD and other supported currencies where available."
                      fr="Supporte USD et autres devises prises en charge si disponibles."
                    />
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-12 space-y-6 md:mt-16">
          <div className="flex flex-col gap-2">
            <p className="text-xs uppercase tracking-[0.25em] text-indigo-800 dark:text-indigo-300">
              <LangText en="Why Maboria" fr="Pourquoi Maboria" />
            </p>
            <h2 className="text-2xl font-semibold text-foreground max-md:text-xl">
              <LangText en="Built for teams that care about reliability" fr="Concu pour les equipes qui veulent la fiabilite" />
            </h2>
            <p className="text-sm text-slate-900 dark:text-slate-300 max-md:text-xs">
              <LangText
                en="Everything you need to automate revenue operations while staying in control."
                fr="Tout ce qu il faut pour automatiser la gestion du revenu en restant aux commandes."
              />
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {whyMaboria.map((item) => (
              <Card key={item.title.en} className="border border-border bg-card/80 p-5 shadow-sm">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-border bg-muted/70 text-indigo-700 dark:text-indigo-200">
                    <item.icon className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      <LangText en={item.title.en} fr={item.title.fr} />
                    </p>
                    <p className="mt-1 text-xs text-slate-900 dark:text-slate-300">
                      <LangText en={item.description.en} fr={item.description.fr} />
                    </p>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </section>

        <section className="mt-12 space-y-6 md:mt-16">
          <div className="flex flex-col gap-2">
            <p className="text-xs uppercase tracking-[0.25em] text-indigo-800 dark:text-indigo-300">
              <LangText en="How it works" fr="Comment ca marche" />
            </p>
            <h2 className="text-2xl font-semibold text-foreground max-md:text-xl">
              <LangText en="From signup to payment in minutes" fr="De l inscription au paiement en quelques minutes" />
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
                    <p className="text-sm font-semibold text-foreground">
                      <LangText en={item.title.en} fr={item.title.fr} />
                    </p>
                    <p className="mt-1 text-xs text-slate-900 dark:text-slate-300">
                      <LangText en={item.description.en} fr={item.description.fr} />
                    </p>
                  </div>
                </div>
              </Card>
            ))}
          </div>
          <div className="flex flex-wrap gap-3 text-sm text-slate-900 dark:text-slate-300">
            {[ 
              { en: "No setup required", fr: "Aucune configuration requise" }, 
              { en: "Monthly billing", fr: "Facturation mensuelle" }, 
              { en: "Cancel anytime", fr: "Annulez a tout moment" }, 
            ].map((item) => ( 
              <div
                key={item.en}
                className="flex items-center gap-2 rounded-full border border-border bg-card/70 px-4 py-2 text-xs font-medium"
              >
                <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-300" />
                <LangText en={item.en} fr={item.fr} />
              </div>
            ))}
          </div>
        </section>

        <section className="mt-12 space-y-6 md:mt-16">
          <div className="flex flex-col gap-2">
            <p className="text-xs uppercase tracking-[0.25em] text-indigo-800 dark:text-indigo-300">
              <LangText en="Security & reliability" fr="Securite & fiabilite" />
            </p>
            <h2 className="text-2xl font-semibold text-foreground max-md:text-xl">
              <LangText en="Built for trust from day one" fr="Concu pour la confiance des le debut" />
            </h2>
            <p className="text-sm text-slate-900 dark:text-slate-300">
              <LangText
                en="Keep teams accountable while protecting revenue operations."
                fr="Gardez les equipes responsables tout en protegeant les revenus."
              />
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {securityItems.map((item) => (
              <Card key={item.title.en} className="border border-border bg-card/80 p-5 shadow-sm">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-border bg-muted/70 text-indigo-700 dark:text-indigo-200">
                    <item.icon className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      <LangText en={item.title.en} fr={item.title.fr} />
                    </p>
                    <p className="mt-1 text-xs text-slate-900 dark:text-slate-300">
                      <LangText en={item.description.en} fr={item.description.fr} />
                    </p>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </section>

        <section className="mt-12 md:mt-16">
          <PricingSection plans={plans} />
        </section>

        <section className="mt-12 rounded-2xl border border-border bg-card/70 p-6 md:mt-16 md:p-8 max-md:p-4 shadow-sm">
          <div className="grid gap-5 md:gap-6 lg:grid-cols-2">
            <div>
              <h3 className="text-xl font-semibold text-foreground">
                <LangText en="Loved by operators" fr="Approuve par les equipes" />
              </h3>
              <p className="text-sm text-slate-900 dark:text-slate-300 max-md:text-xs">
                <LangText
                  en="Maboria replaced 4 tools. Billing, automations, AI insights, and admin visibility just work."
                  fr="Maboria a remplace 4 outils. Facturation, automatisations, IA et admin fonctionnent ensemble."
                />
              </p>
            </div>
            <div className="space-y-3">
              <div className="rounded-xl border border-border bg-muted/60 p-4">
                <p className="text-sm text-slate-900 dark:text-slate-300 max-md:text-xs">
                  <LangText
                    en="We ship faster with AI-generated flows and get paid faster with dual-currency billing."
                    fr="On avance plus vite avec les flux IA et on est paye plus vite avec la double devise."
                  />
                </p>
                <p className="text-xs text-slate-900 dark:text-slate-300">- Elizabeth Bassey, Beta Tester</p>
              </div>
              <div className="rounded-xl border border-border bg-muted/60 p-4">
                <p className="text-sm text-slate-900 dark:text-slate-300 max-md:text-xs">
                  <LangText
                    en="Admin panel feels like a dedicated billing control room - amazing visibility."
                    fr="Le panneau admin ressemble a une salle de controle - excellente visibilite."
                  />
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
              <LangText en="FAQ" fr="FAQ" />
            </Link>
            <Link href="/terms" className="hover:text-foreground">
              <LangText en="Terms" fr="Conditions" />
            </Link>
            <Link href="/privacy" className="hover:text-foreground">
              <LangText en="Privacy" fr="Confidentialite" />
            </Link>
            <Link href="/support" className="hover:text-foreground">
              <LangText en="Support" fr="Support" />
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
