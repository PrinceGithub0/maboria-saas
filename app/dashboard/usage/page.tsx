"use client";

import { useState } from "react";
import useSWR from "swr";
import { Activity, FileText, MessageSquare, Sparkles, Info } from "lucide-react";
import { Card } from "@/components/ui/card";
import { MiniAreaChart } from "@/components/charts/area-chart";
import { Table } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useLanguage } from "@/components/providers/language-provider";
import { formatDateDMY } from "@/lib/date";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function UsagePage() {
  const { language } = useLanguage();
  const t = (en: string, fr: string) => (language === "fr" ? fr : en);
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const { data, isLoading } = useSWR(
    `/api/analytics/usage?tz=${encodeURIComponent(timeZone)}&range=30`,
    fetcher,
    { refreshInterval: 10000, dedupingInterval: 10000, revalidateOnFocus: true }
  );
  const { data: automationBreakdown } = useSWR(
    data?.range?.cycleStart ? `/api/analytics/automation-breakdown` : null,
    fetcher,
    { refreshInterval: 10000, dedupingInterval: 10000, revalidateOnFocus: true }
  );

  const rows = Array.isArray(data?.rows) ? data.rows : [];
  const formatDayLabel = (key: string) => {
    const parts = key.split("-");
    if (parts.length !== 3) return key;
    const [year, month, day] = parts;
    const date = new Date(`${year}-${month}-${day}T00:00:00Z`);
    const shortMonth = date.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
    return `${day} ${shortMonth}`;
  };
  const aiError = data && typeof data === "object" && "error" in data;
  const formatNumber = (value: number) => new Intl.NumberFormat().format(value);
  const unitLabel = t("tokens", "jetons");
  const formatDate = (value?: string | Date) => {
    if (!value) return "--";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "--";
    return formatDateDMY(date);
  };
  const formatDateKey = (value?: string | Date) => {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
  };
  const latestUsageDate = data?.range?.lastUpdated;
  const cycleStart = data?.range?.cycleStart;
  const cycleEnd = data?.range?.cycleEnd;

  const totalsByCategory = {
    automation: rows.reduce((sum: number, row: any) => sum + (Number(row.automationRuns) || 0), 0),
    invoice: rows.reduce((sum: number, row: any) => sum + (Number(row.invoices) || 0), 0),
    ai: rows.reduce((sum: number, row: any) => sum + (Number(row.aiRequests) || 0), 0),
    whatsapp: rows.reduce((sum: number, row: any) => sum + (Number(row.whatsappMessages) || 0), 0),
  };
  const getLimitSummary = (key: keyof typeof data.limits | string) => {
    const entry = (data?.limits as any)?.[key];
    if (!entry) return null;
    if (entry.limit == null) return t("Unlimited", "Illimite");
    return `${formatNumber(entry.used || 0)} / ${formatNumber(entry.limit || 0)}`;
  };
  const getRemainingSummary = (key: keyof typeof data.limits | string) => {
    const entry = (data?.limits as any)?.[key];
    if (!entry) return null;
    if (entry.limit == null) return t("Unlimited", "Illimite");
    return formatNumber(entry.remaining || 0);
  };

  const usageHighlights = [
    {
      key: "automation",
      label: t("Automation runs", "Executions automatisation"),
      icon: Activity,
      limit: getLimitSummary("automationRuns"),
      remaining: getRemainingSummary("automationRuns"),
    },
    {
      key: "invoice",
      label: t("Invoices", "Factures"),
      icon: FileText,
      limit: getLimitSummary("invoices"),
      remaining: getRemainingSummary("invoices"),
    },
    {
      key: "ai",
      label: t("AI requests", "Requetes IA"),
      icon: Sparkles,
      limit: getLimitSummary("aiRequests"),
      remaining: getRemainingSummary("aiRequests"),
    },
    {
      key: "aiTokens",
      label: t("AI tokens", "Jetons IA"),
      icon: Sparkles,
      limit: getLimitSummary("aiTokens"),
      remaining: getRemainingSummary("aiTokens"),
    },
    {
      key: "whatsapp",
      label: t("WhatsApp messages", "Messages WhatsApp"),
      icon: MessageSquare,
      limit: getLimitSummary("whatsappMessages"),
      remaining: getRemainingSummary("whatsappMessages"),
    },
  ];
  const tableRows = [
    {
      id: `usage-automation-${data?.range?.endDate || "now"}`,
      category: t("Automation runs", "Executions automatisation"),
      amount: totalsByCategory.automation,
      period: t("daily", "quotidien"),
      createdAt: data?.range?.endDate,
    },
    {
      id: `usage-invoice-${data?.range?.endDate || "now"}`,
      category: t("Invoices", "Factures"),
      amount: totalsByCategory.invoice,
      period: t("daily", "quotidien"),
      createdAt: data?.range?.endDate,
    },
    {
      id: `usage-ai-${data?.range?.endDate || "now"}`,
      category: t("AI requests", "Requetes IA"),
      amount: totalsByCategory.ai,
      period: t("daily", "quotidien"),
      createdAt: data?.range?.endDate,
    },
    {
      id: `usage-whatsapp-${data?.range?.endDate || "now"}`,
      category: t("WhatsApp messages", "Messages WhatsApp"),
      amount: totalsByCategory.whatsapp,
      period: t("daily", "quotidien"),
      createdAt: data?.range?.endDate,
    },
  ];

  const cycleStartKey = formatDateKey(cycleStart);
  const cycleEndKey = formatDateKey(cycleEnd);
  const cycleRows =
    cycleStartKey && cycleEndKey
      ? rows.filter((row: any) => row.date >= cycleStartKey && row.date <= cycleEndKey)
      : [];
  const [cycleOffset, setCycleOffset] = useState(0);
  const baseCycleStart = cycleStart ? new Date(cycleStart) : null;
  const baseCycleEnd = cycleEnd ? new Date(cycleEnd) : null;
  const addMonths = (value: Date, months: number) =>
    new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + months, value.getUTCDate(), 0, 0, 0));
  const viewCycleStart = baseCycleStart ? addMonths(baseCycleStart, cycleOffset) : null;
  const viewCycleEnd = baseCycleEnd ? addMonths(baseCycleEnd, cycleOffset) : null;
  const viewStartKey = viewCycleStart ? formatDateKey(viewCycleStart) : undefined;
  const viewEndKey = viewCycleEnd ? formatDateKey(viewCycleEnd) : undefined;
  const viewRows =
    viewStartKey && viewEndKey
      ? rows.filter((row: any) => row.date >= viewStartKey && row.date <= viewEndKey)
      : cycleRows;
  const chartRows = viewRows.length >= 7 ? viewRows : rows;
  const chartRangeStart = chartRows[0]?.date;
  const chartRangeEnd = chartRows[chartRows.length - 1]?.date;
  const chartData: Array<{ name: string; value: number }> = chartRows.map((row: any) => ({
    name: formatDayLabel(row.date),
    value: Number(row.aiTokens) || 0,
  }));
  const aiHasData = chartData.some((point) => Number(point.value) > 0);
  const aiValues = chartData.map((point) => Number(point.value) || 0);
  const totalAi = aiValues.reduce((sum, value) => sum + value, 0);
  const avgAi = aiValues.length ? Math.round(totalAi / aiValues.length) : 0;
  const peakPoint = chartData.reduce(
    (best, point) => (Number(point.value) > Number(best.value) ? point : best),
    chartData[0] || { name: "--", value: 0 }
  );
  const peakLabel = peakPoint.name || "--";
  const canNextCycle = viewCycleEnd ? viewCycleEnd < new Date() : false;
  const exportRows = (items: any[]) =>
    items.map((row: any) => ({
      date: row.date,
      invoices: row.invoices,
      automation_runs: row.automationRuns,
      ai_requests: row.aiRequests,
      ai_tokens: row.aiTokens,
      whatsapp_messages: row.whatsappMessages,
    }));
  const toCsv = (items: any[]) => {
    if (!items.length) return "";
    const headers = Object.keys(items[0]);
    const lines = items.map((row) =>
      headers.map((key) => JSON.stringify((row as any)[key] ?? "")).join(",")
    );
    return [headers.join(","), ...lines].join("\n");
  };
  const downloadCsv = (filename: string, items: any[]) => {
    const csv = toCsv(items);
    if (!csv) return;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4 max-md:space-y-6">
      <div className="md:contents max-md:rounded-[28px] max-md:border max-md:border-border/60 max-md:bg-card max-md:p-4 max-md:shadow-[0_16px_36px_rgba(15,23,42,0.18)]">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-indigo-600 dark:text-indigo-300">
            {t("Usage", "Usage")}
          </p>
          <h1 className="text-3xl font-semibold text-foreground">
            {t("Analytics", "Analytique")}
          </h1>
        </div>
      </div>
      <Card
        title={t("AI token usage", "Utilisation tokens IA")}
        className="space-y-4"
        actions={
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <button
              type="button"
              className="rounded-full border border-border/70 bg-background/60 px-2.5 py-1 text-foreground disabled:opacity-40"
              onClick={() => setCycleOffset((value) => value - 1)}
              disabled={!baseCycleStart}
            >
              {t("Previous", "Precedent")}
            </button>
            <span className="rounded-full border border-border/70 bg-background/60 px-2.5 py-1 text-foreground">
              {chartRows === viewRows
                ? `${formatDate(viewCycleStart ?? cycleStart)} - ${formatDate(
                    viewCycleEnd ?? cycleEnd
                  )}`
                : `${formatDate(chartRangeStart)} - ${formatDate(chartRangeEnd)}`}
            </span>
            <button
              type="button"
              className="rounded-full border border-border/70 bg-background/60 px-2.5 py-1 text-foreground disabled:opacity-40"
              onClick={() => setCycleOffset((value) => value + 1)}
              disabled={!baseCycleEnd || !canNextCycle}
            >
              {t("Next", "Suivant")}
            </button>
          </div>
        }
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-border/70 bg-background/60 px-3 py-2">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              {t("Total", "Total")}
            </p>
            <p className="text-lg font-semibold text-foreground">
              {formatNumber(totalAi)} {unitLabel}
            </p>
          </div>
          <div className="rounded-xl border border-border/70 bg-background/60 px-3 py-2">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              {t("Average per day", "Moyenne par jour")}
            </p>
            <p className="text-lg font-semibold text-foreground">
              {formatNumber(avgAi)} {unitLabel}
            </p>
          </div>
          <div className="rounded-xl border border-border/70 bg-background/60 px-3 py-2">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              {t("Peak day", "Jour de pic")}
            </p>
            <p className="text-lg font-semibold text-foreground">
              {peakLabel} - {formatNumber(Number(peakPoint.value) || 0)} {unitLabel}
            </p>
          </div>
        </div>
        <MiniAreaChart data={chartData} className="min-h-[180px]" forceAllTicks />
        {aiError && (
          <p className="mt-3 text-xs text-muted-foreground">
            {t(
              "AI usage is unavailable. Upgrade to Starter to unlock AI usage metrics.",
              "Usage IA indisponible. Passez a Starter pour debloquer les metriques."
            )}
          </p>
        )}
        {!aiError && !aiHasData && (
          <p className="mt-3 text-xs text-muted-foreground">
            {t(
              "No AI usage yet. Run the AI assistant to generate token usage data.",
              "Pas d usage IA. Utilisez l assistant IA pour generer les donnees."
            )}
          </p>
        )}
      </Card>
      <Card
        title={t("Usage records", "Enregistrements usage")}
        className="space-y-4"
        actions={
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
            <span className="rounded-full border border-border/70 bg-background/60 px-2.5 py-1 text-foreground">
              {t("Total:", "Total:")} {formatNumber(tableRows.length)}
            </span>
            <span className="rounded-full border border-border/70 bg-background/60 px-2.5 py-1 text-foreground">
              {t("Last update:", "Derniere maj:")} {formatDate(latestUsageDate)}
            </span>
            <span className="rounded-full border border-border/70 bg-background/60 px-2.5 py-1 text-foreground">
              {t("Cycle:", "Cycle:")} {formatDate(cycleStart)} – {formatDate(cycleEnd)}
            </span>
            <button
              type="button"
              className="rounded-full border border-border/70 bg-background/60 px-2.5 py-1 text-foreground hover:bg-background"
              onClick={() => downloadCsv("usage-history.csv", exportRows(rows))}
            >
              {t("Export history CSV", "Exporter historique CSV")}
            </button>
            <button
              type="button"
              className="rounded-full border border-border/70 bg-background/60 px-2.5 py-1 text-foreground hover:bg-background"
              onClick={() => downloadCsv("usage-cycle.csv", exportRows(cycleRows))}
            >
              {t("Export cycle CSV", "Exporter cycle CSV")}
            </button>
            <span
              className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-background/60 px-2.5 py-1 text-foreground"
              title={t(
                "Usage resets at the start of each billing cycle.",
                "L usage est reinitialise au debut de chaque cycle."
              )}
            >
              <Info className="h-3 w-3" /> {t("Reset info", "Infos cycle")}
            </span>
            <span
              className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-background/60 px-2.5 py-1 text-foreground"
              title={t(
                "Unlimited means no cap for the current plan.",
                "Illimite signifie aucun plafond pour ce plan."
              )}
            >
              <Info className="h-3 w-3" /> {t("Unlimited", "Illimite")}
            </span>
            <span
              className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-background/60 px-2.5 py-1 text-foreground"
              title={t(
                "Counts only successful actions: invoices sent, automation runs, AI requests, WhatsApp sent.",
                "Compter uniquement les actions reussies."
              )}
            >
              <Info className="h-3 w-3" /> {t("What counts", "Ce qui compte")}
            </span>
          </div>
        }
      >
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-6" />
            <Skeleton className="h-6" />
          </div>
        ) : tableRows.length ? (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              {usageHighlights.map((item) => {
                const Icon = item.icon;
                return (
                  <div
                    key={item.key}
                    className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-background/60 px-3 py-2"
                  >
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">
                        {item.label}
                      </p>
                      {item.limit && (
                        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                          {t("Used/Limit:", "Utilise/Limite:")} {item.limit}
                        </p>
                      )}
                      {item.remaining && (
                        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                          {t("Remaining:", "Restant:")} {item.remaining}
                        </p>
                      )}
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                        {t("Cycle start:", "Debut cycle:")} {formatDate(cycleStart)}
                      </p>
                    </div>
                    <span className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border/70 bg-background/80 text-indigo-500">
                      <Icon className="h-5 w-5" />
                    </span>
                  </div>
                );
              })}
            </div>
            <Table
              data={tableRows}
              keyExtractor={(row: any) => row.id}
              columns={[
                {
                  key: "category",
                  label: t("Category", "Categorie"),
                  render: (row: any) => (
                    <span className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/60 px-3 py-1 text-xs font-semibold text-foreground">
                      <span className="h-1.5 w-1.5 rounded-full bg-indigo-500" />
                      {row.category || t("Unknown", "Inconnu")}
                    </span>
                  ),
                },
                {
                  key: "amount",
                  label: t("Amount", "Montant"),
                  render: (row: any) => (
                    <span className="text-sm font-semibold text-foreground">
                      {formatNumber(Number(row.amount) || 0)}
                    </span>
                  ),
                },
                {
                  key: "period",
                  label: t("Period", "Periode"),
                  render: (row: any) => (
                    <span className="rounded-full border border-border/70 bg-muted px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-foreground">
                      {row.period || t("Unknown", "Inconnu")}
                    </span>
                  ),
                },
                {
                  key: "createdAt",
                  label: t("Date", "Date"),
                  render: (row: any) => formatDate(row.createdAt),
                },
              ]}
            />
            {Array.isArray(automationBreakdown?.items) && automationBreakdown.items.length > 0 && (
              <div className="space-y-2 rounded-xl border border-border/70 bg-background/60 p-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  {t("Automation breakdown", "Repartition automatisations")}
                </p>
                <div className="grid gap-2">
                  {automationBreakdown.items.map((item: any) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between text-sm text-foreground"
                    >
                      <span className="font-medium">{item.name}</span>
                      <span className="text-muted-foreground">
                        {formatNumber(Number(item.count) || 0)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <EmptyState
            title={t("No usage yet", "Aucun usage")}
            description={t(
              "Run automations and AI to see usage metrics here.",
              "Lancez automatisations et IA pour voir les metriques."
            )}
          />
        )}
      </Card>
    </div>
  );
}
