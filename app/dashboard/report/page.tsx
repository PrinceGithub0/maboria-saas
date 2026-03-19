"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import {
  Bot,
  Download,
  FileText,
  MessageSquare,
  ShieldCheck,
  Users,
  Workflow,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { MiniAreaChart } from "@/components/charts/area-chart";
import { formatDateDMY } from "@/lib/date";

type UsageFeatureKey =
  | "ai_requests"
  | "invoices"
  | "whatsapp_messages"
  | "automations_runs"
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
    defaultFeature: "ai_requests" | "invoices" | "whatsapp_messages" | "automations_runs";
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

function formatNumber(value: number) {
  return new Intl.NumberFormat().format(value);
}

function formatDate(value?: string | null) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return formatDateDMY(date);
}

function toStatusLabel(status: UsageSnapshot["plan"]["status"]) {
  if (status === "past_due") return "Past due";
  if (status === "canceled") return "Canceled";
  return "Active";
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
  if (feature === "whatsapp_messages") return MessageSquare;
  if (feature === "automations_runs") return Workflow;
  return Users;
}

function chartLabel(feature: UsageFeatureKey) {
  if (feature === "ai_requests") return "AI";
  if (feature === "invoices") return "Invoices";
  if (feature === "whatsapp_messages") return "WhatsApp";
  if (feature === "automations_runs") return "Automations";
  return "Team";
}

function planLabel(plan: UsageSnapshot["plan"]["id"]) {
  if (plan === "STARTER") return "Starter";
  if (plan === "PRO") return "Pro";
  if (plan === "GROWTH") return "Growth";
  if (plan === "BUSINESS") return "Business";
  return "Enterprise";
}

