"use client";

import Link from "next/link";
import Image from "next/image";
import { CheckCircle2, CreditCard, Info, Linkedin, Mail, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { pricingTableDualCurrency } from "@/lib/pricing";
import { PricingSection } from "@/components/pricing/pricing-section";
import { MarketingCta } from "@/components/ui/marketing-cta";
import { MarketingHeaderActions } from "@/components/ui/marketing-header-actions";
import { PaystackLogo } from "@/components/ui/paystack-logo";
import { LangText } from "@/components/ui/lang-text";

const plans = pricingTableDualCurrency();

const trustBullets = [
  { en: "No wallets", fr: "Pas de portefeuille" },
  { en: "No holding funds", fr: "Pas de fonds detenus" },
  { en: "No custody risk", fr: "Aucun risque de garde" },
  { en: "Automated confirmation + receipts", fr: "Confirmation et recus automatiques" },
];

const workflowSteps = [
  { step: "01", en: "Create invoice", fr: "Creer une facture" },
  { step: "02", en: "Invoice sent by email or WhatsApp", fr: "Facture envoyee par email ou WhatsApp" },
  { step: "03", en: "Customer pays via Paystack or Flutterwave", fr: "Paiement via Paystack ou Flutterwave" },
  { step: "04", en: "Payment detected instantly", fr: "Paiement detecte instantanement" },
  { step: "05", en: "Receipt issued automatically", fr: "Recu emis automatiquement" },
  { step: "06", en: "Follow-ups triggered if unpaid", fr: "Relances en cas d impaye" },
  { step: "07", en: "Activity logged for your team", fr: "Activite journalisee pour l equipe" },
  { step: "08", en: "Reports generated automatically", fr: "Rapports generes automatiquement" },
];

const featureGroups = [
  {
    title: { en: "Automation", fr: "Automatisation" },
    items: [
      { en: "Automate invoice creation", fr: "Automatiser la creation de factures" },
      { en: "Automate email sending", fr: "Automatiser l envoi d emails" },
      { en: "Automate WhatsApp messaging", fr: "Automatiser les messages WhatsApp" },
      { en: "Automate receipts", fr: "Automatiser les recus" },
      { en: "Automate follow-ups and escalation", fr: "Automatiser les relances" },
      { en: "Automate reports and summaries", fr: "Automatiser les rapports" },
    ],
  },
  {
    title: { en: "Unified Inbox", fr: "Boite de reception unifiee" },
    items: [
      { en: "Manage email and WhatsApp conversations in one inbox", fr: "Gerer les conversations email et WhatsApp dans une seule boite" },
      { en: "Send email and WhatsApp messages directly from the app", fr: "Envoyer des messages email et WhatsApp depuis l app" },
      {
        en: "Trigger inbox follow-ups based on payment status and workflow events.",
        fr: "Declencher des relances de boite de reception selon le statut de paiement et les evenements du workflow.",
      },
      { en: "No switching tools", fr: "Pas de changement d outil" },
    ],
  },
  {
    title: { en: "AI (Specific and useful)", fr: "IA (precise et utile)" },
    items: [
      { en: "AI improves message tone before sending", fr: "L IA ajuste le ton avant envoi" },
      { en: "AI assists workflow setup", fr: "L IA aide a configurer les workflows" },
      { en: "AI generates summaries and insights", fr: "L IA genere des resumes" },
      { en: "AI reduces repetitive work (you stay in control)", fr: "L IA reduit le travail repetitif (vous gardez le controle)" },
    ],
  },
  {
    title: { en: "Teams + Logs + Visibility", fr: "Equipes + logs + visibilite" },
    items: [
      { en: "Roles and permissions", fr: "Roles et permissions" },
      { en: "Activity logs (invoice, payment, automation)", fr: "Journaux d activite" },
      { en: "Usage analytics", fr: "Analytique d usage" },
      { en: "Download CSV report history", fr: "Historique CSV telechargeable" },
    ],
  },
];

const coverageItems = [
  { en: "Cards (local & international)", fr: "Cartes (locales et internationales)" },
  { en: "Bank transfers", fr: "Virements bancaires" },
  { en: "Mobile money (where supported)", fr: "Mobile money (selon pays)" },
  { en: "Multi-currency billing and automatic conversion", fr: "Multi-devise et conversion automatique" },
];

export default function LandingPage() {
  const logoSrc = "/branding/Maboria%20Company%20logo.png";
  return (
    <div className="relative min-h-screen bg-gradient-to-br from-background via-muted/40 to-background text-foreground max-md:overflow-x-hidden">
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
                <a href="#features" className="block rounded-lg px-3 py-2 text-sm hover:bg-muted/60">
                  <LangText en="Features" fr="Fonctionnalites" />
                </a>
                <a href="#pricing" className="block rounded-lg px-3 py-2 text-sm hover:bg-muted/60">
                  <LangText en="Pricing" fr="Tarifs" />
                </a>
                <Link href="/login" className="block rounded-lg px-3 py-2 text-sm hover:bg-muted/60">
                  <LangText en="Login" fr="Connexion" />
                </Link>
                <Link href="/signup" className="block rounded-lg px-3 py-2 text-sm hover:bg-muted/60">
                  <LangText en="Get started" fr="Commencer" />
                </Link>
              </div>
            </details>
              <Link href="/" className="flex items-center gap-2">
                <div className="relative h-8 w-8 overflow-hidden rounded-xl border border-border bg-card">
                  <Image src={logoSrc} alt="Maboria" fill sizes="32px" className="object-contain p-0 scale-110" priority />
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

      <header className="sticky top-0 z-50 mx-auto hidden max-w-6xl items-center justify-between overflow-visible border-b border-border bg-background/85 px-6 py-4 backdrop-blur md:flex pointer-events-auto">
          <Link href="/" className="flex items-center gap-3">
            <div className="relative h-10 w-10 overflow-hidden rounded-2xl border border-border bg-card">
              <Image src={logoSrc} alt="Maboria" fill sizes="40px" className="object-contain p-0 scale-110" priority />
            </div>
          <div className="leading-tight">
            <p className="text-xs uppercase tracking-[0.25em] text-indigo-800 dark:text-indigo-300">Maboria</p>
            <p className="text-lg font-semibold text-foreground">
              <LangText en="Automation Cloud" fr="Cloud automation" />
            </p>
          </div>
        </Link>
        <nav className="hidden items-center gap-6 text-sm font-medium text-muted-foreground md:flex">
          <a href="#features" className="transition hover:text-foreground">
            <LangText en="Features" fr="Fonctionnalites" />
          </a>
          <a href="#pricing" className="transition hover:text-foreground">
            <LangText en="Pricing" fr="Tarifs" />
          </a>
        </nav>
        <div className="relative z-50 hidden items-center gap-3 sm:flex">
          <MarketingHeaderActions />
          <MarketingCta variant="header" />
        </div>
      </header>

      <main className="relative z-10 pointer-events-auto mx-auto max-w-6xl px-6 pb-16 pt-24 md:pt-10">
        <section className="grid gap-12 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <div className="space-y-6">
            <p className="text-xs uppercase tracking-[0.3em] text-indigo-800 dark:text-indigo-300">
              <LangText en="Maboria" fr="Maboria" />
            </p>
            <h1 className="text-4xl font-semibold leading-[1.05] tracking-tight text-foreground md:text-6xl">
              <LangText
                en="Automate how your business runs — and how it gets paid."
                fr="Automatisez le fonctionnement de votre entreprise — et ses paiements."
              />
            </h1>
            <p className="text-lg text-slate-900 dark:text-slate-300">
              <LangText
                en="Maboria is a revenue and operations automation platform that handles invoicing, payment collection, receipts, WhatsApp and email communication, AI-assisted workflows, reporting, and team visibility — while payments go directly into your own account, not ours."
                fr="Maboria est une plateforme d automatisation du revenu et des operations qui gere la facturation, la collecte, les recus, WhatsApp et email, les workflows assists par IA, les rapports et la visibilite equipe — pendant que les paiements vont directement sur votre compte, pas le notre."
              />
            </p>
            <MarketingCta variant="hero" />
            <div className="flex flex-col gap-2 text-xs text-slate-900 dark:text-slate-300">
              <div className="flex flex-wrap items-center gap-3">
                <PaystackLogo className="payment-logo-color h-6 w-auto" />
                <Image
                  src="/payment-logos/flutterwave.png"
                  alt="Flutterwave"
                  width={144}
                  height={40}
                  className="payment-logo-color h-9 w-auto"
                />
              </div>
              <span>
                <LangText
                  en="Payments powered by Paystack and Flutterwave."
                  fr="Paiements fournis par Paystack et Flutterwave."
                />
              </span>
            </div>
          </div>
          <div className="relative">
            <div className="absolute -right-10 -top-10 hidden h-28 w-28 rounded-full bg-indigo-500/20 blur-3xl lg:block" />
            <div
              className="relative overflow-hidden rounded-[28px] border border-slate-200 bg-slate-50 p-6 text-slate-900 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.25)] dark:border-slate-700 dark:bg-slate-900/88 dark:text-slate-100 dark:shadow-[0_24px_48px_-28px_rgba(2,6,23,0.55)]"
            >
              <div className="flex items-center justify-between text-xs text-slate-900 dark:text-slate-100">
                <span>
                  <LangText en="Collections overview" fr="Apercu recouvrement" />
                </span>
                <span className="rounded-full bg-emerald-200 px-2 py-0.5 text-[10px] font-semibold text-emerald-900 ring-1 ring-emerald-300 dark:bg-emerald-400/12 dark:text-emerald-300 dark:ring-emerald-400/30">
                  <LangText en="Live" fr="Actif" />
                </span>
              </div>
              <div className="mt-6 grid gap-4">
                <div className="grid gap-2">
                  <div className="h-2 w-32 rounded-full border border-slate-200 bg-slate-400/70 shadow-[inset_0_0_0_1px_rgba(15,23,42,0.04)] dark:border-slate-700 dark:bg-slate-700" />
                  <div className="h-2 w-48 rounded-full border border-slate-200 bg-slate-400/70 shadow-[inset_0_0_0_1px_rgba(15,23,42,0.04)] dark:border-slate-700 dark:bg-slate-700" />
                </div>
                <div className="grid gap-3">
                  <div className="flex items-center justify-between text-xs font-semibold text-slate-900 dark:text-slate-100">
                    <span>
                      <LangText en="Payment detected" fr="Paiement detecte" />
                    </span>
                    <span className="font-semibold">$12,480</span>
                  </div>
                  <div className="h-3 w-full rounded-full bg-slate-300/80 dark:bg-slate-800">
                    <div className="h-3 w-4/5 rounded-full bg-indigo-600 dark:bg-indigo-500" />
                  </div>
                </div>
                <div className="grid gap-2 text-xs text-slate-900 dark:text-slate-100">
                  <div className="flex items-center justify-between">
                    <span>
                      <LangText en="Receipt issued" fr="Recu emis" />
                    </span>
                    <span className="font-semibold">Auto</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>
                      <LangText en="AI improved message" fr="Message ameliore par IA" />
                    </span>
                    <span className="font-semibold">
                      <LangText en="Ready" fr="Pret" />
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>
                      <LangText en="Activity log" fr="Historique" />
                    </span>
                    <span className="font-semibold">Live</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-14 border-t border-border pt-8">
          <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
            <div className="space-y-3">
              <p className="text-xs uppercase tracking-[0.25em] text-indigo-800 dark:text-indigo-300">
                <LangText en="Trust" fr="Confiance" />
              </p>
              <h2 className="text-2xl font-semibold text-foreground">
                <LangText
                  en="Payments go straight to you — we don't hold your money."
                  fr="Les paiements vont directement a vous — nous ne gardons pas vos fonds."
                />
              </h2>
              <p className="text-sm text-slate-900 dark:text-slate-300">
                <LangText
                  en="Maboria does not store or hold customer funds. Payments are processed by Paystack or Flutterwave and settled directly into your connected business account or sub-account. Maboria only detects payment status and triggers automations."
                  fr="Maboria ne stocke pas les fonds clients. Les paiements sont traites par Paystack ou Flutterwave et verses sur votre compte. Maboria detecte le statut et declenche l automation."
                />
              </p>
            </div>
            <div className="space-y-3 text-sm text-slate-900 dark:text-slate-300">
              {trustBullets.map((item) => (
                <div key={item.en} className="flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600 dark:text-emerald-300" />
                  <LangText en={item.en} fr={item.fr} />
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mt-14 border-t border-border pt-8">
          <div className="space-y-3">
            <p className="text-xs uppercase tracking-[0.25em] text-indigo-800 dark:text-indigo-300">
              <LangText en="Sub-accounts" fr="Sous-comptes" />
            </p>
            <h2 className="text-2xl font-semibold text-foreground">
              <LangText en="Collect payments with sub-accounts — without stress." fr="Collectez avec des sous-comptes — sans stress." />
            </h2>
            <p className="text-sm text-slate-900 dark:text-slate-300">
              <LangText
                en="Create sub-accounts for collections, send invoices, and let customers pay once. Funds land directly in your connected account, while Maboria automatically confirms payment, issues receipts, updates records, and notifies your team."
                fr="Creez des sous-comptes, envoyez des factures, et laissez vos clients payer. Les fonds arrivent sur votre compte pendant que Maboria confirme, emet les recus, met a jour et notifie l equipe."
              />
            </p>
          </div>
        </section>

        <section className="mt-14 border-t border-border pt-8">
          <div className="space-y-3">
            <p className="text-xs uppercase tracking-[0.25em] text-indigo-800 dark:text-indigo-300">
              <LangText en="Workflow" fr="Flux" />
            </p>
            <h2 className="text-2xl font-semibold text-foreground">
              <LangText en="What happens when you use Maboria" fr="Ce qui se passe avec Maboria" />
            </h2>
          </div>
          <div className="mt-6 space-y-4">
            {workflowSteps.map((step) => (
              <div key={step.step} className="flex items-start gap-4">
                <div className="flex h-8 w-8 items-center justify-center rounded-full border border-border text-xs font-semibold text-indigo-700 dark:text-indigo-200">
                  {step.step}
                </div>
                <div className="border-l border-border pl-4 text-sm text-slate-900 dark:text-slate-300">
                  <LangText en={step.en} fr={step.fr} />
                </div>
              </div>
            ))}
          </div>
        </section>

        <section id="features" className="mt-14 border-t border-border pt-8">
          <div className="space-y-3">
            <p className="text-xs uppercase tracking-[0.25em] text-indigo-800 dark:text-indigo-300">
              <LangText en="Features" fr="Fonctionnalites" />
            </p>
            <h2 className="text-2xl font-semibold text-foreground">
              <LangText en="Everything you can automate — end to end." fr="Tout ce que vous pouvez automatiser." />
            </h2>
          </div>
          <div className="mt-6 grid gap-8 md:grid-cols-2">
            {featureGroups.map((group) => (
              <div key={group.title.en} className="space-y-3">
                <h3 className="text-base font-semibold text-foreground">
                  <LangText en={group.title.en} fr={group.title.fr} />
                </h3>
                <ul className="space-y-2 text-sm text-slate-900 dark:text-slate-300">
                  {group.items.map((item) => (
                    <li key={item.en} className="flex items-start gap-2">
                      <span className="mt-2 h-1.5 w-1.5 rounded-full bg-indigo-500/70" />
                      <LangText en={item.en} fr={item.fr} />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-14 border-t border-border pt-8">
          <div className="space-y-3">
            <p className="text-xs uppercase tracking-[0.25em] text-indigo-800 dark:text-indigo-300">
              <LangText en="Coverage" fr="Couverture" />
            </p>
            <h2 className="text-2xl font-semibold text-foreground">
              <LangText en="Payment coverage that scales globally." fr="Couverture paiement a l echelle mondiale." />
            </h2>
            <p className="text-sm text-slate-900 dark:text-slate-300">
              <LangText
                en="Availability depends on provider and country."
                fr="La disponibilite depend du prestataire et du pays."
              />
            </p>
          </div>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {coverageItems.map((item) => (
              <div key={item.en} className="flex items-start gap-3 text-sm text-slate-900 dark:text-slate-300">
                <span className="mt-1 h-1.5 w-1.5 rounded-full bg-indigo-500/70" />
                <LangText en={item.en} fr={item.fr} />
              </div>
            ))}
          </div>
        </section>

        <section id="pricing" className="mt-14 border-t border-border pt-8">
          <div className="mb-6 flex flex-col gap-2">
            <p className="text-xs uppercase tracking-[0.25em] text-indigo-800 dark:text-indigo-300">
              <LangText en="Pricing" fr="Tarifs" />
            </p>
            <h2 className="text-2xl font-semibold text-foreground">
              <LangText en="Choose how much of your operations you want to automate." fr="Choisissez combien automatiser." />
            </h2>
          </div>
          <PricingSection plans={plans} />
        </section>

        <section className="mt-14 border-t border-border pt-8 text-center">
          <h2 className="text-2xl font-semibold text-foreground">
            <LangText en="Build predictable revenue — without manual work." fr="Construisez un revenu previsible — sans travail manuel." />
          </h2>
          <div className="mt-6 flex justify-center">
            <Link href="/signup">
              <Button size="md">
                <LangText en="Get started" fr="Commencer" />
              </Button>
            </Link>
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
      </main>

      <footer className="border-t border-border bg-background/80 px-4 py-8 backdrop-blur md:px-6">
        <div className="mx-auto w-full max-w-6xl">
          <div className="grid grid-cols-1 gap-8 text-sm text-slate-600 max-md:max-w-none md:grid-cols-2 lg:grid-cols-4 dark:text-slate-300">
            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-foreground">Maboria Automation Cloud</h3>
              <p className="text-sm leading-relaxed text-slate-500 dark:text-slate-400">
                Build predictable revenue — without manual work.
              </p>
            </section>

            <section className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                <LangText en="Product" fr="Produit" />
              </h3>
              <nav className="flex flex-col gap-2">
                <Link href="/features" className="transition-colors duration-150 hover:text-indigo-600 dark:hover:text-indigo-300">
                  <LangText en="Features" fr="Fonctionnalites" />
                </Link>
                <Link href="/pricing" className="transition-colors duration-150 hover:text-indigo-600 dark:hover:text-indigo-300">
                  <LangText en="Pricing" fr="Tarifs" />
                </Link>
                <Link href="/faq" className="transition-colors duration-150 hover:text-indigo-600 dark:hover:text-indigo-300">
                  <LangText en="FAQ" fr="FAQ" />
                </Link>
              </nav>
            </section>

            <section className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                <LangText en="Company" fr="Entreprise" />
              </h3>
              <nav className="flex flex-col gap-2">
                <Link href="/terms" className="transition-colors duration-150 hover:text-indigo-600 dark:hover:text-indigo-300">
                  <LangText en="Terms" fr="Conditions" />
                </Link>
                <Link href="/privacy" className="transition-colors duration-150 hover:text-indigo-600 dark:hover:text-indigo-300">
                  <LangText en="Privacy" fr="Confidentialite" />
                </Link>
              </nav>
            </section>

            <section className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                <LangText en="Contact" fr="Contact" />
              </h3>
              <div className="flex flex-col gap-2">
                <a
                  href="mailto:support@mail.maboria.com"
                  className="flex items-center gap-2 hover:text-blue-600 transition-colors"
                >
                  <Mail size={18} />
                  support@mail.maboria.com
                </a>
                <a
                  href="mailto:billing@maboria.com"
                  className="flex items-center gap-2 hover:text-blue-600 transition-colors"
                >
                  <CreditCard size={18} />
                  billing@maboria.com
                </a>
                <a
                  href="mailto:info@maboria.com"
                  className="flex items-center gap-2 hover:text-blue-600 transition-colors"
                >
                  <Info size={18} />
                  info@maboria.com
                </a>
                <a
                  href="https://www.linkedin.com/in/maboria-inc-2157a13b2"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 hover:text-blue-600 transition-colors"
                >
                  <Linkedin size={18} />
                  LinkedIn
                </a>
              </div>
            </section>
          </div>

          <div className="mt-8 border-t border-border/70 pt-4 text-center text-xs text-slate-500 dark:text-slate-400">
            {"\u00A9"} {new Date().getFullYear()} Maboria Inc. All rights reserved.
          </div>
        </div>
      </footer>
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 px-4 py-3 backdrop-blur md:hidden">
        <MarketingCta variant="mobileBar" />
      </div>
    </div>
  );
}

