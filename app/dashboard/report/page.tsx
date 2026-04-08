"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import {
  Bot,
  Link2,
  Download,
  FileText,
  ShieldCheck,
  Users,
  Workflow,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { MiniAreaChart } from "@/components/charts/area-chart";
import { LANGUAGE_LOCALES } from "@/lib/i18n";
import { useLanguage } from "@/components/providers/language-provider";

type UsageFeatureKey =
  | "ai_requests"
  | "invoices"
  | "automations_runs"
  | "workspace_connections"
  | "team_members_seats";

type UsageSnapshot = {
  orgId: string;
  plan: {
    id: "STARTER" | "PRO" | "GROWTH" | "BUSINESS" | "ENTERPRISE";
    status: "active" | "past_due" | "canceled" | "trialing";
    billingInterval: "monthly" | "yearly";
    apiAccessEnabled: boolean;
    unlimited: boolean;
  };
  cycle: {
    key: string;
    startAt: string;
    endAt: string;
  };
  cards: Array<{
    featureKey: UsageFeatureKey;
    title: string;
    subtitle: string;
    unlimited: boolean;
    used: number | null;
    limit: number | null;
    remaining: number | null;
    percentUsed: number | null;
    actions: {
      viewDetailsUrl: string;
      exportUrl: string;
    };
  }>;
  trend: {
    defaultFeature: "ai_requests" | "invoices" | "automations_runs";
    series: Record<UsageFeatureKey, Array<{ date: string; value: number }>>;
  };
  recentActivity: Array<{
    date: string;
    featureKey: UsageFeatureKey;
    amount: number;
    type: "usage";
    status: "recorded";
    label: string;
  }>;
};

const fetcher = async <T,>(url: string): Promise<T> => {
  const response = await fetch(url);
  if (!response.ok) {
    const error = new Error(`Request failed (${response.status})`) as Error & { status?: number };
    error.status = response.status;
    throw error;
  }
  return response.json() as Promise<T>;
};

function formatNumber(value: number, locale: string) {
  return new Intl.NumberFormat(locale).format(value);
}

function formatDate(value: string | null | undefined, locale: string) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function toStatusLabel(
  status: UsageSnapshot["plan"]["status"],
  t: ReturnType<typeof useLanguage>["t"]
) {
  if (status === "past_due") return t("Past due", "En retard", "Überfällig", "Vencido", "Em atraso");
  if (status === "canceled") return t("Canceled", "Annulé", "Gekündigt", "Cancelado", "Cancelado");
  return t("Active", "Actif", "Aktiv", "Activo", "Ativo");
}

function statusPillClass(status: UsageSnapshot["plan"]["status"]) {
  if (status === "past_due") {
    return "border-amber-300 bg-amber-100 text-amber-900";
  }
  if (status === "canceled") {
    return "border-rose-300 bg-rose-100 text-rose-900";
  }
  return "border-emerald-300 bg-emerald-100 text-emerald-900";
}

function statusDotClass(status: UsageSnapshot["plan"]["status"]) {
  if (status === "past_due") return "bg-amber-600";
  if (status === "canceled") return "bg-rose-600";
  return "bg-emerald-600";
}

function toneForPercent(percent: number | null) {
  if (percent == null) return { bar: "bg-blue-500", text: "text-muted-foreground" };
  if (percent >= 100) return { bar: "bg-rose-500", text: "text-rose-700" };
  if (percent >= 80) return { bar: "bg-amber-500", text: "text-amber-700" };
  return { bar: "bg-blue-500", text: "text-muted-foreground" };
}

function iconForFeature(feature: UsageFeatureKey) {
  if (feature === "ai_requests") return Bot;
  if (feature === "invoices") return FileText;
  if (feature === "automations_runs") return Workflow;
  if (feature === "workspace_connections") return Link2;
  return Users;
}

function chartLabel(feature: UsageFeatureKey, t: ReturnType<typeof useLanguage>["t"]) {
  if (feature === "ai_requests") return t("AI", "IA", "KI", "IA", "IA");
  if (feature === "invoices") return t("Invoices", "Factures", "Rechnungen", "Facturas", "Faturas");
  if (feature === "automations_runs") return t("Automations", "Automatisations", "Automatisierungen", "Automatizaciónes", "Automações");
  if (feature === "workspace_connections") return t("Connections", "Connexions", "Verbindungen", "Conexiónes", "Conexões");
  return t("Team", "Équipe", "Team", "Equipo", "Equipa");
}