export default function ReportPage() {
  const router = useRouter();
  const { data, error, isLoading, mutate } = useSWR<UsageSnapshot>(
    "/api/analytics/usage?cycle=current",
    fetcher,
    { refreshInterval: 30000, dedupingInterval: 10000, revalidateOnFocus: true }
  );
  const [selectedFeature, setSelectedFeature] = useState<
    "ai_requests" | "invoices" | "whatsapp_messages" | "automations_runs"
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
      <Card title="Report dashboard">
        <div className="space-y-3">
          <p className="text-sm text-rose-700">
            {accessError
              ? "You no longer have access to this report."
              : "Unable to load usage metrics right now. Please refresh."}
          </p>
          <Button variant="secondary" onClick={() => mutate()}>
            Retry
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
              Live report refresh failed. Showing the last available snapshot.
            </p>
            <Button variant="secondary" onClick={() => mutate()}>
              Retry
            </Button>
          </div>
        </Card>
      ) : null}
      <Card
        title="Report dashboard"
        actions={
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1 text-xs font-semibold shadow-sm ${statusPillClass(data.plan.status)}`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${statusDotClass(data.plan.status)}`} />
            {toStatusLabel(data.plan.status)}
          </span>
        }
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <p className="text-2xl font-semibold text-foreground">{planLabel(data.plan.id)} Plan</p>
            <p className="text-sm text-muted-foreground">
              Cycle: {formatDate(data.cycle.startAt)} - {formatDate(data.cycle.endAt)}
            </p>
            <p className="text-xs text-muted-foreground">
              Billing interval: {data.plan.billingInterval === "yearly" ? "Yearly" : "Monthly"}
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            {data.plan.unlimited ? (
              <>
                <div className="space-y-2 text-right">
                  <span className="inline-flex items-center gap-2 rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    Unlimited usage enabled
                  </span>
                  {data.plan.apiAccessEnabled ? (
                    <p className="text-xs font-medium text-foreground">API access enabled</p>
                  ) : null}
                </div>
                <a
                  href={exportAllUrl}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-border bg-muted px-4 text-sm font-semibold text-foreground transition hover:brightness-95"
                >
                  <Download className="h-4 w-4" />
                  Export cycle
                </a>
              </>
            ) : (
              <>
                <a
                  href={exportAllUrl}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-border bg-muted px-4 text-sm font-semibold text-foreground transition hover:brightness-95"
                >
                  <Download className="h-4 w-4" />
                  Export cycle
                </a>
                <Link href="/dashboard/subscription">
                  <Button className="h-10 rounded-xl px-4">Upgrade plan</Button>
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
                  <p className="text-base font-semibold text-foreground">{card.title}</p>
                  <p className="text-xs text-muted-foreground">{card.subtitle}</p>
                </div>
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-foreground">
                  <Icon className="h-4 w-4" />
                </span>
              </div>

              {card.unlimited ? (
                <div className="space-y-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
                  <p className="font-semibold text-emerald-800">Unlimited</p>
                  <p className="text-xs font-medium">
                    Used this cycle: {formatNumber(card.used ?? 0)}
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Used / Limit</span>
                    <span className="font-semibold text-foreground">
                      {formatNumber(card.used ?? 0)} / {formatNumber(card.limit ?? 0)}
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
                    <span>{card.percentUsed ?? 0}% used</span>
                    <span>Remaining: {formatNumber(card.remaining ?? 0)}</span>
                  </div>
                </div>
              )}

              <div className="mt-1 flex items-center gap-2">
                <Button
                  variant="secondary"
                  className="h-9 rounded-lg px-3 text-xs"
                  onClick={() => handleViewDetails(card.featureKey)}
                >
                  View details
                </Button>
                <a
                  href={card.actions.exportUrl}
                  className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-border bg-muted px-3 text-xs font-semibold text-foreground transition hover:brightness-95"
                >
                  <Download className="h-3.5 w-3.5" />
                  Export
                </a>
              </div>
            </Card>
          );
        })}
      </section>

      <div ref={trendSectionRef}>
        {!hasAnyUsage ? (
        <Card title="Usage trend">
          <p className="text-sm text-muted-foreground">
            No usage yet in this cycle. Once activity starts, trend and activity rows will appear here.
          </p>
        </Card>
      ) : (
        <Card
          title="Usage trend"
          className={`space-y-4 transition-all duration-300 ${
            trendFlashing ? "ring-2 ring-blue-300/80 bg-blue-50/30" : ""
          }`}
        >
          <div className="flex flex-wrap items-center gap-2">
            {(
              ["ai_requests", "invoices", "whatsapp_messages", "automations_runs"] as const
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
                {chartLabel(feature)}
              </button>
            ))}
          </div>

          {chartData.length ? (
            <MiniAreaChart data={chartData} className="min-h-[240px]" forceAllTicks />
          ) : (
            <p className="text-sm text-muted-foreground">
              This metric has no trend data yet for the current cycle.
            </p>
          )}
        </Card>
      )}
      </div>

      <Card title="Recent activity" className="space-y-3">
        {data.recentActivity.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-border/70 text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-2 py-3 text-left">Date</th>
                  <th className="px-2 py-3 text-center">Feature</th>
                  <th className="px-2 py-3 text-center">Amount</th>
                  <th className="px-2 py-3 text-center">Type</th>
                  <th className="px-2 py-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.recentActivity.map((item, index) => (
                  <tr key={`${item.date}-${item.featureKey}-${index}`} className="border-b border-border/40">
                    <td className="px-2 py-3 text-left text-muted-foreground">{formatDate(item.date)}</td>
                    <td className="px-2 py-3 text-center font-medium text-foreground">{item.label}</td>
                    <td className="px-2 py-3 text-center text-foreground">{formatNumber(item.amount)}</td>
                    <td className="px-2 py-3 text-center text-muted-foreground">Usage</td>
                    <td className="px-2 py-3 text-center">
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-1 text-xs font-medium text-emerald-700">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                        Recorded
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No recent usage activity for this cycle.</p>
        )}
      </Card>
    </div>
  );
}
