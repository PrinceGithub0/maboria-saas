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
import { Skeleton } from "@/components/ui/skeleton";
import { Delta } from "@/components/ui/delta";

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

function formatLastUpdated(iso: string | undefined) {
  if (!iso) return "Last updated just now";
  const timestamp = new Date(iso).getTime();
  if (!Number.isFinite(timestamp)) return "Last updated just now";
  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / (1000 * 60)));
  if (minutes < 1) return "Last updated just now";
  if (minutes === 1) return "Last updated 1 minute ago";
  if (minutes < 60) return `Last updated ${minutes} minutes ago`;
  const hours = Math.floor(minutes / 60);
  if (hours === 1) return "Last updated 1 hour ago";
  return `Last updated ${hours} hours ago`;
}

function StatusBadge({ level, label }: { level: EngineStatusLevel; label: string }) {
  const tone =
    level === "HEALTHY"
      ? "provider-health-pill"
      : level === "AT_RISK"
        ? "bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/40"
        : "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:border-rose-500/40";
  const borderWidth = "border";
  return (
    <span className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-bold ${borderWidth} ${tone}`}>
      {label}
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
      <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
      <p className={`mt-2 text-3xl font-semibold tracking-tight text-foreground ${valueClassName}`}>{value}</p>
      <div className="mt-1">
        <Delta value={deltaValue} suffix={deltaSuffix} compareLabel={context} inverse={inverse} mode="muted" />
      </div>
    </div>
  );
}

function LineChart({ data }: { data: MetricsResponse["revenue"]["series"] }) {
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
          <p>New subs: {row.newSubscribers}</p>
          <p>Churned: {row.churnedSubscribers}</p>
          <p>Net: {row.netSubscriberChange}</p>
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
            name="Revenue"
          />
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="netSubscriberChange"
            stroke="rgba(100,116,139,0.85)"
            strokeWidth={1.2}
            strokeDasharray="5 4"
            name="Net subs"
            dot={false}
          />
          <Line
            yAxisId="right"
            type="linear"
            dataKey="newSubscriberMarker"
            stroke="transparent"
            strokeWidth={0}
            name="New subs"
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
  const topPlan = rows[0]?.plan || null;
  const sortableHeaders: Array<{ key: PlanSortKey; label: string }> = [
    { key: "plan", label: "Plan Name" },
    { key: "subscribers", label: "Subscribers" },
    { key: "mrrUsd", label: "MRR (USD)" },
    { key: "sharePercent", label: "% of Revenue" },
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
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Admin</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground">Engine Metrics</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Subscription engine financial and retention performance.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Provider settles in local currency; reporting normalized to USD.
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="flex flex-wrap items-center justify-end gap-2">
            {data ? <StatusBadge level={data.engineStatus.level} label={data.engineStatus.label} /> : null}
            <Link
              href="/admin/users"
              className="inline-flex h-10 items-center rounded-lg border border-border/70 bg-background px-4 text-sm font-medium text-foreground transition hover:bg-muted/40"
            >
              Open Billing
            </Link>
            <a
              href={`/api/admin/revenue/export?range=${range}`}
              className="inline-flex h-10 items-center rounded-lg border border-border/70 bg-background px-4 text-sm font-medium text-foreground transition hover:bg-muted/40"
            >
              Export CSV
            </a>
          </div>
          <p className="text-xs text-muted-foreground">{formatLastUpdated(data?.lastUpdatedAt)}</p>
        </div>
      </section>

      {error ? (
        <section className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-rose-800 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200">
          <p className="text-sm font-medium">Unable to load engine metrics right now.</p>
          <button
            type="button"
            onClick={() => void mutate()}
            className="mt-3 inline-flex h-9 items-center rounded-lg border border-rose-300 bg-white px-3 text-sm font-medium text-rose-700 transition hover:bg-rose-100 dark:border-rose-400/50 dark:bg-transparent dark:text-rose-200 dark:hover:bg-rose-500/15"
          >
            Retry
          </button>
        </section>
      ) : null}

      <section className="rounded-2xl border border-border/60 bg-card shadow-[0_4px_14px_rgba(15,23,42,0.04)]">
        <div className="grid gap-0 md:grid-cols-5">
          {isLoading || !kpis ? (
            Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className={`px-4 py-4 ${index > 0 ? "md:border-l md:border-border/60" : ""}`}>
                <Skeleton className="h-16 w-full" />
              </div>
            ))
          ) : (
            <>
              <div className="md:border-r md:border-border/60">
                <MetricItem
                  label="Active Subscribers"
                  value={String(kpis.activeSubscribers.value)}
                  context={kpis.activeSubscribers.context}
                  deltaValue={kpis.activeSubscribers.delta}
                />
              </div>
              <div className="md:border-x md:border-border/80">
                <MetricItem
                  label="MRR (USD)"
                  value={formatCurrency(kpis.mrrUsd.value, "USD")}
                  context={kpis.mrrUsd.context}
                  deltaValue={kpis.mrrUsd.deltaPercent}
                  deltaSuffix="%"
                  valueClassName="text-[2.2rem] !font-extrabold leading-none"
                  containerClassName="bg-muted/10"
                />
              </div>
              <div className="md:border-r md:border-border/60">
                <MetricItem
                  label="30-Day Growth"
                  value={formatPercent(kpis.growth30d.value)}
                  context={kpis.growth30d.context}
                  deltaValue={kpis.growth30d.deltaPercent}
                  deltaSuffix="%"
                />
              </div>
              <div className="md:border-r md:border-border/60">
                <MetricItem
                  label="Churn Rate (30d)"
                  value={formatPercent(kpis.churnRate30d.value)}
                  context={kpis.churnRate30d.context}
                  deltaValue={kpis.churnRate30d.deltaPercent}
                  deltaSuffix="%"
                  inverse
                />
              </div>
              <MetricItem
                label="Failed Payments (30d)"
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
          title="Revenue & Growth"
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
              <Delta value={revenue.netSubscribers} compareLabel="subscribers" mode="muted" precision={0} />
              <Delta
                value={revenue.netRevenueDeltaUsd}
                compareLabel="net revenue"
                displayValue={formatCurrency(Math.abs(revenue.netRevenueDeltaUsd), "USD")}
                mode="muted"
              />
              <Delta value={revenue.growthPercent} suffix="%" compareLabel="growth" mode="muted" />
            </div>
          ) : null}
          {revenue ? (
            <div className="mt-4">
              <p className="mb-2 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">Net MRR Movement</p>
              <BreakdownList
                rows={[
                  { label: "New Revenue", value: revenue?.mrrMovement.newRevenueUsd ?? 0 },
                  { label: "Churned Revenue", value: revenue?.mrrMovement.churnedRevenueUsd ?? 0, negative: true },
                  { label: "Downgrades", value: revenue?.mrrMovement.downgradeRevenueUsd ?? 0, negative: true },
                  { label: "Net Change", value: revenue?.mrrMovement.netChangeUsd ?? 0, emphasize: true, negative: (revenue?.mrrMovement.netChangeUsd ?? 0) < 0 },
                ]}
              />
            </div>
          ) : null}
        </SectionCard>

        <SectionCard title="Churn & Retention">
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
                <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Subscribers at Risk</p>
                <p className="mt-1 text-2xl font-semibold text-foreground">{churnRetention.subscribersAtRisk}</p>
                <div className="mt-1">
                  <Delta value={churnRetention.atRiskDelta7d} compareLabel="since last week" mode="muted" precision={0} />
                </div>
              </div>
              <div className="rounded-xl border border-border/60 p-4">
                <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Voluntary Churn</p>
                <p className="mt-1 text-2xl font-semibold text-foreground">{formatPercent(churnRetention.voluntaryChurnRate30d)}</p>
                <p className="text-xs text-muted-foreground">Last 30 days</p>
              </div>
              <div className="rounded-xl border border-border/60 p-4">
                <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Involuntary Churn</p>
                <p className="mt-1 text-2xl font-semibold text-foreground">{formatPercent(churnRetention.involuntaryChurnRate30d)}</p>
                <p className="text-xs text-muted-foreground">Payment failures</p>
              </div>
              <div className="rounded-xl border border-border/60 p-4">
                <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Retention Rate (30d)</p>
                <p className="mt-1 text-2xl font-semibold text-foreground">{formatPercent(churnRetention.retentionRate30d)}</p>
              </div>
              <div className="rounded-xl border border-border/60 p-4">
                <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Average Subscription Duration</p>
                <p className="mt-1 text-2xl font-semibold text-foreground">{churnRetention.averageSubscriptionDurationMonths.toFixed(1)} months</p>
              </div>
              <div className="rounded-xl border border-border/60 p-4">
                <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">LTV</p>
                {advanced?.ltvLabel ? (
                  <div className="mt-1 space-y-0.5">
                    <p className="text-sm font-semibold text-foreground">Strong retention</p>
                    <p className="text-xs text-muted-foreground">No churn detected</p>
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

      <SectionCard title="Payment Health">
        {isLoading || !paymentHealth ? (
          <div className="grid gap-4 md:grid-cols-[1.2fr_1fr]">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-[1.2fr_1fr]">
            <div className="grid gap-3 sm:grid-cols-4">
              <div className="rounded-xl border border-border/60 p-4">
                <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Failed Charges (7d)</p>
                <p className="mt-2 text-2xl font-semibold text-foreground">{paymentHealth.failedCharges7d}</p>
              </div>
              <div className="rounded-xl border border-border/60 p-4">
                <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Retry Success Rate</p>
                <p className="mt-2 text-2xl font-semibold text-foreground">{formatPercent(paymentHealth.retrySuccessRate7d)}</p>
                <div className="mt-1">
                  <Delta value={paymentHealth.retrySuccessRateDelta.deltaPercent} suffix="%" compareLabel="vs last period" mode="muted" />
                </div>
              </div>
              <div className="rounded-xl border border-border/60 p-4">
                <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Collection Rate</p>
                <p className="mt-2 text-2xl font-semibold text-foreground">{formatPercent(paymentHealth.collectionRate30d)}</p>
                <div className="mt-1">
                  <Delta value={paymentHealth.collectionRateDelta.deltaPercent} suffix="%" compareLabel="vs last period" mode="muted" />
                </div>
              </div>
              <div className="rounded-xl border border-border/60 p-4">
                <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground/85">
                  Subscription Refund Rate (30d)
                </p>
                <p className="mt-2 text-2xl font-semibold text-foreground">{formatPercent(paymentHealth.refundRate30d)}</p>
                <div className="mt-1">
                  <Delta
                    value={paymentHealth.refundRateDelta.deltaPercent}
                    suffix="%"
                    compareLabel="vs last period"
                    inverse
                    mode="muted"
                  />
                </div>
              </div>
            </div>
            <div className="space-y-2 rounded-xl border border-border/60 p-4">
              <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Providers</p>
              {paymentHealth.providers.map((provider) => (
                <div key={provider.name} className="flex items-center justify-between">
                  <span className="text-sm font-medium text-foreground">{provider.name}</span>
                  <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-bold ${
                    provider.status === "Healthy"
                      ? "provider-health-pill"
                      : "bg-amber-50 text-amber-900 border-amber-300 dark:bg-amber-500/12 dark:text-amber-300 dark:border-amber-500/45"
                  }`}>
                    {provider.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </SectionCard>

      <SectionCard title="Revenue by Plan">
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

      <SectionCard title="Advanced Metrics">
        {isLoading || !advanced ? (
          <Skeleton className="h-20 w-full" />
        ) : (
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">ARPU</p>
              <p className="mt-1 text-2xl font-semibold text-foreground">{formatCurrency(advanced.arpuUsd, "USD")}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">LTV</p>
              {advanced.ltvLabel ? (
                <div className="mt-1 space-y-0.5">
                  <p className="text-base font-semibold text-foreground">Strong retention</p>
                  <p className="text-xs text-muted-foreground">No churn detected</p>
                </div>
              ) : (
                <p className="mt-1 text-2xl font-semibold text-foreground">{formatCurrency(advanced.ltvUsd, "USD")}</p>
              )}
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Average Subscription Duration</p>
              <p className="mt-1 text-2xl font-semibold text-foreground">
                {advanced.averageSubscriptionDurationMonths.toFixed(1)} months
              </p>
            </div>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
