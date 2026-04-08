"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { usePricingCurrency } from "@/components/providers/pricing-currency-provider";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/components/providers/language-provider";
import { LANGUAGE_LOCALES, type LocalizedText } from "@/lib/i18n";
import { normalizeCurrency } from "@/lib/payments/currency-allowlist";
import { roundPricingDisplayAmount } from "@/lib/pricing-rounding";

type PlanRecord = {
  plan: string;
  label: string;
  usd?: number | null;
  features: string[];
};

const copy = {
  sectionTitle: {
    en: "Stop Chasing Payments Across Inboxes and Spreadsheets",
    fr: "Arretez de courir après les paiements entre boites mail et feuilles de calcul",
    de: "Jagen Sie Zahlungen nicht langer zwischen Postfaechern und Tabellen hinterher",
    es: "Deja de perseguir pagos entre bandejas de entrada y hojas de calculo",
    pt: "Deixe de perseguir pagamentos entre caixas de entrada e folhas de calculo",
  } satisfies LocalizedText,
  sectionSubtitle: {
    en: "Maboria brings invoicing, payment follow-ups, automation, and team inbox operations into one workspace so your team moves faster and misses less revenue.",
    fr: "Maboria regroupe la facturation, les relances de paiement, l'automatisation et les opérations de boîte d'équipe dans un seul espace afin que votre équipe avance plus vite et laisse passer moins de revenus.",
    de: "Maboria vereint Rechnungsstellung, Zahlungsnachverfolgung, Automatisierung und Team-Postfachprozesse in einem Workspace, damit Ihr Team schneller arbeitet und weniger Umsatz liegen laesst.",
    es: "Maboria integra facturación, seguimientos de pago, automatización y operaciónes de bandeja del equipo en un solo espacio para que tu equipo avance más rápido y deje escapar menos ingresos.",
    pt: "A Maboria junta faturação, seguimentos de pagamento, automação e operações de caixa da equipa num unico espaço para que a sua equipa avance mais depressa e perca menos receita.",
  } satisfies LocalizedText,
  ownConnections: {
    en: "Connect your existing Gmail, Outlook, and WhatsApp channels in minutes.",
    fr: "Connectez vos canaux Gmail, Outlook et WhatsApp existants en quelques minutes.",
    de: "Verbinden Sie Ihre bestehenden Gmail-, Outlook- und WhatsApp-Kanaele in wenigen Minuten.",
    es: "Conecta tus canales existentes de Gmail, Outlook y WhatsApp en minutos.",
    pt: "Ligue os seus canais existentes de Gmail, Outlook e WhatsApp em minutos.",
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
    de: "Jährlich",
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
    es: "Más popular",
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
    de: "/Monat bei jährlicher Zahlung",
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
    de: "jährlich berechnet zu",
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
  checkoutSupported: {
    en: "Shown currencies are supported at checkout.",
    fr: "Les devises affichees sont prises en charge au paiement.",
    de: "Die angezeigten Währungen werden beim Checkout unterstützt.",
    es: "Las monedas mostradas son compatibles en el checkout.",
    pt: "As moedas mostradas sao suportadas no checkout.",
  } satisfies LocalizedText,
  currency: {
    en: "Currency",
    fr: "Devise",
    de: "Währung",
    es: "Moneda",
    pt: "Moeda",
  } satisfies LocalizedText,
};

const planLabelCopy: Record<string, LocalizedText> = {
  STARTER: { en: "Starter", fr: "Starter", de: "Starter", es: "Inicial", pt: "Inicial" },
  PRO: { en: "Pro", fr: "Pro", de: "Pro", es: "Pro", pt: "Pro" },
  GROWTH: { en: "Growth", fr: "Growth", de: "Growth", es: "Crecimiento", pt: "Crescimento" },
  BUSINESS: { en: "Business", fr: "Business", de: "Business", es: "Business", pt: "Business" },
  ENTERPRISE: {
    en: "Enterprise",
    fr: "Enterprise",
    de: "Enterprise",
    es: "Enterprise",
    pt: "Enterprise",
  },
};

const featureCopy: Record<string, LocalizedText> = {
  "1 workspace": {
    en: "1 workspace",
    fr: "1 espace de travail",
    de: "1 Workspace",
    es: "1 espacio de trabajo",
    pt: "1 espaço de trabalho",
  },
  "2 connections total": {
    en: "2 connections total",
    fr: "2 connexions au total",
    de: "2 Verbindungen insgesamt",
    es: "2 conexiónes en total",
    pt: "2 ligacoes no total",
  },
  "Unified inbox": {
    en: "Unified inbox",
    fr: "Boite de reception unifiee",
    de: "Vereinheitlichter Posteingang",
    es: "Bandeja unificada",
    pt: "Caixa de entrada unificada",
  },
  "Send invoices and track payments": {
    en: "Send invoices and track payments",
    fr: "Envoyer des factures et suivre les paiements",
    de: "Rechnungen senden und Zahlungen verfolgen",
    es: "Enviar facturas y seguir pagos",
    pt: "Enviar faturas e acompanhar pagamentos",
  },
  "Automated follow-ups": {
    en: "Automated follow-ups",
    fr: "Relances automatisees",
    de: "Automatisierte Nachfassaktionen",
    es: "Seguimientos automatizados",
    pt: "Seguimentos automatizados",
  },
  "Basic workflows": {
    en: "Basic workflows",
    fr: "Workflows de base",
    de: "Grundlegende Workflows",
    es: "Flujos basicos",
    pt: "Fluxos basicos",
  },
  "AI assistant": {
    en: "AI assistant",
    fr: "Assistant IA",
    de: "KI-Assistent",
    es: "Asistente de IA",
    pt: "Assistente de IA",
  },
  "1 seat": {
    en: "1 seat",
    fr: "1 siege",
    de: "1 Sitzplatz",
    es: "1 asiento",
    pt: "1 utilizador",
  },
  "Up to 8 connections": {
    en: "Up to 8 connections",
    fr: "Jusqu a 8 connexions",
    de: "Bis zu 8 Verbindungen",
    es: "Hasta 8 conexiónes",
    pt: "Até 8 ligacoes",
  },
  "Shared inbox": {
    en: "Shared inbox",
    fr: "Boite de reception partagee",
    de: "Gemeinsamer Posteingang",
    es: "Bandeja compartida",
    pt: "Caixa de entrada partilhada",
  },
  "Smart automation workflows": {
    en: "Smart automation workflows",
    fr: "Workflows d'automatisation intelligents",
    de: "Intelligente Automatisierungs-Workflows",
    es: "Flujos de automatización inteligentes",
    pt: "Fluxos de automação inteligentes",
  },
  "AI-powered replies": {
    en: "AI-powered replies",
    fr: "Réponses assistees par IA",
    de: "KI-gestützte Antworten",
    es: "Respuestas con IA",
    pt: "Respostas com IA",
  },
  "Payment tracking": {
    en: "Payment tracking",
    fr: "Suivi des paiements",
    de: "Zahlungsverfolgung",
    es: "Seguimiento de pagos",
    pt: "Acompanhamento de pagamentos",
  },
  Exports: {
    en: "Exports",
    fr: "Exports",
    de: "Exporte",
    es: "Exportaciones",
    pt: "Exportacoes",
  },
  "Role-based access": {
    en: "Role-based access",
    fr: "Accès base sur les rôles",
    de: "Rollenbasierter Zugriff",
    es: "Acceso por roles",
    pt: "Acesso por perfis",
  },
  "3 seats": {
    en: "3 seats",
    fr: "3 sieges",
    de: "3 Sitzplatze",
    es: "3 asientos",
    pt: "3 utilizadores",
  },
  "Up to 20 connections": {
    en: "Up to 20 connections",
    fr: "Jusqu a 20 connexions",
    de: "Bis zu 20 Verbindungen",
    es: "Hasta 20 conexiónes",
    pt: "Até 20 ligacoes",
  },
  "Multiple connected inboxes": {
    en: "Multiple connected inboxes",
    fr: "Plusieurs boites connectees",
    de: "Mehrere verbundene Posteingänge",
    es: "Multiples bandejas conectadas",
    pt: "Varias caixas ligadas",
  },
  "Advanced routing and assignment": {
    en: "Advanced routing and assignment",
    fr: "Routage et attribution avances",
    de: "Erweitertes Routing und Zuweisung",
    es: "Enrutamiento y asignacion avanzados",
    pt: "Encaminhamento e atribuicao avancados",
  },
  "Reporting and team visibility": {
    en: "Reporting and team visibility",
    fr: "Reporting et visibilite d équipe",
    de: "Berichte und Team-Transparenz",
    es: "Reportes y visibilidad del equipo",
    pt: "Relatórios e visibilidade da equipa",
  },
  "Longer history retention": {
    en: "Longer history retention",
    fr: "Historique conserve plus longtemps",
    de: "Langere Verlaufsspeicherung",
    es: "Retención historica más larga",
    pt: "Retenção de histórico mais longa",
  },
  "Priority support": {
    en: "Priority support",
    fr: "Support prioritaire",
    de: "Priorisierter Support",
    es: "Soporte prioritario",
    pt: "Suporte prioritario",
  },
  "Up to 8 seats": {
    en: "Up to 8 seats",
    fr: "Jusqu a 8 sieges",
    de: "Bis zu 8 Sitzplatze",
    es: "Hasta 8 asientos",
    pt: "Até 8 utilizadores",
  },
  "Unlimited connections": {
    en: "Unlimited connections",
    fr: "Connexions illimitees",
    de: "Unbegrenzte Verbindungen",
    es: "Conexiónes ilimitadas",
    pt: "Ligacoes ilimitadas",
  },
  "Advanced inbox operations": {
    en: "Advanced inbox operations",
    fr: "Operations avancees de boite de reception",
    de: "Erweiterte Postfach-Operationen",
    es: "Operaciones avanzadas de bandeja",
    pt: "Operações avancadas de caixa de entrada",
  },
  "Roles and permissions": {
    en: "Roles and permissions",
    fr: "Roles et permissions",
    de: "Rollen und Berechtigungen",
    es: "Roles y permisos",
    pt: "Papeis e permissoes",
  },
  "Audit logs": {
    en: "Audit logs",
    fr: "Journaux d audit",
    de: "Audit-Protokolle",
    es: "Registros de auditoria",
    pt: "Registos de auditoria",
  },
  "Admin controls": {
    en: "Admin controls",
    fr: "Controles administrateur",
    de: "Admin-Steuerungen",
    es: "Controles administrativos",
    pt: "Controlos administrativos",
  },
  "Advanced reporting": {
    en: "Advanced reporting",
    fr: "Reporting avance",
    de: "Erweiterte Berichte",
    es: "Reportes avanzados",
    pt: "Relatórios avancados",
  },
  "Compliance and e-invoicing support": {
    en: "Compliance and e-invoicing support",
    fr: "Conformité et prise en charge de la facturation electronique",
    de: "Compliance- und E-Rechnungs-Unterstützung",
    es: "Cumplimiento y soporte de facturación electronica",
    pt: "Conformidade e suporte a faturação eletronica",
  },
  "Onboarding assistance": {
    en: "Onboarding assistance",
    fr: "Assistance a l onboarding",
    de: "Unterstützung beim Onboarding",
    es: "Asistencia de incorporación",
    pt: "Apoio ao onboarding",
  },
  "Up to 15 seats": {
    en: "Up to 15 seats",
    fr: "Jusqu a 15 sieges",
    de: "Bis zu 15 Sitzplatze",
    es: "Hasta 15 asientos",
    pt: "Até 15 utilizadores",
  },
  "Custom throughput": {
    en: "Custom throughput",
    fr: "Capacite personnalisee",
    de: "Individueller Durchsatz",
    es: "Capacidad personalizada",
    pt: "Capacidade personalizada",
  },
  "SLA guarantee": {
    en: "SLA guarantee",
    fr: "Garantie SLA",
    de: "SLA-Garantie",
    es: "Garantia de SLA",
    pt: "Garantia de SLA",
  },
  "Custom integrations": {
    en: "Custom integrations",
    fr: "Integrations sur mesure",
    de: "Individuelle Integrationen",
    es: "Integraciónes personalizadas",
    pt: "Integrações personalizadas",
  },
  "Dedicated support": {
    en: "Dedicated support",
    fr: "Support dedie",
    de: "Dedizierter Support",
    es: "Soporte dedicado",
    pt: "Suporte dedicado",
  },
  "Compliance rollout assistance": {
    en: "Compliance rollout assistance",
    fr: "Accompagnement au deploiement de la conformité",
    de: "Unterstützung beim Compliance-Rollout",
    es: "Apoyo para el despliegue de cumplimiento",
    pt: "Apoio na implementacao de conformidade",
  },
  "Negotiated limits and controls": {
    en: "Negotiated limits and controls",
    fr: "Limites et controles negocies",
    de: "Verhandelte Limits und Kontrollen",
    es: "Limites y controles negociados",
    pt: "Limites e controlos negociados",
  },
  "Custom seat volume": {
    en: "Custom seat volume",
    fr: "Volume de sieges personnalise",
    de: "Individuelles Sitzplatzvolumen",
    es: "Volumen de asientos personalizado",
    pt: "Volume personalizado de utilizadores",
  },
};

function duplicateEnglish(value: string): LocalizedText {
  return { en: value, fr: value, de: value, es: value, pt: value };
}

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
      de: "Für Einzelunternehmer, die Abrechnung und Nachfassaktionen in den Griff bekommen wollen.",
      es: "Para operadores en solitario que quieren ordenar facturación y seguimientos.",
      pt: "Para operadores individuais que querem organizar faturação e seguimentos.",
    },
    cta: {
      en: "Get Starter",
      fr: "Choisir Starter",
      de: "Starter wählen",
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
      fr: "Pour les petites équipes qui gèrent ensemble communication client et operations.",
      de: "Für kleine Teams, die Kundenkommunikation und Tagesgeschaeft gemeinsam steuern.",
      es: "Para pequenos equipos que gestionan juntos comunicacion con clientes y operaciónes diarias.",
      pt: "Para pequenas equipas que gerem juntas a comunicacao com clientes e a operacao diaria.",
    },
    cta: {
      en: "Get Pro",
      fr: "Choisir Pro",
      de: "Pro wählen",
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
      fr: "Pour les équipes en croissance qui ont besoin de structure et de visibilite.",
      de: "Für wachsende Teams, die Struktur, Tempo und Transparenz brauchen.",
      es: "Para equipos en crecimiento que necesitan estructura, rapidez y visibilidad.",
      pt: "Para equipas em crescimento que precisam de estrutura, velocidade e visibilidade.",
    },
    cta: {
      en: "Get Growth",
      fr: "Choisir Growth",
      de: "Growth wählen",
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
      de: "Für Unternehmen, die Kontrolle, Nachvollziehbarkeit und operative Aufsicht brauchen.",
      es: "Para empresas que necesitan control, responsabilidad y supervision operativa.",
      pt: "Para empresas que precisam de controlo, responsabilidade e supervisao operaciónal.",
    },
    cta: {
      en: "Get Business",
      fr: "Choisir Business",
      de: "Business wählen",
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
      de: "Für Organisationen mit individuellen Workflows, Kontrollen und Rollout-Anforderungen.",
      es: "Para organizaciones con flujos, controles y necesidades de despliegue personalizados.",
      pt: "Para organizações com fluxos, controlos e necessidades de rollout personalizadas.",
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

export function PricingSection({ plans }: { plans: PlanRecord[] }) {
  const { language, t } = useLanguage();
  const { currency, currencyOptions, priceBook, setCurrency } = usePricingCurrency();
  const [billing, setBilling] = useState<"monthly" | "yearly">("monthly");
  const locale = LANGUAGE_LOCALES[language];
  const normalizedCurrency = normalizeCurrency(currency);
  const formatPlanAmount = (value: number) =>
    new Intl.NumberFormat(locale, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(roundPricingDisplayAmount(value));
  const currencyMarker = (() => {
    try {
      const parts = new Intl.NumberFormat(locale, {
        style: "currency",
        currency: normalizedCurrency,
        currencyDisplay: "narrowSymbol",
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }).formatToParts(1);
      return parts.find((part) => part.type === "currency")?.value?.trim() || normalizedCurrency;
    } catch {
      return normalizedCurrency;
    }
  })();
  const formatPlanTotal = (value: number) =>
    `${currencyMarker}${formatPlanAmount(value)}`;
  const resolvedPlans = useMemo(
    () =>
      plans.map((plan) => {
        const ui = planUi[plan.plan] ?? planUi.STARTER;
        const priceEntry = priceBook[currency]?.[plan.plan] || null;
        const monthly = plan.plan === "ENTERPRISE" ? null : priceEntry?.monthly ?? null;
        const yearlyPrice = plan.plan === "ENTERPRISE" ? null : priceEntry?.yearly ?? null;
        const isPopular = plan.plan === "PRO";
        const featureIconColor = plan.plan === "ENTERPRISE" ? "#64748b" : ui.accent;
        const customPriceClass =
          plan.plan === "ENTERPRISE"
            ? "text-lg font-semibold leading-tight tracking-tight text-slate-950 dark:text-white sm:text-xl xl:text-2xl"
            : "text-3xl font-semibold tracking-tight text-slate-950 dark:text-white xl:text-4xl";
        const localizedLabel = t(planLabelCopy[plan.plan] ?? duplicateEnglish(plan.label));
        const localizedFeatures = plan.features.map((feature) =>
          t(featureCopy[feature] ?? duplicateEnglish(feature))
        );
        const href =
          plan.plan === "ENTERPRISE"
            ? ui.href
            : (() => {
                const [pathname, query = ""] = ui.href.split("?");
                const params = new URLSearchParams(query);
                params.set("currency", currency);
                params.set("interval", billing);
                return `${pathname}?${params.toString()}`;
              })();

        return {
          ...plan,
          ui,
          monthly,
          yearlyPrice,
          isPopular,
          featureIconColor,
          customPriceClass,
          localizedLabel,
          localizedFeatures,
          href,
        };
      }),
    [billing, currency, plans, priceBook, t]
  );

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
        <div className="flex flex-wrap items-center justify-center gap-3">
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
          <label className="sr-only" htmlFor="pricing-currency">
            {t(copy.currency)}
          </label>
          <div className="rounded-full border border-slate-200 bg-white px-3 py-1.5 shadow-sm dark:border-white/10 dark:bg-slate-900/70 dark:shadow-[0_16px_40px_rgba(2,6,23,0.32)]">
            <select
              id="pricing-currency"
              value={currency}
              onChange={(event) => setCurrency(event.target.value)}
              className="bg-transparent pr-6 text-sm font-semibold text-slate-700 outline-none dark:text-slate-200"
            >
              {currencyOptions.map((option) => (
                <option key={option.code} value={option.code}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {t(copy.checkoutSupported)}
        </p>
      </div>

      <div className="mx-auto grid max-w-[1840px] gap-5 lg:grid-cols-2 xl:grid-cols-4 min-[1750px]:grid-cols-5">
        {resolvedPlans.map((plan) => {
          const {
            ui,
            monthly,
            yearlyPrice,
            isPopular,
            featureIconColor,
            customPriceClass,
            localizedLabel,
            localizedFeatures,
            href,
          } = plan;
          return (
            <div
              key={plan.plan}
              className={`relative flex h-full min-h-[560px] flex-col rounded-2xl border bg-white p-5 shadow-[0_14px_32px_rgba(15,23,42,0.08)] transition duration-200 hover:-translate-y-1 hover:shadow-[0_24px_46px_rgba(15,23,42,0.12)] dark:bg-slate-950/72 dark:shadow-[0_22px_48px_rgba(2,6,23,0.4)] dark:backdrop-blur ${ui.border} ${
                isPopular
                  ? "ring-2 ring-[rgba(59,130,246,0.2)] shadow-[0_22px_48px_rgba(59,130,246,0.16)] dark:ring-[rgba(96,165,250,0.18)] dark:shadow-[0_22px_44px_rgba(2,6,23,0.44)]"
                  : ""
              }`}
            >
              <div className="flex min-h-[220px] flex-col">
                <div className="flex min-h-9 items-start justify-end">
                  {isPopular ? (
                    <span className="inline-flex max-w-full rounded-full border border-[rgba(59,130,246,0.22)] bg-[rgba(59,130,246,0.08)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#2563eb] dark:border-[rgba(96,165,250,0.22)] dark:bg-[rgba(59,130,246,0.14)] dark:text-[#93c5fd]">
                      {t(copy.mostPopular)}
                    </span>
                  ) : null}
                </div>

                <div className="mt-3">
                  <h3 className="text-2xl font-semibold text-slate-950 dark:text-white">{localizedLabel}</h3>
                  <p className="mt-2 h-[4.5rem] overflow-hidden text-sm leading-6 text-slate-600 [-webkit-box-orient:vertical] [-webkit-line-clamp:3] [display:-webkit-box] dark:text-slate-300">
                    {t(ui.audience)}
                  </p>
                </div>

                <div className="space-y-1 pt-4">
                  {monthly == null ? (
                    <div className={customPriceClass}>
                      {t(copy.customPricing)}
                    </div>
                  ) : billing === "monthly" ? (
                    <>
                      <div className="flex min-w-0 items-end gap-1 text-slate-950 dark:text-white">
                        <span className="shrink-0 text-[clamp(1.6rem,2vw,2.4rem)] font-semibold leading-none tracking-tight text-slate-800 dark:text-slate-100">
                          {currencyMarker}
                        </span>
                        <span className="min-w-0 whitespace-nowrap text-[clamp(2rem,2.3vw,3rem)] font-semibold leading-none tracking-tight tabular-nums">
                          {formatPlanAmount(monthly)}
                        </span>
                        <span className="shrink-0 pb-1 text-base font-medium leading-none text-slate-500 dark:text-slate-400">
                          {t(copy.perMonth)}
                        </span>
                      </div>
                      <p className="text-sm leading-5 text-slate-500 dark:text-slate-400">
                        {t(copy.billedMonthly)}
                      </p>
                    </>
                  ) : (
                    <>
                      <div className="flex min-w-0 items-end gap-1 text-slate-950 dark:text-white">
                        <span className="shrink-0 text-[clamp(1.6rem,2vw,2.4rem)] font-semibold leading-none tracking-tight text-slate-800 dark:text-slate-100">
                          {currencyMarker}
                        </span>
                        <span className="min-w-0 whitespace-nowrap text-[clamp(2rem,2.3vw,3rem)] font-semibold leading-none tracking-tight tabular-nums">
                          {formatPlanAmount((yearlyPrice || 0) / 12)}
                        </span>
                        <span className="shrink-0 pb-1 text-base font-medium leading-none text-slate-500 dark:text-slate-400">
                          {t(copy.perMonth)}
                        </span>
                      </div>
                      <p className="text-sm leading-5 text-slate-500 dark:text-slate-400">
                        {t(copy.billedAnnuallyAt)} {formatPlanTotal(yearlyPrice || 0)}
                      </p>
                    </>
                  )}
                </div>
              </div>

              <div className="mt-6 h-px bg-slate-200 dark:bg-white/10" />

              <ul className="mt-6 flex-1 space-y-3 text-sm text-slate-700 dark:text-slate-200">
                {localizedFeatures.map((feature) => (
                  <li key={feature} className="flex items-start gap-2.5">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" style={{ color: featureIconColor }} />
                    <span className="text-pretty">{feature}</span>
                  </li>
                ))}
              </ul>

              <Link href={href} className="mt-auto pt-6">
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
