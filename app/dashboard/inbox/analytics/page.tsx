"use client";

import useSWR from "swr";
import { MiniAreaChart } from "@/components/charts/area-chart";
import { formatDateTimeDMY } from "@/lib/date";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type AnalyticsData = {
  messagesToday: number;
  messagesWeek: number;
  avgResponseMs: number;
  openCount: number;
  series: { date: string; count: number }[];
};

const formatDuration = (ms: number) => {
  if (!ms) return "—";
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.round((ms % 60000) / 1000);
  return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
};

export default function InboxAnalyticsPage() {
  const { data } = useSWR<AnalyticsData>("/api/inbox/unified/analytics", fetcher, { shouldRetryOnError: false });

  const chartData = (data?.series || []).map((point) => ({
    name: new Date(point.date).toLocaleDateString("en-GB", { day: "2-digit", month: "short" }),
    value: point.count,
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.28em] text-slate-400">Inbox</p>
          <h1 className="text-3xl font-semibold text-slate-900">Inbox analytics</h1>
          <p className="text-sm text-slate-500">Operational visibility across WhatsApp conversations.</p>
        </div>
        <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
          Live
        </span>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Messages today</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{data?.messagesToday ?? "—"}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Messages this week</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{data?.messagesWeek ?? "—"}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Avg response time</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{formatDuration(data?.avgResponseMs ?? 0)}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Open conversations</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{data?.openCount ?? "—"}</p>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_12px_30px_rgba(15,23,42,0.05)]">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-900">Message volume</p>
            <p className="text-xs text-slate-500">Last 14 days</p>
          </div>
          <p className="text-xs text-slate-400">Updated {formatDateTimeDMY(new Date())}</p>
        </div>
        <div className="mt-4">
          <MiniAreaChart data={chartData} forceAllTicks className="min-h-[220px]" />
        </div>
      </div>
    </div>
  );
}
