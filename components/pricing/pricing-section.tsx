"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/components/providers/language-provider";
import { LANGUAGE_LOCALES, type LocalizedText } from "@/lib/i18n";

type PlanRecord = {
  plan: string;
  label: string;
  usd?: number | null;
  features: string[];
};

type PlanDetails = {
  title?: LocalizedText;
  tagline: LocalizedText;
  cta: LocalizedText;
  href: string;
  includes: LocalizedText[];
  limits?: LocalizedText[];
};

const pricingCopy = {
  sectionTitle: {
    en: "Pricing",
    fr: "Tarifs",
    de: "Preise",
    es: "Precios",
    pt: "Precos",
  } satisfies LocalizedText,
  sectionSubtitle: {
    en: "Choose how much of your operations you want to automate.",
    fr: "Choisissez le niveau d automatisation souhaite.",
    de: "Wähle, wie viel deiner Ablaufe du automatisieren willst.",
    es: "Elige cuanto de tus operaciónes quieres automatizar.",
    pt: "Escolha quanto das suas operações quer automatizar.",
  } satisfies LocalizedText,
  monthly: {
    en: "Monthly",
    fr: "Mensuel",
    de: "Monatlich",
    es: "Mensual",
    pt: "Mensal",
  } satisfies LocalizedText,
  yearlyWithDiscount: {
    en: "Yearly (Save 10%)",
    fr: "Annuel (Economisez 10%)",
    de: "Jährlich (10% sparen)",
    es: "Anual (Ahorra 10%)",
    pt: "Anual (Poupe 10%)",
  } satisfies LocalizedText,
  priceNotice: {
    en: "Prices shown in USD. You'll be charged in your local currency where supported. VAT included where applicable.",
    fr: "Prix en USD. Facturation en devise locale si disponible. TVA incluse si applicable.",
    de: "Preise werden in USD angezeigt. Falls unterstutzt, wird in deiner lokalen Währung abgerechnet. MwSt. inklusive, wo anwendbar.",
    es: "Los precios se muestran en USD. Se te cobrara en tu moneda local cuando sea compatible. IVA incluido cuando corresponda.",
    pt: "Os precos sao apresentados em USD. Sera cobrado na sua moeda local quando suportado. IVA incluido quando aplicavel.",
  } satisfies LocalizedText,
  mostPopular: {
    en: "Most Popular",
    fr: "Plus populaire",
    de: "Am beliebtesten",
    es: "Mas popular",
    pt: "Mais popular",
  } satisfies LocalizedText,
  customPricing: {
    en: "Custom pricing",
    fr: "Tarif sur mesure",
    de: "Individuelle Preise",
    es: "Precio personalizado",
    pt: "Preco personalizado",
  } satisfies LocalizedText,
  perYear: {
    en: "/ year",
    fr: "/ an",
    de: "/ Jahr",
    es: "/ ano",
    pt: "/ ano",
  } satisfies LocalizedText,
  perMonth: {
    en: "/ month",
    fr: "/ mois",
    de: "/ Monat",
    es: "/ mes",
    pt: "/ mes",
  } satisfies LocalizedText,
  saveTen: {
    en: "(save 10%)",
    fr: "(economisez 10%)",
    de: "(10% sparen)",
    es: "(ahorra 10%)",
    pt: "(poupe 10%)",
  } satisfies LocalizedText,
};