function featureTitle(feature: UsageFeatureKey, t: ReturnType<typeof useLanguage>["t"]) {
  if (feature === "ai_requests") return t("AI Usage", "Utilisation IA", "KI-Nutzung", "Uso de IA", "Utilização de IA");
  if (feature === "invoices") return t("Invoices", "Factures", "Rechnungen", "Facturas", "Faturas");
  if (feature === "automations_runs") return t("Automations", "Automatisations", "Automatisierungen", "Automatizaciónes", "Automações");
  if (feature === "workspace_connections") return t("Connections", "Connexions", "Verbindungen", "Conexiónes", "Conexões");
  return t("Team Members", "Membres de l équipe", "Teammitglieder", "Miembros del equipo", "Membros da equipa");
}

function featureSubtitle(feature: UsageFeatureKey, t: ReturnType<typeof useLanguage>["t"]) {
  if (feature === "ai_requests") {
    return t(
      "Requests used this cycle",
      "Requêtes utilisees ce cycle",
      "In diesem Zyklus genutzte Anfragen",
      "Solicitudes usadas este ciclo",
      "Pedidos utilizados neste ciclo"
    );
  }
  if (feature === "invoices") {
    return t(
      "Invoices sent this cycle",
      "Factures envoyées ce cycle",
      "In diesem Zyklus gesendete Rechnungen",
      "Facturas enviadas este ciclo",
      "Faturas enviadas neste ciclo"
    );
  }
  if (feature === "workspace_connections") {
    return t(
      "Connected inbox channels in use",
      "Canaux connectes utilises",
      "Verbundene Postfachkanale im Einsatz",
      "Canales conectados en uso",
      "Canais ligados em uso"
    );
  }
  if (feature === "automations_runs") {
    return t(
      "Successful automation runs this cycle",
      "Executions d'automatisation reussies ce cycle",
      "Erfolgreiche Automatisierungslaufe in diesem Zyklus",
      "Ejecuciones de automatización correctas este ciclo",
      "Execucoes de automação bem-sucedidas neste ciclo"
    );
  }
  return t("Seats in use", "Places utilisees", "Genutzte Platze", "Plazas en uso", "Lugares em uso");
}

function planLabel(plan: UsageSnapshot["plan"]["id"], t: ReturnType<typeof useLanguage>["t"]) {
  if (plan === "STARTER") return t("Starter", "Starter", "Starter", "Starter", "Starter");
  if (plan === "PRO") return t("Pro", "Pro", "Pro", "Pro", "Pro");
  if (plan === "GROWTH") return t("Growth", "Growth", "Growth", "Growth", "Growth");
  if (plan === "BUSINESS") return t("Business", "Business", "Business", "Business", "Business");
  return t("Enterprise", "Enterprise", "Enterprise", "Enterprise", "Enterprise");
}

