"use client";

import { useState } from "react";
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

const copy = {
  sectionTitle: {
    en: "Pricing That Scales With Your Operations",
    fr: "Tarifs adaptes a vos operations",
    de: "Preise, die mit Ihrem Betrieb wachsen",
    es: "Precios que crecen con tus operaciones",
    pt: "Precos que crescem com a operacao",
  } satisfies LocalizedText,
  sectionSubtitle: {
    en: "Run invoicing, payment follow-ups, shared inbox workflows, and team operations from one workspace.",
    fr: "Gerez facturation, relances, boites partagees et operations d equipe depuis un seul espace.",
    de: "Steuern Sie Rechnungen, Zahlungsnachverfolgung, gemeinsame Postfach-Workflows und Teamablaufe in einem Workspace.",
    es: "Gestiona facturas, seguimientos de pago, bandejas compartidas y operaciones del equipo desde un solo espacio.",
    pt: "Gira faturacao, seguimentos de pagamento, caixas partilhadas e operacoes da equipa num unico espaco.",
  } satisfies LocalizedText,
  ownConnections: {
    en: "Bring your own Gmail, Outlook, and WhatsApp connections.",
    fr: "Connectez vos propres comptes Gmail, Outlook et WhatsApp.",
    de: "Verbinden Sie Ihre eigenen Gmail-, Outlook- und WhatsApp-Kanale.",
    es: "Conecta tus propias cuentas de Gmail, Outlook y WhatsApp.",
    pt: "Ligue as suas proprias contas Gmail, Outlook e WhatsApp.",
  } satisfies LocalizedText,
  monthly: {
    en: "Monthly",
    fr: "Mensuel",
    de: "Monatlich",
    es: "Mensual",
    pt: "Mensal",
  } satisfies LocalizedText,
  yearly: {
    en: "Yearly",
    fr: "Annuel",
    de: "Jaehrlich",
    es: "Anual",
    pt: "Anual",
  } satisfies LocalizedText,
  saveFifteen: {
    en: "Save 15%",
    fr: "Economisez 15%",
    de: "15% sparen",
    es: "Ahorra 15%",
    pt: "Poupe 15%",
  } satisfies LocalizedText,
  mostPopular: {
    en: "Most Popular",
    fr: "Plus populaire",
    de: "Am beliebtesten",
    es: "Mas popular",
    pt: "Mais popular",
  } satisfies LocalizedText,
  customPricing: {
    en: "Contact Sales",
    fr: "Contacter les ventes",
    de: "Vertrieb kontaktieren",
    es: "Contactar ventas",
    pt: "Contactar vendas",
  } satisfies LocalizedText,
  perMonth: {
    en: "/mo",
    fr: "/mois",
    de: "/Monat",
    es: "/mes",
    pt: "/mes",
  } satisfies LocalizedText,
  perMonthBilledYearly: {
    en: "/mo billed yearly",
    fr: "/mois facture annuellement",
    de: "/Monat bei jaehrlicher Zahlung",
    es: "/mes facturado anualmente",
    pt: "/mes faturado anualmente",
  } satisfies LocalizedText,
  perYear: {
    en: "/year",
    fr: "/an",
    de: "/Jahr",
    es: "/ano",
    pt: "/ano",
  } satisfies LocalizedText,
  billedAnnuallyAt: {
    en: "billed annually at",
    fr: "facture annuellement a",
    de: "jahrlich berechnet zu",
    es: "facturado anualmente a",
    pt: "faturado anualmente a",
  } satisfies LocalizedText,
  billedMonthly: {
    en: "billed monthly",
    fr: "facture mensuellement",
    de: "monatlich berechnet",
    es: "facturado mensualmente",
    pt: "faturado mensalmente",
  } satisfies LocalizedText,
};

const planUi: Record<
  string,
  {
    audience: LocalizedText;
    cta: LocalizedText;
    href: string;
    accent: string;
    tint: string;
    button: string;
    border: string;
  }
