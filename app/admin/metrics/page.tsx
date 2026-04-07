"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import useSWR from "swr";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatCurrency } from "@/lib/currency";
import { useLanguage } from "@/components/providers/language-provider";
import { Skeleton } from "@/components/ui/skeleton";
import { Delta } from "@/components/ui/delta";
import { LANGUAGE_LOCALES, type CompleteLocalizedText } from "@/lib/i18n";

type RangeKey = "7d" | "30d" | "90d";
type DeltaDirection = "up" | "down" | "flat";
type EngineStatusLevel = "HEALTHY" | "AT_RISK" | "CRITICAL";

type MetricsResponse = {
  currency: "USD";
  range: RangeKey;
  lastUpdatedAt: string;
  engineStatus: {
    level: EngineStatusLevel;
    label: string;
  };
  kpis: {
    activeSubscribers: {
      value: number;
      delta: number;
      deltaPercent: number;
      direction: DeltaDirection;
      asPercent: boolean;
      context: string;
    };
    mrrUsd: {
      value: number;
      delta: number;
      deltaPercent: number;
      direction: DeltaDirection;
      asPercent: boolean;
      context: string;
    };
    growth30d: {
      value: number;
      delta: number;
      deltaPercent: number;
      direction: DeltaDirection;
      asPercent: boolean;
      context: string;
    };
    churnRate30d: {
      value: number;
      delta: number;
      deltaPercent: number;
      direction: DeltaDirection;
      asPercent: boolean;
      context: string;
    };
    failedPayments30d: {
      value: number;
      delta: number;
      deltaPercent: number;
      direction: DeltaDirection;
      asPercent: boolean;
      context: string;
    };
  };
  revenue: {
    currentRangeRevenueUsd: number;
    previousRangeRevenueUsd: number;
    netRevenueDeltaUsd: number;
    netSubscribers: number;
    netSubscribersDelta: number;
    growthPercent: number;
    series: Array<{
      date: string;
      name: string;
      revenue: number;
      newSubscribers: number;
      churnedSubscribers: number;
      netSubscriberChange: number;
    }>;
    mrrMovement: {
      newRevenueUsd: number;
      churnedRevenueUsd: number;
      downgradeRevenueUsd: number;
      netChangeUsd: number;
    };
  };
  churnRetention: {
    subscribersAtRisk: number;
    atRiskDelta7d: number;
    voluntaryChurnRate30d: number;
    involuntaryChurnRate30d: number;
    retentionRate30d: number;
    averageSubscriptionDurationMonths: number;
  };
  paymentHealth: {
    failedCharges7d: number;
    retrySuccessRate7d: number;
    retrySuccessRateDelta: {
      delta: number;
      deltaPercent: number;
      direction: DeltaDirection;
      asPercent: boolean;
    };
    refundRate30d: number;
    refundRateDelta: {
      delta: number;
      deltaPercent: number;
      direction: DeltaDirection;
      asPercent: boolean;
    };
    collectionRate30d: number;
    collectionRateDelta: {
      delta: number;
      deltaPercent: number;
      direction: DeltaDirection;
      asPercent: boolean;
    };
    failedPaymentRate30d: number;
    providers: Array<{
      name: string;
      status: "Healthy" | "Degraded";
      failureRate: number;
    }>;
  };
  revenueByPlan: Array<{
    plan: string;
    subscribers: number;
    mrrUsd: number;
    sharePercent: number;
  }>;
  advanced: {
    arpuUsd: number;
    ltvUsd: number;
    ltvLabel: string | null;
    averageSubscriptionDurationMonths: number;
  };
};

type PlanSortKey = "plan" | "subscribers" | "mrrUsd" | "sharePercent";

const text = (en: string, fr: string, de: string, es: string, pt: string): CompleteLocalizedText => ({ en, fr, de, es, pt });

const fetcher = async (url: string): Promise<MetricsResponse> => {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Unable to load engine metrics right now.");
  }
  return response.json();
};

function formatPercent(value: number) {
  const numeric = Number(value ?? 0);
  if (!Number.isFinite(numeric)) return "0.0%";
  return `${numeric.toFixed(1)}%`;
}