export default function ReportPage() {
  const router = useRouter();
  const { language, t } = useLanguage();
  const locale = LANGUAGE_LOCALES[language];
  const { data, error, isLoading, mutate } = useSWR<UsageSnapshot>(
    "/api/analytics/usage?cycle=current",
    fetcher,
    { refreshInterval: 30000, dedupingInterval: 10000, revalidateOnFocus: true }
  );
  const [selectedFeature, setSelectedFeature] = useState<
    "ai_requests" | "invoices" | "automations_runs"
  >("ai_requests");
  const trendSectionRef = useRef<HTMLDivElement | null>(null);
  const trendFlashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [trendFlashing, setTrendFlashing] = useState(false);

  const chartData = useMemo(() => {
    const selected = data?.trend.series?.[selectedFeature];
    return (selected ?? []).map((point) => ({
      name: point.date.slice(5),
      value: point.value,
    }));
  }, [data?.trend.series, selectedFeature]);

  useEffect(() => {
    if (!data?.trend.defaultFeature) return;
    setSelectedFeature(data.trend.defaultFeature);
  }, [data?.trend.defaultFeature]);

  const exportAllUrl = "/api/analytics/usage/export?cycle=current";
  const errorStatus = typeof (error as { status?: unknown } | null)?.status === "number"
    ? Number((error as { status?: number }).status)
    : null;
  const accessError = errorStatus === 401 || errorStatus === 403;
  const showStaleDataWarning = Boolean(error && data && !accessError);
  const hasAnyUsage =
    (data?.cards.some((card) => Number(card.used ?? 0) > 0) ?? false) ||
    (data?.recentActivity.length ?? 0) > 0;
  const handleViewDetails = (featureKey: UsageFeatureKey) => {
    if (featureKey === "workspace_connections") {
      router.push("/dashboard/inbox");
      return;
    }
    if (featureKey === "team_members_seats") {
      router.push("/dashboard/team");
      return;
    }
    setSelectedFeature(featureKey);
    setTrendFlashing(true);
    if (trendFlashTimerRef.current) clearTimeout(trendFlashTimerRef.current);
    trendFlashTimerRef.current = setTimeout(() => setTrendFlashing(false), 1200);
    trendSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  useEffect(() => {
    return () => {
      if (trendFlashTimerRef.current) clearTimeout(trendFlashTimerRef.current);
    };
  }, []);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-24 rounded-2xl" />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={`usage-card-skeleton-${index}`} className="h-56 rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-72 rounded-2xl" />
      </div>
    );
  }

  if (!data || accessError) {
    return (
      <Card title={t("Report dashboard", "Tableau de rapports", "Berichts-Dashboard", "Panel de informes", "Painel de relatórios")}>
        <div className="space-y-3">
          <p className="text-sm text-rose-700">
            {accessError
              ? t("You no longer have access to this report.", "Vous n'avez plus accès a ce rapport.", "Sie haben keinen Zugriff mehr auf diesen Bericht.", "Ya no tienes acceso a este informe.", "Ja não tem acesso a este relatorio.")
              : t("Unable to load usage metrics right now. Please refresh.", "Impossible de charger les métriques d'utilisation pour le moment. Veuillez actualiser.", "Nutzungsmetriken können gerade nicht geladen werden. Bitte aktualisieren.", "No se pueden cargar las métricas de uso en este momento. Actualiza la página.", "Não foi possível carregar as métricas de utilização agora. Atualize a página.")}
          </p>
          <Button variant="secondary" onClick={() => mutate()}>
            {t("Retry", "Reessayer", "Erneut versuchen", "Reintentar", "Tentar novamente")}
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {showStaleDataWarning ? (
        <Card className="border-amber-200 bg-amber-50 text-amber-900">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm">
              {t("Live report refresh failed. Showing the last available snapshot.", "L'actualisation du rapport a échoué. Dernier aperçu disponible affiche.", "Die Live-Aktualisierung des Berichts ist fehlgeschlagen. Letzter verfügbarer Stand wird angezeigt.", "La actualización en vivo del informe ha fallado. Se muestra la Última captura disponible.", "A atualização em tempo real do relatorio falhou. A mostrar a Última captura disponível.")}
            </p>
            <Button variant="secondary" onClick={() => mutate()}>
              {t("Retry", "Reessayer", "Erneut versuchen", "Reintentar", "Tentar novamente")}
            </Button>
          </div>
        </Card>
      ) : null}
      <Card
        title={t("Report dashboard", "Tableau de rapports", "Berichts-Dashboard", "Panel de informes", "Painel de relatórios")}
        actions={
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1 text-xs font-semibold shadow-sm ${statusPillClass(data.plan.status)}`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${statusDotClass(data.plan.status)}`} />
            {toStatusLabel(data.plan.status, t)}
          </span>
        }
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <p className="text-2xl font-semibold text-foreground">{planLabel(data.plan.id, t)} {t("Plan", "Plan", "Plan", "Plan", "Plano")}</p>
            <p className="text-sm text-muted-foreground">
              {t("Cycle", "Cycle", "Zeitraum", "Ciclo", "Ciclo")}: {formatDate(data.cycle.startAt, locale)} - {formatDate(data.cycle.endAt, locale)}
            </p>
            <p className="text-xs text-muted-foreground">
              {t("Billing interval", "Intervalle de facturation", "Abrechnungsintervall", "Intervalo de facturación", "Intervalo de faturação")}: {data.plan.billingInterval === "yearly" ? t("Yearly", "Annuel", "Jährlich", "Anual", "Anual") : t("Monthly", "Mensuel", "Monatlich", "Mensual", "Mensal")}
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            {data.plan.unlimited ? (
              <>
                <div className="space-y-2 text-right">
                  <span className="inline-flex items-center gap-2 rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    {t("Unlimited usage enabled", "Utilisation illimitee activée", "Unbegrenzte Nutzung aktiviert", "Uso ilimitado activado", "Utilização ilimitada ativada")}
                  </span>
                  {data.plan.apiAccessEnabled ? (
                    <p className="text-xs font-medium text-foreground">{t("API access enabled", "Accès API active", "API-Zugriff aktiviert", "Acceso API activado", "Acesso API ativado")}</p>
                  ) : null}
                </div>
                <a
                  href={exportAllUrl}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-border bg-muted px-4 text-sm font-semibold text-foreground transition hover:brightness-95"
                >
                  <Download className="h-4 w-4" />
                  {t("Export cycle", "Exporter le cycle", "Zyklus exportieren", "Exportar ciclo", "Exportar ciclo")}
                </a>
              </>
            ) : (
              <>
                <a
                  href={exportAllUrl}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-border bg-muted px-4 text-sm font-semibold text-foreground transition hover:brightness-95"
                >
                  <Download className="h-4 w-4" />
                  {t("Export cycle", "Exporter le cycle", "Zyklus exportieren", "Exportar ciclo", "Exportar ciclo")}
                </a>
                <Link href="/dashboard/subscription">
                  <Button className="h-10 rounded-xl px-4">{t("Upgrade plan", "Passer a un plan superieur", "Plan upgraden", "Mejorar plan", "Atualizar plano")}</Button>
                </Link>
              </>
            )}
          </div>
        </div>
      </Card>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {data.cards.map((card) => {
          const Icon = iconForFeature(card.featureKey);
          const tone = toneForPercent(card.percentUsed);
          return (
            <Card key={card.featureKey} className="space-y-4 p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-base font-semibold text-foreground">{featureTitle(card.featureKey, t)}</p>
                  <p className="text-xs text-muted-foreground">{featureSubtitle(card.featureKey, t)}</p>
                </div>
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-foreground">
                  <Icon className="h-4 w-4" />
                </span>
              </div>

              {card.unlimited ? (
                <div className="space-y-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
                  <p className="font-semibold text-emerald-800">
                    {t("Unlimited", "Illimite", "Unbegrenzt", "Ilimitado", "Ilimitado")}
                  </p>
                  <p className="text-xs font-medium">
                    {t("Used this cycle", "Utilis? ce cycle", "In diesem Zyklus genutzt", "Usado este ciclo", "Utilizado neste ciclo")}: {formatNumber(card.used ?? 0, locale)}
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">{t("Used / Limit", "Utilis? / Limite", "Genutzt / Limit", "Usado / Limite", "Utilizado / Limite")}</span>
                    <span className="font-semibold text-foreground">
                      {formatNumber(card.used ?? 0, locale)} / {formatNumber(card.limit ?? 0, locale)}
                    </span>
                  </div>
                  <div className="relative h-2 overflow-hidden rounded-full border border-border/70 bg-muted">
                    {(card.percentUsed ?? 0) <= 0 ? (
                      <span className="absolute left-0 top-0 h-full w-[2px] bg-blue-300" />
                    ) : null}
                    <div
                      className={`h-full ${tone.bar} transition-all duration-200`}
                      style={{
                        width:
                          (card.percentUsed ?? 0) > 0
                            ? `${Math.max(card.percentUsed ?? 0, 2)}%`
                            : "0%",
                      }}
                    />
                  </div>
                  <div className={`flex items-center justify-between text-xs ${tone.text}`}>
                    <span>{card.percentUsed ?? 0}% {t("used", "utilis?", "genutzt", "usado", "utilizado")}</span>
                    <span>{t("Remaining", "Restant", "Verbleibend", "Restante", "Restante")}: {formatNumber(card.remaining ?? 0, locale)}</span>
                  </div>
                </div>
              )}

              <div className="mt-1 flex items-center gap-2">
                <Button
                  variant="secondary"
                  className="h-9 rounded-lg px-3 text-xs"
                  onClick={() => handleViewDetails(card.featureKey)}
                >
                  {t("View details", "Voir les d?tails", "Details ansehen", "Ver detalles", "Ver detalhes")}
                </Button>
                <a
                  href={card.actions.exportUrl}
                  className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-border bg-muted px-3 text-xs font-semibold text-foreground transition hover:brightness-95"
                >
                  <Download className="h-3.5 w-3.5" />
                  {t("Export", "Exporter", "Exportieren", "Exportar", "Exportar")}
                </a>
              </div>
            </Card>
          );
        })}
      </section>

      <div ref={trendSectionRef}>
        {!hasAnyUsage ? (
        <Card title={t("Usage trend", "Tendance d'utilisation", "Nutzungstrend", "Tendencia de uso", "Tendencia de utilização")}>
          <p className="text-sm text-muted-foreground">
            {t("No usage yet in this cycle. Once activity starts, trend and activity rows will appear here.", "Aucune utilisation sur ce cycle pour le moment. Une fois l'activité demarree, la tendance et les lignes d'activité apparaitront ici.", "In diesem Zyklus gibt es noch keine Nutzung. Sobald Aktivität beginnt, erscheinen hier Trend und Aktivität.", "Aún no hay uso en este ciclo. Cuando empiece la actividad, la tendencia y el historial apareceran aquí.", "Ainda não ha utilização neste ciclo. Quando a atividade começar, a tendencia e a atividade aparecerao aquí.")}
          </p>
        </Card>
      ) : (
        <Card
          title={t("Usage trend", "Tendance d'utilisation", "Nutzungstrend", "Tendencia de uso", "Tendencia de utilização")}
          className={`space-y-4 transition-all duration-300 ${
            trendFlashing ? "ring-2 ring-blue-300/80 bg-blue-50/30" : ""
          }`}
        >
          <div className="flex flex-wrap items-center gap-2">
            {(
              ["ai_requests", "invoices", "automations_runs"] as const
            ).map((feature) => (
              <button
                key={feature}
                type="button"
                onClick={() => setSelectedFeature(feature)}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                  selectedFeature === feature
                    ? "border-blue-300 bg-blue-100 text-blue-700"
                    : "border-border bg-background text-foreground hover:bg-muted"
                }`}
              >
                {chartLabel(feature, t)}
              </button>
            ))}
          </div>

          {chartData.length ? (
            <MiniAreaChart data={chartData} className="min-h-[240px]" forceAllTicks />
          ) : (
            <p className="text-sm text-muted-foreground">
              {t("This metric has no trend data yet for the current cycle.", "Cette metrique n'a pas encore de données de tendance pour le cycle en cours.", "Für diese Kennzahl gibt es im aktuellen Zyklus noch keine Trenddaten.", "Esta metrica aún no tiene datos de tendencia para el ciclo actual.", "Esta metrica ainda não tem dados de tendencia para o ciclo atual.")}
            </p>
          )}
        </Card>
      )}
      </div>

      <Card title={t("Recent activity", "Activit? recente", "Letzte Aktivität", "Actividad reciente", "Atividade recente")} className="space-y-3">
        {data.recentActivity.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-border/70 text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-2 py-3 text-left">{t("Date", "Date", "Datum", "Fecha", "Data")}</th>
                  <th className="px-2 py-3 text-center">{t("Feature", "Fonction", "Funktion", "Caracteristica", "Funcionalidade")}</th>
                  <th className="px-2 py-3 text-center">{t("Amount", "Montant", "Menge", "Cantidad", "Quantidade")}</th>
                  <th className="px-2 py-3 text-center">{t("Type", "Type", "Typ", "Tipo", "Tipo")}</th>
                  <th className="px-2 py-3 text-center">{t("Status", "Statut", "Status", "Estado", "Estado")}</th>
                </tr>
              </thead>
              <tbody>
                {data.recentActivity.map((item, index) => (
                  <tr key={`${item.date}-${item.featureKey}-${index}`} className="border-b border-border/40">
                    <td className="px-2 py-3 text-left text-muted-foreground">{formatDate(item.date, locale)}</td>
                    <td className="px-2 py-3 text-center font-medium text-foreground">
                      {featureTitle(item.featureKey, t)}
                    </td>
                    <td className="px-2 py-3 text-center text-foreground">{formatNumber(item.amount, locale)}</td>
                    <td className="px-2 py-3 text-center text-muted-foreground">{t("Usage", "Utilisation", "Nutzung", "Uso", "Uso")}</td>
                    <td className="px-2 py-3 text-center">
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-1 text-xs font-medium text-emerald-700">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                        {t("Recorded", "Enregistr?", "Erfasst", "Registrado", "Registado")}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t("No recent usage activity for this cycle.", "Aucune activité recente pour ce cycle.", "Keine aktuelle Nutzung in diesem Zyklus.", "No hay actividad de uso reciente en este ciclo.", "Não há atividade recente neste ciclo.")}</p>
        )}
      </Card>
    </div>
  );
}
