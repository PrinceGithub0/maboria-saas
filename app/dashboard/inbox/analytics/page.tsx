"use client";

import useSWR from "swr";
import { MiniAreaChart } from "@/components/charts/area-chart";
import { LANGUAGE_LOCALES } from "@/lib/i18n";
import { useLanguage } from "@/components/providers/language-provider";
import { localizeServerMessage } from "@/lib/localization/server-messages";

type AnalyticsData = {
  messagesToday: number;
  messagesWeek: number;
  avgResponseMs: number;
  openCount: number;
  series: { date: string; count: number }[];
  generatedAt: string;
};

const fetcher = async (url: string): Promise<AnalyticsData> => {
  const response = await fetch(url, { cache: "no-store" });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof payload?.error === "string" ? payload.error : "Failed to load inbox analytics");
  }
  return payload as AnalyticsData;
};

const formatDuration = (ms: number) => {
  if (!ms) return "--";
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.round((ms % 60000) / 1000);
  return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
};

export default function InboxAnalyticsPage() {
  const { language, t } = useLanguage();
  const locale = LANGUAGE_LOCALES[language];
  const { data, error, isLoading, mutate } = useSWR<AnalyticsData>("/api/inbox/unified/analytics", fetcher, {
    shouldRetryOnError: false,
    revalidateOnFocus: true,
  });

  const chartData = (data?.series || []).map((point) => ({
    name: new Date(point.date).toLocaleDateString(locale, { day: "2-digit", month: "short" }),
    value: point.count,
  }));

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-slate-400">{t("Inbox", "Boite de reception", "Posteingang", "Bandeja de entrada", "Caixa de entrada")}</p>
            <h1 className="text-3xl font-semibold text-slate-900">{t("Inbox analytics", "Analytique de la boite de reception", "Posteingangsanalysen", "Analitica de la bandeja de entrada", "Analitica da caixa de entrada")}</h1>
            <p className="text-sm text-slate-500">{t("Operational visibility across WhatsApp conversations.", "Visibilite operationnelle sur les conversations WhatsApp.", "Operative Transparenz über WhatsApp-Konversationen.", "Visibilidad operativa en las conversaciones de WhatsApp.", "Visibilidade operaciónal nas conversas WhatsApp.")}</p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-[104px] animate-pulse rounded-2xl border border-slate-200 bg-white p-4" />
          ))}
        </div>

        <div className="h-[318px] animate-pulse rounded-3xl border border-slate-200 bg-white p-6" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-slate-400">{t("Inbox", "Boite de reception", "Posteingang", "Bandeja de entrada", "Caixa de entrada")}</p>
            <h1 className="text-3xl font-semibold text-slate-900">{t("Inbox analytics", "Analytique de la boite de reception", "Posteingangsanalysen", "Analitica de la bandeja de entrada", "Analitica da caixa de entrada")}</h1>
            <p className="text-sm text-slate-500">{t("Operational visibility across WhatsApp conversations.", "Visibilite operationnelle sur les conversations WhatsApp.", "Operative Transparenz über WhatsApp-Konversationen.", "Visibilidad operativa en las conversaciones de WhatsApp.", "Visibilidade operaciónal nas conversas WhatsApp.")}</p>
          </div>
        </div>

        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>{localizeServerMessage(error instanceof Error ? error.message : "", language, t("Unable to load inbox analytics.", "Impossible de charger l'analytique de la boite de reception.", "Posteingangsanalysen kÃ¶nnen nicht geladen werden.", "No se puede cargar la analitica de la bandeja de entrada.", "NÃ£o foi possivel carregar a analitica da caixa de entrada."))}</span>
            <button
              type="button"
              onClick={() => void mutate()}
              className="rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-sm font-semibold text-rose-700"
            >
              {t("Retry", "Reessayer", "Erneut versuchen", "Reintentar", "Tentar novamente")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.28em] text-slate-400">{t("Inbox", "Boite de reception", "Posteingang", "Bandeja de entrada", "Caixa de entrada")}</p>
          <h1 className="text-3xl font-semibold text-slate-900">{t("Inbox analytics", "Analytique de la boite de reception", "Posteingangsanalysen", "Analitica de la bandeja de entrada", "Analitica da caixa de entrada")}</h1>
          <p className="text-sm text-slate-500">{t("Operational visibility across WhatsApp conversations.", "Visibilite operationnelle sur les conversations WhatsApp.", "Operative Transparenz über WhatsApp-Konversationen.", "Visibilidad operativa en las conversaciones de WhatsApp.", "Visibilidade operaciónal nas conversas WhatsApp.")}</p>
        </div>
        <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
          {t("Live", "En direct", "Live", "En vivo", "Ao vivo")}
        </span>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-400">{t("Messages today", "Messages aujourd'hui", "Nachrichten heute", "Mensajes hoy", "Mensagens hoje")}</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{data.messagesToday}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-400">{t("Messages this week", "Messages cette semaine", "Nachrichten diese Woche", "Mensajes esta semana", "Mensagens esta semana")}</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{data.messagesWeek}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-400">{t("Avg response time", "Temps de réponse moyen", "Durchschnittliche Antwortzeit", "Tiempo medio de respuesta", "Tempo medio de resposta")}</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{formatDuration(data.avgResponseMs)}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-400">{t("Open conversations", "Conversations ouvertes", "Offene Konversationen", "Conversaciones abiertas", "Conversas abertas")}</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{data.openCount}</p>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_12px_30px_rgba(15,23,42,0.05)]">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-900">{t("Message volume", "Volume de messages", "Nachrichtenvolumen", "Volumen de mensajes", "Volume de mensagens")}</p>
            <p className="text-xs text-slate-500">{t("Last 14 days", "14 derniers jours", "Letzte 14 Tage", "Ultimos 14 dias", "Ultimos 14 dias")}</p>
          </div>
          <p className="text-xs text-slate-400">
            {t("Updated", "Mis a jour", "Aktualisiert", "Actualizado", "Atualizado")}{" "}
            {new Intl.DateTimeFormat(locale, {
              day: "2-digit",
              month: "short",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
              hour12: false,
            }).format(new Date(data.generatedAt))}
          </p>
        </div>
        <div className="mt-4">
          <MiniAreaChart data={chartData} forceAllTicks className="min-h-[220px]" />
        </div>
      </div>
    </div>
  );
}
