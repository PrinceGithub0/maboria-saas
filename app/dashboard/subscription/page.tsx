"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import useSWRInfinite from "swr/infinite";
import { ArrowUpRight, ReceiptText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { TransientAlert } from "@/components/ui/transient-alert";
import { useLanguage } from "@/components/providers/language-provider";
import { billingEmail, billingMailto } from "@/lib/billing/contact";
import { getScheduledDowngradeTargets } from "@/lib/subscription-downgrade-rules";
import { LANGUAGE_LOCALES, type LocalizedText } from "@/lib/i18n";

type SubscriptionRow = {
  id: string;
  plan: string;
  status: string;
  renewalDate: string;
  billingInterval?: string | null;
  interval?: string | null;
  autoRenew?: boolean | null;
  cancelAtPeriodEnd?: boolean | null;
  pendingPlan?: string | null;
  pendingEffectiveAt?: string | null;
  receiptUrl?: string | null;
};

type SubscriptionManagement = {
  provider: string | null;
  stateSource: "subscription" | "org_subscription" | "none";
  billingMode: "provider_portal" | "provider_external" | "unmanaged";
  portalPath: string | null;
  canManageAutoRenewInApp: boolean;
  canScheduleDowngradeInApp: boolean;
};

type SubscriptionSummaryResponse = {
  active: SubscriptionRow | null;
  hasReceipt: boolean;
  management: SubscriptionManagement;
  renewalAction?: {
    reference: string;
    status: string;
    redirectUrl: string | null;
  } | null;
};

type SubscriptionHistoryResponse = {
  items: SubscriptionRow[];
  pagination: {
    pageSize: number;
    hasMore: boolean;
    nextCursor: string | null;
  };
};

type MeResponse = {
  orgRole?: string | null;
};

const fetcher = async <T,>(url: string): Promise<T> => {
  const response = await fetch(url, { cache: "no-store" });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof payload?.error === "string" ? payload.error : `Request failed (${response.status})`);
  }
  return payload as T;
};