> = {
  STARTER: {
    audience: {
      en: "For solo operators getting billing and follow-ups under control.",
      fr: "Pour les independants qui veulent mieux gerer facturation et relances.",
      de: "Fur Einzelunternehmer, die Abrechnung und Nachfassaktionen in den Griff bekommen wollen.",
      es: "Para operadores en solitario que quieren ordenar facturacion y seguimientos.",
      pt: "Para operadores individuais que querem organizar faturacao e seguimentos.",
    },
    cta: {
      en: "Get Starter",
      fr: "Choisir Starter",
      de: "Starter waehlen",
      es: "Elegir Starter",
      pt: "Escolher Starter",
    },
    href: "/dashboard/subscription?plan=starter",
    accent: "#22c55e",
    tint: "bg-[rgba(34,197,94,0.08)] dark:bg-[rgba(34,197,94,0.14)]",
    button:
      "!border !border-[rgba(34,197,94,0.22)] !bg-[rgba(34,197,94,0.10)] !text-[#15803d] !shadow-none hover:!bg-[rgba(34,197,94,0.16)] dark:!border-[rgba(74,222,128,0.22)] dark:!bg-[rgba(34,197,94,0.16)] dark:!text-[#bbf7d0] dark:hover:!bg-[rgba(34,197,94,0.22)]",
    border: "border-[rgba(34,197,94,0.25)] dark:border-[rgba(74,222,128,0.22)]",
  },
  PRO: {
    audience: {
      en: "For small teams running customer communication and daily operations together.",
      fr: "Pour les petites equipes qui gerent ensemble communication client et operations.",
      de: "Fur kleine Teams, die Kundenkommunikation und Tagesgeschaeft gemeinsam steuern.",
      es: "Para pequenos equipos que gestionan juntos comunicacion con clientes y operaciones diarias.",
      pt: "Para pequenas equipas que gerem juntas a comunicacao com clientes e a operacao diaria.",
    },
    cta: {
      en: "Get Pro",
      fr: "Choisir Pro",
      de: "Pro waehlen",
      es: "Elegir Pro",
      pt: "Escolher Pro",
    },
    href: "/dashboard/subscription?plan=pro",
    accent: "#3b82f6",
    tint: "bg-[rgba(59,130,246,0.1)] dark:bg-[rgba(59,130,246,0.16)]",
    button:
      "!border !border-[rgba(59,130,246,0.22)] !bg-[rgba(59,130,246,0.10)] !text-[#2563eb] !shadow-none hover:!bg-[rgba(59,130,246,0.16)] dark:!border-[rgba(96,165,250,0.22)] dark:!bg-[rgba(59,130,246,0.16)] dark:!text-[#bfdbfe] dark:hover:!bg-[rgba(59,130,246,0.22)]",
    border: "border-[rgba(59,130,246,0.28)] dark:border-[rgba(96,165,250,0.24)]",
  },
  GROWTH: {
    audience: {
      en: "For growing teams that need structure, speed, and visibility.",
      fr: "Pour les equipes en croissance qui ont besoin de structure et de visibilite.",
      de: "Fur wachsende Teams, die Struktur, Tempo und Transparenz brauchen.",
      es: "Para equipos en crecimiento que necesitan estructura, rapidez y visibilidad.",
      pt: "Para equipas em crescimento que precisam de estrutura, velocidade e visibilidade.",
    },
    cta: {
      en: "Get Growth",
      fr: "Choisir Growth",
      de: "Growth waehlen",
      es: "Elegir Growth",
      pt: "Escolher Growth",
    },
    href: "/dashboard/subscription?plan=growth",
    accent: "#8b5cf6",
    tint: "bg-[rgba(139,92,246,0.1)] dark:bg-[rgba(139,92,246,0.16)]",
    button:
      "!border !border-[rgba(139,92,246,0.22)] !bg-[rgba(139,92,246,0.10)] !text-[#7c3aed] !shadow-none hover:!bg-[rgba(139,92,246,0.16)] dark:!border-[rgba(167,139,250,0.22)] dark:!bg-[rgba(139,92,246,0.16)] dark:!text-[#ddd6fe] dark:hover:!bg-[rgba(139,92,246,0.22)]",
    border: "border-[rgba(139,92,246,0.25)] dark:border-[rgba(167,139,250,0.22)]",
  },
  BUSINESS: {
    audience: {
      en: "For companies that need control, accountability, and operational oversight.",
      fr: "Pour les entreprises qui veulent plus de controle et de responsabilisation.",
      de: "Fur Unternehmen, die Kontrolle, Nachvollziehbarkeit und operative Aufsicht brauchen.",
      es: "Para empresas que necesitan control, responsabilidad y supervision operativa.",
      pt: "Para empresas que precisam de controlo, responsabilidade e supervisao operacional.",
    },
    cta: {
      en: "Get Business",
      fr: "Choisir Business",
      de: "Business waehlen",
      es: "Elegir Business",
      pt: "Escolher Business",
    },
    href: "/dashboard/subscription?plan=business",
    accent: "#f59e0b",
    tint: "bg-[rgba(245,158,11,0.1)] dark:bg-[rgba(245,158,11,0.16)]",
    button:
      "!border !border-[rgba(245,158,11,0.22)] !bg-[rgba(245,158,11,0.10)] !text-[#d97706] !shadow-none hover:!bg-[rgba(245,158,11,0.16)] dark:!border-[rgba(251,191,36,0.22)] dark:!bg-[rgba(245,158,11,0.16)] dark:!text-[#fde68a] dark:hover:!bg-[rgba(245,158,11,0.22)]",
    border: "border-[rgba(245,158,11,0.25)] dark:border-[rgba(251,191,36,0.22)]",
  },
  ENTERPRISE: {
    audience: {
      en: "For organizations with custom workflows, controls, and rollout needs.",
      fr: "Pour les organisations avec des flux, controles et besoins de deploiement personnalises.",
      de: "Fur Organisationen mit individuellen Workflows, Kontrollen und Rollout-Anforderungen.",
      es: "Para organizaciones con flujos, controles y necesidades de despliegue personalizados.",
      pt: "Para organizacoes com fluxos, controlos e necessidades de rollout personalizadas.",
    },
    cta: {
      en: "Contact Sales",
      fr: "Contacter les ventes",
      de: "Vertrieb kontaktieren",
      es: "Contactar ventas",
      pt: "Contactar vendas",
    },
    href: "/contact",
    accent: "#111827",
    tint: "bg-slate-100 dark:bg-slate-800/80",
    button:
      "!bg-slate-900 !text-white !shadow-none hover:!bg-slate-800 dark:!border dark:!border-white/14 dark:!bg-slate-100 dark:!text-slate-950 dark:hover:!bg-white",
    border: "border-slate-300 dark:border-white/12",
  },
};

