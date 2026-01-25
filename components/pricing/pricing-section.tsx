"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/components/providers/language-provider";

type PlanRecord = {
  plan: string;
  label: string;
  usd?: number | null;
  features: string[];
};

type PlanDetails = {
  tagline: { en: string; fr: string };
  cta: { en: string; fr: string };
  href: string;
  includes: { en: string; fr: string }[];
  limits?: { en: string; fr: string }[];
};

const planDetails: Record<string, PlanDetails> = {
  STARTER: {
    tagline: { en: "Perfect for getting started.", fr: "Parfait pour bien demarrer." },
    cta: { en: "Get Starter", fr: "Get Starter" },
    href: "/dashboard/subscription?plan=starter",
    includes: [
      { en: "Invoices: 50 / month", fr: "Factures : 50 / mois" },
      { en: "WhatsApp messages: 100 / month", fr: "WhatsApp : 100 / mois" },
      { en: "AI usage: 50 / month", fr: "IA : 50 / mois" },
      { en: "Automations: 3 total", fr: "Automatisations : 3" },
      { en: "1 user", fr: "1 utilisateur" },
    ],
  },
  PRO: {
    tagline: { en: "Best value for professionals.", fr: "Meilleur choix pour les pros." },
    cta: { en: "Get Pro", fr: "Get Pro" },
    href: "/dashboard/subscription?plan=pro",
    includes: [
      { en: "Invoices: 300 / month", fr: "Factures : 300 / mois" },
      { en: "WhatsApp messages: 1,000 / month", fr: "WhatsApp : 1 000 / mois" },
      { en: "AI usage: 300 / month", fr: "IA : 300 / mois" },
      { en: "Automations: 10 total", fr: "Automatisations : 10" },
      { en: "Up to 3 team members", fr: "Jusqu a 3 membres" },
    ],
  },
  GROWTH: {
    tagline: { en: "Built for scaling operations.", fr: "Concu pour la croissance." },
    cta: { en: "Get Growth", fr: "Get Growth" },
    href: "/dashboard/subscription?plan=growth",
    includes: [
      { en: "Invoices: 1,000 / month", fr: "Factures : 1 000 / mois" },
      { en: "WhatsApp messages: 3,000 / month", fr: "WhatsApp : 3 000 / mois" },
      { en: "AI usage: 1,000 / month", fr: "IA : 1 000 / mois" },
      { en: "Automations: 25 total", fr: "Automatisations : 25" },
      { en: "Up to 5 team members", fr: "Jusqu a 5 membres" },
    ],
  },
  BUSINESS: {
    tagline: { en: "Designed for teams that run volume.", fr: "Pour equipes a fort volume." },
    cta: { en: "Get Business", fr: "Get Business" },
    href: "/dashboard/subscription?plan=business",
    includes: [
      { en: "Invoices: 3,000 / month", fr: "Factures : 3 000 / mois" },
      { en: "WhatsApp messages: 7,500 / month", fr: "WhatsApp : 7 500 / mois" },
      { en: "AI usage: 3,000 / month", fr: "IA : 3 000 / mois" },
      { en: "Automations: Unlimited", fr: "Automatisations illimitees" },
      { en: "Up to 10 team members", fr: "Jusqu a 10 membres" },
    ],
  },
  PREMIUM: {
    tagline: { en: "Designed for teams that run volume.", fr: "Pour equipes a fort volume." },
    cta: { en: "Get Business", fr: "Get Business" },
    href: "/dashboard/subscription?plan=business",
    includes: [
      { en: "Invoices: 3,000 / month", fr: "Factures : 3 000 / mois" },
      { en: "WhatsApp messages: 7,500 / month", fr: "WhatsApp : 7 500 / mois" },
      { en: "AI usage: 3,000 / month", fr: "IA : 3 000 / mois" },
      { en: "Automations: Unlimited", fr: "Automatisations illimitees" },
      { en: "Up to 10 team members", fr: "Jusqu a 10 membres" },
    ],
  },
  ENTERPRISE: {
    tagline: { en: "", fr: "" },
    cta: { en: "Contact Sales", fr: "Contact Sales" },
    href: "/contact",
    includes: [
      { en: "Unlimited invoices", fr: "Unlimited invoices" },
      { en: "Unlimited WhatsApp messages", fr: "Unlimited WhatsApp messages" },
      { en: "Unlimited AI usage", fr: "Unlimited AI usage" },
      { en: "Unlimited automations", fr: "Unlimited automations" },
      { en: "Unlimited team members", fr: "Unlimited team members" },
      { en: "SLA-backed uptime guarantee", fr: "SLA-backed uptime guarantee" },
      { en: "Priority infrastructure & rate limits", fr: "Priority infrastructure & rate limits" },
      { en: "Dedicated account manager", fr: "Dedicated account manager" },
      { en: "Custom integrations & compliance support", fr: "Custom integrations & compliance support" },
    ],
  },
};