function formatSubscriptionDate(value: Date | string | null | undefined, locale: string) {
  if (!value) return "--";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function localizeSubscriptionServerMessage(
  message: string,
  t: ReturnType<typeof useLanguage>["t"]
) {
  const normalized = String(message || "").trim();
  if (!normalized) return "";
  if (/^Request failed \(\d+\)$/.test(normalized)) {
    return t(
      "Request failed. Please try again.",
      "La requête a échoué. Veuillez réessayer.",
      "Die Anfrage ist fehlgeschlagen. Bitte versuche es erneut.",
      "La solicitud fallo. Intentalo de nuevo.",
      "O pedido falhou. Tente novamente."
    );
  }

  const translations: Record<string, string> = {
    Unauthorized: t("Unauthorized.", "Non autorise.", "Nicht autorisiert.", "No autorizado.", "Não autorizado."),
    "Organization access denied.": t(
      "Organization access denied.",
      "Accès à l'organisation refuse.",
      "Zugriff auf die Organisation verweigert.",
      "Acceso a la organización denegado.",
      "Acesso a organização negado."
    ),
    "Organization not found": t(
      "Organization not found.",
      "Organisation introuvable.",
      "Organisation nicht gefunden.",
      "Organización no encontrada.",
      "Organização não encontrada."
    ),
    "Organization access has been disabled.": t(
      "Organization access has been disabled.",
      "L accès à l'organisation a ?t? desactive.",
      "Der Zugriff auf die Organisation wurde deaktiviert.",
      "El acceso a la organización ha sido desactivado.",
      "O acesso a organização foi desativado."
    ),
    "Organization access is suspended.": t(
      "Organization access is suspended.",
      "L accès à l'organisation est suspendu.",
      "Der Zugriff auf die Organisation ist ausgesetzt.",
      "El acceso a la organización esta suspendido.",
      "O acesso a organização esta suspenso."
    ),
    "Organization subscription inactive. Please renew billing.": t(
      "Organization subscription is inactive. Please renew billing.",
      "L abonnement de l'organisation est inactif. Veuillez renouveler la facturation.",
      "Das Abonnement der Organisation ist inaktiv. Bitte erneuere die Abrechnung.",
      "La suscripción de la organización esta inactiva. Renueva la facturación.",
      "A subscrição da organização esta inativa. Renove a faturação."
    ),
    "Organization subscription inactive. Please contact the organization owner.": t(
      "Organization subscription is inactive. Please contact the organization owner.",
      "L abonnement de l'organisation est inactif. Contactez le proprietaire de l'organisation.",
      "Das Abonnement der Organisation ist inaktiv. Bitte kontaktiere den Eigentümer der Organisation.",
      "La suscripción de la organización esta inactiva. Ponte en contacto con el propietario de la organización.",
      "A subscrição da organização esta inativa. Contacte o proprietário da organização."
    ),
    "You do not have permission for this action.": t(
      "You do not have permission for this action.",
      "Vous n'avez pas l autorisation pour cette action.",
      "Du hast keine Berechtigung für diese Aktion.",
      "No tienes permiso para esta acción.",
      "Não tem permissao para esta ação."
    ),
    "Payments are currently disabled.": t(
      "Payments are currently disabled.",
      "Les paiements sont actuellement desactives.",
      "Zahlungen sind derzeit deaktiviert.",
      "Los pagos estan desactivados en este momento.",
      "Os pagamentos estão desativados neste momento."
    ),
    "Subscription not found.": t(
      "Subscription not found.",
      "Abonnement introuvable.",
      "Abonnement nicht gefunden.",
      "Suscripción no encontrada.",
      "Subscrição não encontrada."
    ),
    "No active subscription was found.": t(
      "No active subscription was found.",
      "Aucun abonnement actif n'a ?t? trouve.",
      "Es wurde kein aktives Abonnement gefunden.",
      "No se encontro ninguna suscripción activa.",
      "Não foi encontrada nenhuma subscrição ativa."
    ),
    "No active subscription was found for downgrade scheduling.": t(
      "No active subscription was found for downgrade scheduling.",
      "Aucun abonnement actif n'a ?t? trouve pour planifier le downgrade.",
      "Es wurde kein aktives Abonnement für die Planung eines Downgrades gefunden.",
      "No se encontro ninguna suscripción activa para programar el downgrade.",
      "Não foi encontrada nenhuma subscrição ativa para agendar o downgrade."
    ),
    "We could not determine your current billing period end.": t(
      "We could not determine your current billing period end.",
      "Nous n'avons pas pu determiner la fin de votre periode de facturation actuelle.",
      "Das Ende deines aktuellen Abrechnungszeitraums konnte nicht ermittelt werden.",
      "No pudimos determinar el final de tu periodo de facturación actual.",
      "Não foi possivel determinar o fim do seu periodo de faturação atual."
    ),
    "Downgrade request failed.": t(
      "Downgrade request failed.",
      "La demande de downgrade a échoué.",
      "Die Downgrade-Anfrage ist fehlgeschlagen.",
      "La solicitud de downgrade fallo.",
      "O pedido de downgrade falhou."
    ),
    "Unable to cancel the pending downgrade.": t(
      "Unable to cancel the pending downgrade.",
      "Impossible d annuler le downgrade en attente.",
      "Das ausstehende Downgrade konnte nicht storniert werden.",
      "No se pudo cancelar el downgrade pendiente.",
      "Não foi possivel cancelar o downgrade pendente."
    ),
    "Unable to schedule downgrade.": t(
      "Unable to schedule downgrade.",
      "Impossible de planifier le downgrade.",
      "Das Downgrade konnte nicht geplant werden.",
      "No se pudo programar el downgrade.",
      "Não foi possivel agendar o downgrade."
    ),
    "Only lower-tier plans can be scheduled as downgrades.": t(
      "Only lower-tier plans can be scheduled as downgrades.",
      "Seuls les plans inferieurs peuvent être planifies comme downgrades.",
      "Nur niedrigere Tarifstufen können als Downgrades geplant werden.",
      "Solo los planes de nivel inferior pueden programarse como downgrades.",
      "Apenas planos de nivel inferior podem ser agendados como downgrades."
    ),
    "That downgrade is already scheduled for your next billing cycle.": t(
      "That downgrade is already scheduled for your next billing cycle.",
      "Ce downgrade est déjà planifie pour votre prochain cycle de facturation.",
      "Dieses Downgrade ist bereits für deinen nächsten Abrechnungszyklus geplant.",
      "Ese downgrade ya esta programado para tu próximo ciclo de facturación.",
      "Esse downgrade ja esta agendado para o seu próximo ciclo de faturação."
    ),
    "There is no scheduled downgrade to cancel.": t(
      "There is no scheduled downgrade to cancel.",
      "Il n y a aucun downgrade planifie a annuler.",
      "Es gibt kein geplantes Downgrade zum Stornieren.",
      "No hay ningun downgrade programado para cancelar.",
      "Não existe nenhum downgrade agendado para cancelar."
    ),
    "Unable to open billing portal.": t(
      "Unable to open billing portal.",
      "Impossible d ouvrir le portail de facturation.",
      "Das Abrechnungsportal konnte nicht geöffnet werden.",
      "No se pudo abrir el portal de facturación.",
      "Não foi possivel abrir o portal de faturação."
    ),
    "Billing portal is unavailable right now.": t(
      "Billing portal is unavailable right now.",
      "Le portail de facturation est indisponible pour le moment.",
      "Das Abrechnungsportal ist derzeit nicht verfügbar.",
      "El portal de facturación no esta disponible en este momento.",
      "O portal de faturação não esta disponível neste momento."
    ),
    "Unable to update auto-renew.": t(
      "Unable to update auto-renew.",
      "Impossible de mettre a jour le renouvellement auto.",
      "Die automatische Verlängerung konnte nicht aktualisiert werden.",
      "No se pudo actualizar la renovacion automatica.",
      "Não foi possivel atualizar a renovacao automatica."
    ),
    "Manage auto-renew in the Stripe billing portal.": t(
      "Manage auto-renew in the Stripe billing portal.",
      "Gerez le renouvellement auto dans le portail de facturation Stripe.",
      "Verwalte die automatische Verlängerung im Stripe-Abrechnungsportal.",
      "Gestiona la renovacion automatica en el portal de facturación de Stripe.",
      "Gere a renovacao automatica no portal de faturação Stripe."
    ),
    "Manage plan changes in the Stripe billing portal.": t(
      "Manage plan changes in the Stripe billing portal.",
      "Gerez les changements de plan dans le portail de facturation Stripe.",
      "Verwalte Planänderungen im Stripe-Abrechnungsportal.",
      "Gestiona los cambios de plan en el portal de facturación de Stripe.",
      "Gere alteracoes do plano no portal de faturação Stripe."
    ),
    "Auto-renew changes for this billing provider are not self-serve in the dashboard yet.": t(
      "Auto-renew changes for this billing provider are not self-serve in the dashboard yet.",
      "Les changements de renouvellement auto pour ce fournisseur ne sont pas encore disponibles en libre-service dans le tableau de bord.",
      "Änderungen der automatischen Verlängerung für diesen Anbieter sind im Dashboard noch nicht im Selbstbedienungsmodus verfügbar.",
      "Los cambios de renovacion automatica para este proveedor aún no estan disponibles desde el panel.",
      "As alteracoes da renovacao automatica para este fornecedor ainda não estão disponiveis no painel."
    ),
    "Plan downgrades for this billing provider are not self-serve in the dashboard yet.": t(
      "Plan downgrades for this billing provider are not self-serve in the dashboard yet.",
      "Les downgrades de plan pour ce fournisseur ne sont pas encore disponibles en libre-service dans le tableau de bord.",
      "Plan-Downgrades für diesen Anbieter sind im Dashboard noch nicht im Selbstbedienungsmodus verfügbar.",
      "Los downgrades de plan para este proveedor aún no estan disponibles desde el panel.",
      "Os downgrades de plano para este fornecedor ainda não estão disponiveis no painel."
    ),
    "Auto-renew is already turned off for the end of this billing period.": t(
      "Auto-renew is already turned off for the end of this billing period.",
      "Le renouvellement auto est déjà desactive pour la fin de cette periode de facturation.",
      "Die automatische Verlängerung ist für das Ende dieses Abrechnungszeitraums bereits deaktiviert.",
      "La renovacion automatica ya esta desactivada para el final de este periodo de facturación.",
      "A renovacao automatica ja esta desativada para o final deste periodo de faturação."
    ),
    "Auto-renew is already active for this subscription.": t(
      "Auto-renew is already active for this subscription.",
      "Le renouvellement auto est déjà actif pour cet abonnement.",
      "Die automatische Verlängerung ist für dieses Abonnement bereits aktiv.",
      "La renovacion automatica ya esta activa para esta suscripción.",
      "A renovacao automatica ja esta ativa para esta subscrição."
    ),
    "Unable to start renewal right now.": t(
      "Unable to start renewal right now.",
      "Impossible de lancer le renouvellement pour le moment.",
      "Die Verlängerung kann gerade nicht gestartet werden.",
      "No se pudo iniciar la renovacion en este momento.",
      "Não foi possivel iniciar a renovacao neste momento."
    ),
    "This renewal flow is not available for the current billing provider.": t(
      "This renewal flow is not available for the current billing provider.",
      "Ce flux de renouvellement n est pas disponible pour le fournisseur de facturation actuel.",
      "Dieser Verlängerungsablauf ist für den aktuellen Abrechnungsanbieter nicht verfügbar.",
      "Este flujo de renovacion no esta disponible para el proveedor de facturación actual.",
      "Este fluxo de renovacao não esta disponível para o fornecedor de faturação atual."
    ),
    "This subscription is not due for renewal yet.": t(
      "This subscription is not due for renewal yet.",
      "Cet abonnement n est pas encore arrive a renouvellement.",
      "Dieses Abonnement ist noch nicht zur Verlängerung fallig.",
      "Esta suscripción'aún no debe renovarse.",
      "Esta subscrição ainda não esta pronta para renovacao."
    ),
    "Auto-renew is turned off for this subscription.": t(
      "Auto-renew is turned off for this subscription.",
      "Le renouvellement auto est desactive pour cet abonnement.",
      "Die automatische Verlängerung ist für dieses Abonnement deaktiviert.",
      "La renovacion automatica esta desactivada para esta suscripción.",
      "A renovacao automatica esta desativada para esta subscrição."
    ),
    "This renewal amount could not be calculated safely.": t(
      "This renewal amount could not be calculated safely.",
      "Le montant du renouvellement n'a pas pu être calcule en toute sécurité.",
      "Der Verlängerungsbetrag konnte nicht sicher berechnet werden.",
      "No se pudo calcular con seguridad el importe de la renovacion.",
      "Não foi possivel calcular com seguranca o valor da renovacao."
    ),
    "A Flutterwave renewal attempt is already in progress.": t(
      "A Flutterwave renewal attempt is already in progress.",
      "Une tentative de renouvellement Flutterwave est déjà en cours.",
      "Ein Flutterwave-Verlängerungsversuch lauft bereits.",
      "Ya hay un intento de renovacion de Flutterwave en curso.",
      "Ja existe uma tentativa de renovacao da Flutterwave em curso."
    ),
    "No reusable Flutterwave payment method is stored for this workspace yet.": t(
      "No reusable Flutterwave payment method is stored for this workspace yet.",
      "Aucune methode de paiement Flutterwave reutilisable n est encore enregistree pour cet espace de travail.",
      "Für diesen Workspace ist noch keine wiederverwendbare Flutterwave-Zahlungsmethode gespeichert.",
      "Todavia no hay un método de pago reutilizable de Flutterwave guardado para este espacio de trabajo.",
      "Ainda não existe um método de pagamento reutilizavel da Flutterwave guardado para este espaco de trabalho."
    ),
    "Billing country is missing for this saved payment method.": t(
      "Billing country is missing for this saved payment method.",
      "Le pays de facturation manque pour cette methode de paiement enregistree.",
      "Das Abrechnungsland fehlt für diese gespeicherte Zahlungsmethode.",
      "Falta el pais de facturación para este método de pago guardado.",
      "Falta o pais de faturação para este método de pagamento guardado."
    ),
  };

  return translations[normalized] || normalized;
}

export default function SubscriptionPage() {
  const router = useRouter();
  const { language, t } = useLanguage();
  const locale = LANGUAGE_LOCALES[language];
  const { data: me } = useSWR<MeResponse>("/api/user/me", fetcher, {
    revalidateOnFocus: false,
  });
  const orgRole = String(me?.orgRole || "").toLowerCase();
  const canManageWorkspaceSubscription = orgRole === "owner" || orgRole === "billing_admin";
  const billingAccessResolved = me !== undefined;
  const {
    data: summaryData,
    error: summaryError,
    mutate: mutateSummary,
    isValidating: summaryValidating,
  } = useSWR<SubscriptionSummaryResponse>(
    billingAccessResolved && canManageWorkspaceSubscription ? "/api/subscription?scope=summary" : null,
    fetcher,
    {
    revalidateOnFocus: false,
    }
  );
  const getHistoryKey = (pageIndex: number, previousPageData: SubscriptionHistoryResponse | null) => {
    if (!billingAccessResolved || !canManageWorkspaceSubscription) return null;
    if (pageIndex > 0 && !previousPageData?.pagination?.nextCursor) return null;
    const params = new URLSearchParams();
    params.set("scope", "history");
    params.set("limit", "10");
    if (pageIndex > 0 && previousPageData?.pagination?.nextCursor) {
      params.set("cursor", previousPageData.pagination.nextCursor);
    }
    return `/api/subscription?${params.toString()}`;
  };
  const {
    data: historyPages,
    error: historyError,
    mutate: mutateHistory,
    isLoading: historyLoading,
    isValidating: historyValidating,
    setSize,
  } = useSWRInfinite<SubscriptionHistoryResponse>(getHistoryKey, fetcher, {
    revalidateFirstPage: true,
  });
  const isSummaryLoading = summaryData === undefined && !summaryError;
  const isHistoryLoading = historyPages === undefined && !historyError;
  const isLoading = isSummaryLoading || isHistoryLoading;
  const historyRows = useMemo(() => historyPages?.flatMap((page) => page.items) || [], [historyPages]);
  const accessError = summaryError?.message
    ? localizeSubscriptionServerMessage(summaryError.message, t)
    : null;
  const localizedHistoryError = historyError?.message
    ? localizeSubscriptionServerMessage(historyError.message, t)
    : null;
  const hasSummaryError = Boolean(summaryError && !summaryData);
  const hasHistoryError = Boolean(historyError && !historyPages);
  const [actionStatus, setActionStatus] = useState<{
    message: string;
    variant: "info" | "success" | "error";
  } | null>(null);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [downgradePlan, setDowngradePlan] = useState("STARTER");
  const [downgradeActionLoading, setDowngradeActionLoading] = useState(false);
  const [renewalActionLoading, setRenewalActionLoading] = useState(false);
  const [renewNowLoading, setRenewNowLoading] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);
  const hasMoreHistory = Boolean(historyPages?.[historyPages.length - 1]?.pagination?.hasMore);

  const formatPlan = (plan: string) => {
    switch ((plan || "").toUpperCase()) {
      case "STARTER":
        return t({ en: "Starter", fr: "Starter", de: "Starter", es: "Starter", pt: "Starter" });
      case "PRO":
        return t({ en: "Pro", fr: "Pro", de: "Pro", es: "Pro", pt: "Pro" });
      case "GROWTH":
        return t({ en: "Growth", fr: "Growth", de: "Growth", es: "Growth", pt: "Growth" });
      case "BUSINESS":
        return t({ en: "Business", fr: "Business", de: "Business", es: "Business", pt: "Business" });
      case "PREMIUM":
        return t({ en: "Business", fr: "Business", de: "Business", es: "Business", pt: "Business" });
      case "ENTERPRISE":
        return t({ en: "Enterprise", fr: "Entreprise", de: "Enterprise", es: "Enterprise", pt: "Enterprise" });
      default:
        return plan;
    }
  };

  const activeSub = summaryData?.active || null;
  const activeSubStatus = String(activeSub?.status || "").toUpperCase();
  const planKey = String(activeSub?.plan || "").toUpperCase();
  const currentPlan = activeSub?.plan
    ? formatPlan(activeSub.plan)
    : t("No active plan", "Aucun plan actif", "Kein aktiver Plan", "Sin plan activo", "Sem plano ativo");
  const hasReceipt = Boolean(summaryData?.hasReceipt);
  const management = summaryData?.management;
  const pendingPlan = activeSub?.pendingPlan ? String(activeSub.pendingPlan).toUpperCase() : null;
  const pendingEffectiveAt = activeSub?.pendingEffectiveAt ? new Date(activeSub.pendingEffectiveAt) : null;
  const downloadReceipt = () => {
    window.open("/api/subscription/receipt", "_blank", "noopener,noreferrer");
  };

  const formatProvider = (provider: string | null | undefined) => {
    const value = String(provider || "").toUpperCase();
    if (value === "PAYSTACK") return "Paystack";
    if (value === "FLUTTERWAVE") return "Flutterwave";
    if (value === "STRIPE") return "Stripe";
    return provider || t("billing provider", "fournisseur de facturation", "Abrechnungsanbieter", "proveedor de facturación", "fornecedor de faturação");
  };

  const planDescriptions: Record<string, LocalizedText> = {
    STARTER: {
      en: "Designed for individuals getting started with automations.",
      fr: "Concu pour les individus qui demarrent avec les automatisations.",
      de: "Konzipiert für Einzelpersonen, die mit Automatisierungen starten.",
      es: "Disenado para personas que empiezan con automatizaciones.",
      pt: "Concebido para pessoas que estão a comecar com automatizacoes.",
    },
    PRO: {
      en: "Built for professionals running active workflows.",
      fr: "Concu pour les professionnels avec des workflows actifs.",
      de: "Für Fachleute mit aktiven Workflows entwickelt.",
      es: "Creado para profesionales que ejecutan flujos activos.",
      pt: "Criado para profissionais com fluxos de trabalho ativos.",
    },
    GROWTH: {
      en: "Optimized for scaling teams and higher execution volume.",
      fr: "Optimise pour les équipes en croissance et volume élevé.",
      de: "Optimiert für wachsende Teams und hoheres Ausfuhrungsvolumen.",
      es: "Optimizado para equipos en crecimiento y mayor volumen de ejecucion.",
      pt: "Otimizado para equipas em crescimento e maior volume de execucao.",
    },
    BUSINESS: {
      en: "Optimized for scaling teams and higher execution volume.",
      fr: "Optimise pour les équipes en croissance et volume élevé.",
      de: "Optimiert für wachsende Teams und hoheres Ausfuhrungsvolumen.",
      es: "Optimizado para equipos en crecimiento y mayor volumen de ejecucion.",
      pt: "Otimizado para equipas em crescimento e maior volume de execucao.",
    },
    ENTERPRISE: {
      en: "Built for organizations running production workloads.",
      fr: "Concu pour les organisations avec charges de production.",
      de: "Für Organisationen mit produktiven Workloads entwickelt.",
      es: "Creado para organizaciones con cargas de trabajo de producción.",
      pt: "Criado para organizações com cargas de produção.",
    },
  };

  const resolveInterval = (sub: any) => {
    const raw = String(sub?.billingInterval || sub?.interval || sub?.cadence || "").toLowerCase();
    if (raw.includes("year")) return t("Yearly", "Annuel", "Jährlich", "Anual", "Anual");
    if (raw.includes("month")) return t("Monthly", "Mensuel", "Monatlich", "Mensual", "Mensal");
    return t("Monthly", "Mensuel", "Monatlich", "Mensual", "Mensal");
  };

  const resolveBillingStatus = (sub: any) => {
    const status = String(sub?.status || "").toUpperCase();
    if (status === "ACTIVE") return t("Active", "Actif", "Aktiv", "Activo", "Ativo");
    if (status === "PAST_DUE") return t("Past due", "En retard", "überfällig", "Vencido", "Em atraso");
    if (status === "TRIALING") return t("Trial", "Essai", "Testphase", "Prueba", "Teste");
    if (status === "CANCELED") return t("Canceled", "Annule", "Gekundigt", "Cancelado", "Cancelado");
    return t("Inactive", "Inactif", "Inaktiv", "Inactivo", "Inativo");
  };

  const resolveBillingStatusDotClass = (sub: any) => {
    const status = String(sub?.status || "").toUpperCase();
    if (status === "ACTIVE") return "bg-emerald-500";
    if (status === "PAST_DUE") return "bg-amber-500";
    if (status === "TRIALING") return "bg-sky-500";
    if (status === "CANCELED") return "bg-slate-400";
    return "bg-muted-foreground";
  };

  const resolveUsage = (sub: any) => {
    if (!sub) return t("No active subscription", "Aucun abonnement actif", "Kein aktives Abonnement", "No hay suscripción activa", "Sem subscrição ativa");
    const key = String(sub?.plan || "").toUpperCase();
    if (key === "ENTERPRISE") return t("Unlimited usage", "Usage illimite", "Unbegrenzte Nutzung", "Uso ilimitado", "Utilização ilimitada");
    return t(
      "Usage limits reset each billing cycle",
      "Les limites se reinitialisent a chaque cycle",
      "Nutzungslimits werden in jedem Abrechnungszyklus zurückgesetzt",
      "Los limites de uso se restablecen en cada ciclo de facturación",
      "Os limites de utilização sao repostos em cada ciclo de faturação"
    );
  };

  const hasRenewalDatePassed = (sub: any) => {
    if (!sub?.renewalDate) return false;
    const renewalDate = new Date(sub.renewalDate);
    return !Number.isNaN(renewalDate.getTime()) && renewalDate.getTime() < Date.now();
  };

  const resolveNextInvoice = (sub: any) => {
    if (!sub) return t("No active subscription", "Aucun abonnement actif", "Kein aktives Abonnement", "No hay suscripción activa", "Sem subscrição ativa");
    if (sub?.prepaid || sub?.id === "admin-override") return t("Included", "Inclus", "Inbegriffen", "Incluido", "Incluido");
    if (hasRenewalDatePassed(sub)) return t("Due now", "Due maintenant", "Jetzt fallig", "Vence ahora", "Vence agora");
    if (sub?.renewalDate) return formatSubscriptionDate(sub.renewalDate, locale);
    return t("Contact support", "Contactez le support", "Support kontaktieren", "Contactar con soporte", "Contactar o suporte");
  };

  const resolveRenewal = (sub: any) => {
    if (!sub) return t("No active subscription", "Aucun abonnement actif", "Kein aktives Abonnement", "No hay suscripción activa", "Sem subscrição ativa");
    if (sub?.renewalDate && hasRenewalDatePassed(sub)) {
      const dateLabel = formatSubscriptionDate(sub.renewalDate, locale);
      return t(
        `Past due since ${dateLabel}`,
        `En retard depuis ${dateLabel}`,
        `Uberfallig seit ${dateLabel}`,
        `Vencido desde ${dateLabel}`,
        `Em atraso desde ${dateLabel}`
      );
    }
    if (sub?.renewalDate) return formatSubscriptionDate(sub.renewalDate, locale);
    return t("Not scheduled", "Non planifie", "Nicht geplant", "No programado", "Não agendado");
  };

  const resolveCurrentInterval = (sub: any) => {
    if (!sub) return t("No active subscription", "Aucun abonnement actif", "Kein aktives Abonnement", "No hay suscripción activa", "Sem subscrição ativa");
    return resolveInterval(sub);
  };

  const resolveAutoRenew = (sub: any) => {
    if (!sub) return t("No active subscription", "Aucun abonnement actif", "Kein aktives Abonnement", "No hay suscripción activa", "Sem subscrição ativa");
    if (management?.billingMode === "provider_portal") {
      return t("Managed in Stripe", "Gere dans Stripe", "In Stripe verwaltet", "Gestionado en Stripe", "Gerido no Stripe");
    }
    if (management?.billingMode === "provider_external") {
      return t("Managed by provider", "Gere par le fournisseur", "Vom Anbieter verwaltet", "Gestionado por el proveedor", "Gerido pelo fornecedor");
    }
    if (sub?.cancelAtPeriodEnd === true || sub?.autoRenew === false) {
      return t("Off, ends at period close", "Desactive, fin au prochain terme", "Aus, endet zum Periodenende", "Desactivado, termina al final del periodo", "Desativado, termina no fim do periodo");
    }
    if (sub?.autoRenew === true && sub?.cancelAtPeriodEnd === false) {
      return t("On, renews automatically", "Active, renouvellement automatique", "Ein, automatische Verlängerung", "Activo, se renueva automaticamente", "Ativo, renova automaticamente");
    }
    if (management?.stateSource === "org_subscription") {
      return t("Syncing billing state", "Synchronisation de l'etat", "Abrechnungsstatus wird synchronisiert", "Sincronizando estado de facturación", "A sincronizar estado de faturação");
    }
    return t("Unavailable", "Indisponible", "Nicht verfügbar", "No disponible", "Indisponivel");
  };

  const handleDowngrade = async () => {
    setActionStatus(null);
    setDowngradeActionLoading(true);
    try {
      const res = await fetch("/api/subscription/downgrade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: downgradePlan }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (payload?.code === "EXTERNAL_BILLING_PORTAL_REQUIRED" && payload?.portalPath) {
          await openBillingPortal(payload.portalPath);
          return;
        }

        setActionStatus({
          message:
            (typeof payload?.error === "string" && localizeSubscriptionServerMessage(payload.error, t)) ||
            t("Downgrade request failed.", "La demande de downgrade a échoué.", "Die Downgrade-Anfrage ist fehlgeschlagen.", "La solicitud de downgrade fallo.", "O pedido de downgrade falhou."),
          variant: "error",
        });
        return;
      }
      setActionStatus({
        message: t(
          "Downgrade scheduled for your next billing cycle.",
          "Downgrade planifie au prochain cycle.",
          "Das Downgrade wurde für den nächsten Abrechnungszyklus geplant.",
          "El downgrade se programo para tu próximo ciclo de facturación.",
          "O downgrade foi agendado para o próximo ciclo de faturação."
        ),
        variant: "success",
      });
      await Promise.all([mutateSummary(), mutateHistory()]);
    } finally {
      setDowngradeActionLoading(false);
    }
  };

  const handleCancelPendingDowngrade = async () => {
    setActionStatus(null);
    setDowngradeActionLoading(true);
    try {
      const res = await fetch("/api/subscription/downgrade", {
        method: "DELETE",
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        setActionStatus({
          message:
            (typeof payload?.error === "string" && localizeSubscriptionServerMessage(payload.error, t)) ||
            t(
              "Unable to cancel the pending downgrade.",
              "Impossible d annuler le downgrade en attente.",
              "Das ausstehende Downgrade konnte nicht storniert werden.",
              "No se pudo cancelar el downgrade pendiente.",
              "Não foi possivel cancelar o downgrade pendente."
            ),
          variant: "error",
        });
        return;
      }
      setActionStatus({
        message: t(
          "Pending downgrade canceled. Your current plan will continue renewing as normal.",
          "Le downgrade en attente a ?t? annule. Votre plan actuel continuera de se renouveler normalement.",
          "Das ausstehende Downgrade wurde storniert. Dein aktueller Plan wird sich wie gewohnt weiter verlängern.",
          "El downgrade pendiente se cancelo. Tu plan actual seguira renovandose con normalidad.",
          "O downgrade pendente foi cancelado. O teu plano atual continuara a renovar normalmente."
        ),
        variant: "success",
      });
      await Promise.all([mutateSummary(), mutateHistory()]);
    } finally {
      setDowngradeActionLoading(false);
    }
  };

  const openBillingPortal = async (portalPath: string) => {
    setActionStatus(null);
    setPortalLoading(true);

    try {
      const res = await fetch(portalPath, {
        method: "POST",
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        setActionStatus({
          message:
            (typeof payload?.error === "string" && localizeSubscriptionServerMessage(payload.error, t)) ||
            t(
              "Unable to open billing portal.",
              "Impossible d'ouvrir le portail de facturation.",
              "Das Abrechnungsportal konnte nicht geöffnet werden.",
              "No se pudo abrir el portal de facturación.",
              "Não foi possivel abrir o portal de faturação."
            ),
          variant: "error",
        });
        return false;
      }
      if (!payload?.url) {
        setActionStatus({
          message: t(
            "Billing portal is unavailable right now.",
            "Le portail de facturation est indisponible pour le moment.",
            "Das Abrechnungsportal ist derzeit nicht verfügbar.",
            "El portal de facturación no esta disponible en este momento.",
            "O portal de faturação não esta disponível neste momento."
          ),
          variant: "error",
        });
        return false;
      }
      window.location.href = payload.url;
      return true;
    } finally {
      setPortalLoading(false);
    }
  };

  const handleOpenBillingPortal = async () => {
    if (!management?.portalPath) return;
    await openBillingPortal(management.portalPath);
  };

  const handleAutoRenewChange = async (enabled: boolean) => {
    setActionStatus(null);
    setRenewalActionLoading(true);

    try {
      const res = await fetch("/api/subscription/auto-renew", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      const payload = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (payload?.code === "EXTERNAL_BILLING_PORTAL_REQUIRED" && payload?.portalPath) {
          await openBillingPortal(payload.portalPath);
          return;
        }

        setActionStatus({
          message:
            (typeof payload?.error === "string" && localizeSubscriptionServerMessage(payload.error, t)) ||
            t(
              "Unable to update auto-renew.",
              "Impossible de mettre a jour le renouvellement auto.",
              "Die automatische Verlängerung konnte nicht aktualisiert werden.",
              "No se pudo actualizar la renovacion automatica.",
              "Não foi possivel atualizar a renovacao automatica."
            ),
          variant: "error",
        });
        return;
      }

      setShowCancelConfirm(false);
      setActionStatus({
        message: enabled
          ? t(
              "Auto-renew is active again for this subscription.",
              "Le renouvellement auto est de nouveau actif pour cet abonnement.",
              "Die automatische Verlängerung ist für dieses Abonnement wieder aktiv.",
              "La renovacion automatica vuelve a estar activa para esta suscripción.",
              "A renovacao automatica voltou a estar ativa para esta subscrição."
            )
          : t(
              "Auto-renew will stop at the end of the current billing period.",
              "Le renouvellement auto s arretera a la fin de la periode de facturation en cours.",
              "Die automatische Verlängerung endet am Ende des aktuellen Abrechnungszeitraums.",
              "La renovacion automatica se detendra al final del periodo de facturación actual.",
              "A renovacao automatica sera interrompida no fim do periodo de faturação atual."
            ),
        variant: "success",
      });
      await Promise.all([mutateSummary(), mutateHistory()]);
    } finally {
      setRenewalActionLoading(false);
    }
  };

  const availableDowngradePlans = getScheduledDowngradeTargets(
    (planKey || "STARTER") as "STARTER" | "PRO" | "GROWTH" | "BUSINESS" | "ENTERPRISE",
    pendingPlan as "STARTER" | "PRO" | "GROWTH" | "BUSINESS" | null
  );
  const canManageActiveSubscription = Boolean(
    activeSub && ["ACTIVE", "PAST_DUE", "TRIALING"].includes(activeSubStatus)
  );
  const canManageAutoRenewInApp =
    canManageActiveSubscription && Boolean(management?.canManageAutoRenewInApp);
  const canScheduleDowngradeInApp =
    canManageActiveSubscription && Boolean(management?.canScheduleDowngradeInApp);
  const canOpenBillingPortal = management?.billingMode === "provider_portal" && Boolean(management.portalPath);
  const autoRenewDisabled = activeSub?.cancelAtPeriodEnd === true || activeSub?.autoRenew === false;
  const hasProviderManagedPendingDowngrade = Boolean(
    pendingPlan && canManageActiveSubscription && !canScheduleDowngradeInApp
  );
  const renewalAction = summaryData?.renewalAction || null;
  const hasPendingRenewalRedirect =
    activeSubStatus === "PAST_DUE" && Boolean(renewalAction?.redirectUrl);

  useEffect(() => {
    if (availableDowngradePlans.length === 0) return;
    if (!(availableDowngradePlans as string[]).includes(downgradePlan)) {
      setDowngradePlan(availableDowngradePlans[0]);
    }
  }, [availableDowngradePlans, downgradePlan]);

  useEffect(() => {
    if ((autoRenewDisabled || !canManageAutoRenewInApp) && showCancelConfirm) {
      setShowCancelConfirm(false);
    }
  }, [autoRenewDisabled, canManageAutoRenewInApp, showCancelConfirm]);

  const handleRenewNow = async () => {
    setActionStatus(null);
    setRenewNowLoading(true);
    try {
      const res = await fetch("/api/subscription/renew-now", {
        method: "POST",
      });
      const payload = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (payload?.redirectUrl) {
          window.location.href = payload.redirectUrl;
          return;
        }
        setActionStatus({
          message:
            (typeof payload?.error === "string" && localizeSubscriptionServerMessage(payload.error, t)) ||
            t(
              "Unable to start renewal right now.",
              "Impossible de lancer le renouvellement pour le moment.",
              "Die Verlängerung kann gerade nicht gestartet werden.",
              "No se pudo iniciar la renovacion en este momento.",
              "Não foi possivel iniciar a renovacao neste momento."
            ),
          variant: "error",
        });
        return;
      }

      if (payload?.redirectUrl) {
        window.location.href = payload.redirectUrl;
        return;
      }

      setActionStatus({
        message:
          payload?.status === "succeeded"
            ? t(
                "Renewal payment succeeded.",
                "Le paiement de renouvellement a reussi.",
                "Die Verlängerungszahlung war erfolgreich.",
                "El pago de renovacion se realizo correctamente.",
                "O pagamento de renovacao foi bem-sucedido."
              )
            : t(
                "Renewal started. Complete any required bank authentication if prompted.",
                "Le renouvellement a commence. Terminez toute authentification bancaire demandee si necessaire.",
                "Die Verlängerung wurde gestartet. Schliesse gegebenenfalls die erforderliche Bankauthentifizierung ab.",
                "La renovacion se ha iniciado. Completa la autenticacion bancaria requerida si se solicita.",
                "A renovacao foi iniciada. Complete qualquer autenticação bancaria necessária se for solicitado."
              ),
        variant: "success",
      });
      await Promise.all([mutateSummary(), mutateHistory()]);
    } finally {
      setRenewNowLoading(false);
    }
  };

  return (
    <div className="space-y-10">
      <div className="flex items-center justify-between border-b border-border/40 pb-6 max-md:flex-col max-md:items-start max-md:gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
            {t("Subscription", "Abonnement", "Abonnement", "Suscripción", "Subscrição")}
          </p>
          <h1 className="text-3xl font-semibold text-foreground">{t("Manage plan", "Gerer le plan", "Plan verwalten", "Gestionar plan", "Gerir plano")}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {t(
              "Update your plan, billing, and renewal settings.",
              "Mettez a jour votre plan, la facturation et le renouvellement.",
              "Aktualisiere deinen Plan sowie Rechnungs- und Verlängerungseinstellungen.",
              "Actualiza tu plan y la configuración de facturación y renovacion.",
              "Atualize o seu plano e as definições de faturação e renovacao."
            )}
          </p>
        </div>
        <div className="flex gap-2 max-md:w-full">
          <Button
            className="max-md:w-full"
            onClick={() => Promise.all([mutateSummary(), mutateHistory()])}
            loading={summaryValidating || historyValidating}
          >
            {t("Refresh", "Actualiser", "Aktualisieren", "Actualizar", "Atualizar")}
          </Button>
        </div>
      </div>

      {actionStatus && (
        <div>
          <TransientAlert variant={actionStatus.variant} onDismiss={() => setActionStatus(null)}>
            {actionStatus.message}
          </TransientAlert>
        </div>
      )}

      {accessError ? (
        <div>
          <Alert variant="error">{String(accessError)}</Alert>
        </div>
      ) : null}
      {billingAccessResolved && !canManageWorkspaceSubscription ? (
        <div>
          <Alert variant="error">
            {t(
              "Only the workspace owner or billing admin can manage the workspace subscription.",
              "Seul le proprietaire de l'espace de travail ou l administrateur de facturation peut gerer l abonnement de l'espace de travail.",
              "Nur der Workspace-Eigentümer oder Billing-Admin kann das Workspace-Abonnement verwalten.",
              "Solo el propietario del espacio de trabajo o el administrador de facturación puede gestionar la suscripción del espacio.",
              "Apenas o proprietário do espaco de trabalho ou o administrador de faturação pode gerir a subscrição do espaco."
            )}
          </Alert>
        </div>
      ) : isLoading ? (
        <div className="space-y-6">
          <div className="grid gap-8 border-b border-border/40 pb-8 lg:grid-cols-[1.6fr_0.4fr]">
            <div className="space-y-3">
              <div className="h-4 w-24 animate-pulse rounded bg-muted/50" />
              <div className="h-8 w-64 animate-pulse rounded bg-muted/50" />
              <div className="h-4 w-full max-w-xl animate-pulse rounded bg-muted/40" />
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="h-16 animate-pulse rounded-xl bg-muted/30" />
                <div className="h-16 animate-pulse rounded-xl bg-muted/30" />
                <div className="h-16 animate-pulse rounded-xl bg-muted/30" />
              </div>
              <div className="h-11 w-36 animate-pulse rounded-lg bg-muted/40" />
            </div>
            <div className="space-y-3">
              <div className="h-10 animate-pulse rounded bg-muted/40" />
              <div className="h-10 animate-pulse rounded bg-muted/40" />
              <div className="h-10 animate-pulse rounded bg-muted/40" />
              <div className="h-10 animate-pulse rounded bg-muted/40" />
            </div>
          </div>
          <div className="space-y-3">
            <div className="h-6 w-40 animate-pulse rounded bg-muted/50" />
            <div className="h-40 animate-pulse rounded-2xl border border-border/40 bg-muted/20" />
          </div>
        </div>
      ) : hasSummaryError ? null : (
        <>
          <div className="grid gap-8 border-b border-border/40 pb-8 lg:grid-cols-[1.6fr_0.4fr]">
            <div className="space-y-4">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{t("Current plan", "Plan actuel", "Aktueller Plan", "Plan actual", "Plano atual")}</p>
                <h2 className="mt-2 text-2xl font-semibold text-foreground">
                  {t("Current plan:", "Plan actuel :", "Aktueller Plan:", "Plan actual:", "Plano atual:")} {currentPlan}
                </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {t(
                      planDescriptions[planKey] || {
                        en: "Plan details are available after activation.",
                        fr: "Details du plan disponibles apres activation.",
                        de: "Plandetails sind nach der Aktivierung verfügbar.",
                        es: "Los detalles del plan estaran disponibles despues de la activacion.",
                        pt: "Os detalhes do plano ficam disponiveis após a ativacao.",
                      }
                    )}
                  </p>
              </div>
              <div className="grid gap-4 text-sm text-muted-foreground sm:grid-cols-3">
                <div className="space-y-1">
                  <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">{t("Billing cycle", "Cycle", "Abrechnungszyklus", "Ciclo de facturación", "Ciclo de faturação")}</p>
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-foreground">{resolveCurrentInterval(activeSub)}</p>
                    {activeSub &&
                    resolveCurrentInterval(activeSub) ===
                      t("Yearly", "Annuel", "Jährlich", "Anual", "Anual") && (
                      <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-700">
                        {t("Annual billing", "Facturation annuelle", "Jährliche Abrechnung", "Facturación anual", "Faturação anual")}
                      </span>
                    )}
                  </div>
                </div>
                <div className="space-y-1">
                  <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">{t("Usage model", "Usage", "Nutzungsmodell", "Modelo de uso", "Modelo de utilização")}</p>
                  <p className="font-medium text-foreground">{resolveUsage(activeSub)}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">{t("Next invoice", "Prochaine facture", "Nächste Rechnung", "Próxima factura", "Próxima fatura")}</p>
                  <p className="font-medium text-foreground">{resolveNextInvoice(activeSub)}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 max-md:flex-col max-md:items-stretch">
                <Button type="button" onClick={() => router.push("/dashboard/payments")}>
                  {t("Upgrade plan", "Mettre a niveau", "Plan upgraden", "Mejorar plan", "Atualizar plano")}
                </Button>
                {canManageActiveSubscription &&
                activeSubStatus === "PAST_DUE" &&
                management?.provider === "FLUTTERWAVE" ? (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={
                      hasPendingRenewalRedirect && renewalAction?.redirectUrl
                        ? () => {
                            window.location.href = renewalAction.redirectUrl as string;
                          }
                        : handleRenewNow
                    }
                    loading={renewNowLoading}
                  >
                    {hasPendingRenewalRedirect
                      ? t("Complete Flutterwave renewal", "Completer le renouvellement Flutterwave", "Flutterwave-Verlängerung abschliessen", "Completar renovacion de Flutterwave", "Concluir renovacao Flutterwave")
                      : t("Retry saved Flutterwave card", "Relancer la carte Flutterwave enregistree", "Gespeicherte Flutterwave-Karte erneut versuchen", "Reintentar tarjeta Flutterwave guardada", "Tentar novamente o cartao Flutterwave guardado")}
                  </Button>
                ) : null}
                {canManageActiveSubscription && canOpenBillingPortal ? (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={handleOpenBillingPortal}
                    loading={portalLoading}
                  >
                    {t("Manage billing in Stripe", "Gerer la facturation dans Stripe", "Abrechnung in Stripe verwalten", "Gestionar facturación en Stripe", "Gerir faturação no Stripe")}
                  </Button>
                ) : null}
                {canManageAutoRenewInApp ? (
                  autoRenewDisabled ? (
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => handleAutoRenewChange(true)}
                      loading={renewalActionLoading}
                    >
                      {t("Resume auto-renew", "Reprendre le renouvellement auto", "Automatische Verlängerung fortsetzen", "Reactivar renovacion automatica", "Retomar renovacao automatica")}
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="danger"
                      onClick={() => setShowCancelConfirm(true)}
                      loading={renewalActionLoading}
                    >
                      {t("Cancel auto-renew", "Desactiver le renouvellement auto", "Automatische Verlängerung beenden", "Cancelar renovacion automatica", "Cancelar renovacao automatica")}
                    </Button>
                  )
                ) : null}
              </div>
              {showCancelConfirm && canManageAutoRenewInApp && !autoRenewDisabled ? (
                <div className="rounded-2xl border border-rose-200 bg-rose-50/80 p-4 text-sm text-rose-900 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-100">
                  <p className="font-medium">
                    {t("Cancel at period end?", "Annuler a la fin de la periode ?", "Zum Periodenende beenden?", "Cancelar al final del periodo?", "Cancelar no fim do periodo?")}
                  </p>
                  <p className="mt-1 text-rose-800 dark:text-rose-200">
                    {t(
                      "This stops future renewals and keeps your subscription active until the current billing period ends.",
                      "Cela arrete les renouvellements futurs et conserve votre abonnement actif jusqu'a la fin de la periode de facturation en cours.",
                      "Dadurch werden zukunftige Verlängerungen gestoppt und dein Abonnement bleibt bis zum Ende des aktuellen Abrechnungszeitraums aktiv.",
                      "Esto detiene futuras renovaciones y mantiene tu suscripción activa hasta el final del periodo actual.",
                      "Isto interrompe renovacoes futuras e mantem a sua subscrição ativa at? ao fim do periodo atual."
                    )}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="danger"
                      onClick={() => handleAutoRenewChange(false)}
                      loading={renewalActionLoading}
                    >
                      {t("Yes, cancel auto-renew", "Oui, desactiver le renouvellement auto", "Ja, automatische Verlängerung beenden", "Si, cancelar renovacion automatica", "Sim, cancelar renovacao automatica")}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => setShowCancelConfirm(false)}
                      disabled={renewalActionLoading}
                    >
                      {t("Keep subscription", "Garder l'abonnement", "Abonnement behalten", "Mantener suscripción", "Manter subscrição")}
                    </Button>
                  </div>
                </div>
              ) : null}
              {canManageActiveSubscription && management?.billingMode === "provider_external" ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50/80 p-4 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
                  <p className="font-medium">
                    {t("Billing changes are provider-managed.", "Les changements de facturation sont geres par le fournisseur.", "Abrechnungsänderungen werden vom Anbieter verwaltet.", "Los cambios de facturación los gestiona el proveedor.", "As alteracoes de faturação sao geridas pelo fornecedor.")}
                  </p>
                  <p className="mt-1 text-amber-800 dark:text-amber-200">
                    {t(
                      `This subscription is billed through ${formatProvider(management.provider)}. Maboria does not auto-charge external renewals yet, so once the cycle date passes you need to renew through checkout or contact support.`,
                      `Cet abonnement est facture via ${formatProvider(management.provider)}. Maboria ne debite pas encore automatiquement les renouvellements externes, donc apres la date d echeance vous devez relancer le paiement ou contacter le support.`,
                      `Dieses Abonnement wird uber ${formatProvider(management.provider)} abgerechnet. Maboria belastet externe Verlangerungen noch nicht automatisch, daher musst du nach Ablauf des Zyklusdatums uber den Checkout verlangern oder den Support kontaktieren.`,
                      `Esta suscripcion se factura a traves de ${formatProvider(management.provider)}. Maboria todavia no cobra automaticamente las renovaciones externas, por lo que cuando pase la fecha del ciclo debes renovar desde el checkout o contactar con soporte.`,
                      `Esta subscricao e faturada atraves de ${formatProvider(management.provider)}. A Maboria ainda nao cobra automaticamente renovacoes externas, por isso, quando a data do ciclo passar, tera de renovar no checkout ou contactar o suporte.`
                    )}
                  </p>
                </div>
              ) : null}
              {canManageActiveSubscription && management?.stateSource === "org_subscription" ? (
                <div className="rounded-2xl border border-sky-200 bg-sky-50/80 p-4 text-sm text-sky-900 dark:border-sky-900/60 dark:bg-sky-950/30 dark:text-sky-100">
                  <p className="font-medium">
                    {t("Billing state is syncing.", "L'etat de facturation se synchronise.", "Abrechnungsstatus wird synchronisiert.", "El estado de facturación se esta sincronizando.", "O estado de faturação esta a sincronizar.")}
                  </p>
                  <p className="mt-1 text-sky-800 dark:text-sky-200">
                    {t(
                      "Some renewal controls stay hidden until the subscription mirror is fully synced.",
                      "Certains controles de renouvellement restent masques jusqu'a la synchronisation complete du miroir d'abonnement.",
                      "Einige Verlängerungsoptionen bleiben verborgen, bis der Abonnementspiegel vollstandig synchronisiert ist.",
                      "Algunos controles de renovacion permanecen ocultos hasta que se sincronice por completo el reflejo de la suscripción.",
                      "Alguns controlos de renovacao permanecem ocultos at? que o espelho da subscrição esteja totalmente sincronizado."
                    )}
                  </p>
                </div>
              ) : null}
              <div className="rounded-2xl border border-border/60 bg-muted/20 p-4 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                      {t("Downgrade", "Downgrade", "Downgrade", "Downgrade", "Downgrade")}
                    </p>
                    <p className="mt-2 font-medium text-foreground">
                      {hasProviderManagedPendingDowngrade
                        ? t(
                            `A legacy dashboard downgrade to ${formatPlan(pendingPlan!)} is still recorded locally.`,
                            `Un ancien downgrade du tableau de bord vers ${formatPlan(pendingPlan!)} est encore enregistre localement.`,
                            `Ein altes Dashboard-Downgrade auf ${formatPlan(pendingPlan!)} ist noch lokal gespeichert.`,
                            `Todavia hay registrado localmente un downgrade heredado del panel a ${formatPlan(pendingPlan!)}.`,
                            `Ainda existe localmente um downgrade antigo do painel para ${formatPlan(pendingPlan!)}.`
                          )
                        : pendingPlan
                        ? t(
                            `Pending downgrade to ${formatPlan(pendingPlan)}.`,
                            `Downgrade vers ${formatPlan(pendingPlan)} en attente.`,
                            `Ausstehendes Downgrade auf ${formatPlan(pendingPlan)}.`,
                            `Downgrade pendiente a ${formatPlan(pendingPlan)}.`,
                            `Downgrade pendente para ${formatPlan(pendingPlan)}.`
                          )
                        : t(
                            "Schedule a downgrade for the next billing cycle.",
                            "Planifier un downgrade au prochain cycle.",
                            "Plane ein Downgrade für den nächsten Abrechnungszyklus.",
                            "Programa un downgrade para el próximo ciclo de facturación.",
                            "Agenda um downgrade para o próximo ciclo de faturação."
                          )}
                    </p>
                    {pendingEffectiveAt && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {t("Effective", "Effectif", "Wirksam", "Efectivo", "Efetivo")}{" "}
                        {formatSubscriptionDate(pendingEffectiveAt, locale)}
                      </p>
                    )}
                    {hasProviderManagedPendingDowngrade ? (
                      <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
                        {t(
                          "Provider-managed billing will not apply this local downgrade automatically. Clear it here and manage the change with your billing provider.",
                          "La facturation geree par le fournisseur n appliquera pas automatiquement ce downgrade local. Supprimez-le ici puis gerez le changement avec votre fournisseur de facturation.",
                          "Provider-verwaltete Abrechnung wird dieses lokale Downgrade nicht automatisch anwenden. Entferne es hier und verwalte die Änderung bei deinem Zahlungsanbieter.",
                          "La facturación gestionada por el proveedor no aplicara automaticamente este downgrade local. Eliminalo aqui y gestiona el cambio con tu proveedor de facturación.",
                          "A faturação gerida pelo fornecedor não aplicara automaticamente este downgrade local. Limpe-o aqui e gira a alteração com o seu fornecedor de faturação."
                        )}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {pendingPlan && canManageActiveSubscription ? (
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={handleCancelPendingDowngrade}
                        loading={downgradeActionLoading}
                      >
                        {t(
                          "Undo pending downgrade",
                          "Annuler le downgrade en attente",
                          "Ausstehendes Downgrade ruckgangig machen",
                          "Deshacer downgrade pendiente",
                          "Anular downgrade pendente"
                        )}
                      </Button>
                    ) : canScheduleDowngradeInApp && availableDowngradePlans.length > 0 ? (
                      <>
                        <select
                          value={downgradePlan}
                          onChange={(event) => setDowngradePlan(event.target.value)}
                          className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                          disabled={downgradeActionLoading}
                        >
                          {availableDowngradePlans.map((plan) => (
                            <option key={plan} value={plan}>
                              {formatPlan(plan)}
                            </option>
                          ))}
                        </select>
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={handleDowngrade}
                          loading={downgradeActionLoading}
                        >
                          {t(
                            "Schedule downgrade",
                            "Planifier",
                            "Downgrade planen",
                            "Programar downgrade",
                            "Agendar downgrade"
                          )}
                        </Button>
                      </>
                    ) : canManageActiveSubscription && canOpenBillingPortal ? (
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={handleOpenBillingPortal}
                        loading={portalLoading}
                      >
                        {t(
                          "Manage downgrade in Stripe",
                          "Gerer le downgrade dans Stripe",
                          "Downgrade in Stripe verwalten",
                          "Gestionar downgrade en Stripe",
                          "Gerir downgrade no Stripe"
                        )}
                      </Button>
                    ) : canManageActiveSubscription && management?.billingMode === "provider_external" ? (
                      <p className="text-xs text-muted-foreground">
                        {t(
                          `Downgrades for ${formatProvider(management.provider)} are handled outside the dashboard. Contact support if you need help.`,
                          `Les downgrades pour ${formatProvider(management.provider)} sont geres hors du tableau de bord. Contactez le support si vous avez besoin d aide.`,
                          `Downgrades fur ${formatProvider(management.provider)} werden ausserhalb des Dashboards verwaltet. Kontaktiere den Support, wenn du Hilfe brauchst.`,
                          `Los downgrades para ${formatProvider(management.provider)} se gestionan fuera del panel. Contacta con soporte si necesitas ayuda.`,
                          `Os downgrades para ${formatProvider(management.provider)} sao geridos fora do painel. Contacte o suporte se precisar de ajuda.`
                        )}
                      </p>
                    ) : canScheduleDowngradeInApp ? (
                      <p className="text-xs text-muted-foreground">
                        {t(
                          "No lower tiers available for this plan.",
                          "Aucun plan inferieur disponible.",
                          "Für diesen Plan sind keine niedrigeren Stufen verfügbar.",
                          "No hay niveles inferiores disponibles para este plan.",
                          "Não existem niveis inferiores disponiveis para este plano."
                        )}
                      </p>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        {t(
                          "Downgrade controls are unavailable without an active subscription.",
                          "Le downgrade n est pas disponible sans abonnement actif.",
                          "Downgrade-Steuerelemente sind ohne aktives Abonnement nicht verfügbar.",
                          "Los controles de downgrade no estan disponibles sin una suscripción activa.",
                          "Os controlos de downgrade não estão disponiveis sem uma subscrição ativa."
                        )}
                      </p>
                    )}
                  </div>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                {canScheduleDowngradeInApp
                  ? t(
                      "Upgrades apply immediately with prorated credit. Downgrades are scheduled for the next cycle and applied by the billing job.",
                      "Les upgrades s appliquent immediatement avec credit au prorata. Les downgrades sont planifies pour le cycle suivant et appliques par la tache de facturation.",
                      "Upgrades werden sofort mit anteiligem Guthaben angewendet. Downgrades werden für den nächsten Zyklus geplant und vom Abrechnungsjob ausgeführt.",
                      "Las mejoras se aplican de inmediato con credito prorrateado. Los downgrades se programan para el siguiente ciclo y los aplica el trabajo de facturación.",
                      "Os upgrades sao aplicados de imediato com credito proporcional. Os downgrades sao agendados para o ciclo seguinte e aplicados pelo processo de faturação."
                    )
                  : management?.billingMode === "provider_portal"
                    ? t(
                        "Upgrades still start in checkout. Downgrades and billing-cycle changes for this subscription are managed in Stripe.",
                        "Les upgrades demarrent toujours au paiement. Les downgrades et changements de cycle de facturation pour cet abonnement sont geres dans Stripe.",
                        "Upgrades starten weiterhin im Checkout. Downgrades und Änderungen des Abrechnungszyklus für dieses Abonnement werden in Stripe verwaltet.",
                        "Las mejoras siguen iniciandose en el checkout. Los downgrades y cambios de ciclo de facturación para esta suscripción se gestionan en Stripe.",
                        "Os upgrades continuam a comecar no checkout. Os downgrades e alteracoes do ciclo de faturação desta subscrição sao geridos no Stripe."
                      )
                    : management?.billingMode === "provider_external"
                      ? t(
                          "Upgrades still start in checkout. Downgrades and billing-cycle changes for this subscription are managed outside the dashboard.",
                          "Les upgrades demarrent toujours au paiement. Les downgrades et changements de cycle de facturation pour cet abonnement sont geres hors du tableau de bord.",
                          "Upgrades starten weiterhin im Checkout. Downgrades und Änderungen des Abrechnungszyklus für dieses Abonnement werden außerhalb des Dashboards verwaltet.",
                          "Las mejoras siguen iniciandose en el checkout. Los downgrades y cambios de ciclo de facturación para esta suscripción se gestionan fuera del panel.",
                          "Os upgrades continuam a comecar no checkout. Os downgrades e alteracoes do ciclo de faturação desta subscrição sao geridos fora do painel."
                        )
                      : t(
                          "Upgrades apply immediately with prorated credit.",
                          "Les upgrades s appliquent immediatement avec credit au prorata.",
                          "Upgrades werden sofort mit anteiligem Guthaben angewendet.",
                          "Las mejoras se aplican de inmediato con credito prorrateado.",
                          "Os upgrades sao aplicados de imediato com credito proporcional."
                        )}
              </p>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex flex-col items-start justify-between gap-1 border-b border-border/40 pb-2 sm:flex-row sm:gap-4">
                <span className="min-w-[120px] text-muted-foreground">
                  {t("Billing status", "Statut de facturation", "Abrechnungsstatus", "Estado de facturación", "Estado da faturação")}
                </span>
                <span className="inline-flex items-center justify-end gap-2 font-medium text-foreground">
                  <span className={`h-2 w-2 rounded-full ${resolveBillingStatusDotClass(activeSub)}`} />
                  {resolveBillingStatus(activeSub)}
                </span>
              </div>
              <div className="flex flex-col items-start justify-between gap-1 border-b border-border/40 pb-2 sm:flex-row sm:gap-4">
                <span className="min-w-[120px] text-muted-foreground">
                  {t("Renews", "Renouvellement", "Verlängert sich", "Renueva", "Renova")}
                </span>
                <span className="text-right font-medium text-foreground">{resolveRenewal(activeSub)}</span>
              </div>
              <div className="flex flex-col items-start justify-between gap-1 border-b border-border/40 pb-2 sm:flex-row sm:gap-4">
                <span className="min-w-[120px] text-muted-foreground">
                  {t("Next invoice", "Prochaine facture", "Nächste Rechnung", "Próxima factura", "Próxima fatura")}
                </span>
                <span className="text-right font-medium text-foreground">{resolveNextInvoice(activeSub)}</span>
              </div>
              <div className="flex flex-col items-start justify-between gap-1 sm:flex-row sm:gap-4">
                <span className="min-w-[120px] text-muted-foreground">
                  {t("Usage", "Usage", "Nutzung", "Uso", "Utilização")}
                </span>
                <span className="max-w-[220px] text-right font-medium text-foreground">{resolveUsage(activeSub)}</span>
              </div>
              <div className="flex flex-col items-start justify-between gap-1 border-t border-border/40 pt-2 sm:flex-row sm:gap-4">
                <span className="min-w-[120px] text-muted-foreground">
                  {t("Auto-renew", "Renouvellement auto", "Automatische Verlängerung", "Renovacion automatica", "Renovacao automatica")}
                </span>
                <span className="text-right font-medium text-foreground">{resolveAutoRenew(activeSub)}</span>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3 max-md:flex-col max-md:items-start">
              <h2 className="text-lg font-semibold text-foreground">
                {t("Subscription history", "Historique des abonnements", "Abonnementverlauf", "Historial de suscripciones", "Histórico de subscricoes")}
              </h2>
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  type="button"
                  variant="ghost"
                  className="h-11 rounded-full border border-slate-300/90 bg-white px-5 text-sm font-medium text-slate-900 shadow-[0_10px_24px_-18px_rgba(15,23,42,0.35)] transition duration-200 hover:-translate-y-0.5 hover:!border-slate-400 hover:!bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:hover:!border-slate-500 dark:hover:!bg-slate-900"
                  onClick={() => router.push("/dashboard/payments#recent-payments")}
                >
                  <ArrowUpRight className="h-4 w-4 opacity-70" />
                  {t("View recent payments", "Voir les paiements recents", "Letzte Zahlungen ansehen", "Ver pagos recientes", "Ver pagamentos recentes")}
                </Button>
                {hasReceipt && (
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-11 rounded-full border border-slate-200/90 bg-slate-50 px-5 text-sm font-medium text-slate-700 shadow-[0_10px_24px_-20px_rgba(15,23,42,0.28)] transition duration-200 hover:-translate-y-0.5 hover:!border-slate-300 hover:!bg-white hover:text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:!border-slate-500 dark:hover:!bg-slate-900 dark:hover:!text-slate-100"
                    onClick={downloadReceipt}
                  >
                    <ReceiptText className="h-4 w-4 opacity-70" />
                    {t("Download latest receipt", "Télécharger le dernier recu", "Letzten Beleg herunterladen", "Descargar el ultimo recibo", "Transferir o recibo mais recente")}
                  </Button>
                )}
              </div>
            </div>
            {hasHistoryError ? (
              <Alert variant="error">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    {t(
                      "Subscription history is unavailable.",
                      "L'historique des abonnements est indisponible.",
                      "Der Abonnementverlauf ist nicht verfügbar.",
                      "El historial de suscripciones no esta disponible.",
                      "O histórico de subscricoes não esta disponível."
                    )}{" "}
                    {localizedHistoryError}
                  </span>
                  <Button size="sm" variant="secondary" onClick={() => void mutateHistory()}>
                    {t("Retry", "Reessayer", "Erneut versuchen", "Reintentar", "Tentar novamente")}
                  </Button>
                </div>
              </Alert>
            ) : historyRows.length === 0 ? (
              <Alert variant="info">
                {t(
                  "No subscription history yet.",
                  "Aucun historique d abonnement pour le moment.",
                  "Noch kein Abonnementverlauf vorhanden.",
                  "Todavia no hay historial de suscripciones.",
                  "Ainda não existe histórico de subscricoes."
                )}
              </Alert>
            ) : (
              <div className="space-y-3">
                <div className="overflow-hidden rounded-2xl border border-border/40">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-muted/20 text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                      <tr>
                        <th className="px-4 py-3">{t("Plan", "Plan", "Plan", "Plan", "Plano")}</th>
                        <th className="px-4 py-3">{t("Status", "Statut", "Status", "Estado", "Estado")}</th>
                        <th className="px-4 py-3">{t("Renews", "Renouvellement", "Verlängert sich", "Renueva", "Renova")}</th>
                        <th className="px-4 py-3">{t("Usage", "Usage", "Nutzung", "Uso", "Utilização")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {historyRows.map((row) => (
                        <tr key={row.id} className="border-t border-border/30">
                          <td className="px-4 py-3 font-medium text-foreground">{formatPlan(row.plan)}</td>
                          <td className="px-4 py-3 text-muted-foreground">
                            <span className="inline-flex items-center gap-2">
                              <span className={`h-2 w-2 rounded-full ${resolveBillingStatusDotClass(row)}`} />
                              {resolveBillingStatus(row)}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">{resolveRenewal(row)}</td>
                          <td className="px-4 py-3 text-muted-foreground">{resolveUsage(row)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {hasMoreHistory ? (
                  <div className="flex justify-center">
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => setSize((current) => current + 1)}
                      loading={historyValidating && !historyLoading}
                    >
                      {t(
                        "Load older history",
                        "Charger l'historique plus ancien",
                        "Alteren Verlauf laden",
                        "Cargar historial anterior",
                        "Carregar histórico mais antigo"
                      )}
                    </Button>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </>
      )}
      <p className="text-sm text-muted-foreground">
        {t(
          "Billing questions? Email ",
          "Questions de facturation ? Ecrivez a ",
          "Fragen zur Abrechnung? Schreib an ",
          "Tienes preguntas de facturación? Escribe a ",
          "Perguntas sobre faturação? Envie email para "
        )}
        <a href={billingMailto} className="font-medium text-foreground hover:underline">
          {billingEmail}
        </a>
      </p>
    </div>
  );
}
