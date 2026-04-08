"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import clsx from "clsx";
import { useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Copy,
  Loader2,
  MoreHorizontal,
  RefreshCw,
  ShieldCheck,
  X,
  XCircle,
} from "lucide-react";
import { useLanguage } from "@/components/providers/language-provider";
import { LANGUAGE_LOCALES } from "@/lib/i18n";

type RunRecord = {
  id: string;
  flowId: string;
  runStatus?: string | null;
  createdAt: string;
  startedAt?: string | null;
  completedAt?: string | null;
  nextRunAt?: string | null;
  nextStepIndex?: number | null;
  lastCompletedStepIndex?: number | null;
  logs?: unknown;
  trigger?: string | null;
  source?: string | null;
  input?: unknown;
  flow?: { title?: string | null } | null;
};

type RunLog = {
  timestamp?: string | null;
  step?: string | null;
  result?: unknown;
  error?: string | null;
  reason?: string | null;
};

const PAGE_SIZE = 24;
const ROW_HEIGHT = 170;
const AUTO_REFRESH_STORAGE_KEY = "automation_auto_refresh";
const REFRESH_FEEDBACK_MS = 650;

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to load operations");
  return res.json();
};

const asObj = (v: unknown): Record<string, any> =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, any>) : {};
const asLogs = (v: unknown): RunLog[] => (Array.isArray(v) ? (v as RunLog[]) : []);
const norm = (v?: string | null) => String(v || "").trim().toUpperCase();
const parseDateValue = (value?: string | null) => {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};
const isFutureScheduledRun = (run: Pick<RunRecord, "runStatus" | "nextRunAt">, now = Date.now()) => {
  if (norm(run.runStatus) !== "PENDING") return false;
  const nextRunAt = parseDateValue(run.nextRunAt);
  return Boolean(nextRunAt && nextRunAt.getTime() > now);
};
const isDuePendingRun = (run: Pick<RunRecord, "runStatus" | "nextRunAt">, now = Date.now()) => {
  if (norm(run.runStatus) !== "PENDING") return false;
  const nextRunAt = parseDateValue(run.nextRunAt);
  return !nextRunAt || nextRunAt.getTime() <= now;
};

const statusTone = (s: string) => {
  if (s === "SUCCESS") return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-300";
  if (s === "FAILED") return "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-400/30 dark:bg-rose-400/10 dark:text-rose-300";
  if (s === "RUNNING") return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-300";
  return "border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200";
};

const statusIcon = (s: string) => {
  if (s === "SUCCESS") return CheckCircle2;
  if (s === "FAILED") return XCircle;
  if (s === "RUNNING") return Loader2;
  return Clock3;
};

const formatDuration = (start?: string | null, end?: string | null, status?: string | null) => {
  if (!start) return "--";
  const a = new Date(start).getTime();
  const b = end ? new Date(end).getTime() : norm(status) === "RUNNING" ? Date.now() : NaN;
  if (!Number.isFinite(a) || !Number.isFinite(b)) return "--";
  const ms = Math.max(0, b - a);
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(ms < 10000 ? 1 : 0)}s`;
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${m}m ${String(s).padStart(2, "0")}s`;
};

function Sparkline({ values, color }: { values: number[]; color: string }) {
  const max = Math.max(...values, 1);
  const w = 100;
  const h = 24;
  const points = values
    .map((v, i) => {
      const x = (i / Math.max(values.length - 1, 1)) * w;
      const y = h - (v / max) * h;
      return `${x},${y}`;
    })
    .join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-6 w-24" aria-hidden="true">
      <polyline fill="none" stroke={color} strokeWidth="2" points={points} />
    </svg>
  );
}