function formatLastUpdated(iso: string | undefined, locale: string, t: (value: CompleteLocalizedText) => string) {
  if (!iso) return t(text("Last updated just now", "Mis ? jour à l'instant", "Gerade aktualisiert", "Actualizado hace un momento", "Atualizado agora mesmo"));
  const timestamp = new Date(iso).getTime();
  if (!Number.isFinite(timestamp)) return t(text("Last updated just now", "Mis ? jour à l'instant", "Gerade aktualisiert", "Actualizado hace un momento", "Atualizado agora mesmo"));
  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / (1000 * 60)));
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  if (minutes < 1) return t(text("Last updated just now", "Mis ? jour à l'instant", "Gerade aktualisiert", "Actualizado hace un momento", "Atualizado agora mesmo"));
  if (minutes < 60) return `${t(text("Last updated", "Mis ? jour", "Zuletzt aktualisiert", "?ltima actualizacion", "?ltima atualiza??o"))} ${rtf.format(-minutes, "minute")}`;
  const hours = Math.floor(minutes / 60);
  return `${t(text("Last updated", "Mis ? jour", "Zuletzt aktualisiert", "?ltima actualizacion", "?ltima atualiza??o"))} ${rtf.format(-hours, "hour")}`;
}

function StatusBadge({ level }: { level: EngineStatusLevel; label: string }) {
  const { t } = useLanguage();
  const tone =
    level === "HEALTHY"
      ? "provider-health-pill"
      : level === "AT_RISK"
        ? "bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/40"
        : "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:border-rose-500/40";
  const borderWidth = "border";
  return (
    <span className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-bold ${borderWidth} ${tone}`}>
      {level === "HEALTHY"
        ? t("Healthy", "Sain", "Gesund", "Saludable", "Saudavel")
        : level === "AT_RISK"
          ? t("At Risk", "A risque", "Gefährdet", "En riesgo", "Em risco")
          : t("Critical", "Critique", "Kritisch", "Critico", "Critico")}
    </span>
  );
}

function SectionCard({
  title,
  rightSlot,
  children,
}: {
  title: string;
  rightSlot?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border/60 bg-card p-6 shadow-[0_4px_14px_rgba(15,23,42,0.04)]">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-foreground">{title}</h2>
        {rightSlot}
      </div>
      {children}
    </section>
  );
}

function MetricItem({
  label,
  value,
  context,
  deltaValue,
  deltaSuffix,
  inverse = false,
  valueClassName = "",
  containerClassName = "",
}: {
  label: string;
  value: string;
  context: string;
  deltaValue: number;
  deltaSuffix?: string;
  inverse?: boolean;
  valueClassName?: string;
  containerClassName?: string;
}) {
  return (
    <div className={`px-4 py-4 ${containerClassName}`}>
      <p className="text-[10px] font-medium uppercase leading-5 tracking-[0.1em] text-muted-foreground break-words">{label}</p>
      <p className={`mt-2 text-3xl font-semibold tracking-tight text-foreground ${valueClassName}`}>{value}</p>
      <div className="mt-1">
        <Delta value={deltaValue} suffix={deltaSuffix} compareLabel={context} inverse={inverse} mode="muted" className="max-w-full" />
      </div>
    </div>
  );
}

function LineChart({ data }: { data: MetricsResponse["revenue"]["series"] }) {
  const { t } = useLanguage();
  const chartData = data.map((row) => ({
    ...row,
    newSubscriberMarker: row.newSubscribers > 0 ? row.newSubscribers : null,
  }));

  const renderTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const row = payload[0]?.payload as MetricsResponse["revenue"]["series"][number] | undefined;
    if (!row) return null;
    return (
      <div className="rounded-xl border border-border/70 bg-background px-3 py-2 shadow-[0_8px_16px_rgba(15,23,42,0.08)]">
        <p className="text-xs text-muted-foreground">{row.name}</p>
        <p className="mt-1 text-sm font-semibold text-foreground">{formatCurrency(row.revenue, "USD")}</p>
        <div className="mt-1 space-y-0.5 text-xs text-muted-foreground">
          <p>{t("New subs:", "Nouveaux abonnes :", "Neue Abonnenten:", "Nuevos suscriptores:", "Novos subscritores:")} {row.newSubscribers}</p>
          <p>{t("Churned:", "Perdus :", "Abgaenge:", "Cancelados:", "Cancelados:")} {row.churnedSubscribers}</p>
          <p>{t("Net:", "Net :", "Netto:", "Neto:", "Liquido:")} {row.netSubscriberChange}</p>
        </div>
      </div>
    );
  };

  return (
    <div className="h-[300px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
          <defs>
            <linearGradient id="metricsRevenueFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--chart-primary, #4f46e5)" stopOpacity={0.08} />
              <stop offset="95%" stopColor="var(--chart-primary, #4f46e5)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--border)" strokeOpacity={0.3} vertical={false} />
          <XAxis
            dataKey="name"
            axisLine={false}
            tickLine={false}
            tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
            minTickGap={18}
          />
          <YAxis
            yAxisId="left"
            axisLine={false}
            tickLine={false}
            tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
            tickFormatter={(value) => `$${value}`}
          />
          <YAxis yAxisId="right" orientation="right" hide />
          <Tooltip content={renderTooltip} />
          <Area
            yAxisId="left"
            type="monotone"
            dataKey="revenue"
            stroke="none"
            fill="url(#metricsRevenueFill)"
            isAnimationActive={false}
          />
          <Line
            yAxisId="left"
            type="monotone"
            dataKey="revenue"
            stroke="var(--chart-primary, #4f46e5)"
            strokeWidth={2.8}
            dot={false}
            activeDot={{ r: 4 }}
            name={t("Revenue", "Revenu", "Umsatz", "Ingresos", "Receita")}
          />
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="netSubscriberChange"
            stroke="rgba(100,116,139,0.85)"
            strokeWidth={1.2}
            strokeDasharray="5 4"
            name={t("Net subs", "Abonnes nets", "Netto-Abonnenten", "Suscriptores netos", "Subscritores liquidos")}
            dot={false}
          />
          <Line
            yAxisId="right"
            type="linear"
            dataKey="newSubscriberMarker"
            stroke="transparent"
            strokeWidth={0}
            name={t("New subs", "Nouveaux abonnes", "Neue Abonnenten", "Nuevos suscriptores", "Novos subscritores")}
            dot={{ r: 3, fill: "#10b981", stroke: "#10b981" }}
            activeDot={{ r: 4, fill: "#10b981", stroke: "#10b981" }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

function BreakdownList({
  rows,
}: {
  rows: Array<{ label: string; value: number; negative?: boolean; emphasize?: boolean }>;
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-muted/15 px-4 py-3 text-sm">
      {rows.map((row) => (
        <div
          key={row.label}
          className={`grid grid-cols-[1fr_auto] items-center gap-6 py-1.5 ${
            row.emphasize ? "mt-2 border-t border-border/60 pt-2.5" : ""
          }`}
        >
          <span className="text-muted-foreground">{row.label}</span>
          <Delta
            value={row.negative ? -Math.abs(row.value) : Math.abs(row.value)}
            displayValue={formatCurrency(Math.abs(row.value), "USD")}
            mode={row.emphasize ? "default" : "muted"}
          />
        </div>
      ))}
    </div>
  );
}

function PlanRevenueTable({
  rows,
  sortKey,
  sortDirection,
  onSort,
}: {
  rows: MetricsResponse["revenueByPlan"];
  sortKey: PlanSortKey;
  sortDirection: "asc" | "desc";
  onSort: (key: PlanSortKey) => void;
}) {
  const { t } = useLanguage();
  const topPlan = rows[0]?.plan || null;
  const sortableHeaders: Array<{ key: PlanSortKey; label: string }> = [
    { key: "plan", label: t("Plan Name", "Nom du forfait", "Planname", "Nombre del plan", "Nome do plano") },
    { key: "subscribers", label: t("Subscribers", "Abonnes", "Abonnenten", "Suscriptores", "Subscritores") },
    { key: "mrrUsd", label: t("MRR (USD)", "MRR (USD)", "MRR (USD)", "MRR (USD)", "MRR (USD)") },
    { key: "sharePercent", label: t("% of Revenue", "% du revenu", "% des Umsatzes", "% de ingresos", "% da receita") },
  ];

  return (
    <div className="overflow-hidden rounded-xl border border-border/60">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="bg-muted/30 text-left text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
            {sortableHeaders.map((header) => (
              <th
                key={header.key}
                className={`px-4 py-3 font-semibold ${
                  header.key === "subscribers" || header.key === "mrrUsd" ? "text-center" : ""
                }`}
              >
                <button
                  type="button"
                  onClick={() => onSort(header.key)}
                  className={`inline-flex items-center gap-1 hover:text-foreground ${
                    header.key === "subscribers" || header.key === "mrrUsd" ? "w-full justify-center" : ""
                  }`}
                >
                  {header.label}
                  {sortKey === header.key ? (
                    <span>{sortDirection === "asc" ? "↑" : "↓"}</span>
                  ) : null}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const isDominant = row.plan === topPlan;
            return (
              <tr
                key={row.plan}
                className={`border-t border-border/50 ${isDominant ? "bg-indigo-50/40 dark:bg-indigo-500/10" : ""}`}
              >
                <td className="px-4 py-3 font-medium text-foreground">
                  {row.plan.charAt(0) + row.plan.slice(1).toLowerCase()}
                </td>
                <td className="px-4 py-3 text-center text-foreground">{row.subscribers}</td>
                <td className="px-4 py-3 text-center text-foreground">{formatCurrency(row.mrrUsd, "USD")}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="w-12 text-xs font-medium text-foreground">{formatPercent(row.sharePercent)}</span>
                    <div className="h-2 flex-1 rounded-full bg-muted/40">
                      <div
                        className="h-2 rounded-full bg-indigo-500/75"
                        style={{ width: `${Math.max(0, Math.min(100, row.sharePercent))}%` }}
                      />
                    </div>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function AdminMetricsPage() {
  const { language, t } = useLanguage();
  const [range, setRange] = useState<RangeKey>("30d");
  const [sortKey, setSortKey] = useState<PlanSortKey>("mrrUsd");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  const { data, error, isLoading, mutate } = useSWR<MetricsResponse>(
    `/api/admin/revenue?range=${range}`,
    fetcher
  );

  const sortedPlanRows = useMemo(() => {
    const rows = [...(data?.revenueByPlan || [])];
    rows.sort((a, b) => {
      const left = a[sortKey];
      const right = b[sortKey];
      if (typeof left === "string" && typeof right === "string") {
        return sortDirection === "asc"
          ? left.localeCompare(right)
          : right.localeCompare(left);
      }
      const leftNum = Number(left || 0);
      const rightNum = Number(right || 0);
      return sortDirection === "asc" ? leftNum - rightNum : rightNum - leftNum;
    });
    return rows;
  }, [data?.revenueByPlan, sortDirection, sortKey]);

  const kpis = data?.kpis;
  const churnRetention = data?.churnRetention;
  const paymentHealth = data?.paymentHealth;
  const revenue = data?.revenue;
  const advanced = data?.advanced;

  return (
    <div className="mx-auto max-w-[1240px] space-y-8 px-6 py-8 max-md:px-4 max-md:py-6">
      <section className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">{t("Admin", "Admin", "Admin", "Admin", "Admin")}</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground">{t("Engine Metrics", "Métriques moteur", "Engine-Metriken", "Métricas del motor", "Métricas do motor")}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {t("Subscription engine financial and retention performance.", "Performance financiere et de rétention du moteur d'abonnement.", "Finanz- und Bindungsleistung der Abonnement-Engine.", "Rendimiento financiero y de retención del motor de suscripciones.", "Desempenho financeiro e de retenção do motor de subscricoes.")}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("Provider settles in local currency; reporting normalized to USD.", "Le fournisseur regle en devise locale ; le reporting est normalise en USD.", "Der Anbieter rechnet in lokaler Währung ab; das Reporting wird auf USD normalisiert.", "El proveedor liquida en moneda local; los informes se normalizan a USD.", "O fornecedor liquida em moeda local; os relatórios s?o normalizados para USD.")}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="flex flex-wrap items-center justify-end gap-2">
            {data ? <StatusBadge level={data.engineStatus.level} label={data.engineStatus.label} /> : null}
            <Link
              href="/admin/users"
              className="inline-flex h-10 items-center rounded-lg border border-border/70 bg-background px-4 text-sm font-medium text-foreground transition hover:bg-muted/40"
            >
              {t("Open Billing", "Ouvrir la facturation", "Abrechnung öffnen", "Abrir facturación", "Abrir faturação")}
            </Link>
            <a
              href={`/api/admin/revenue/export?range=${range}`}
              className="inline-flex h-10 items-center rounded-lg border border-border/70 bg-background px-4 text-sm font-medium text-foreground transition hover:bg-muted/40"
            >
              {t("Export CSV", "Exporter CSV", "CSV exportieren", "Exportar CSV", "Exportar CSV")}
            </a>
          </div>
          <p className="text-xs text-muted-foreground">{formatLastUpdated(data?.lastUpdatedAt, LANGUAGE_LOCALES[language], t)}</p>
        </div>
      </section>

      {error ? (
        <section className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-rose-800 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200">
          <p className="text-sm font-medium">{t("Unable to load engine metrics right now.", "Impossible de charger les métriques moteur pour le moment.", "Engine-Metriken koennen derzeit nicht geladen werden.", "No se pueden cargar las métricas del motor en este momento.", "Não foi poss?vel carregar as métricas do motor neste momento.")}</p>
          <button
            type="button"
            onClick={() => void mutate()}
            className="mt-3 inline-flex h-9 items-center rounded-lg border border-rose-300 bg-white px-3 text-sm font-medium text-rose-700 transition hover:bg-rose-100 dark:border-rose-400/50 dark:bg-transparent dark:text-rose-200 dark:hover:bg-rose-500/15"
          >
            {t("Retry", "Reessayer", "Erneut versuchen", "Reintentar", "Tentar novamente")}
          </button>
        </section>
      ) : null}

      <section className="rounded-2xl border border-border/60 bg-card shadow-[0_4px_14px_rgba(15,23,42,0.04)]">
        <div className="grid gap-0 md:grid-cols-2 xl:grid-cols-5">
          {isLoading || !kpis ? (
            Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className={`px-4 py-4 ${index > 0 ? "xl:border-l xl:border-border/60" : ""}`}>
                <Skeleton className="h-16 w-full" />
              </div>
            ))
          ) : (
            <>
              <div className="xl:border-r xl:border-border/60">
                <MetricItem
                  label={t("Active Subscribers", "Abonnes actifs", "Aktive Abonnenten", "Suscriptores activos", "Subscritores ativos")}
                  value={String(kpis.activeSubscribers.value)}
                  context={kpis.activeSubscribers.context}
                  deltaValue={kpis.activeSubscribers.delta}
                />
              </div>
              <div className="xl:border-x xl:border-border/80">
                <MetricItem
                  label={t("MRR (USD)", "MRR (USD)", "MRR (USD)", "MRR (USD)", "MRR (USD)")}
                  value={formatCurrency(kpis.mrrUsd.value, "USD")}
                  context={kpis.mrrUsd.context}
                  deltaValue={kpis.mrrUsd.deltaPercent}
                  deltaSuffix="%"
                  valueClassName="text-[2.2rem] !font-extrabold leading-none"
                  containerClassName="bg-muted/10"
                />
              </div>
              <div className="xl:border-r xl:border-border/60">
                <MetricItem
                  label={t("30-Day Growth", "Croissance sur 30 jours", "30-Tage-Wachstum", "Crecimiento de 30 d?as", "Crescimento de 30 dias")}
                  value={formatPercent(kpis.growth30d.value)}
                  context={kpis.growth30d.context}
                  deltaValue={kpis.growth30d.deltaPercent}
                  deltaSuffix="%"
                />
              </div>
              <div className="xl:border-r xl:border-border/60">
                <MetricItem
                  label={t("Churn Rate (30d)", "Taux de churn (30j)", "Abwänderungsrate (30 T.)", "Tasa de cancelación (30d)", "Taxa de churn (30d)")}
                  value={formatPercent(kpis.churnRate30d.value)}
                  context={kpis.churnRate30d.context}
                  deltaValue={kpis.churnRate30d.deltaPercent}
                  deltaSuffix="%"
                  inverse
                />
              </div>
              <MetricItem
                label={t("Failed Payments (30d)", "Paiements échoués (30j)", "Fehlgeschlagene Zahlungen (30 T.)", "Pagos fallidos (30d)", "Pagamentos falhados (30d)")}
                value={String(kpis.failedPayments30d.value)}
                context={kpis.failedPayments30d.context}
                deltaValue={kpis.failedPayments30d.delta}
                inverse
              />
            </>
          )}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[1.65fr_1fr]">
        <SectionCard
          title={t("Revenue & Growth", "Revenus et croissance", "Umsatz und Wachstum", "Ingresos y crecimiento", "Receita e crescimento")}
          rightSlot={
            <div className="inline-flex rounded-lg border border-border/70 bg-muted/20 p-1">
              {(["7d", "30d", "90d"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setRange(option)}
                  className={`inline-flex rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                    range === option
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:bg-background/70 hover:text-foreground"
                  }`}
                >
                  {option.toUpperCase()}
                </button>
              ))}
            </div>
          }
        >
          {isLoading || !revenue ? <Skeleton className="h-[300px] w-full" /> : <LineChart data={revenue.series} />}
          {revenue ? (
            <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 border-t border-border/60 pt-4 text-sm text-muted-foreground">
              <Delta value={revenue.netSubscribers} compareLabel={t("subscribers", "abonnes", "Abonnenten", "suscriptores", "subscritores")} mode="muted" precision={0} />
              
              <Delta
                value={revenue.netRevenueDeltaUsd}
                compareLabel={t("net revenue", "revenu net", "Nettoumsatz", "ingresos netos", "receita liquida")}
                displayValue={formatCurrency(Math.abs(revenue.netRevenueDeltaUsd), "USD")}
                mode="muted"
              />
              <Delta value={revenue.growthPercent} suffix="%" compareLabel={t("growth", "croissance", "Wachstum", "crecimiento", "crescimento")} mode="muted" />
            </div>
          ) : null}
          {revenue ? (
            <div className="mt-4">
              <p className="mb-2 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">{t("Net MRR Movement", "Variation nette du MRR", "Netto-MRR-Bewegung", "Movimiento neto del MRR", "Movimento liquido do MRR")}</p>
              <BreakdownList
                rows={[
                  { label: t("New Revenue", "Nouveaux revenus", "Neuer Umsatz", "Nuevos ingresos", "Nova receita"), value: revenue?.mrrMovement.newRevenueUsd ?? 0 },
                  { label: t("Churned Revenue", "Revenus perdus", "Verlorener Umsatz", "Ingresos perdidos", "Receita perdida"), value: revenue?.mrrMovement.churnedRevenueUsd ?? 0, negative: true },
                  { label: t("Downgrades", "Retrogradations", "Downgrades", "Bajadas de plan", "Downgrades"), value: revenue?.mrrMovement.downgradeRevenueUsd ?? 0, negative: true },
                  { label: t("Net Change", "Variation nette", "Nettoveraenderung", "Cambio neto", "Variacao liquida"), value: revenue?.mrrMovement.netChangeUsd ?? 0, emphasize: true, negative: (revenue?.mrrMovement.netChangeUsd ?? 0) < 0 },
                ]}
              />
            </div>
          ) : null}
        </SectionCard>

        <SectionCard title={t("Churn & Retention", "Churn et rétention", "Abwänderung und Bindung", "Cancelación y retención", "Churn e retenção")}>
          {isLoading || !churnRetention ? (
            <div className="space-y-3">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : (
            <div className="space-y-3">
              <div className="rounded-xl border border-border/60 p-4">
                <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">{t("Subscribers at Risk", "Abonnes a risque", "Gefährdete Abonnenten", "Suscriptores en riesgo", "Subscritores em risco")}</p>
                <p className="mt-1 text-2xl font-semibold text-foreground">{churnRetention.subscribersAtRisk}</p>
                <div className="mt-1">
                  <Delta value={churnRetention.atRiskDelta7d} compareLabel={t("since last week", "depuis la semaine derni?re", "seit letzter Woche", "desde la semana pasada", "desde a semana passada")} mode="muted" precision={0} />
                </div>
              </div>
              <div className="rounded-xl border border-border/60 p-4">
                <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">{t("Voluntary Churn", "Churn volontaire", "Freiwillige Abwänderung", "Cancelación voluntaria", "Churn voluntario")}</p>
                <p className="mt-1 text-2xl font-semibold text-foreground">{formatPercent(churnRetention.voluntaryChurnRate30d)}</p>
                <p className="text-xs text-muted-foreground">{t("Last 30 days", "30 derniers jours", "Letzte 30 Tage", "?ltimos 30 d?as", "?ltimos 30 dias")}</p>
              </div>
              <div className="rounded-xl border border-border/60 p-4">
                <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">{t("Involuntary Churn", "Churn involontaire", "Unfreiwillige Abwänderung", "Cancelación involuntaria", "Churn involuntario")}</p>
                <p className="mt-1 text-2xl font-semibold text-foreground">{formatPercent(churnRetention.involuntaryChurnRate30d)}</p>
                <p className="text-xs text-muted-foreground">{t("Payment failures", "Echecs de paiement", "Zahlungsausfaelle", "Fallos de pago", "Falhas de pagamento")}</p>
              </div>
              <div className="rounded-xl border border-border/60 p-4">
                <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">{t("Retention Rate (30d)", "Taux de rétention (30j)", "Bindungsrate (30 T.)", "Tasa de retención (30d)", "Taxa de retenção (30d)")}</p>
                <p className="mt-1 text-2xl font-semibold text-foreground">{formatPercent(churnRetention.retentionRate30d)}</p>
              </div>
              <div className="rounded-xl border border-border/60 p-4">
                <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">{t("Average Subscription Duration", "Durée moyenne d'abonnement", "Durchschnittliche Abonnementdauer", "Duración media de suscripción", "Duracao media da subscrição")}</p>
                <p className="mt-1 text-2xl font-semibold text-foreground">{churnRetention.averageSubscriptionDurationMonths.toFixed(1)} {t("months", "mois", "Monate", "meses", "meses")}</p>
              </div>
              <div className="rounded-xl border border-border/60 p-4">
                <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">{t("LTV", "LTV", "LTV", "LTV", "LTV")}</p>
                {advanced?.ltvLabel ? (
                  <div className="mt-1 space-y-0.5">
                    <p className="text-sm font-semibold text-foreground">{t("Strong retention", "Rétention forte", "Starke Bindung", "Retención solida", "Retenção forte")}</p>
                    <p className="text-xs text-muted-foreground">{t("No churn detected", "Aucun churn detecte", "Keine Abwänderung erkannt", "No se detecto cancelación", "Nenhum churn detetado")}</p>
                  </div>
                ) : (
                  <p className="mt-1 text-2xl font-semibold text-foreground">
                    {formatCurrency(advanced?.ltvUsd ?? 0, "USD")}
                  </p>
                )}
              </div>
            </div>
          )}
        </SectionCard>
      </div>

      <SectionCard title={t("Payment Health", "Sante des paiements", "Zahlungsgesundheit", "Salud de pagos", "Saude dos pagamentos")}>
        {isLoading || !paymentHealth ? (
          <div className="grid gap-4 md:grid-cols-[1.2fr_1fr]">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : (
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(280px,1fr)]">
            <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-4">
              <div className="min-w-0 rounded-xl border border-border/60 p-4">
                <p className="text-xs uppercase leading-5 tracking-[0.1em] text-muted-foreground break-words">{t("Failed Charges (7d)", "Paiements échoués (7j)", "Fehlgeschlagene Abbuchungen (7 T.)", "Cobros fallidos (7d)", "Cobrancas falhadas (7d)")}</p>
                <p className="mt-2 text-2xl font-semibold text-foreground">{paymentHealth.failedCharges7d}</p>
              </div>
              <div className="min-w-0 rounded-xl border border-border/60 p-4">
                <p className="text-xs uppercase leading-5 tracking-[0.1em] text-muted-foreground break-words">{t("Retry Success Rate", "Taux de succes des relances", "Erfolgsquote bei Wiederholungen", "Tasa de ?xito de reintentos", "Taxa de sucesso das tentativas")}</p>
                <p className="mt-2 text-2xl font-semibold text-foreground">{formatPercent(paymentHealth.retrySuccessRate7d)}</p>
                <div className="mt-1">
                  <Delta value={paymentHealth.retrySuccessRateDelta.deltaPercent} suffix="%" compareLabel={t("vs last period", "vs periode précédente", "gegenüber letzter Periode", "vs periodo anterior", "vs periodo anterior")} mode="muted" className="max-w-full" />
                </div>
              </div>
              <div className="min-w-0 rounded-xl border border-border/60 p-4">
                <p className="text-xs uppercase leading-5 tracking-[0.1em] text-muted-foreground break-words">{t("Collection Rate", "Taux d'encaissement", "Einziehungsquote", "Tasa de cobro", "Taxa de cobranca")}</p>
                <p className="mt-2 text-2xl font-semibold text-foreground">{formatPercent(paymentHealth.collectionRate30d)}</p>
                <div className="mt-1">
                  <Delta value={paymentHealth.collectionRateDelta.deltaPercent} suffix="%" compareLabel={t("vs last period", "vs periode précédente", "gegenüber letzter Periode", "vs periodo anterior", "vs periodo anterior")} mode="muted" className="max-w-full" />
                </div>
              </div>
              <div className="min-w-0 rounded-xl border border-border/60 p-4">
                <p className="text-[10px] uppercase leading-5 tracking-[0.08em] text-muted-foreground/85 break-words">
                  {t("Subscription Refund Rate (30d)", "Taux de remboursement des abonnements (30j)", "Rückerstattungsquote fuer Abos (30 T.)", "Tasa de reembolso de suscripciones (30d)", "Taxa de reembolso de subscricoes (30d)")}
                </p>
                <p className="mt-2 text-2xl font-semibold text-foreground">{formatPercent(paymentHealth.refundRate30d)}</p>
                <div className="mt-1">
                  <Delta
                    value={paymentHealth.refundRateDelta.deltaPercent}
                    suffix="%"
                    compareLabel={t("vs last period", "vs periode précédente", "gegenüber letzter Periode", "vs periodo anterior", "vs periodo anterior")}
                    inverse
                    mode="muted"
                    className="max-w-full"
                  />
                </div>
              </div>
            </div>
            <div className="min-w-0 space-y-2 rounded-xl border border-border/60 p-4">
              <p className="text-xs uppercase leading-5 tracking-[0.1em] text-muted-foreground">{t("Providers", "Fournisseurs", "Anbieter", "Proveedores", "Fornecedores")}</p>
              {paymentHealth.providers.map((provider) => (
                <div key={provider.name} className="flex min-w-0 items-center justify-between gap-3">
                  <span className="min-w-0 truncate text-sm font-medium text-foreground">{provider.name}</span>
                  <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-bold ${
                    provider.status === "Healthy"
                      ? "provider-health-pill"
                      : "bg-amber-50 text-amber-900 border-amber-300 dark:bg-amber-500/12 dark:text-amber-300 dark:border-amber-500/45"
                  }`}>
                    {provider.status === "Healthy"
                      ? t("Healthy", "Sain", "Gesund", "Saludable", "Saudavel")
                      : t("Degraded", "Degrade", "Beeintraechtigt", "Degradado", "Degradado")}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </SectionCard>

      <SectionCard title={t("Revenue by Plan", "Revenus par forfait", "Umsatz nach Plan", "Ingresos por plan", "Receita por plano")}>
        {isLoading ? (
          <Skeleton className="h-48 w-full" />
        ) : (
          <PlanRevenueTable
            rows={sortedPlanRows}
            sortKey={sortKey}
            sortDirection={sortDirection}
            onSort={(key) => {
              if (sortKey === key) {
                setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
                return;
              }
              setSortKey(key);
              setSortDirection(key === "plan" ? "asc" : "desc");
            }}
          />
        )}
      </SectionCard>

      <SectionCard title={t("Advanced Metrics", "Métriques avancees", "Erweiterte Metriken", "Métricas avanzadas", "Métricas avancadas")}>
        {isLoading || !advanced ? (
          <Skeleton className="h-20 w-full" />
        ) : (
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">{t("ARPU", "ARPU", "ARPU", "ARPU", "ARPU")}</p>
              <p className="mt-1 text-2xl font-semibold text-foreground">{formatCurrency(advanced.arpuUsd, "USD")}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">{t("LTV", "LTV", "LTV", "LTV", "LTV")}</p>
              {advanced.ltvLabel ? (
                <div className="mt-1 space-y-0.5">
                  <p className="text-base font-semibold text-foreground">{t("Strong retention", "Rétention forte", "Starke Bindung", "Retención solida", "Retenção forte")}</p>
                  <p className="text-xs text-muted-foreground">{t("No churn detected", "Aucun churn detecte", "Keine Abwänderung erkannt", "No se detecto cancelación", "Nenhum churn detetado")}</p>
                </div>
              ) : (
                <p className="mt-1 text-2xl font-semibold text-foreground">{formatCurrency(advanced.ltvUsd, "USD")}</p>
              )}
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">{t("Average Subscription Duration", "Durée moyenne d'abonnement", "Durchschnittliche Abonnementdauer", "Duración media de suscripción", "Duracao media da subscrição")}</p>
              <p className="mt-1 text-2xl font-semibold text-foreground">
                {advanced.averageSubscriptionDurationMonths.toFixed(1)} {t("months", "mois", "Monate", "meses", "meses")}
              </p>
            </div>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
