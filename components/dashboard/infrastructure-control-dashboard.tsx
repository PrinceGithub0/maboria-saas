"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import {
  AlertTriangle,
  CalendarRange,
  CheckCircle2,
  Clock3,
  Loader2,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  XCircle,
} from "lucide-react";

import { useLanguage } from "@/components/providers/language-provider";
import { formatCurrency } from "@/lib/currency";
import { LANGUAGE_LOCALES } from "@/lib/i18n";
import type {
  DateRangeKey,
  InfrastructureDashboardPayload,
  SystemState,
  TimelineEntry,
} from "@/lib/dashboard/control-types";

const AUTO_REFRESH_KEY = "dashboard_auto_refresh";
const RANGE_KEY = "dashboard_date_range";
const TIMELINE_PAGE_SIZE = 20;

type Translate = (en: string, fr?: string, de?: string, es?: string, pt?: string) => string;

function msLabel(value: number | null) {
  if (!value || value <= 0) return "--";
  if (value < 1000) return `${value} ms`;
  if (value < 60000) return `${(value / 1000).toFixed(1)} s`;
  const mins = Math.floor(value / 60000);
  const secs = Math.round((value % 60000) / 1000);
  return `${mins}m ${secs}s`;
}

function stateLabel(state: SystemState, t: Translate) {
  if (state === "critical") return t("Critical", "Critique", "Kritisch", "Critico", "Critico");
  if (state === "degraded") return t("Degraded", "Degrade", "Beeintrachtigt", "Degradado", "Degradado");
  return t("Stable", "Stable", "Stabil", "Estable", "Estavel");
}

function stateClasses(state: SystemState) {
  if (state === "critical") return "border-red-300 bg-red-50 text-red-800";
  if (state === "degraded") return "border-amber-300 bg-amber-50 text-amber-800";
  return "border-emerald-300 bg-emerald-50 text-emerald-800";
}

function timelineIcon(item: TimelineEntry) {
  if (item.status === "failed") return XCircle;
  if (item.status === "warning") return AlertTriangle;
  if (item.status === "success") return CheckCircle2;
  return Clock3;
}

function rangeLabel(key: DateRangeKey, t: Translate) {
  if (key === "today") return t("Today", "Aujourd'hui", "Heute", "Hoy", "Hoje");
  if (key === "7d") return t("Last 7 Days", "7 derniers jours", "Letzte 7 Tage", "Últimos 7 días", "Últimos 7 dias");
  if (key === "30d") return t("Last 30 Days", "30 derniers jours", "Letzte 30 Tage", "Últimos 30 días", "Últimos 30 dias");
  return t("Custom", "Personnalise", "Benutzerdefiniert", "Personalizado", "Personalizado");
}

function queueStatusLabel(value: InfrastructureDashboardPayload["commandStrip"]["queueStatus"], t: Translate) {
  if (value === "High") return t("High", "Eleve", "Hoch", "Alta", "Alta");
  if (value === "Moderate") return t("Moderate", "Modere", "Mittel", "Moderada", "Moderada");
  return t("Low", "Faible", "Niedrig", "Baja", "Baixa");
}

function healthLabel(value: "Healthy" | "Degraded", t: Translate) {
  if (value === "Degraded") return t("Degraded", "Degrade", "Beeintrachtigt", "Degradado", "Degradado");
  return t("Healthy", "Sain", "Gesund", "Saludable", "Saudavel");
}

function localizeAlertItem(item: string, t: Translate) {
  const failedMatch = item.match(/^(\d+) automations failed in the last hour$/i);
  if (failedMatch) {
    return t(
      `${failedMatch[1]} automations failed in the last hour`,
      `${failedMatch[1]} automatisations ont echoue au cours de la derniere heure`,
      `${failedMatch[1]} Automatisierungen sind in der letzten Stunde fehlgeschlagen`,
      `${failedMatch[1]} automatizaciones fallaron en la ultima hora`,
      `${failedMatch[1]} automacoes falharam na ultima hora`
    );
  }
  const retriesMatch = item.match(/^(\d+) retries pending$/i);
  if (retriesMatch) {
    return t(
      `${retriesMatch[1]} retries pending`,
      `${retriesMatch[1]} nouvelles tentatives en attente`,
      `${retriesMatch[1]} Wiederholungen ausstehend`,
      `${retriesMatch[1]} reintentos pendientes`,
      `${retriesMatch[1]} repeticoes pendentes`
    );
  }
  if (item === "Messaging delivery delays detected") {
    return t(
      "Messaging delivery delays detected",
      "Retards de livraison de messagerie détectés",
      "Verzogerungen bei der Nachrichtenzustellung erkannt",
      "Se detectaron retrasos en la entrega de mensajes",
      "Foram detetados atrasos na entrega de mensagens"
    );
  }
  if (item === "All automations running normally") {
    return t(
      "All automations running normally",
      "Toutes les automatisations fonctionnent normalement",
      "Alle Automatisierungen laufen normal",
      "Todas las automatizaciones funcionan con normalidad",
      "Todas as automações estão a funcionar normalmente"
    );
  }
  return item;
}