const planDetails: Record<string, PlanDetails> = {
  STARTER: {
    title: { en: "Starter", fr: "Starter", de: "Starter", es: "Starter", pt: "Starter" },
    tagline: {
      en: "Perfect for getting started.",
      fr: "Parfait pour bien demarrer.",
      de: "Perfekt für den Einstieg.",
      es: "Perfecto para empezar.",
      pt: "Perfeito para comecar.",
    },
    cta: { en: "Get Starter", fr: "Choisir Starter", de: "Starter wählen", es: "Elegir Starter", pt: "Escolher Starter" },
    href: "/dashboard/subscription?plan=starter",
    includes: [
      { en: "Invoices: 50 / month", fr: "Factures : 50 / mois", de: "Rechnungen: 50 / Monat", es: "Facturas: 50 / mes", pt: "Faturas: 50 / mes" },
      { en: "WhatsApp messages: 100 / month", fr: "WhatsApp : 100 / mois", de: "WhatsApp-Nachrichten: 100 / Monat", es: "Mensajes de WhatsApp: 100 / mes", pt: "Mensagens WhatsApp: 100 / mes" },
      { en: "AI usage: 50 / month", fr: "IA : 50 / mois", de: "KI-Nutzung: 50 / Monat", es: "Uso de IA: 50 / mes", pt: "Uso de IA: 50 / mes" },
      { en: "Automations: 3 total", fr: "Automatisations : 3", de: "Automatisierungen: 3 gesamt", es: "Automatizaciónes: 3 en total", pt: "Automações: 3 no total" },
      { en: "1 user", fr: "1 utilisateur", de: "1 Benutzer", es: "1 usuario", pt: "1 utilizador" },
    ],
  },
  PRO: {
    title: { en: "Pro", fr: "Pro", de: "Pro", es: "Pro", pt: "Pro" },
    tagline: {
      en: "Best value for professionals.",
      fr: "Meilleur choix pour les pros.",
      de: "Bestes Preis-Leistungs-Verhaltnis für Profis.",
      es: "La mejor opcion para profesionales.",
      pt: "A melhor opcao para profissionais.",
    },
    cta: { en: "Get Pro", fr: "Choisir Pro", de: "Pro wählen", es: "Elegir Pro", pt: "Escolher Pro" },
    href: "/dashboard/subscription?plan=pro",
    includes: [
      { en: "Invoices: 300 / month", fr: "Factures : 300 / mois", de: "Rechnungen: 300 / Monat", es: "Facturas: 300 / mes", pt: "Faturas: 300 / mes" },
      { en: "WhatsApp messages: 1,000 / month", fr: "WhatsApp : 1 000 / mois", de: "WhatsApp-Nachrichten: 1.000 / Monat", es: "Mensajes de WhatsApp: 1.000 / mes", pt: "Mensagens WhatsApp: 1.000 / mes" },
      { en: "AI usage: 300 / month", fr: "IA : 300 / mois", de: "KI-Nutzung: 300 / Monat", es: "Uso de IA: 300 / mes", pt: "Uso de IA: 300 / mes" },
      { en: "Automations: 10 total", fr: "Automatisations : 10", de: "Automatisierungen: 10 gesamt", es: "Automatizaciónes: 10 en total", pt: "Automações: 10 no total" },
      { en: "Up to 3 team members", fr: "Jusqu a 3 membres", de: "Bis zu 3 Teammitglieder", es: "Hasta 3 miembros del equipo", pt: "At? 3 membros da equipa" },
    ],
  },
  GROWTH: {
    title: { en: "Growth", fr: "Growth", de: "Growth", es: "Growth", pt: "Growth" },
    tagline: {
      en: "Built for scaling operations.",
      fr: "Concu pour la croissance.",
      de: "Gebaut für skalierende Ablaufe.",
      es: "Creado para escalar operaciónes.",
      pt: "Criado para escalar operações.",
    },
    cta: { en: "Get Growth", fr: "Choisir Growth", de: "Growth wählen", es: "Elegir Growth", pt: "Escolher Growth" },
    href: "/dashboard/subscription?plan=growth",
    includes: [
      { en: "Invoices: 1,000 / month", fr: "Factures : 1 000 / mois", de: "Rechnungen: 1.000 / Monat", es: "Facturas: 1.000 / mes", pt: "Faturas: 1.000 / mes" },
      { en: "WhatsApp messages: 3,000 / month", fr: "WhatsApp : 3 000 / mois", de: "WhatsApp-Nachrichten: 3.000 / Monat", es: "Mensajes de WhatsApp: 3.000 / mes", pt: "Mensagens WhatsApp: 3.000 / mes" },
      { en: "AI usage: 1,000 / month", fr: "IA : 1 000 / mois", de: "KI-Nutzung: 1.000 / Monat", es: "Uso de IA: 1.000 / mes", pt: "Uso de IA: 1.000 / mes" },
      { en: "Automations: 25 total", fr: "Automatisations : 25", de: "Automatisierungen: 25 gesamt", es: "Automatizaciónes: 25 en total", pt: "Automações: 25 no total" },
      { en: "Up to 5 team members", fr: "Jusqu a 5 membres", de: "Bis zu 5 Teammitglieder", es: "Hasta 5 miembros del equipo", pt: "At? 5 membros da equipa" },
    ],
  },
  BUSINESS: {
    title: { en: "Business", fr: "Business", de: "Business", es: "Business", pt: "Business" },
    tagline: {
      en: "Designed for teams that run volume.",
      fr: "Pour équipes a fort volume.",
      de: "Für Teams mit hohem Volumen.",
      es: "Disenado para equipos que manejan volumen.",
      pt: "Pensado para equipas com grande volume.",
    },
    cta: { en: "Get Business", fr: "Choisir Business", de: "Business wählen", es: "Elegir Business", pt: "Escolher Business" },
    href: "/dashboard/subscription?plan=business",
    includes: [
      { en: "Invoices: 3,000 / month", fr: "Factures : 3 000 / mois", de: "Rechnungen: 3.000 / Monat", es: "Facturas: 3.000 / mes", pt: "Faturas: 3.000 / mes" },
      { en: "WhatsApp messages: 7,500 / month", fr: "WhatsApp : 7 500 / mois", de: "WhatsApp-Nachrichten: 7.500 / Monat", es: "Mensajes de WhatsApp: 7.500 / mes", pt: "Mensagens WhatsApp: 7.500 / mes" },
      { en: "AI usage: 3,000 / month", fr: "IA : 3 000 / mois", de: "KI-Nutzung: 3.000 / Monat", es: "Uso de IA: 3.000 / mes", pt: "Uso de IA: 3.000 / mes" },
      { en: "Automations: Unlimited", fr: "Automatisations illimitees", de: "Automatisierungen: Unbegrenzt", es: "Automatizaciónes: Ilimitadas", pt: "Automações: Ilimitadas" },
      { en: "Up to 10 team members", fr: "Jusqu a 10 membres", de: "Bis zu 10 Teammitglieder", es: "Hasta 10 miembros del equipo", pt: "At? 10 membros da equipa" },
    ],
  },
  PREMIUM: {
    title: { en: "Business", fr: "Business", de: "Business", es: "Business", pt: "Business" },
    tagline: {
      en: "Designed for teams that run volume.",
      fr: "Pour équipes a fort volume.",
      de: "Für Teams mit hohem Volumen.",
      es: "Disenado para equipos que manejan volumen.",
      pt: "Pensado para equipas com grande volume.",
    },
    cta: { en: "Get Business", fr: "Choisir Business", de: "Business wählen", es: "Elegir Business", pt: "Escolher Business" },
    href: "/dashboard/subscription?plan=business",
    includes: [
      { en: "Invoices: 3,000 / month", fr: "Factures : 3 000 / mois", de: "Rechnungen: 3.000 / Monat", es: "Facturas: 3.000 / mes", pt: "Faturas: 3.000 / mes" },
      { en: "WhatsApp messages: 7,500 / month", fr: "WhatsApp : 7 500 / mois", de: "WhatsApp-Nachrichten: 7.500 / Monat", es: "Mensajes de WhatsApp: 7.500 / mes", pt: "Mensagens WhatsApp: 7.500 / mes" },
      { en: "AI usage: 3,000 / month", fr: "IA : 3 000 / mois", de: "KI-Nutzung: 3.000 / Monat", es: "Uso de IA: 3.000 / mes", pt: "Uso de IA: 3.000 / mes" },
      { en: "Automations: Unlimited", fr: "Automatisations illimitees", de: "Automatisierungen: Unbegrenzt", es: "Automatizaciónes: Ilimitadas", pt: "Automações: Ilimitadas" },
      { en: "Up to 10 team members", fr: "Jusqu a 10 membres", de: "Bis zu 10 Teammitglieder", es: "Hasta 10 miembros del equipo", pt: "At? 10 membros da equipa" },
    ],
  },
  ENTERPRISE: {
    title: { en: "Enterprise", fr: "Enterprise", de: "Enterprise", es: "Enterprise", pt: "Enterprise" },
    tagline: {
      en: "Built for organisations at scale.",
      fr: "Concu pour les organisations a grande echelle.",
      de: "Für Organisationen im grossen Massstab.",
      es: "Creado para organizaciones a gran escala.",
      pt: "Criado para organizações em escala.",
    },
    cta: { en: "Contact Sales", fr: "Contacter les ventes", de: "Vertrieb kontaktieren", es: "Contactar ventas", pt: "Contactar vendas" },
    href: "/contact",
    includes: [
      { en: "Unlimited invoices", fr: "Factures illimitees", de: "Unbegrenzte Rechnungen", es: "Facturas ilimitadas", pt: "Faturas ilimitadas" },
      { en: "Unlimited WhatsApp messages", fr: "Messages WhatsApp illimites", de: "Unbegrenzte WhatsApp-Nachrichten", es: "Mensajes de WhatsApp ilimitados", pt: "Mensagens WhatsApp ilimitadas" },
      { en: "Unlimited AI usage", fr: "Utilisation IA illimitee", de: "Unbegrenzte KI-Nutzung", es: "Uso de IA ilimitado", pt: "Uso de IA ilimitado" },
      { en: "Unlimited automations", fr: "Automatisations illimitees", de: "Unbegrenzte Automatisierungen", es: "Automatizaciónes ilimitadas", pt: "Automações ilimitadas" },
      { en: "Unlimited team members", fr: "Membres illimites", de: "Unbegrenzte Teammitglieder", es: "Miembros de equipo ilimitados", pt: "Membros de equipa ilimitados" },
      { en: "SLA-backed uptime guarantee", fr: "Garantie de disponibilite avec SLA", de: "SLA-gestutzte Verfügbarkeitsgarantie", es: "Garantia de disponibilidad con SLA", pt: "Garantia de disponibilidade com SLA" },
      { en: "Priority infrastructure & rate limits", fr: "Infrastructure prioritaire et limites dediees", de: "Priorisierte Infrastruktur und Limits", es: "Infraestructura prioritaria y limites dedicados", pt: "Infraestrutura prioritaria e limites dedicados" },
      { en: "Dedicated account manager", fr: "Responsable de compte dedie", de: "Dedizierter Account Manager", es: "Gestor de cuenta dedicado", pt: "Gestor de conta dedicado" },
      { en: "Custom integrations & compliance support", fr: "Integrations sur mesure et support conformité", de: "Individuelle Integrationen und Compliance-Support", es: "Integraciónes a medida y soporte de cumplimiento", pt: "Integrações personalizadas e apoio de conformidade" },
    ],
  },
};