const accents: Record<string, { button: string; title?: string }> = {
  STARTER: { button: "bg-blue-600 text-white hover:bg-blue-700" },
  PRO: { button: "bg-blue-600 text-white hover:bg-blue-700" },
  GROWTH: {
    button:
      "!bg-emerald-600 !text-white !hover:bg-emerald-700 !shadow-emerald-600/20",
    title: "text-emerald-700",
  },
  BUSINESS: { button: "bg-blue-600 text-white hover:bg-blue-700" },
  PREMIUM: { button: "bg-blue-600 text-white hover:bg-blue-700" },
  ENTERPRISE: { button: "bg-blue-600 text-white hover:bg-blue-700" },
};

const formatUsd = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);

export function PricingSection({ plans }: { plans: PlanRecord[] }) {
  const { language } = useLanguage();
  const t = (en: string, fr: string) => (language === "fr" ? fr : en);
  const [billing, setBilling] = useState<"monthly" | "yearly">("monthly");
  const mainPlans = useMemo(() => plans.filter((p) => p.plan !== "ENTERPRISE"), [plans]);
  const enterprise = useMemo(() => plans.find((p) => p.plan === "ENTERPRISE"), [plans]);

  const computeYearly = (monthly?: number | null) => {
    if (!monthly) return null;
    const yearly = monthly * 12 * 0.85;
    return Math.floor(yearly);
  };

  return (
    <section className="space-y-6 rounded-[32px] bg-[#F8FAFC] px-6 py-12 max-md:px-4 max-md:py-10">
      <div className="mx-auto flex max-w-5xl flex-col items-center gap-4 text-center">
        <h2 className="text-3xl font-semibold text-slate-900 max-md:text-2xl">
          {t("Pricing", "Tarifs")}
        </h2>
        <div className="inline-flex items-center rounded-full border border-slate-200 bg-white p-1 shadow-sm">
          <button
            type="button"
            onClick={() => setBilling("monthly")}
            className={`rounded-full px-6 py-2 text-sm font-semibold transition ${
              billing === "monthly" ? "bg-blue-600 text-white shadow-sm" : "text-slate-700"
            }`}
          >
            {t("Monthly", "Mensuel")}
          </button>
          <button
            type="button"
            onClick={() => setBilling("yearly")}
            className={`rounded-full px-6 py-2 text-sm font-semibold transition ${
              billing === "yearly" ? "bg-blue-600 text-white shadow-sm" : "text-slate-700"
            }`}
          >
            {t("Yearly (Save 15%)", "Annuel (Economisez 15%)")}
          </button>
        </div>
        <p className="text-sm text-slate-500">
          {t(
            "Prices shown in USD. You’ll be charged in your local currency where supported. VAT included where applicable.",
            "Prix en USD. Facturation en devise locale si disponible. TVA incluse si applicable."
          )}
        </p>
      </div>

      <div className="mx-auto grid max-w-6xl gap-6 md:grid-cols-2 xl:grid-cols-4">
        {mainPlans.map((plan) => {
          const accent = accents[plan.plan] || accents.STARTER;
          const detail = planDetails[plan.plan];
          const isPopular = plan.plan === "PRO";
          const monthly = plan.usd ?? null;
          const yearly = computeYearly(plan.usd);
          const price = billing === "yearly" ? yearly : monthly;
          const cadence = billing === "yearly" ? t("/ year", "/ an") : t("/ month", "/ mois");
          return (
            <div
              key={plan.plan}
              className="relative flex h-full min-h-[520px] flex-col rounded-[28px] border border-slate-200 bg-white px-6 pb-6 pt-7 shadow-[0_10px_20px_rgba(15,23,42,0.08)] transition hover:-translate-y-1 hover:shadow-[0_14px_28px_rgba(15,23,42,0.12)]"
            >
              <div className="pointer-events-none absolute inset-x-0 top-0 h-2 rounded-t-[28px] bg-gradient-to-r from-slate-200 to-slate-100" />
              {isPopular && (
                <span className="absolute -top-4 left-1/2 -translate-x-1/2 rounded-full bg-amber-500 px-4 py-1 text-xs font-semibold uppercase tracking-wide text-white shadow-sm">
                  {t("Most Popular", "Plus populaire")}
                </span>
              )}
              <div className="space-y-3">
                <h3 className={`text-3xl font-semibold ${accent.title ?? "text-slate-900"}`}>{plan.label}</h3>
                <div className="text-5xl font-semibold leading-tight text-slate-900">
                  {plan.usd == null ? (
                    t("Custom pricing", "Tarif sur mesure")
                  ) : (
                    <div className="space-y-1">
                      <div>
                        {formatUsd(price || 0)} <span className="text-base text-slate-500">{cadence}</span>
                      </div>
                      {billing === "monthly" && yearly != null && (
                        <div className="text-base text-slate-600">
                          {formatUsd(yearly)} {t("/ year", "/ an")}{" "}
                          <span className="text-slate-400">{t("(save 15%)", "(economisez 15%)")}</span>
                        </div>
                      )}
                      {billing === "yearly" && monthly != null && (
                        <div className="text-base text-slate-600">
                          {formatUsd(monthly)} {t("/ month", "/ mois")}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                {detail && (
                  <p className="text-sm font-semibold text-slate-700">{t(detail.tagline.en, detail.tagline.fr)}</p>
                )}
              </div>
              {detail && (
                <div className="mt-4 space-y-3">
                  <div className="h-px w-full bg-slate-200" />
                  <ul className="space-y-2 text-sm text-slate-700">
                    {detail.includes.map((item) => (
                      <li key={item.en} className="flex items-start gap-2">
                        <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-500" />
                        <span>{t(item.en, item.fr)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {detail && (
                <Link href={detail.href} className="mt-auto pt-5">
                  <Button className={`h-12 w-full text-base ${accent.button}`}>
                    {t(detail.cta.en, detail.cta.fr)}
                  </Button>
                </Link>
              )}
            </div>
          );
        })}
      </div>

      {enterprise && (
        <div className="mx-auto max-w-6xl">
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
            <div className="relative flex h-full min-h-[520px] flex-col rounded-[28px] border border-slate-200 bg-white px-6 pb-6 pt-7 shadow-[0_10px_20px_rgba(15,23,42,0.08)]">
              <div className="pointer-events-none absolute inset-x-0 top-0 h-2 rounded-t-[28px] bg-gradient-to-r from-slate-200 to-slate-100" />
              <div className="space-y-2">
                <h3 className="text-3xl font-semibold text-slate-950">{enterprise.label}</h3>
                <p className="text-sm font-semibold text-slate-700">
                  {t("Built for organisation at scale.", "Built for organisation at scale.")}
                </p>
                <div className="h-1" />
              </div>
              <div className="mt-1 space-y-2">
                <div className="h-px w-full bg-slate-200" />
                <ul className="space-y-2 text-sm text-slate-700">
                  {planDetails.ENTERPRISE.includes.map((item) => (
                    <li key={item.en} className="flex items-start gap-2">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600" />
                      <span>{t(item.en, item.fr)}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <Link href="/contact" className="mt-auto pt-5">
                <Button className="h-12 w-full text-base bg-blue-600 text-white hover:bg-blue-700">
                  {t("Contact Sales", "Contact Sales")}
                </Button>
              </Link>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