function localizeSummary(summary: string, t: Translate) {
  if (summary === "Messaging provider outage affecting delivery.") {
    return t(
      "Messaging provider outage affecting delivery.",
      "Une panne du fournisseur de messagerie affecte la livraison.",
      "Ein Ausfall des Messaging-Anbieters beeinträchtigt die Zustellung.",
      "Una caida del proveedor de mensajeria afecta la entrega.",
      "Uma falha do fornecedor de mensagens afeta a entrega."
    );
  }
  if (summary === "Automation execution failures detected. Active incident handling in progress.") {
    return t(
      "Automation execution failures detected. Active incident handling in progress.",
      "Des \u00e9checs d'ex\u00e9cution d'automatisations ont \u00e9t\u00e9 d\u00e9tect\u00e9s. Gestion active de l'incident en cours.",
      "Fehler bei der Automatisierungsausführung erkannt. Aktive Vorfallsbearbeitung läuft.",
      "Se detectaron fallos de ejecución de automatizaciones. La gesti?n del incidente esta en curso.",
      "Foram detetadas falhas na execução das automações. A gestão do incidente esta em curso."
    );
  }
  if (summary === "Critical system degradation detected. Immediate action required.") {
    return t(
      "Critical system degradation detected. Immediate action required.",
      "Une d\u00e9gradation critique du syst\u00e8me a \u00e9t\u00e9 d\u00e9tect\u00e9e. Une action imm\u00e9diate est requise.",
      "Kritische Systembeeintrachtigung erkannt. Sofortiges Handeln ist erforderlich.",
      "Se detecto una degradacion critica del sistema. Se requiere acción inmediata.",
      "Foi detetada uma degradacao critica do sistema. E necessária ação imediata."
    );
  }
  if (summary === "Payment latency elevated. Monitoring in progress.") {
    return t(
      "Payment latency elevated. Monitoring in progress.",
      "La latence des paiements est élevée. Surveillance en cours.",
      "Die Zahlungslatenz ist erhoht. überwachung läuft.",
      "La latencia de pago es elevada. Monitorizacion en curso.",
      "A latencia dos pagamentos esta elevada. Monitorizacao em curso."
    );
  }
  if (summary === "All automations operating normally. No critical risks detected.") {
    return t(
      "All automations operating normally. No critical risks detected.",
      "Toutes les automatisations fonctionnent normalement. Aucun risque critique detecte.",
      "Alle Automatisierungen laufen normal. Keine kritischen Risiken erkannt.",
      "Todas las automatizaciones funcionan con normalidad. No se detectaron riesgos criticos.",
      "Todas as automações estão a funcionar normalmente. Não foram detetados riscos criticos."
    );
  }
  return summary;
}

function localizeTimelineTitle(title: string, t: Translate) {
  const statusMatch = title.match(/^(.*) (failed|completed|updated)$/i);
  if (!statusMatch) return title;
  const [, prefix, status] = statusMatch;
  if (status.toLowerCase() === "failed") {
    return t(`${prefix} failed`, `${prefix} a echoue`, `${prefix} fehlgeschlagen`, `${prefix} fallo`, `${prefix} falhou`);
  }
  if (status.toLowerCase() === "completed") {
    return t(`${prefix} completed`, `${prefix} termine`, `${prefix} abgeschlossen`, `${prefix} completado`, `${prefix} concluido`);
  }
  return t(`${prefix} updated`, `${prefix} mis a jour`, `${prefix} aktualisiert`, `${prefix} actualizado`, `${prefix} atualizado`);
}

function buildRangeQuery(range: InfrastructureDashboardPayload["dateRange"]) {
  const query = new URLSearchParams();
  query.set("range", range.key);
  if (range.key === "custom") {
    query.set("from", range.from);
    query.set("to", range.to);
  }
  return query;
}