const accents: Record<string, { button: string; title?: string }> = {
  STARTER: { button: "bg-blue-600 text-white hover:bg-blue-700" },
  PRO: { button: "bg-blue-600 text-white hover:bg-blue-700" },
  GROWTH: {
    button:
      "!bg-emerald-600 !text-white !hover:bg-emerald-700 !shadow-emerald-600/20",
    title: "text-emerald-700 dark:text-emerald-400",
  },
  BUSINESS: { button: "bg-blue-600 text-white hover:bg-blue-700" },
  PREMIUM: { button: "bg-blue-600 text-white hover:bg-blue-700" },
  ENTERPRISE: { button: "bg-blue-600 text-white hover:bg-blue-700" },
};

const formatUsd = (value: number, locale: string) =>
  new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);

export function PricingSection({ plans }: { plans: PlanRecord[] }) {
  const { language, t } = useLanguage();
  const [billing, setBilling] = useState<"monthly" | "yearly">("monthly");
  const locale = LANGUAGE_LOCALES[language];
  const mainPlans = useMemo(() => plans.filter((p) => p.plan !== "ENTERPRISE"), [plans]);
  const enterprise = useMemo(() => plans.find((p) => p.plan === "ENTERPRISE"), [plans]);
  const enterpriseDetail = planDetails.ENTERPRISE;

  const computeYearly = (monthly?: number | null) => {
    if (!monthly) return null;
    const yearly = monthly * 12 * 0.9;
    return Math.floor(yearly);
  };

  return (
    <section className="relative z-10 pointer-events-auto space-y-10 px-6 py-16 max-md:px-4 max-md:py-12">
      <div className="mx-auto flex max-w-5xl flex-col items-center gap-3 text-center">
        <h2 className="text-4xl font-semibold text-slate-900 max-md:text-3xl dark:text-slate-50">
          {t(pricingCopy.sectionTitle)}
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-300">
          {t(pricingCopy.sectionSubtitle)}
        </p>
        <div className="inline-flex items-center rounded-full border border-slate-200/80 bg-white/90 p-1 shadow-[0_6px_16px_rgba(15,23,42,0.06)] dark:border-slate-700 dark:bg-slate-900/90 dark:shadow-[0_10px_28px_rgba(2,6,23,0.45)]">
          <button
            type="button"
            onClick={() => setBilling("monthly")}
            className={`rounded-full px-6 py-2 text-sm font-semibold transition ${
              billing === "monthly"
                ? "bg-blue-600 text-white shadow-sm"
                : "text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
            }`}
          >
            {t(pricingCopy.monthly)}
          </button>
          <button
            type="button"
            onClick={() => setBilling("yearly")}
            className={`rounded-full px-6 py-2 text-sm font-semibold transition ${
              billing === "yearly"
                ? "bg-blue-600 text-white shadow-sm"
                : "text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
            }`}
          >
            {t(pricingCopy.yearlyWithDiscount)}
          </button>
        </div>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {t(pricingCopy.priceNotice)}
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
          const cadence = billing === "yearly" ? t(pricingCopy.perYear) : t(pricingCopy.perMonth);
          return (
            <div
              key={plan.plan}
              className={`relative flex h-full min-h-[520px] flex-col rounded-2xl border border-slate-200/80 bg-white/90 px-6 pb-6 pt-7 shadow-[0_6px_16px_rgba(15,23,42,0.06)] transition hover:shadow-[0_10px_24px_rgba(15,23,42,0.12)] dark:border-slate-700 dark:bg-slate-900/88 dark:shadow-[0_18px_36px_rgba(2,6,23,0.42)] dark:hover:shadow-[0_22px_44px_rgba(2,6,23,0.55)] ${
                isPopular ? "ring-1 ring-indigo-500/20" : ""
              }`}
            >
              {isPopular && (
                <span className="absolute right-4 top-4 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-300">
                  {t(pricingCopy.mostPopular)}
                </span>
              )}
              <div className="space-y-3">
                <h3 className={`text-2xl font-semibold ${accent.title ?? "text-slate-900 dark:text-slate-50"}`}>{detail?.title ? t(detail.title) : plan.label}</h3>
                <div className="text-4xl font-semibold leading-tight text-slate-900 dark:text-slate-50">
                  {plan.usd == null ? (
                    t(pricingCopy.customPricing)
                  ) : (
                    <div className="space-y-1">
                      <div>
                        {formatUsd(price || 0, locale)} <span className="text-base text-slate-500 dark:text-slate-400">{cadence}</span>
                      </div>
                      {billing === "monthly" && yearly != null && (
                        <div className="text-base text-slate-600 dark:text-slate-300">
                          {formatUsd(yearly, locale)} {t(pricingCopy.perYear)}{" "}
                          <span className="text-slate-400 dark:text-slate-500">{t(pricingCopy.saveTen)}</span>
                        </div>
                      )}
                      {billing === "yearly" && monthly != null && (
                        <div className="text-base text-slate-600 dark:text-slate-300">
                          {formatUsd(monthly, locale)} {t(pricingCopy.perMonth)}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                {detail && (
                  <p className="text-sm font-medium text-slate-600 dark:text-slate-300">{t(detail.tagline)}</p>
                )}
              </div>
              {detail && (
                <div className="mt-4 space-y-3">
                  <div className="h-px w-full bg-slate-200/80 dark:bg-slate-800" />
                  <ul className="space-y-2 text-sm text-slate-700 dark:text-slate-200">
                    {detail.includes.map((item) => (
                      <li key={item.en} className="flex items-start gap-2">
                        <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600" />
                        <span>{t(item)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {detail && (
                <Link href={detail.href} className="mt-auto pt-5">
                  <Button className={`h-12 w-full text-base ${accent.button}`}>
                    {t(detail.cta)}
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
            <div className="relative flex h-full min-h-[520px] flex-col rounded-2xl border border-slate-200/80 bg-white/90 px-6 pb-6 pt-7 shadow-[0_6px_16px_rgba(15,23,42,0.06)] dark:border-slate-700 dark:bg-slate-900/88 dark:shadow-[0_18px_36px_rgba(2,6,23,0.42)]">
              <div className="space-y-2">
                <h3 className="text-3xl font-semibold text-slate-950 dark:text-slate-50">{t(enterpriseDetail.title || { en: enterprise.label })}</h3>
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                  {t(enterpriseDetail.tagline)}
                </p>
                <div className="h-1" />
              </div>
              <div className="mt-1 space-y-2">
                <div className="h-px w-full bg-slate-200/80 dark:bg-slate-800" />
                <ul className="space-y-2 text-sm text-slate-700 dark:text-slate-200">
                  {enterpriseDetail.includes.map((item) => (
                    <li key={item.en} className="flex items-start gap-2">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600" />
                      <span>{t(item)}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <Link href="/contact" className="mt-auto pt-5">
                <Button className="h-12 w-full text-base bg-blue-600 text-white hover:bg-blue-700">
                  {t(enterpriseDetail.cta)}
                </Button>
              </Link>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