const formatUsd = (value: number, locale: string) =>
  `$${new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(value)}`;

export function PricingSection({ plans }: { plans: PlanRecord[] }) {
  const { language, t } = useLanguage();
  const [billing, setBilling] = useState<"monthly" | "yearly">("monthly");
  const locale = LANGUAGE_LOCALES[language];

  return (
    <section className="space-y-10 bg-white px-6 py-16 dark:bg-transparent max-md:px-4 max-md:py-12">
      <div className="mx-auto flex max-w-4xl flex-col items-center gap-4 text-center">
        <h2 className="text-4xl font-semibold tracking-tight text-slate-950 dark:text-white max-md:text-3xl">
          {t(copy.sectionTitle)}
        </h2>
        <p className="max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-300">{t(copy.sectionSubtitle)}</p>
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
          {t(copy.ownConnections)}
        </p>
        <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 p-1 shadow-sm dark:border-white/10 dark:bg-slate-900/70 dark:shadow-[0_16px_40px_rgba(2,6,23,0.32)]">
          <button
            type="button"
            onClick={() => setBilling("monthly")}
            className={`rounded-full px-5 py-2 text-sm font-semibold transition ${
              billing === "monthly"
                ? "bg-white text-slate-950 shadow-sm dark:bg-white dark:text-slate-950"
                : "text-slate-500 hover:text-slate-950 dark:text-slate-400 dark:hover:text-white"
            }`}
          >
            {t(copy.monthly)}
          </button>
          <button
            type="button"
            onClick={() => setBilling("yearly")}
            className={`rounded-full px-5 py-2 text-sm font-semibold transition ${
              billing === "yearly"
                ? "bg-slate-900 text-white shadow-sm dark:bg-white dark:text-slate-950"
                : "text-slate-500 hover:text-slate-950 dark:text-slate-400 dark:hover:text-white"
            }`}
          >
            {t(copy.yearly)} <span className="text-xs opacity-80"> • {t(copy.saveFifteen)}</span>
          </button>
        </div>
      </div>

      <div className="mx-auto grid max-w-[1840px] gap-5 lg:grid-cols-2 xl:grid-cols-5">
        {plans.map((plan) => {
          const ui = planUi[plan.plan] ?? planUi.STARTER;
          const monthly = plan.usd ?? null;
          const yearlyPrice = monthly == null ? null : Math.round(monthly * 12 * 0.85);
          const isPopular = plan.plan === "PRO";
          const featureIconColor = plan.plan === "ENTERPRISE" ? "#64748b" : ui.accent;
          const customPriceClass =
            plan.plan === "ENTERPRISE"
              ? "whitespace-nowrap text-lg font-semibold leading-tight tracking-tight text-slate-950 dark:text-white sm:text-xl xl:text-2xl"
              : "whitespace-nowrap text-3xl font-semibold tracking-tight text-slate-950 dark:text-white xl:text-4xl";

          return (
            <div
              key={plan.plan}
              className={`relative flex h-full min-h-[560px] flex-col rounded-2xl border bg-white p-5 shadow-[0_14px_32px_rgba(15,23,42,0.08)] transition duration-200 hover:-translate-y-1 hover:shadow-[0_24px_46px_rgba(15,23,42,0.12)] dark:bg-slate-950/72 dark:shadow-[0_22px_48px_rgba(2,6,23,0.4)] dark:backdrop-blur ${ui.border} ${
                isPopular
                  ? "ring-2 ring-[rgba(59,130,246,0.2)] shadow-[0_22px_48px_rgba(59,130,246,0.16)] dark:ring-[rgba(96,165,250,0.18)] dark:shadow-[0_22px_44px_rgba(2,6,23,0.44)]"
                  : ""
              }`}
            >
              {isPopular ? (
                <span className="absolute right-4 top-4 rounded-full border border-[rgba(59,130,246,0.22)] bg-[rgba(59,130,246,0.08)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#2563eb] dark:border-[rgba(96,165,250,0.22)] dark:bg-[rgba(59,130,246,0.14)] dark:text-[#93c5fd]">
                  {t(copy.mostPopular)}
                </span>
              ) : null}

              <div className="flex min-h-[220px] flex-col">
                <div>
                  <h3 className="text-2xl font-semibold text-slate-950 dark:text-white">{plan.label}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">{t(ui.audience)}</p>
                </div>

                <div className="mt-auto space-y-1 pt-5">
                  {monthly == null ? (
                    <div className={customPriceClass}>
                      {t(copy.customPricing)}
                    </div>
                  ) : billing === "monthly" ? (
                    <>
                      <div className="whitespace-nowrap text-4xl font-semibold tracking-tight text-slate-950 dark:text-white">
                        {formatUsd(monthly, locale)}
                        <span className="ml-1 text-base font-medium text-slate-500 dark:text-slate-400">{t(copy.perMonth)}</span>
                      </div>
                      <p className="whitespace-nowrap text-sm text-slate-500 dark:text-slate-400">
                        {t(copy.billedMonthly)}
                      </p>
                    </>
                  ) : (
                    <>
                      <div className="whitespace-nowrap text-4xl font-semibold tracking-tight text-slate-950 dark:text-white">
                        {formatUsd(Math.round((yearlyPrice || 0) / 12), locale)}
                        <span className="ml-1 text-base font-medium text-slate-500 dark:text-slate-400">{t(copy.perMonth)}</span>
                      </div>
                      <p className="whitespace-nowrap text-sm text-slate-500 dark:text-slate-400">
                        {t(copy.billedAnnuallyAt)} {formatUsd(yearlyPrice || 0, locale)}
                      </p>
                    </>
                  )}
                </div>
              </div>

              <div className="mt-6 h-px bg-slate-200 dark:bg-white/10" />

              <ul className="mt-6 space-y-3 text-sm text-slate-700 dark:text-slate-200">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2.5">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" style={{ color: featureIconColor }} />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>

              <Link href={ui.href} className="mt-auto pt-6">
                <Button className={`h-12 w-full rounded-xl text-base font-semibold ${ui.button}`}>
                  {t(ui.cta)}
                </Button>
              </Link>
            </div>
          );
        })}
      </div>
    </section>
  );
}