function Sparkline({ points }: { points: Array<{ label: string; value: number }> }) {
  const max = Math.max(100, ...points.map((point) => point.value));
  const width = 240;
  const height = 64;
  const coords = points
    .map((point, index) => {
      const x = (index / Math.max(points.length - 1, 1)) * width;
      const y = height - (point.value / max) * height;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-16 w-full">
      <polyline fill="none" stroke="#1d4ed8" strokeWidth="2.5" points={coords} />
    </svg>
  );
}

function SkeletonLayout() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="h-14 rounded-lg border border-slate-200 bg-slate-100" />
      <div className="h-8 rounded-lg border border-slate-200 bg-slate-100" />
      <div className="h-64 rounded-lg border border-slate-200 bg-slate-100" />
      <div className="grid gap-3 md:grid-cols-3">
        <div className="h-44 rounded-lg border border-slate-200 bg-slate-100" />
        <div className="h-44 rounded-lg border border-slate-200 bg-slate-100" />
        <div className="h-44 rounded-lg border border-slate-200 bg-slate-100" />
      </div>
      <div className="h-64 rounded-lg border border-slate-200 bg-slate-100" />
    </div>
  );
}

export function InfrastructureControlDashboard({
  initialData,
}: {
  initialData: InfrastructureDashboardPayload;
}) {
  const { language, t } = useLanguage();
  const locale = LANGUAGE_LOCALES[language];
  const router = useRouter();
  const [data, setData] = useState<InfrastructureDashboardPayload>(initialData);
  const [isInitialLoading] = useState(!initialData);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [timelineVisible, setTimelineVisible] = useState(TIMELINE_PAGE_SIZE);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const inFlightRef = useRef(false);
  const intervalRef = useRef<number | null>(null);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(AUTO_REFRESH_KEY);
      setAutoRefresh(stored === "true");
    } catch {
      setAutoRefresh(false);
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(AUTO_REFRESH_KEY, String(autoRefresh));
    } catch {
      // ignore
    }
  }, [autoRefresh]);

  useEffect(() => {
    try {
      window.localStorage.setItem(RANGE_KEY, JSON.stringify(data.dateRange.query));
    } catch {
      // ignore
    }
  }, [data.dateRange]);

  const refreshData = useCallback(
    async ({ silent = false }: { silent?: boolean } = {}) => {
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      if (!silent) setIsRefreshing(true);
      setWarning(null);

      try {
        const query = buildRangeQuery(data.dateRange);
        const response = await fetch(`/api/dashboard/control?${query.toString()}`, { cache: "no-store" });
        if (!response.ok) throw new Error("refresh_failed");
        const next = (await response.json()) as InfrastructureDashboardPayload;
        setData(next);
      } catch {
        setWarning(
          t(
            "Live data temporarily unavailable. Showing last updated state.",
            "Les données en direct sont temporairement indisponibles. Affichage du dernier etat connu.",
            "Live-Daten sind vorübergehend nicht verfügbar. Letzter bekannter Stand wird angezeigt.",
            "Los datos en vivo no est?n disponibles temporalmente. Se muestra el Último estado conocido.",
            "Os dados em tempo real estão temporariamente indisponiveis. A mostrar o Último estado conhecido."
          )
        );
      } finally {
        inFlightRef.current = false;
        if (!silent) setIsRefreshing(false);
      }
    },
    [data.dateRange, t]
  );

  useEffect(() => {
    if (intervalRef.current) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (!autoRefresh) return;
    intervalRef.current = window.setInterval(() => {
      void refreshData({ silent: true });
    }, 20000);
    return () => {
      if (intervalRef.current) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [autoRefresh, refreshData]);

  const withRange = useCallback(
    (path: string, extra?: Record<string, string>) => {
      const query = buildRangeQuery(data.dateRange);
      Object.entries(extra || {}).forEach(([key, value]) => query.set(key, value));
      const qs = query.toString();
      return qs ? `${path}?${qs}` : path;
    },
    [data.dateRange]
  );

  const setRange = async (next: { range: DateRangeKey; from?: string; to?: string }) => {
    const query = new URLSearchParams();
    query.set("range", next.range);
    if (next.range === "custom") {
      if (!next.from || !next.to) return;
      query.set("from", next.from);
      query.set("to", next.to);
    }
    const nextPath = `/dashboard?${query.toString()}`;
    router.replace(nextPath, { scroll: false });

    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setIsRefreshing(true);
    setWarning(null);
    try {
      const response = await fetch(`/api/dashboard/control?${query.toString()}`, { cache: "no-store" });
      if (!response.ok) throw new Error("range_fetch_failed");
      const payload = (await response.json()) as InfrastructureDashboardPayload;
      setData(payload);
      setTimelineVisible(TIMELINE_PAGE_SIZE);
    } catch {
      setWarning(
        t(
          "Live data temporarily unavailable. Showing last updated state.",
          "Les données en direct sont temporairement indisponibles. Affichage du dernier etat connu.",
          "Live-Daten sind vorübergehend nicht verfügbar. Letzter bekannter Stand wird angezeigt.",
          "Los datos en vivo no est?n disponibles temporalmente. Se muestra el Último estado conocido.",
          "Os dados em tempo real estão temporariamente indisponiveis. A mostrar o Último estado conhecido."
        )
      );
    } finally {
      inFlightRef.current = false;
      setIsRefreshing(false);
    }
  };

  const retrySafeRun = async (item: TimelineEntry) => {
    if (!item.runId || !item.canRetry) return;
    setRetryingId(item.id);
    setWarning(null);
    try {
      const response = await fetch("/api/automation/retry-safe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId: item.runId }),
      });
      if (!response.ok) throw new Error("retry_failed");
      await refreshData({ silent: true });
    } catch {
      setWarning(
        t(
          "Retry could not be started. Please open Automation Operations for details.",
          "La relance n'a pas pu démarrer. Ouvrez les operations d'automatisation pour plus de d?tails.",
          "Der erneute Versuch konnte nicht gestartet werden. Offne die Automatisierungsoperationen für Details.",
          "No se pudo iniciar el reintento. Abre Operaciones de automatización para ver los detalles.",
          "Não foi possível iniciar a repeticao. Abra Operações de automação para ver os detalhes."
        )
      );
    } finally {
      setRetryingId(null);
    }
  };

  const currentRange = data.dateRange;
  const visibleTimeline = data.timeline.slice(0, timelineVisible);
  const canLoadMore = timelineVisible < data.timeline.length;
  const defaultCustomFrom = currentRange.key === "custom" ? currentRange.from : "";
  const defaultCustomTo = currentRange.key === "custom" ? currentRange.to : "";
  const [customFrom, setCustomFrom] = useState(defaultCustomFrom);
  const [customTo, setCustomTo] = useState(defaultCustomTo);

  useEffect(() => {
    if (currentRange.key === "custom") {
      setCustomFrom(currentRange.from);
      setCustomTo(currentRange.to);
    }
  }, [currentRange]);

  const commandMetrics = useMemo(
    () => [
      {
        label: t("Active Automations", "Automatisations actives", "Aktive Automatisierungen", "Automatizaciónes activas", "Automações ativas"),
        value: data.commandStrip.activeAutomations,
      },
      {
        label: t("Failed Runs", "Executions échouées", "Fehlgeschlagene Laufe", "Ejecuciones fallidas", "Execucoes falhadas"),
        value: data.commandStrip.failedRuns,
      },
      {
        label: t("Queue Status", "Statut de la file", "Warteschlangenstatus", "Estado de la cola", "Estado da fila"),
        value: queueStatusLabel(data.commandStrip.queueStatus, t),
      },
      {
        label: t("Average Execution", "Ex?cution moyenne", "Durchschnittliche Ausführung", "Ejecución media", "Execução media"),
        value: msLabel(data.commandStrip.averageExecutionMs),
      },
      {
        label: t("Last Updated", "Derni?re mise ? jour", "Zuletzt aktualisiert", "Última actualización", "Última atualização"),
        value: new Date(data.commandStrip.lastUpdated).toLocaleTimeString(locale, {
          hour: "2-digit",
          minute: "2-digit",
        }),
      },
    ],
    [data.commandStrip, locale, t]
  );

  if (isInitialLoading) return <SkeletonLayout />;

  return (
    <div className="space-y-4 bg-slate-50 pb-8">
      <section className="border border-slate-200 bg-white px-4 py-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <span
              className={clsx(
                "inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-semibold",
                stateClasses(data.commandStrip.state)
              )}
            >
              <span className="h-2.5 w-2.5 rounded-full bg-current" />
              {t("System State", "Etat du système", "Systemstatus", "Estado del sistema", "Estado do sistema")}:{" "}
              {stateLabel(data.commandStrip.state, t)}
            </span>
            <span className="text-sm text-slate-600">
              {t(
                "Automation Operations Command Surface",
                "Surface de commande des operations d'automatisation",
                "Befehlsoberflache für Automatisierungsoperationen",
                "Superficie de mando de operaciónes de automatización",
                "Superficie de comando das operações de automação"
              )}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex items-center gap-2 text-sm text-slate-700">
              {t("Auto-refresh", "Actualisation automatique", "Automatische Aktualisierung", "Actualización automática", "Atualização automática")}
              <button
                type="button"
                onClick={() => setAutoRefresh((prev) => !prev)}
                className={clsx(
                  "relative inline-flex h-6 w-11 items-center rounded-full border transition",
                  autoRefresh ? "border-blue-600 bg-blue-600" : "border-slate-300 bg-slate-200"
                )}
                aria-pressed={autoRefresh}
              >
                <span
                  className={clsx(
                    "inline-block h-4 w-4 transform rounded-full bg-white transition",
                    autoRefresh ? "translate-x-6" : "translate-x-1"
                  )}
                />
              </button>
            </label>
            <button
              type="button"
              onClick={() => void refreshData({ silent: false })}
              className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-800"
              disabled={isRefreshing}
            >
              {isRefreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              {t("Refresh", "Actualiser", "Aktualisieren", "Actualizar", "Atualizar")}
            </button>
            <div className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-1.5">
              <CalendarRange className="h-4 w-4 text-slate-600" />
              <select
                value={currentRange.key}
                onChange={(event) => void setRange({ range: event.target.value as DateRangeKey })}
                className="bg-transparent text-sm font-medium text-slate-800 outline-none"
              >
                <option value="today">{t("Today", "Aujourd'hui", "Heute", "Hoy", "Hoje")}</option>
                <option value="7d">{t("Last 7 Days", "7 derniers jours", "Letzte 7 Tage", "Últimos 7 días", "Últimos 7 dias")}</option>
                <option value="30d">{t("Last 30 Days", "30 derniers jours", "Letzte 30 Tage", "Últimos 30 días", "Últimos 30 dias")}</option>
                <option value="custom">{t("Custom", "Personnalise", "Benutzerdefiniert", "Personalizado", "Personalizado")}</option>
              </select>
            </div>
            {currentRange.key === "custom" ? (
              <div className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-2 py-1.5">
                <input
                  type="date"
                  value={customFrom}
                  onChange={(event) => setCustomFrom(event.target.value)}
                  className="rounded border border-slate-200 px-2 py-1 text-xs text-slate-700"
                />
                <span className="text-slate-400">{t("to", "a", "bis", "a", "a")}</span>
                <input
                  type="date"
                  value={customTo}
                  onChange={(event) => setCustomTo(event.target.value)}
                  className="rounded border border-slate-200 px-2 py-1 text-xs text-slate-700"
                />
                <button
                  type="button"
                  onClick={() => void setRange({ range: "custom", from: customFrom, to: customTo })}
                  className="rounded bg-slate-900 px-2.5 py-1 text-xs font-semibold text-white"
                >
                  {t("Apply", "Appliquer", "Anwenden", "Aplicar", "Aplicar")}
                </button>
              </div>
            ) : null}
          </div>
        </div>

        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {commandMetrics.map((item) => (
            <div key={item.label} className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="text-[11px] uppercase tracking-wide text-slate-500">{item.label}</p>
              <p className="text-sm font-semibold text-slate-900">{item.value}</p>
            </div>
          ))}
        </div>
      </section>

      {warning ? (
        <section className="border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">{warning}</section>
      ) : null}

      <section
        className={clsx(
          "border px-4 py-3 text-sm font-medium",
          data.alertStrip.mode === "ok" ? "border-emerald-300 bg-emerald-100 text-emerald-900" : "border-amber-300 bg-amber-100 text-amber-900"
        )}
      >
        {data.alertStrip.items.map((item) => localizeAlertItem(item, t)).join(" | ")}
      </section>

      <section className="border border-slate-200 bg-white p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">
              {t(
                "Infrastructure Control Dashboard",
                "Tableau de controle de l'infrastructure",
                "Infrastruktur-Kontrolldashboard",
                "Panel de control de infraestructura",
                "Painel de controlo da infraestrutura"
              )}
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              {t(
                "Operational visibility across automation, billing, and infrastructure health.",
                "Visibilit? operationnelle sur l'automatisation, la facturation et l'etat de l'infrastructure.",
                "Operative Transparenz über Automatisierung, Abrechnung und Infrastrukturzustand.",
                "Visibilidad operativa sobre automatización, facturación y salud de la infraestructura.",
                "Visibilidade operaciónal sobre automação, faturação e saude da infraestrutura."
              )}
            </p>
          </div>
          <span className="rounded-md border border-slate-300 bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700">
            {t("Range", "Periode", "Zeitraum", "Periodo", "Periodo")}: {rangeLabel(data.dateRange.key, t)}
          </span>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-[1.3fr_0.7fr]">
          <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs uppercase tracking-[0.16em] text-slate-500">{t("System State", "Etat du système", "Systemstatus", "Estado del sistema", "Estado do sistema")}</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded border border-slate-200 bg-white px-3 py-2">
                <p className="text-[11px] uppercase text-slate-500">{t("Automation Success Rate", "Taux de reussite des automatisations", "Erfolgsquote der Automatisierungen", "Tasa de ?xito de automatizaciones", "Taxa de sucesso das automações")}</p>
                <p className="text-2xl font-semibold text-slate-900">{data.primary.successRate}%</p>
              </div>
              <div className="rounded border border-slate-200 bg-white px-3 py-2">
                <p className="text-[11px] uppercase text-slate-500">{t("Runs Today", "Executions aujourd'hui", "Laufe heute", "Ejecuciones hoy", "Execucoes hoje")}</p>
                <p className="text-2xl font-semibold text-slate-900">{data.primary.runsToday}</p>
              </div>
              <div className="rounded border border-slate-200 bg-white px-3 py-2">
                <p className="text-[11px] uppercase text-slate-500">{t("Failures Today", "Échecs aujourd'hui", "Fehler heute", "Fallos hoy", "Falhas hoje")}</p>
                <p className="text-2xl font-semibold text-slate-900">{data.primary.failuresToday}</p>
              </div>
              <div className="rounded border border-slate-200 bg-white px-3 py-2">
                <p className="text-[11px] uppercase text-slate-500">{t("Average Duration", "Durée moyenne", "Durchschnittliche Dauer", "Duración media", "Duracao media")}</p>
                <p className="text-2xl font-semibold text-slate-900">{msLabel(data.primary.averageDurationMs)}</p>
              </div>
            </div>
            <div className="mt-4 rounded border border-slate-200 bg-white p-3">
              <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">{t("7-Day Trend", "Tendance sur 7 jours", "7-Tage-Trend", "Tendencia de 7 días", "Tendencia de 7 dias")}</p>
              <div className="mt-1">
                <Sparkline points={data.primary.trend} />
              </div>
            </div>
            <p className="mt-4 text-sm font-medium text-slate-700">{localizeSummary(data.primary.summary, t)}</p>
          </div>

          <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs uppercase tracking-[0.16em] text-slate-500">{t("Control Context", "Contexte de controle", "Kontrollkontext", "Contexto de control", "Contexto de controlo")}</p>
            <p className="mt-3 text-sm text-slate-700">
              {t(
                "This dashboard tracks verified backend events only. Financial state, payment references, and automation execution state are sourced from confirmed records.",
                "Ce tableau suit uniquement les événements backend verifies. L'etat financier, les references de paiement et l'etat d'ex?cution des automatisations proviennent d'enregistrements confirmes.",
                "Dieses Dashboard verfolgt nur verifizierte Backend-Ereignisse. Finanzstatus, Zahlungsreferenzen und der Ausführungsstatus von Automatisierungen stammen aus bestätigten Datensatzen.",
                "Este panel rastrea solo eventos de backend verificados. El estado financiero, las referencias de pago y el estado de ejecución de automatizaciones provienen de registros confirmados.",
                "Este painel acompanha apenas eventos de backend verificados. O estado financeiro, as referencias de pagamento e o estado de execução das automações provem de registos confirmados."
              )}
            </p>
          </div>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <article className="border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">{t("Automation Control", "Controle des automatisations", "Automatisierungssteuerung", "Control de automatizaciones", "Controlo de automações")}</h2>
            <Link href={withRange("/dashboard/automations")} className="text-xs font-semibold text-blue-700">
              {t("View Automations", "Voir les automatisations", "Automatisierungen ansehen", "Ver automatizaciones", "Ver automações")}
            </Link>
          </div>
          <div className="mt-3 space-y-2 text-sm">
            <Link href={withRange("/dashboard/automations")} className="flex items-center justify-between rounded border border-slate-200 bg-slate-50 px-3 py-2">
              <span className="text-slate-600">{t("Active Automations", "Automatisations actives", "Aktive Automatisierungen", "Automatizaciónes activas", "Automações ativas")}</span>
              <span className="font-semibold text-slate-900">{data.modules.automation.active}</span>
            </Link>
            <Link href={withRange("/dashboard/automations", { status: "PAUSED" })} className="flex items-center justify-between rounded border border-slate-200 bg-slate-50 px-3 py-2">
              <span className="text-slate-600">{t("Paused Automations", "Automatisations en pause", "Pausierte Automatisierungen", "Automatizaciónes en pausa", "Automações em pausa")}</span>
              <span className="font-semibold text-slate-900">{data.modules.automation.paused}</span>
            </Link>
            <Link href={withRange("/dashboard/automation-operations", { status: "FAILED" })} className="flex items-center justify-between rounded border border-slate-200 bg-slate-50 px-3 py-2">
              <span className="text-slate-600">{t("Failed Runs", "Executions échouées", "Fehlgeschlagene Laufe", "Ejecuciones fallidas", "Execucoes falhadas")}</span>
              <span className="font-semibold text-slate-900">{data.modules.automation.failedRuns}</span>
            </Link>
          </div>
          {data.modules.automation.active + data.modules.automation.paused === 0 ? (
            <p className="mt-3 text-sm text-slate-500">{t("No automations created yet.", "Aucune automatisation creee pour le moment.", "Noch keine Automatisierungen erstellt.", "Aún no se han creado automatizaciones.", "Ainda não foram criadas automações.")}</p>
          ) : null}
        </article>

        {data.permissions.canViewBilling && data.modules.billing ? (
          <article className="border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900">{t("Billing & Payments", "Facturation et paiements", "Abrechnung und Zahlungen", "Facturación y pagos", "Faturação e pagamentos")}</h2>
              <Link href={withRange("/dashboard/invoices")} className="text-xs font-semibold text-blue-700">
                {t("View Invoices", "Voir les factures", "Rechnungen ansehen", "Ver facturas", "Ver faturas")}
              </Link>
            </div>
            <div className="mt-3 space-y-2 text-sm">
              <div className="flex items-center justify-between rounded border border-slate-200 bg-slate-50 px-3 py-2">
                <span className="text-slate-600">{t("Revenue", "Revenus", "Umsatz", "Ingresos", "Receita")}</span>
                <span className="font-semibold text-slate-900">
                  {formatCurrency(data.modules.billing.revenue, data.modules.billing.currency)}
                </span>
              </div>
              <Link href={withRange("/dashboard/invoices")} className="flex items-center justify-between rounded border border-slate-200 bg-slate-50 px-3 py-2">
                <span className="text-slate-600">{t("Invoices Sent", "Factures envoyées", "Gesendete Rechnungen", "Facturas enviadas", "Faturas enviadas")}</span>
                <span className="font-semibold text-slate-900">{data.modules.billing.invoicesSent}</span>
              </Link>
              <Link href={withRange("/dashboard/invoices", { status: "OVERDUE" })} className="flex items-center justify-between rounded border border-slate-200 bg-slate-50 px-3 py-2">
                <span className="text-slate-600">{t("Invoices Overdue", "Factures en retard", "überfällige Rechnungen", "Facturas vencidas", "Faturas em atraso")}</span>
                <span className="font-semibold text-slate-900">{data.modules.billing.invoicesOverdue}</span>
              </Link>
              <Link href={withRange("/billing/payments")} className="flex items-center justify-between rounded border border-slate-200 bg-slate-50 px-3 py-2">
                <span className="text-slate-600">{t("Payment Success Rate", "Taux de reussite des paiements", "Erfolgsquote bei Zahlungen", "Tasa de ?xito de pagos", "Taxa de sucesso dos pagamentos")}</span>
                <span className="font-semibold text-slate-900">{data.modules.billing.paymentSuccessRate}%</span>
              </Link>
            </div>
            {data.modules.billing.revenue === 0 && data.modules.billing.invoicesSent === 0 ? (
              <p className="mt-3 text-sm text-slate-500">{t("No billing activity yet.", "Aucune activité de facturation pour le moment.", "Noch keine Abrechnungsaktivität.", "Aún no hay actividad de facturación.", "Ainda não ha atividade de faturação.")}</p>
            ) : null}
          </article>
        ) : null}

        {data.permissions.canViewInfrastructure && data.modules.infrastructure ? (
          <article className="border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900">{t("Infrastructure Health", "Sante de l'infrastructure", "Infrastrukturzustand", "Salud de la infraestructura", "Saude da infraestrutura")}</h2>
              <Link href={withRange("/admin/logs")} className="text-xs font-semibold text-blue-700">
                {t("View System Logs", "Voir les journaux système", "Systemprotokolle ansehen", "Ver registros del sistema", "Ver registos do sistema")}
              </Link>
            </div>
            <div className="mt-3 space-y-2 text-sm">
              <div className="flex items-center justify-between rounded border border-slate-200 bg-slate-50 px-3 py-2">
                <span className="text-slate-600">{t("Webhook Status", "Statut des webhooks", "Webhook-Status", "Estado de webhooks", "Estado dos webhooks")}</span>
                <span
                  className={clsx(
                    "font-semibold",
                    data.modules.infrastructure.webhookStatus === "Healthy" ? "text-emerald-700" : "text-amber-700"
                  )}
                >
                  {healthLabel(data.modules.infrastructure.webhookStatus, t)}
                </span>
              </div>
              <div className="flex items-center justify-between rounded border border-slate-200 bg-slate-50 px-3 py-2">
                <span className="text-slate-600">{t("Messaging Provider", "Fournisseur de messagerie", "Messaging-Anbieter", "Proveedor de mensajeria", "Fornecedor de mensagens")}</span>
                <span
                  className={clsx(
                    "font-semibold",
                    data.modules.infrastructure.messagingStatus === "Healthy" ? "text-emerald-700" : "text-amber-700"
                  )}
                >
                  {healthLabel(data.modules.infrastructure.messagingStatus, t)}
                </span>
              </div>
              <div className="flex items-center justify-between rounded border border-slate-200 bg-slate-50 px-3 py-2">
                <span className="text-slate-600">{t("API Latency", "Latence API", "API-Latenz", "Latencia API", "Latencia da API")}</span>
                <span className="font-semibold text-slate-900">{msLabel(data.modules.infrastructure.apiLatencyMs)}</span>
              </div>
              <div className="flex items-center justify-between rounded border border-slate-200 bg-slate-50 px-3 py-2">
                <span className="text-slate-600">{t("Error Rate", "Taux d'erreur", "Fehlerrate", "Tasa de error", "Taxa de erro")}</span>
                <span className="font-semibold text-slate-900">{data.modules.infrastructure.errorRate}%</span>
              </div>
            </div>
          </article>
        ) : null}
      </section>

      <section className="border border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">{t("Recent System Activity", "Activit? système recente", "Letzte Systemaktivität", "Actividad reciente del sistema", "Atividade recente do sistema")}</h2>
          <span className="text-xs text-slate-500">{t("Latest 20 entries", "20 dernieres entrees", "Neueste 20 Eintrage", "Últimas 20 entradas", "Ultimas 20 entradas")}</span>
        </div>

        {visibleTimeline.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">{t("No recent system activity.", "Aucune activité système recente.", "Keine aktuelle Systemaktivität.", "No hay actividad reciente del sistema.", "Não há atividade recente do sistema.")}</p>
        ) : (
          <div className="mt-4 space-y-2">
            {visibleTimeline.map((item) => {
              const Icon = timelineIcon(item);
              return (
                <article key={item.id} className="rounded border border-slate-200 bg-slate-50 p-3">
                  <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <div className="flex items-start gap-2.5">
                      <span
                        className={clsx(
                          "mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-full",
                          item.status === "failed"
                            ? "bg-red-100 text-red-700"
                            : item.status === "warning"
                              ? "bg-amber-100 text-amber-700"
                              : item.status === "success"
                                ? "bg-emerald-100 text-emerald-700"
                                : "bg-slate-200 text-slate-700"
                        )}
                      >
                        <Icon className="h-3.5 w-3.5" />
                      </span>
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{localizeTimelineTitle(item.title, t)}</p>
                        <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                          {item.customer ? <span>{t("Customer", "Client", "Kunde", "Cliente", "Cliente")}: {item.customer}</span> : null}
                          {item.invoice ? <span>{t("Invoice", "Facture", "Rechnung", "Factura", "Fatura")}: {item.invoice}</span> : null}
                          {item.durationMs ? <span>{t("Duration", "Durée", "Dauer", "Duración", "Duracao")}: {msLabel(item.durationMs)}</span> : null}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-500">
                        {new Date(item.timestamp).toLocaleString(locale, {
                          day: "2-digit",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                      {item.canRetry ? (
                        <button
                          type="button"
                          onClick={() => void retrySafeRun(item)}
                          disabled={retryingId === item.id}
                          className="rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 disabled:opacity-50"
                        >
                          {retryingId === item.id
                            ? t("Retrying...", "Nouvelle tentative...", "Wird erneut versucht...", "Reintentando...", "A tentar novamente...")
                            : t("Retry", "Reessayer", "Erneut versuchen", "Reintentar", "Tentar novamente")}
                        </button>
                      ) : null}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {canLoadMore ? (
          <div className="mt-4">
            <button
            type="button"
            onClick={() => setTimelineVisible((count) => Math.min(count + TIMELINE_PAGE_SIZE, data.timeline.length))}
            className="rounded border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700"
          >
            {t("Load More", "Charger plus", "Mehr laden", "Cargar más", "Carregar mais")}
          </button>
        </div>
      ) : null}
      </section>

      <section className="grid gap-3 md:hidden">
        <div className="rounded border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
          <span className="inline-flex items-center gap-1">
            {data.commandStrip.state === "critical" ? (
              <ShieldAlert className="h-3.5 w-3.5 text-red-600" />
            ) : (
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
            )}
            {t("Operational mobile view enabled", "Vue mobile operationnelle activée", "Operative mobile Ansicht aktiviert", "Vista movil operativa activada", "Vista movel operaciónal ativada")}
          </span>
        </div>
      </section>
    </div>
  );
}