export default function AutomationOperationsPage() {
  const { language, t } = useLanguage();
  const locale = LANGUAGE_LOCALES[language];
  const statusLabel = useCallback((run: RunRecord) => {
    const s = norm(run.runStatus);
    if (s === "SUCCESS") return t("Completed", "Termin?e", "Abgeschlossen", "Completada", "Conclu?da");
    if (s === "FAILED") return t("Failed", "échouée", "Fehlgeschlagen", "Fallida", "Falhou");
    if (s === "RUNNING") return t("In progress", "En cours", "In Bearbeitung", "En curso", "Em curso");
    if (isFutureScheduledRun(run)) return t("Scheduled", "Planifiee", "Geplant", "Programada", "Agendada");
    return t("Pending", "En attente", "Ausstehend", "Pendiente", "Pendente");
  }, [t]);
  const formatDateTime = useCallback((value?: string | null) => {
    if (!value) return "--";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "--";
    const date = new Intl.DateTimeFormat(locale, { day: "2-digit", month: "short", year: "numeric" }).format(d);
    const time = new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
    return `${date}, ${time}`;
  }, [locale]);
  const stepLabel = useCallback((v?: string | null) => {
    const raw = String(v || "").trim();
    if (!raw) return t("Step", "Etape", "Schritt", "Paso", "Passo");
    return raw.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }, [t]);
  const localizeOpsMessage = useCallback((message?: string | null) => {
    const raw = String(message || "").trim();
    const mapped: Record<string, string> = {
      "Unable to retry this automation.": t("Unable to retry this automation.", "Impossible de relancer cette automatisation.", "Diese Automatisierung kann nicht erneut ausgeführt werden.", "No se puede volver a ejecutar esta automatización.", "Não foi possível repetir esta automação."),
      "Automation retry started.": t("Automation retry started.", "Relance de l'automatisation demarree.", "Die Wiederholung der Automatisierung wurde gestartet.", "Se inicio el reintento de la automatización.", "Foi iniciado o novo processamento da automação."),
      "Network error. Please try again.": t("Network error. Please try again.", "Erreur réseau. Réessayez.", "Netzwerkfehler. Bitte versuche es erneut.", "Error de red. Intentalo de nuevo.", "Erro de rede. Tente novamente."),
      "Failed step retry started.": t("Failed step retry started.", "Relance de l etape en ?chec demarree.", "Die Wiederholung des fehlgeschlagenen Schritts wurde gestartet.", "Se inicio el reintento del paso fallido.", "Foi iniciado o novo processamento do passo falhado."),
      "Unable to retry this step.": t("Unable to retry this step.", "Impossible de relancer cette etape.", "Dieser Schritt kann nicht erneut ausgeführt werden.", "No se puede volver a ejecutar este paso.", "Não foi possível repetir este passo."),
      "Activity ID copied.": t("Activity ID copied.", "ID d activité copie.", "Aktivitäts-ID kopiert.", "ID de actividad copiado.", "ID da atividade copiado."),
      "Automation ID copied.": t("Automation ID copied.", "ID d'automatisation copie.", "Automatisierungs-ID kopiert.", "ID de automatización copiado.", "ID da automação copiado."),
    };
    mapped["Unable to refresh automation operations."] = t(
      "Unable to refresh automation operations.",
      "Impossible d actualiser les operations d'automatisation.",
      "Automatisierungsoperationen konnten nicht aktualisiert werden.",
      "No se pudieron actualizar las operaciónes de automatización.",
      "Não foi possível atualizar as operações de automação."
    );
    return mapped[raw] || raw;
  }, [t]);
  const contextForRun = useCallback((run: RunRecord) => {
    const input = asObj(run.input);
    const invoice = asObj(input.invoice);
    const payment = asObj(input.payment);
    const customer = asObj(input.customer);
    const event = String(input.event || run.trigger || run.source || "System").toLowerCase();
    const eventMap: Record<string, string> = {
      invoice_status: t("Invoice status changed", "Statut de facture modifie", "Rechnungsstatus geändert", "Estado de factura cambiado", "Estado da fatura alterado"),
      "invoice.status.changed": t("Invoice status changed", "Statut de facture modifie", "Rechnungsstatus geändert", "Estado de factura cambiado", "Estado da fatura alterado"),
      "payment.verified": t("Payment confirmed", "Paiement confirme", "Zahlung bestätigt", "Pago confirmado", "Pagamento confirmado"),
      manual: t("Manual start", "Démarrage manuel", "Manueller Start", "Inicio manual", "Inicio manual"),
      webhook: t("Webhook event", "Evenement webhook", "Webhook-Ereignis", "Evento webhook", "Evento webhook"),
      schedule: t("Scheduled start", "Démarrage planifie", "Geplanter Start", "Inicio programado", "Inicio agendado"),
      system: t("System event", "Evenement système", "Systemereignis", "Evento del sistema", "Evento do sistema"),
    };
    return {
      startedBy: eventMap[event] || String(input.event || run.trigger || run.source || t("System", "Systeme", "System", "Sistema", "Sistema")),
      customer: String(customer.name || customer.email || invoice.customerName || input.customerName || "--"),
      invoice: String(invoice.invoiceNumber || input.invoiceNumber || invoice.id || input.invoiceId || "--"),
      paymentReference: String(payment.reference || input.reference || input.paymentReference || "--"),
    };
  }, [t]);
  const searchParams = useSearchParams();
  const { data, mutate, error } = useSWR<RunRecord[]>("/api/automation/runs", fetcher, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
  });
  const runs = useMemo(() => (Array.isArray(data) ? data : []), [data]);

  const [searchInput, setSearchInput] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [automationFilter, setAutomationFilter] = useState("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [confirmRetryId, setConfirmRetryId] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [notice, setNotice] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [scrollTop, setScrollTop] = useState(0);

  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const virtualRef = useRef<HTMLDivElement | null>(null);
  const intervalRef = useRef<number | null>(null);
  const refreshInFlightRef = useRef(false);

  const refreshData = useCallback(
    async ({ silent = false, reportError = !silent }: { silent?: boolean; reportError?: boolean } = {}) => {
      if (refreshInFlightRef.current) return;
      refreshInFlightRef.current = true;
      const startedAt = Date.now();
      if (!silent) setIsRefreshing(true);

      const pageScrollY = window.scrollY;
      const listScrollY = virtualRef.current?.scrollTop ?? 0;
      try {
        const next = await fetcher("/api/automation/runs");
        await mutate(next, { revalidate: false, populateCache: true });
        setLastRefreshed(new Date().toISOString());
      } catch {
        if (reportError) {
          setNotice({ type: "error", message: localizeOpsMessage("Unable to refresh automation operations.") });
        }
      } finally {
        if (!silent) {
          const elapsed = Date.now() - startedAt;
          if (elapsed < REFRESH_FEEDBACK_MS) {
            await new Promise((resolve) => window.setTimeout(resolve, REFRESH_FEEDBACK_MS - elapsed));
          }
        }
        requestAnimationFrame(() => {
          window.scrollTo({ top: pageScrollY });
          if (virtualRef.current) virtualRef.current.scrollTop = listScrollY;
        });
        refreshInFlightRef.current = false;
        if (!silent) setIsRefreshing(false);
      }
    },
    [localizeOpsMessage, mutate]
  );

  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(searchInput.trim().toLowerCase()), 250);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    const nextSearch = String(searchParams.get("q") || "");
    const nextStatus = String(searchParams.get("status") || "all").trim().toUpperCase();
    const nextAutomation = String(searchParams.get("automation") || "all");
    const nextFrom = String(searchParams.get("from") || "");
    const nextTo = String(searchParams.get("to") || "");

    setSearchInput(nextSearch);
    setQuery(nextSearch.trim().toLowerCase());
    setStatusFilter(
      nextStatus === "SUCCESS" || nextStatus === "FAILED" || nextStatus === "RUNNING" || nextStatus === "PENDING"
        ? nextStatus
        : "all"
    );
    setAutomationFilter(nextAutomation || "all");
    setStartDate(nextFrom);
    setEndDate(nextTo);
  }, [searchParams]);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(AUTO_REFRESH_STORAGE_KEY);
      if (saved === "false") setAutoRefresh(false);
      else setAutoRefresh(true);
    } catch {
      setAutoRefresh(true);
    }
  }, []);

  useEffect(() => {
    if (data || error) {
      setIsInitialLoading(false);
      if (data) setLastRefreshed(new Date().toISOString());
    }
  }, [data, error]);

  useEffect(() => {
    try {
      window.localStorage.setItem(AUTO_REFRESH_STORAGE_KEY, String(autoRefresh));
    } catch {
      // ignore storage exceptions
    }
  }, [autoRefresh]);

  useEffect(() => {
    if (intervalRef.current) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (!autoRefresh) return;

    intervalRef.current = window.setInterval(() => {
      void refreshData({ silent: true });
    }, 15000);

    return () => {
      if (intervalRef.current) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [autoRefresh, refreshData]);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
    setScrollTop(0);
  }, [query, statusFilter, automationFilter, startDate, endDate]);

  useEffect(() => {
    if (!loadMoreRef.current) return;
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) setVisibleCount((v) => v + PAGE_SIZE);
        });
      },
      { rootMargin: "160px" }
    );
    obs.observe(loadMoreRef.current);
    return () => obs.disconnect();
  }, []);

  const refreshNow = async () => {
    await refreshData({ silent: false, reportError: true });
  };

  const flowOptions = useMemo(() => {
    const set = new Set<string>();
    runs.forEach((run) => {
      const title = String(run.flow?.title || "").trim();
      if (title) set.add(title);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, locale));
  }, [runs, locale]);

  const filteredRuns = useMemo(() => {
    const a = startDate ? new Date(`${startDate}T00:00:00`).getTime() : null;
    const b = endDate ? new Date(`${endDate}T23:59:59.999`).getTime() : null;
    return [...runs]
      .sort((x, y) => new Date(y.createdAt).getTime() - new Date(x.createdAt).getTime())
      .filter((run) => {
        const status = norm(run.runStatus);
        const created = new Date(run.createdAt).getTime();
        const info = contextForRun(run);
        if (statusFilter !== "all" && statusFilter !== status) return false;
        if (automationFilter !== "all" && automationFilter !== run.flow?.title) return false;
        if (a && created < a) return false;
        if (b && created > b) return false;
        if (!query) return true;
        const hay = [
          run.id,
          run.flow?.title,
          info.customer,
          info.invoice,
          info.paymentReference,
          info.startedBy,
        ]
          .join(" ")
          .toLowerCase();
        return hay.includes(query);
      });
  }, [runs, statusFilter, automationFilter, startDate, endDate, query, contextForRun]);

  const useVirtual = filteredRuns.length > 100;
  const baseRuns = useVirtual ? filteredRuns : filteredRuns.slice(0, visibleCount);
  const startIdx = useVirtual ? Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - 4) : 0;
  const viewportHeight = virtualRef.current?.clientHeight ?? 640;
  const endIdx = useVirtual ? Math.min(baseRuns.length, startIdx + Math.ceil(viewportHeight / ROW_HEIGHT) + 8) : baseRuns.length;
  const visibleRuns = useVirtual ? baseRuns.slice(startIdx, endIdx) : baseRuns;

  const selectedRun = useMemo(() => runs.find((r) => r.id === selectedRunId) || null, [runs, selectedRunId]);
  const timeline = useMemo(() => {
    const logs = asLogs(selectedRun?.logs);
    return logs.map((log, i) => {
      const result = String(log.result || "").toLowerCase();
      const failed = Boolean(log.error) || result === "failed" || result === "retry-exhausted";
      const pending = result === "retry-scheduled" || result === "scheduled";
      const status = failed ? "failed" : pending ? "pending" : "success";
      const ts = log.timestamp ? new Date(log.timestamp).getTime() : NaN;
      const next = i < logs.length - 1 && logs[i + 1]?.timestamp ? new Date(logs[i + 1].timestamp as string).getTime() : NaN;
      const d =
        Number.isFinite(ts) && Number.isFinite(next) && next >= ts
          ? formatDuration(new Date(ts).toISOString(), new Date(next).toISOString(), "SUCCESS")
          : "--";
      return {
        id: `${selectedRun?.id || "run"}-${i}`,
        step: stepLabel(log.step),
        status,
        timestamp: log.timestamp,
        duration: d,
        message: String(log.error || log.reason || (typeof log.result === "string" ? log.result : "")),
      };
    });
  }, [selectedRun, stepLabel]);

  const completedToday = useMemo(() => {
    const start = new Date(new Date().toDateString()).getTime();
    return runs.filter((r) => norm(r.runStatus) === "SUCCESS" && new Date(r.createdAt).getTime() >= start).length;
  }, [runs]);

  const failedToday = useMemo(() => {
    const start = new Date(new Date().toDateString()).getTime();
    return runs.filter((r) => norm(r.runStatus) === "FAILED" && new Date(r.createdAt).getTime() >= start).length;
  }, [runs]);

  const pendingCount = useMemo(() => runs.filter((r) => ["RUNNING", "PENDING"].includes(norm(r.runStatus))).length, [runs]);
  const duePendingCount = useMemo(() => {
    const now = Date.now();
    return runs.filter((run) => isDuePendingRun(run, now)).length;
  }, [runs]);
  const scheduledPendingCount = useMemo(() => {
    const now = Date.now();
    return runs.filter((run) => isFutureScheduledRun(run, now)).length;
  }, [runs]);

  const avgDuration = useMemo(() => {
    const vals = runs
      .map((r) => {
        const a = new Date(r.startedAt || r.createdAt).getTime();
        const b = r.completedAt ? new Date(r.completedAt).getTime() : NaN;
        return Number.isFinite(a) && Number.isFinite(b) ? Math.max(0, b - a) : null;
      })
      .filter((v): v is number => typeof v === "number");
    if (!vals.length) return "--";
    const avg = Math.round(vals.reduce((s, v) => s + v, 0) / vals.length);
    return formatDuration(new Date().toISOString(), new Date(Date.now() + avg).toISOString(), "SUCCESS");
  }, [runs]);

  const series = useMemo(() => {
    const days = 7;
    const now = new Date();
    const keys = Array.from({ length: days }).map((_, idx) => {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (days - 1 - idx));
      return d.toISOString().slice(0, 10);
    });
    const base = () => Object.fromEntries(keys.map((k) => [k, 0]));
    const done = base();
    const fail = base();
    const pend = base();
    const dur = base();
    runs.forEach((run) => {
      const key = String(run.createdAt || "").slice(0, 10);
      if (!keys.includes(key)) return;
      const st = norm(run.runStatus);
      if (st === "SUCCESS") done[key] += 1;
      if (st === "FAILED") fail[key] += 1;
      if (st === "RUNNING" || st === "PENDING") pend[key] += 1;
      const a = new Date(run.startedAt || run.createdAt).getTime();
      const b = run.completedAt ? new Date(run.completedAt).getTime() : NaN;
      if (Number.isFinite(a) && Number.isFinite(b)) dur[key] += Math.round(Math.max(0, b - a) / 1000);
    });
    return {
      done: keys.map((k) => done[k]),
      fail: keys.map((k) => fail[k]),
      pend: keys.map((k) => pend[k]),
      dur: keys.map((k) => dur[k]),
    };
  }, [runs]);

  const failedLastHour = useMemo(() => {
    const cutoff = Date.now() - 60 * 60 * 1000;
    return runs.filter((r) => norm(r.runStatus) === "FAILED" && new Date(r.createdAt).getTime() >= cutoff).length;
  }, [runs]);

  const retriesPending = useMemo(
    () =>
      runs.filter(
        (r) =>
          norm(r.runStatus) === "PENDING" &&
          asLogs(r.logs).some((l) => String(l.result || "").toLowerCase() === "retry-scheduled")
      ).length,
    [runs]
  );

  const whatsappDelay = useMemo(
    () => {
      const cutoff = Date.now() - 24 * 60 * 60 * 1000;
      return runs.filter((r) => {
        const createdAt = new Date(r.createdAt).getTime();
        if (!Number.isFinite(createdAt) || createdAt < cutoff) return false;
        return asLogs(r.logs).some((l) => {
          const step = String(l.step || "").toLowerCase();
          const result = String(l.result || "").toLowerCase();
          return step.includes("whatsapp") && ["retry-scheduled", "retry-exhausted"].includes(result);
        });
      }).length;
    },
    [runs]
  );

  const system = failedLastHour > 0 ? "incident" : duePendingCount > 0 || retriesPending > 0 || whatsappDelay > 0 ? "degraded" : "healthy";
  const systemTone =
    system === "incident"
      ? "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-400/30 dark:bg-rose-400/10 dark:text-rose-300"
      : system === "degraded"
        ? "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-300"
        : "border-emerald-300 bg-emerald-100 text-emerald-900 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-300";

  const alerts = [
    failedLastHour > 0
      ? t(
          `${failedLastHour} automations failed in the last hour`,
          `${failedLastHour} automatisations ont echoue au cours de la derniere heure`,
          `${failedLastHour} Automatisierungen sind in der letzten Stunde fehlgeschlagen`,
          `${failedLastHour} automatizaciones fallaron en la ultima hora`,
          `${failedLastHour} automacoes falharam na ultima hora`
        )
      : "",
    whatsappDelay > 0
      ? t(
          "WhatsApp delivery delays detected",
          "Retards de livraison WhatsApp détectés",
          "WhatsApp-Zustellverzogerungen erkannt",
          "Se detectaron retrasos de entrega en WhatsApp",
          "Foram detetados atrasos de entrega no WhatsApp"
        )
      : "",
    duePendingCount > 0
      ? t(
          `${duePendingCount} pending runs are due now`,
          `${duePendingCount} executions en attente sont dues maintenant`,
          `${duePendingCount} ausstehende Ausfuhrungen sind jetzt fallig`,
          `${duePendingCount} ejecuciones pendientes vencen ahora`,
          `${duePendingCount} execucoes pendentes vencem agora`
        )
      : "",
    retriesPending > 0
      ? t(
          `${retriesPending} retries pending`,
          `${retriesPending} nouvelles tentatives en attente`,
          `${retriesPending} Wiederholungen ausstehend`,
          `${retriesPending} reintentos pendientes`,
          `${retriesPending} novas tentativas pendentes`
        )
      : "",
  ].filter(Boolean);

  const clearFilters = () => {
    setSearchInput("");
    setQuery("");
    setStatusFilter("all");
    setAutomationFilter("all");
    setStartDate("");
    setEndDate("");
  };

  const retryRun = async (run: RunRecord) => {
    setRetrying(true);
    setNotice(null);
    try {
      const originalInput = asObj(run.input);
      const res = await fetch("/api/automation/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          flowId: run.flowId,
          input: {
            ...originalInput,
            retryFromRunId: run.id,
          },
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNotice({ type: "error", message: localizeOpsMessage(String(payload?.reason || payload?.error || "Unable to retry this automation.")) });
      } else {
        setNotice({ type: "success", message: localizeOpsMessage("Automation retry started.") });
        setConfirmRetryId(null);
        await refreshData({ silent: true, reportError: false });
      }
    } catch {
      setNotice({ type: "error", message: localizeOpsMessage("Network error. Please try again.") });
    } finally {
      setRetrying(false);
    }
  };

  const retryFailedStep = async (run: RunRecord) => {
    setRetrying(true);
    setNotice(null);
    try {
      const res = await fetch("/api/automation/retry-safe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId: run.id }),
      });
      const payload = await res.json().catch(() => ({}));
      if (res.ok) {
        setNotice({ type: "success", message: localizeOpsMessage("Failed step retry started.") });
        await refreshData({ silent: true, reportError: false });
        return;
      }
      if (res.status === 409 && payload?.type === "not_retryable") {
        setConfirmRetryId(run.id);
        return;
      }
      setNotice({
        type: "error",
        message: localizeOpsMessage(String(payload?.reason || payload?.error || "Unable to retry this step.")),
      });
    } catch {
      setNotice({ type: "error", message: localizeOpsMessage("Network error. Please try again.") });
    } finally {
      setRetrying(false);
    }
  };

  const renderRunCard = (run: RunRecord, key?: string | null) => {
    const status = norm(run.runStatus);
    const Icon = statusIcon(status);
    const info = contextForRun(run);
    const scheduledPending = isFutureScheduledRun(run);
    return (
      <article key={key || run.id} data-run-menu className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-slate-300 hover:bg-slate-50/60 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-slate-600 dark:hover:bg-slate-800/80">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,0.8fr)_auto]">
          <div className="flex items-start gap-3">
            <span className={clsx("mt-1 rounded-full p-1.5", statusTone(status))}>
              <Icon className={clsx("h-4 w-4", status === "RUNNING" ? "animate-spin" : "")} />
            </span>
            <div className="space-y-1">
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{run.flow?.title || t("Untitled automation", "Automatisation sans titre", "Unbenannte Automatisierung", "Automatización sin título", "Automação sem título")}</p>
              <p className="text-xs text-slate-600 dark:text-slate-300">{t("Started by", "Demarree par", "Gestartet von", "Iniciada por", "Iniciada por")}: {info.startedBy}</p>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                <span>{t("Customer", "Client", "Kunde", "Cliente", "Cliente")}: {info.customer}</span>
                <span>{t("Invoice", "Facture", "Rechnung", "Factura", "Fatura")}: {info.invoice}</span>
              </div>
            </div>
          </div>
          <div className="grid gap-1 text-xs text-slate-600 dark:text-slate-300 sm:grid-cols-3 lg:grid-cols-1">
            <div>
              <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">{t("Started", "Demarree", "Gestartet", "Iniciada", "Iniciada")}</p>
              <p className="mt-0.5 text-sm text-slate-800 dark:text-slate-100">{formatDateTime(run.startedAt || run.createdAt)}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">{t("Duration", "Durée", "Dauer", "Duración", "Duracao")}</p>
              <p className="mt-0.5 text-sm text-slate-800 dark:text-slate-100">{formatDuration(run.startedAt || run.createdAt, run.completedAt, run.runStatus)}</p>
            </div>
            {run.nextRunAt ? (
              <div>
                <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                  {scheduledPending
                    ? t("Scheduled for", "Planifiee pour", "Geplant f?r", "Programada para", "Agendada para")
                    : t("Next attempt", "Prochaine tentative", "Nächster Versuch", "Siguiente intento", "Próxima tentativa")}
                </p>
                <p className="mt-0.5 text-sm text-slate-800 dark:text-slate-100">{formatDateTime(run.nextRunAt)}</p>
              </div>
            ) : null}
          </div>
          <div className="flex items-start justify-end gap-2">
            <span className={clsx("inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold", statusTone(status))}>{statusLabel(run)}</span>
            <button type="button" onClick={() => { setSelectedRunId(run.id); setDrawerOpen(true); }} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-100 dark:hover:bg-slate-800">{t("View Details", "Voir les d?tails", "Details anzeigen", "Ver detalles", "Ver detalhes")}</button>
            {status === "FAILED" ? (
              <button type="button" onClick={() => void retryFailedStep(run)} className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700">{t("Retry", "Relancer", "Erneut versuchen", "Reintentar", "Tentar novamente")}</button>
            ) : null}
            <div className="relative">
              <button type="button" onClick={() => setMenuOpenId(menuOpenId === run.id ? null : run.id)} className="rounded-lg border border-slate-300 p-1.5 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
                <MoreHorizontal className="h-4 w-4" />
              </button>
              {menuOpenId === run.id ? (
                <div className="absolute right-0 top-9 z-20 w-40 rounded-lg border border-slate-200 bg-white p-1 shadow-xl">
                  <button type="button" onClick={() => { navigator.clipboard.writeText(run.id); setNotice({ type: "success", message: localizeOpsMessage("Activity ID copied.") }); setMenuOpenId(null); }} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-100">
                    <Copy className="h-3.5 w-3.5" />{t("Copy activity ID", "Copier l ID d activité", "Aktivitäts-ID kopieren", "Copiar ID de actividad", "Copiar ID da atividade")}
                  </button>
                  <button type="button" onClick={() => { navigator.clipboard.writeText(run.flowId); setNotice({ type: "success", message: localizeOpsMessage("Automation ID copied.") }); setMenuOpenId(null); }} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-100">
                    <Copy className="h-3.5 w-3.5" />{t("Copy automation ID", "Copier l ID d'automatisation", "Automatisierungs-ID kopieren", "Copiar ID de automatización", "Copiar ID da automação")}
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </article>
    );
  };

  const headerTitle =
    language === "de"
      ? "Automationsbetrieb"
      : language === "es"
        ? "Operaciones automaticas"
        : t("Automation Operations", "Operations d'automatisation", "Automatisierungsoperationen", "Operaciones de automatización", "Operações de automação");

  const headerDescription =
    language === "de"
      ? "überwache den Status, prüfe Probleme und starte Schritte neu."
      : language === "es"
        ? "Supervisa el estado, revisa problemas y repite pasos fallidos."
        : t(
            "Monitor automation health, investigate issues, and replay failed steps.",
            "Surveillez la santé, investiguez les échecs et relancez les etapes.",
            "überwache die Gesundheit der Automatisierungen, untersuche Probleme und starte fehlgeschlagene Schritte erneut.",
            "Supervisa la salud de la automatización, investiga problemas y vuelve a ejecutar pasos fallidos.",
            "Monitorize a saude da automação, investigue problemas e repita passos falhados."
          );

  const autoRefreshLabel =
    language === "de" || language === "es"
      ? "Auto-refresh"
      : t("Auto-refresh", "Actualisation auto", "Automatisch aktualisieren", "Actualización automática", "Atualização automática");

  const toggleAutoRefreshLabel =
    language === "de"
      ? "Auto-refresh umschalten"
      : language === "es"
        ? "Alternar auto-refresh"
        : t("Toggle auto-refresh", "Basculer l actualisation auto", "Automatische Aktualisierung umschalten", "Alternar actualización automática", "Alternar atualização automática");

  const refreshLabel = language === "de" || language === "es" ? "Refresh" : t("Refresh", "Actualiser", "Aktualisieren", "Actualizar", "Atualizar");

  const lastUpdatedLabel =
    language === "de"
      ? "Aktualisiert"
      : language === "es"
        ? "Actualizado"
        : t("Last updated", "Derni?re mise ? jour", "Zuletzt aktualisiert", "Última actualización", "Última atualização");

  const systemHealthyLabel =
    language === "de"
      ? "System OK"
      : language === "es"
        ? "Sistema OK"
        : t("System healthy", "Systeme sain", "System gesund", "Sistema saludable", "Sistema saudavel");

  return (
    <div className="space-y-6">
      <header className="space-y-3">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0 flex-1">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">{t("Automation", "Automatisation", "Automatisierung", "Automatización", "Automação")}</p>
            <h1 className="text-3xl font-semibold leading-tight text-slate-900 [overflow-wrap:anywhere] dark:text-slate-50">
              {headerTitle}
            </h1>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              {headerDescription}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 xl:ml-6 xl:shrink-0 xl:flex-nowrap">
            <span className={clsx("inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold", systemTone)}>
              <span
                className={clsx(
                  "h-2 w-2 rounded-full",
                  system === "healthy" ? "bg-emerald-500" : system === "degraded" ? "bg-amber-500" : "bg-rose-500"
                )}
              />
              {system === "incident" ? t("Incident Detected", "Incident detecte", "Vorfall erkannt", "Incidente detectado", "Incidente detetado") : system === "degraded" ? t("Degraded", "Degrade", "Beeintrachtigt", "Degradado", "Degradado") : t("Healthy", "Sain", "Gesund", "Saludable", "Saudavel")}
            </span>
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-3 py-1.5 dark:border-slate-700 dark:bg-slate-900">
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">{autoRefreshLabel}</span>
              <button
                type="button"
                role="switch"
                aria-checked={autoRefresh}
                aria-label={toggleAutoRefreshLabel}
                onClick={() => setAutoRefresh((v) => !v)}
                className={clsx(
                  "relative inline-flex h-5 w-9 items-center rounded-full transition",
                  autoRefresh ? "bg-blue-600" : "bg-slate-300 dark:bg-slate-700"
                )}
              >
                <span
                  className={clsx(
                    "inline-block h-4 w-4 transform rounded-full bg-white transition",
                    autoRefresh ? "translate-x-4" : "translate-x-0.5"
                  )}
                />
              </button>
            </div>
            <button
              type="button"
              onClick={refreshNow}
              disabled={isRefreshing}
              className={clsx(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100",
                isRefreshing
                  ? "border-blue-200 bg-blue-50 text-blue-700 opacity-100 dark:border-blue-400/30 dark:bg-blue-400/10 dark:text-blue-300"
                  : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100 disabled:opacity-60 dark:hover:bg-slate-800"
              )}
            >
              <RefreshCw className={clsx("h-3.5 w-3.5", isRefreshing && "animate-spin")} />
              {isRefreshing
                ? t("Refreshing...", "Actualisation...", "Aktualisiere...", "Actualizando...", "A atualizar...")
                : refreshLabel}
            </button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
          <p>{lastRefreshed ? `${lastUpdatedLabel} ${formatDateTime(lastRefreshed)}` : t("Live data", "Données en direct", "Live-Daten", "Datos en directo", "Dados em direto")}</p>
          {isRefreshing ? (
            <p className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-2 py-1 font-medium text-blue-700 dark:border-blue-400/30 dark:bg-blue-400/10 dark:text-blue-300">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {t("Refreshing data", "Actualisation des données", "Daten werden aktualisiert", "Actualizando datos", "A atualizar dados")}
            </p>
          ) : null}
          {!alerts.length ? (
            <p className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300/70 bg-emerald-50 px-2 py-1 font-medium text-emerald-800 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-300">
              <ShieldCheck className="h-3.5 w-3.5" />
              {systemHealthyLabel}
            </p>
          ) : null}
          {scheduledPendingCount > 0 ? (
            <p className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-white px-2 py-1 font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
              <Clock3 className="h-3.5 w-3.5" />
              {t(
                `${scheduledPendingCount} scheduled runs waiting`,
                `${scheduledPendingCount} executions planifiees en attente`,
                `${scheduledPendingCount} geplante Ausfuhrungen warten`,
                `${scheduledPendingCount} ejecuciones programadas en espera`,
                `${scheduledPendingCount} execucoes agendadas em espera`
              )}
            </p>
          ) : null}
        </div>
      </header>

      {alerts.length ? (
        <section
          className={clsx(
            "rounded-xl border px-4 py-3 text-sm",
            "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-300"
          )}
        >
          {alerts.map((m) => (
            <p key={m} className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              {m}
            </p>
          ))}
        </section>
      ) : null}

      {notice ? (
        <div
          className={clsx(
            "rounded-xl border px-4 py-3 text-sm",
            notice.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-300"
              : "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-400/30 dark:bg-rose-400/10 dark:text-rose-300"
          )}
        >
          {notice.message}
        </div>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <article className="min-w-0 rounded-xl border border-emerald-100 bg-white p-4 shadow-sm dark:border-emerald-400/20 dark:bg-slate-900">
          <p className="text-xs uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400 [overflow-wrap:anywhere]">{t("Completed Today", "Terminees aujourd hui", "Heute abgeschlossen", "Completadas hoy", "Concluidas hoje")}</p>
          <p className="mt-2 text-3xl font-semibold text-slate-900 dark:text-slate-50">{completedToday}</p>
          <div className="mt-2 flex min-w-0 items-center justify-between gap-3">
            <span className="min-w-0 text-xs text-slate-500 dark:text-slate-400">{t("7-day trend", "Tendance sur 7 jours", "7-Tage-Trend", "Tendencia de 7 días", "Tendencia de 7 dias")}</span>
            <Sparkline values={series.done} color="#16a34a" />
          </div>
        </article>
        <article className="min-w-0 rounded-xl border border-rose-100 bg-white p-4 shadow-sm dark:border-rose-400/20 dark:bg-slate-900">
          <p className="text-xs uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400 [overflow-wrap:anywhere]">{t("Failed Today", "Echouees aujourd hui", "Heute fehlgeschlagen", "Fallidas hoy", "Falhadas hoje")}</p>
          <p className="mt-2 text-3xl font-semibold text-slate-900 dark:text-slate-50">{failedToday}</p>
          <div className="mt-2 flex min-w-0 items-center justify-between gap-3">
            <span className="min-w-0 text-xs text-slate-500 dark:text-slate-400">{t("7-day trend", "Tendance sur 7 jours", "7-Tage-Trend", "Tendencia de 7 días", "Tendencia de 7 dias")}</span>
            <Sparkline values={series.fail} color="#e11d48" />
          </div>
        </article>
        <article className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <p className="text-xs uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400 [overflow-wrap:anywhere]">{t("Pending", "En attente", "Ausstehend", "Pendiente", "Pendente")}</p>
          <p className="mt-2 text-3xl font-semibold text-slate-900 dark:text-slate-50">{pendingCount}</p>
          <div className="mt-2 flex min-w-0 items-center justify-between gap-3">
            <span className="min-w-0 text-xs text-slate-500 dark:text-slate-400">{t("7-day trend", "Tendance sur 7 jours", "7-Tage-Trend", "Tendencia de 7 días", "Tendencia de 7 dias")}</span>
            <Sparkline values={series.pend} color="#d97706" />
          </div>
        </article>
        <article className="min-w-0 rounded-xl border border-blue-100 bg-white p-4 shadow-sm dark:border-blue-400/20 dark:bg-slate-900">
          <p className="text-xs uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400 [overflow-wrap:anywhere]">{t("Average Duration", "Durée moyenne", "Durchschnittliche Dauer", "Duración media", "Duracao media")}</p>
          <p className="mt-2 text-3xl font-semibold text-slate-900 dark:text-slate-50">{avgDuration}</p>
          <div className="mt-2 flex min-w-0 items-center justify-between gap-3">
            <span className="min-w-0 text-xs text-slate-500 dark:text-slate-400">{t("7-day trend", "Tendance sur 7 jours", "7-Tage-Trend", "Tendencia de 7 días", "Tendencia de 7 dias")}</span>
            <Sparkline values={series.dur} color="#2563eb" />
          </div>
        </article>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-center justify-between lg:hidden">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t("Filters", "Filtres", "Filter", "Filtros", "Filtros")}</h2>
          <button
            type="button"
            onClick={() => setMobileFiltersOpen((v) => !v)}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-200"
          >
            <ChevronDown className={clsx("h-3.5 w-3.5 transition", mobileFiltersOpen ? "rotate-180" : "")} />
            {mobileFiltersOpen ? t("Hide", "Masquer", "Ausblenden", "Ocultar", "Ocultar") : t("Show", "Afficher", "Anzeigen", "Mostrar", "Mostrar")}
          </button>
        </div>
        <div
          className={clsx(
            "mt-3 grid gap-3 lg:mt-0 lg:grid-cols-[minmax(0,2fr)_minmax(0,170px)_minmax(0,220px)_minmax(0,360px)]",
            !mobileFiltersOpen && "hidden lg:grid"
          )}
        >
          <input
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder={t("Search automations, customer, invoice", "Rechercher automatisation, client, facture", "Automatisierung, Kunde, Rechnung suchen", "Buscar automatización, cliente, factura", "Pesquisar automação, cliente, fatura")}
            className="min-w-0 h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="min-w-0 h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
          >
            <option value="all">{t("All statuses", "Tous les statuts", "Alle Status", "Todos los estados", "Todos os estados")}</option>
            <option value="SUCCESS">{t("Completed", "Termin?e", "Abgeschlossen", "Completada", "Conclu?da")}</option>
            <option value="FAILED">{t("Failed", "échouée", "Fehlgeschlagen", "Fallida", "Falhou")}</option>
            <option value="RUNNING">{t("In progress", "En cours", "In Bearbeitung", "En curso", "Em curso")}</option>
            <option value="PENDING">{t("Pending", "En attente", "Ausstehend", "Pendiente", "Pendente")}</option>
          </select>
          <select
            value={automationFilter}
            onChange={(e) => setAutomationFilter(e.target.value)}
            className="min-w-0 h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
          >
            <option value="all">{t("All automations", "Toutes les automatisations", "Alle Automatisierungen", "Todas las automatizaciones", "Todas as automações")}</option>
            {flowOptions.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
          <div className="min-w-0 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="h-10 rounded-lg border border-slate-300 bg-white pl-3 pr-10 text-sm text-slate-900 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:[color-scheme:dark] [&::-webkit-clear-button]:hidden [&::-webkit-inner-spin-button]:hidden"
            />
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="h-10 rounded-lg border border-slate-300 bg-white pl-3 pr-10 text-sm text-slate-900 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:[color-scheme:dark] [&::-webkit-clear-button]:hidden [&::-webkit-inner-spin-button]:hidden"
            />
          </div>
        </div>
      </section>

      <section className="space-y-3">
        {isInitialLoading ? (
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
            {t("Loading automation operations...", "Chargement des operations d'automatisation...", "Automatisierungsvorgange werden geladen...", "Cargando operaciónes de automatización...", "A carregar operações de automação...")}
          </div>
        ) : error ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-10 text-center text-sm text-rose-700 dark:border-rose-400/30 dark:bg-rose-400/10 dark:text-rose-300">
            {t(
              "Unable to load automation operations. Please try again.",
              "Impossible de charger les operations d'automatisation. Réessayez.",
              "Automatisierungsoperationen konnten nicht geladen werden. Bitte versuche es erneut.",
              "No se pudieron cargar las operaciónes de automatización. Intentalo de nuevo.",
              "Não foi possível carregar as operações de automação. Tente novamente."
            )}
          </div>
        ) : !runs.length ? (
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-10 text-center dark:border-slate-700 dark:bg-slate-900">
            <p className="text-lg font-semibold text-slate-900 dark:text-slate-50">{t("No automation activity yet.", "Aucune activité d'automatisation pour l instant.", "Noch keine Automatisierungsaktivität.", "Aún no hay actividad de automatización.", "Ainda não ha atividade de automação.")}</p>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{t("When automations begin running, they will appear here.", "Lorsque les automatisations commenceront a s executer, elles apparaitront ici.", "Sobald Automatisierungen laufen, erscheinen sie hier.", "Cuando las automatizaciones empiecen a ejecutarse, apareceran aquí.", "Quando as automações começarem a executar, aparecerao aquí.")}</p>
          </div>
        ) : !filteredRuns.length ? (
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-10 text-center dark:border-slate-700 dark:bg-slate-900">
            <p className="text-lg font-semibold text-slate-900 dark:text-slate-50">{t("No automation activity matches your filters.", "Aucune activité d'automatisation ne correspond a vos filtres.", "Keine Automatisierungsaktivität entspricht deinen Filtern.", "Ninguna actividad de automatización coincide con tus filtros.", "Nenhuma atividade de automação corresponde aos seus filtros.")}</p>
            <button
              type="button"
              onClick={clearFilters}
              className="mt-3 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              {t("Clear Filters", "Effacer les filtres", "Filter zurücksetzen", "Borrar filtros", "Limpar filtros")}
            </button>
          </div>
        ) : useVirtual ? (
          <div
            ref={virtualRef}
            onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
            className="max-h-[68vh] overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-950/70"
          >
            <div className="relative" style={{ height: `${baseRuns.length * ROW_HEIGHT}px` }}>
              {visibleRuns.map((run, i) => (
                <div key={run.id} className="absolute left-0 right-0" style={{ top: `${(startIdx + i) * ROW_HEIGHT}px` }}>
                  {renderRunCard(run)}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <>
            {visibleRuns.map((run) => renderRunCard(run))}
            {baseRuns.length < filteredRuns.length ? <div ref={loadMoreRef} className="h-8" /> : null}
          </>
        )}
      </section>

      {drawerOpen && selectedRun ? (
        <div className="fixed inset-0 z-50">
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/40"
            onClick={() => setDrawerOpen(false)}
            aria-label={t("Close details", "Fermer les détails", "Details schließen", "Cerrar detalles", "Fechar detalhes")}
          />
          <aside className="absolute inset-x-0 bottom-0 top-12 overflow-y-auto rounded-t-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-700 dark:bg-slate-900 md:inset-y-0 md:left-auto md:right-0 md:top-0 md:w-[560px] md:rounded-none md:rounded-l-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">{t("Run Overview", "Vue d ensemble de l ex?cution", "Laufübersicht", "Resumen de la ejecución", "Visao geral da execução")}</p>
                <h2 className="mt-1 text-xl font-semibold text-slate-900 dark:text-slate-50">
                  {selectedRun.flow?.title || t("Untitled automation", "Automatisation sans titre", "Unbenannte Automatisierung", "Automatización sin título", "Automação sem título")}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="rounded-full border border-slate-300 p-2 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {(() => {
              const info = contextForRun(selectedRun);
              const status = norm(selectedRun.runStatus);
              return (
                <div className="mt-4 grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 sm:grid-cols-2">
                  <div>
                    <p className="text-xs uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">{t("Status", "Statut", "Status", "Estado", "Estado")}</p>
                    <span className={clsx("mt-1 inline-flex rounded-full border px-2 py-1 text-xs font-semibold", statusTone(status))}>
                      {statusLabel(selectedRun)}
                    </span>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">{t("Start Event", "Evenement de depart", "Startereignis", "Evento de inicio", "Evento inicial")}</p>
                    <p className="mt-1 font-medium text-slate-900 dark:text-slate-50">{info.startedBy}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">{t("Customer", "Client", "Kunde", "Cliente", "Cliente")}</p>
                    <p className="mt-1 font-medium text-slate-900 dark:text-slate-50">{info.customer}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">{t("Invoice", "Facture", "Rechnung", "Factura", "Fatura")}</p>
                    <p className="mt-1 font-medium text-slate-900 dark:text-slate-50">{info.invoice}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">{t("Payment Reference", "Reference de paiement", "Zahlungsreferenz", "Referencia de pago", "Referencia de pagamento")}</p>
                    <p className="mt-1 font-medium text-slate-900 dark:text-slate-50">{info.paymentReference}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">{t("Started", "Demarree", "Gestartet", "Iniciada", "Iniciada")}</p>
                    <p className="mt-1 font-medium text-slate-900 dark:text-slate-50">{formatDateTime(selectedRun.startedAt || selectedRun.createdAt)}</p>
                  </div>
                  {selectedRun.nextRunAt ? (
                    <div>
                      <p className="text-xs uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                        {isFutureScheduledRun(selectedRun)
                          ? t("Scheduled for", "Planifiee pour", "Geplant f?r", "Programada para", "Agendada para")
                          : t("Next attempt", "Prochaine tentative", "Nächster Versuch", "Siguiente intento", "Próxima tentativa")}
                      </p>
                      <p className="mt-1 font-medium text-slate-900 dark:text-slate-50">{formatDateTime(selectedRun.nextRunAt)}</p>
                    </div>
                  ) : null}
                  <div>
                    <p className="text-xs uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">{t("Duration", "Durée", "Dauer", "Duración", "Duracao")}</p>
                    <p className="mt-1 font-medium text-slate-900 dark:text-slate-50">
                      {formatDuration(selectedRun.startedAt || selectedRun.createdAt, selectedRun.completedAt, selectedRun.runStatus)}
                    </p>
                  </div>
                </div>
              );
            })()}

            <div className="mt-6">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t("Step Timeline", "Chronologie des etapes", "Schrittverlauf", "Linea de tiempo de pasos", "Cronologia dos passos")}</h3>
              <div className="mt-3 space-y-3">
                {timeline.length ? (
                  timeline.map((item, idx) => (
                    <div key={item.id} className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-2">
                          <span
                            className={clsx(
                              "mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full",
                              item.status === "success"
                                ? "bg-emerald-100 text-emerald-700"
                                : item.status === "failed"
                                  ? "bg-rose-100 text-rose-700"
                                  : "bg-amber-100 text-amber-700"
                            )}
                          >
                            {item.status === "success" ? (
                              <CheckCircle2 className="h-3.5 w-3.5" />
                            ) : item.status === "failed" ? (
                              <XCircle className="h-3.5 w-3.5" />
                            ) : (
                              <Clock3 className="h-3.5 w-3.5" />
                            )}
                          </span>
                          <div>
                            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                              {t("Step", "Etape", "Schritt", "Paso", "Passo")} {idx + 1} - {item.step}
                            </p>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                              {item.timestamp ? formatDateTime(item.timestamp) : "--"} - {item.duration}
                            </p>
                          </div>
                        </div>
                        <span
                          className={clsx(
                            "rounded-full px-2 py-1 text-[11px] font-semibold uppercase tracking-wide",
                            item.status === "success"
                              ? "bg-emerald-100 text-emerald-700"
                              : item.status === "failed"
                                ? "bg-rose-100 text-rose-700"
                                : "bg-amber-100 text-amber-700"
                          )}
                        >
                          {item.status === "success" ? t("Success", "Succes", "Erfolg", "?xito", "Sucesso") : item.status === "failed" ? t("Failed", "?chec", "Fehlgeschlagen", "Fallido", "Falhou") : t("Pending", "En attente", "Ausstehend", "Pendiente", "Pendente")}
                        </span>
                      </div>
                      {item.message ? <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">{item.message}</p> : null}
                    </div>
                  ))
                ) : (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300">
                    {t("No step timeline available for this run.", "Aucune chronologie d etapes disponible pour cette ex?cution.", "Kein Schrittverlauf für diese Ausführung verfügbar.", "No hay linea de tiempo de pasos para esta ejecución.", "Não há cronologia de passos para esta execução.")}
                  </div>
                )}
              </div>
            </div>
          </aside>
        </div>
      ) : null}

      {confirmRetryId ? (
        <div className="fixed inset-0 z-[60]">
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/40"
            onClick={() => setConfirmRetryId(null)}
            aria-label={t("Close retry confirmation", "Fermer la confirmation de relance", "Bestätigung für erneuten Lauf schließen", "Cerrar confirmación de reintento", "Fechar confirmação de repetição")}
          />
          <div className="absolute left-1/2 top-1/2 w-[92vw] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-50">{t("Confirm Full Run Retry", "Confirmer la relance complete", "Vollständigen erneuten Lauf bestätigen", "Confirmar reintento completo", "Confirmar repeticao completa")}</h3>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              {t("This retry will start the full automation again from the beginning.", "Cette relance redémarrerà l'automatisation complete depuis le debut.", "Dieser erneute Lauf startet die komplette Automatisierung erneut von Anfang an.", "Este reintento iniciara toda la automatización de nuevo desde el principio.", "Esta repeticao iniciara toda a automação novamente desde o inicio.")}
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmRetryId(null)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                {t("Cancel", "Annuler", "Abbrechen", "Cancelar", "Cancelar")}
              </button>
              <button
                type="button"
                disabled={retrying}
                onClick={() => {
                  const run = runs.find((r) => r.id === confirmRetryId);
                  if (run) void retryRun(run);
                }}
                className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {retrying ? t("Retrying...", "Relance...", "Wird erneut ausgeführt...", "Reintentando...", "A repetir...") : t("Retry full run", "Relancer l ex?cution complete", "Gesamten Lauf erneut ausführen", "Reintentar ejecución completa", "Repetir execução completa")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
