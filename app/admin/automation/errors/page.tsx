"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import useSWR from "swr";
import { Copy, ExternalLink, RefreshCw, Search, X } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/components/providers/language-provider";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Toast } from "@/components/ui/toast";
import { formatDateTimeDMY } from "@/lib/date";
import { LANGUAGE_LOCALES, type CompleteLocalizedText } from "@/lib/i18n";

type RecoveryStatus = "FAILED" | "RETRYING" | "RESOLVED";
type RangeMode = "1h" | "24h" | "7d" | "custom";
type SortMode = "created_desc" | "created_asc";
type AutoRefreshMode = "off" | "30" | "60";

type ListItem = {
  id: string;
  runId?: string;
  flow: { id: string; name: string; businessId: string | null; tenantName: string | null };
  subscriber: { id: string; name: string; email: string; publicId: string | null };
  status: RecoveryStatus;
  errorSummary: string;
  createdAt: string;
  retryCount: number;
  lastRetryAt: string | null;
  latestAttemptAt: string | null;
  latestAttemptRunId: string | null;
};

type ListResponse = {
  summary: {
    failedRuns24h: number;
    impactedFlows24h: number;
    impactedSubscribers24h: number;
    latestFailureAt: string | null;
    counters?: {
      automation_failures_total: number;
      automation_retries_total: number;
      automation_replays_total: number;
      automation_recovered_total: number;
    };
  };
  topImpactedFlows: Array<{ flowId: string; flowName: string; failureCount: number }>;
  items: ListItem[];
  hasMore: boolean;
  nextCursor: string | null;
  pageSize: number;
  total: number;
};

type DetailResponse = {
  id: string;
  status: RecoveryStatus;
  retryCount: number;
  lastRetryAt: string | null;
  runId: string;
  flow: { id: string; name: string };
  subscriber: { id: string; email: string };
  tenant: { id: string | null; name: string | null };
  trigger: string;
  created: string;
  failedStep: {
    stepId: string | null;
    stepIndex: number | null;
    stepType: string | null;
    transient: boolean;
  } | null;
  errorMessage: string;
  stackTrace: string | null;
  sanitizedInputPayload: Record<string, unknown>;
  flowConfigurationSnapshot: Record<string, unknown>;
  inputPayload: Record<string, unknown>;
  flowSnapshot: Record<string, unknown>;
  resumeState: Record<string, unknown>;
  relatedLinks: {
    tenant: string | null;
    subscriber: string | null;
    flow: string | null;
  };
  stepsTimeline: Array<{
    id: string;
    stepKey: string;
    stepType: string;
    status: "STARTED" | "SUCCESS" | "FAILED" | "SKIPPED";
    startedAt: string | null;
    finishedAt: string | null;
    durationMs: number | null;
    errorMessage: string | null;
    errorCode: string | null;
    safeOutput: Record<string, unknown> | null;
  }>;
  recoveryAttempts: Array<{
    id: string;
    actorAdminId: string;
    actorAdminName: string | null;
    actorIp: string | null;
    createdAt: string;
    resultStatus: "STARTED" | "BLOCKED" | "SUCCEEDED" | "FAILED";
    newRunId: string | null;
    blockReason: string | null;
    reason: string | null;
  }>;
  runMetadata: {
    runId: string;
    flowName: string;
    flowId: string;
    subscriberId: string;
    subscriberEmail: string;
    tenantId: string | null;
    tenantName: string | null;
    triggerType: string;
    createdAt: string;
    latestAttemptAt: string | null;
    latestAttemptRunId: string | null;
  };
  error: {
    message: string;
    stackTrace: string | null;
  };
  executionContext: {
    inputPayload: Record<string, unknown>;
    flowSnapshot: Record<string, unknown>;
    resumeState: Record<string, unknown>;
  };
  replayHistory: Array<{
    id: string;
    status: "PENDING" | "RUNNING" | "SUCCESS" | "FAILED";
    createdAt: string;
    completedAt: string | null;
  }>;
};

const fetcher = async <T,>(url: string): Promise<T> => {
  const res = await fetch(url, { cache: "no-store" });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(String((payload as { error?: string }).error || `Request failed (${res.status})`));
  return payload as T;
};

const text = (en: string, fr: string, de: string, es: string, pt: string): CompleteLocalizedText => ({ en, fr, de, es, pt });

const statusOptions: Array<{ value: "ALL" | RecoveryStatus; label: CompleteLocalizedText }> = [
  { value: "ALL", label: text("All statuses", "Tous les statuts", "Alle Status", "Todos los estados", "Todos os estados") },
  { value: "FAILED", label: text("Failed", "échoué", "Fehlgeschlagen", "Fallido", "Falhado") },
  { value: "RETRYING", label: text("Retrying", "Nouvelle tentative", "Wiederholung", "Reintentando", "A tentar novamente") },
  { value: "RESOLVED", label: text("Resolved", "Résolue", "Behoben", "Resuelto", "Resolvido") },
];

function statusLabel(status: RecoveryStatus) {
  if (status === "FAILED") return text("Failed", "échoué", "Fehlgeschlagen", "Fallido", "Falhado");
  if (status === "RETRYING") return text("Retrying", "Nouvelle tentative", "Wiederholung", "Reintentando", "A tentar novamente");
  return text("Resolved", "Résolue", "Behoben", "Resuelto", "Resolvido");
}

function stepStatusLabel(status: "STARTED" | "SUCCESS" | "FAILED" | "SKIPPED") {
  if (status === "STARTED") return text("Started", "Demarre", "Gestartet", "Iniciado", "Iniciado");
  if (status === "SUCCESS") return text("Success", "Succes", "Erfolg", "?xito", "Sucesso");
  if (status === "FAILED") return text("Failed", "échoué", "Fehlgeschlagen", "Fallido", "Falhado");
  return text("Skipped", "Ignore", "übersprungen", "Omitido", "Ignorado");
}

function attemptStatusLabel(status: "STARTED" | "BLOCKED" | "SUCCEEDED" | "FAILED") {
  if (status === "STARTED") return text("Started", "Demarre", "Gestartet", "Iniciado", "Iniciado");
  if (status === "BLOCKED") return text("Blocked", "Bloque", "Blockiert", "Bloqueado", "Bloqueado");
  if (status === "SUCCEEDED") return text("Succeeded", "R?ussi", "Erfolgreich", "Completado", "Conclu?do");
  return text("Failed", "échoué", "Fehlgeschlagen", "Fallido", "Falhado");
}

function formatRelative(input: string, locale: string) {
  const deltaMs = new Date(input).getTime() - Date.now();
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const minute = 60_000;
  const hour = 3_600_000;
  const day = 86_400_000;
  if (Math.abs(deltaMs) < minute) return rtf.format(0, "minute");
  if (Math.abs(deltaMs) < hour) return rtf.format(Math.round(deltaMs / minute), "minute");
  if (Math.abs(deltaMs) < day) return rtf.format(Math.round(deltaMs / hour), "hour");
  return rtf.format(Math.round(deltaMs / day), "day");
}

function statusBadgeClass(status: RecoveryStatus) {
  if (status === "FAILED") return "bg-rose-100 text-rose-700 ring-rose-200 dark:bg-rose-500/15 dark:text-rose-300 dark:ring-rose-500/30";
  if (status === "RETRYING") return "bg-indigo-100 text-indigo-700 ring-indigo-200 dark:bg-indigo-500/15 dark:text-indigo-300 dark:ring-indigo-500/30";
  return "bg-emerald-100 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/30";
}

function stepStatusClass(status: "STARTED" | "SUCCESS" | "FAILED" | "SKIPPED") {
  if (status === "FAILED") return "bg-rose-100 text-rose-700 ring-rose-200 dark:bg-rose-500/15 dark:text-rose-300 dark:ring-rose-500/30";
  if (status === "SUCCESS") return "bg-emerald-100 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/30";
  if (status === "STARTED") return "bg-indigo-100 text-indigo-700 ring-indigo-200 dark:bg-indigo-500/15 dark:text-indigo-300 dark:ring-indigo-500/30";
  return "bg-slate-100 text-slate-700 ring-slate-200 dark:bg-slate-500/15 dark:text-slate-300 dark:ring-slate-500/30";
}

function attemptStatusClass(status: "STARTED" | "BLOCKED" | "SUCCEEDED" | "FAILED") {
  if (status === "FAILED" || status === "BLOCKED") {
    return "bg-rose-100 text-rose-700 ring-rose-200 dark:bg-rose-500/15 dark:text-rose-300 dark:ring-rose-500/30";
  }
  if (status === "SUCCEEDED") {
    return "bg-emerald-100 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/30";
  }
  return "bg-indigo-100 text-indigo-700 ring-indigo-200 dark:bg-indigo-500/15 dark:text-indigo-300 dark:ring-indigo-500/30";
}

function toDateInput(date: Date | null) {
  if (!date) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function parseDateInput(value: string) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return null;
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function JsonCard({ title, value }: { title: CompleteLocalizedText; value: Record<string, unknown> }) {
  const { t } = useLanguage();
  const [copied, setCopied] = useState(false);
  const formatted = useMemo(() => JSON.stringify(value || {}, null, 2), [value]);

  const copy = async () => {
    await navigator.clipboard.writeText(formatted);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div className="space-y-2 rounded-lg border border-border/70 bg-background/70 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">{t(title)}</p>
        <Button size="sm" variant="ghost" onClick={copy}>
          {copied ? t("Copied", "Copie", "Kopiert", "Copiado", "Copiado") : t("Copy JSON", "Copier le JSON", "JSON kopieren", "Copiar JSON", "Copiar JSON")}
        </Button>
      </div>
      <pre className="max-h-48 overflow-auto rounded-md border border-border/60 bg-background p-2 text-xs text-foreground">
        {formatted}
      </pre>
    </div>
  );
}

export default function AutomationErrorsPage() {
  const { language, t } = useLanguage();
  const searchRef = useRef<HTMLInputElement | null>(null);

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [flowId, setFlowId] = useState("");
  const [subscriber, setSubscriber] = useState("");
  const [tenant, setTenant] = useState("");
  const [status, setStatus] = useState<"ALL" | RecoveryStatus>("ALL");
  const [range, setRange] = useState<RangeMode>("24h");
  const [from, setFrom] = useState<Date | null>(null);
  const [to, setTo] = useState<Date | null>(null);
  const [sort, setSort] = useState<SortMode>("created_desc");
  const [autoRefresh, setAutoRefresh] = useState<AutoRefreshMode>("off");
  const [cursors, setCursors] = useState<string[]>([""]);
  const [page, setPage] = useState(1);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [toast, setToast] = useState("");
  const [replayBusyId, setReplayBusyId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [replayModalRunId, setReplayModalRunId] = useState<string | null>(null);
  const [replayReason, setReplayReason] = useState("");
  const [copiedValue, setCopiedValue] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
      setCursors([""]);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const autoRefreshMs = autoRefresh === "off" ? 0 : Number(autoRefresh) * 1000;
  const cursor = page > 1 ? cursors[page - 1] || "" : "";

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    params.set("pageSize", "20");
    params.set("sort", sort);
    params.set("range", range);
    if (search) params.set("q", search);
    if (flowId) params.set("flowId", flowId);
    if (subscriber) params.set("subscriber", subscriber);
    if (tenant) params.set("tenant", tenant);
    if (status !== "ALL") params.set("status", status);
    if (range === "custom" && from) params.set("from", from.toISOString());
    if (range === "custom" && to) params.set("to", to.toISOString());
    if (cursor) params.set("cursor", cursor);
    return params.toString();
  }, [cursor, flowId, from, range, search, sort, status, subscriber, tenant, to]);

  const { data, error, isLoading, mutate } = useSWR<ListResponse>(
    `/api/admin/automation/errors?${queryString}`,
    fetcher,
    { refreshInterval: autoRefreshMs, revalidateOnFocus: true }
  );

  const { data: detail, isLoading: detailLoading, mutate: mutateDetail } = useSWR<DetailResponse>(
    selectedRunId ? `/api/admin/automation/errors/${selectedRunId}` : null,
    fetcher
  );

  useEffect(() => {
    if (!data?.items?.length) {
      setSelectedRunId(null);
      return;
    }
    if (selectedRunId && data.items.some((item) => item.id === selectedRunId)) return;
    setSelectedRunId(data.items[0].id);
  }, [data?.items, selectedRunId]);

  const refreshPage = useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await mutate();
      await mutateDetail();
    } finally {
      setRefreshing(false);
    }
  }, [mutate, mutateDetail, refreshing]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTyping = Boolean(
        target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)
      );
      if (event.key === "/" && !isTyping) {
        event.preventDefault();
        searchRef.current?.focus();
      }
      if ((event.key === "r" || event.key === "R") && !isTyping) {
        event.preventDefault();
        void refreshPage();
      }
      if (event.key === "Escape") {
        setSelectedRunId(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [refreshPage]);

  const applyRange = (nextRange: RangeMode) => {
    setRange(nextRange);
    setPage(1);
    setCursors([""]);
    if (nextRange !== "custom") {
      setFrom(null);
      setTo(null);
    }
  };

  const activeFilters = useMemo(
    () =>
      [
        search ? { id: "q", label: t(text(`Search: ${search}`, `Recherche : ${search}`, `Suche: ${search}`, `Buscar: ${search}`, `Pesquisar: ${search}`)), clear: () => { setSearch(""); setSearchInput(""); setPage(1); setCursors([""]); } } : null,
        flowId ? { id: "flow", label: t(text(`Flow: ${flowId}`, `Flux : ${flowId}`, `Flow: ${flowId}`, `Flujo: ${flowId}`, `Fluxo: ${flowId}`)), clear: () => { setFlowId(""); setPage(1); setCursors([""]); } } : null,
        subscriber ? { id: "subscriber", label: t(text(`Subscriber: ${subscriber}`, `Abonne : ${subscriber}`, `Abonnent: ${subscriber}`, `Suscriptor: ${subscriber}`, `Subscritor: ${subscriber}`)), clear: () => { setSubscriber(""); setPage(1); setCursors([""]); } } : null,
        tenant ? { id: "tenant", label: t(text(`Tenant: ${tenant}`, `Locataire : ${tenant}`, `Mandant: ${tenant}`, `Tenant: ${tenant}`, `Tenant: ${tenant}`)), clear: () => { setTenant(""); setPage(1); setCursors([""]); } } : null,
        status !== "ALL" ? { id: "status", label: t(text(`Status: ${status}`, `Statut : ${status}`, `Status: ${status}`, `Estado: ${status}`, `Estado: ${status}`)), clear: () => { setStatus("ALL"); setPage(1); setCursors([""]); } } : null,
        range !== "24h" ? { id: "range", label: t(text(`Range: ${range}`, `Plage : ${range}`, `Bereich: ${range}`, `Rango: ${range}`, `Intervalo: ${range}`)), clear: () => applyRange("24h") } : null,
      ].filter(Boolean) as Array<{ id: string; label: string; clear: () => void }>,
    [flowId, range, search, status, subscriber, tenant, t]
  );

  const copyText = useCallback(async (label: string, value: string | null | undefined) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopiedValue(label);
      setTimeout(() => setCopiedValue((prev) => (prev === label ? null : prev)), 1500);
    } catch {
      setToast(t("Copy failed", "La copie a échoué", "Kopieren fehlgeschlagen", "La copia fallo", "A copia falhou"));
      setTimeout(() => setToast(""), 2200);
    }
  }, [t]);

  const runReplay = async (runId: string, reason?: string) => {
    if (replayBusyId) return;
    setReplayBusyId(runId);
    try {
      const res = await fetch(`/api/admin/automation/errors/${runId}/replay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason?.trim() || undefined }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(String((payload as { error?: string }).error || t("Replay failed", "La relecture a échoué", "Replay fehlgeschlagen", "La repeticion fallo", "A repeticao falhou")));
      }
      const replayRunId = String((payload as { newRunId?: string; replayRunId?: string }).newRunId || (payload as { replayRunId?: string }).replayRunId || "").trim();
      setToast(
        replayRunId
          ? t(
              text(
                `Replay started (${replayRunId})`,
                `Relecture demarree (${replayRunId})`,
                `Replay gestartet (${replayRunId})`,
                `Repeticion iniciada (${replayRunId})`,
                `Repeticao iniciada (${replayRunId})`
              )
            )
          : t("Replay started", "Relecture demarree", "Replay gestartet", "Repeticion iniciada", "Repeticao iniciada")
      );
      await Promise.all([mutate(), mutateDetail()]);
      setTimeout(() => setToast(""), 2500);
    } catch (err) {
      setToast(err instanceof Error ? err.message : t("Replay failed", "La relecture a échoué", "Replay fehlgeschlagen", "La repeticion fallo", "A repeticao falhou"));
      setTimeout(() => setToast(""), 3200);
    } finally {
      setReplayBusyId(null);
    }
  };

  const onReplay = async () => {
    if (!replayModalRunId) return;
    const targetRunId = replayModalRunId;
    await runReplay(targetRunId, replayReason);
    setReplayModalRunId(null);
    setReplayReason("");
  };

  const summary = data?.summary;
  const rows = data?.items || [];
  const replayModalRun = rows.find((row) => row.id === replayModalRunId) || (detail && replayModalRunId === detail.id
    ? {
        id: detail.id,
        flow: { id: detail.flow.id, name: detail.flow.name, businessId: detail.tenant.id, tenantName: detail.tenant.name },
        subscriber: {
          id: detail.subscriber.id,
          name: detail.subscriber.email,
          email: detail.subscriber.email,
          publicId: null,
        },
        status: detail.status,
        errorSummary: detail.error.message,
        createdAt: detail.created,
        retryCount: detail.retryCount,
        lastRetryAt: detail.lastRetryAt,
        latestAttemptAt: detail.runMetadata.latestAttemptAt,
        latestAttemptRunId: detail.runMetadata.latestAttemptRunId,
      }
    : null);
  const hasFailures = (summary?.failedRuns24h || 0) > 0;

  return (
    <div className="mx-auto w-full max-w-[1440px] space-y-5 px-6 py-5">
      <header className="rounded-xl border border-border/60 bg-card px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold text-foreground">{t(text("Automation Errors", "Erreurs d'automatisation", "Automatisierungsfehler", "Errores de automatización", "Erros de automação"))}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {t(
                text(
                  "Recover failed automation runs and maintain system reliability.",
                  "Recuperez les executions d'automatisation échouées et maintenez la fiabilite du système.",
                  "Behebe fehlgeschlagene Automatisierungslaufe und halte die Systemzuverlässigkeit aufrecht.",
                  "Recupera las ejecuciones fallidas de automatización y manten la fiabilidad del sistema.",
                  "Recupere execucoes falhadas da automação e mantenha a fiabilidade do sistema."
                )
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" onClick={refreshPage} disabled={refreshing}>
              <RefreshCw className={clsx("h-4 w-4", refreshing && "animate-spin")} />
              {refreshing
                ? t("Refreshing...", "Rafra?chissement...", "Wird aktualisiert...", "Actualizando...", "A atualizar...")
                : t("Refresh", "Rafraichir", "Aktualisieren", "Actualizar", "Atualizar")}
            </Button>
            <select
              value={autoRefresh}
              onChange={(event) => setAutoRefresh(event.target.value as AutoRefreshMode)}
              className="h-10 rounded-md border border-border/70 bg-background px-3 text-sm"
            >
              <option value="off">{t("Auto refresh: Off", "Rafra?chissement auto : arr?t", "Auto-Aktualisierung: aus", "Actualización automática: desactivada", "Atualização automática: desligada")}</option>
              <option value="30">{t("Auto refresh: 30s", "Rafra?chissement auto : 30 s", "Auto-Aktualisierung: 30 s", "Actualización automática: 30 s", "Atualização automática: 30 s")}</option>
              <option value="60">{t("Auto refresh: 60s", "Rafra?chissement auto : 60 s", "Auto-Aktualisierung: 60 s", "Actualización automática: 60 s", "Atualização automática: 60 s")}</option>
            </select>
          </div>
        </div>
      </header>

      {error ? (
        <div className="space-y-2">
          <Alert variant="error">{t("Unable to load automation failures.", "Impossible de charger les échecs d'automatisation.", "Automatisierungsfehler können nicht geladen werden.", "No se pueden cargar los fallos de automatización.", "Não foi possível carregar as falhas de automação.")}</Alert>
          <Button variant="secondary" onClick={refreshPage}>{t("Retry", "Reessayer", "Erneut versuchen", "Reintentar", "Tentar novamente")}</Button>
        </div>
      ) : null}

      <section className="grid gap-3 md:grid-cols-2 2xl:grid-cols-4">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-24 rounded-xl" />)
        ) : (
          <>
            <div className={clsx("rounded-xl border bg-card px-4 py-3", hasFailures ? "border-amber-300 dark:border-amber-500/40" : "border-border/70")}>
              <p className="text-xs uppercase leading-5 tracking-[0.1em] text-muted-foreground break-words">{t("Failed Runs", "Executions échouées", "Fehlgeschlagene Laufe", "Ejecuciones fallidas", "Execucoes falhadas")}</p>
              <p className="mt-1 text-2xl font-semibold text-foreground">{summary?.failedRuns24h ?? 0}</p>
            </div>
            <div className="rounded-xl border border-border/70 bg-card px-4 py-3">
              <p className="text-xs uppercase leading-5 tracking-[0.1em] text-muted-foreground break-words">{t("Impacted Flows", "Flux impactes", "Betroffene Flows", "Flujos afectados", "Fluxos afetados")}</p>
              <p className="mt-1 text-2xl font-semibold text-foreground">{summary?.impactedFlows24h ?? 0}</p>
            </div>
            <div className="rounded-xl border border-border/70 bg-card px-4 py-3">
              <p className="text-xs uppercase leading-5 tracking-[0.1em] text-muted-foreground break-words">{t("Impacted Subscribers", "Abonnés impactes", "Betroffene Abonnenten", "Suscriptores afectados", "Subscritores afetados")}</p>
              <p className="mt-1 text-2xl font-semibold text-foreground">{summary?.impactedSubscribers24h ?? 0}</p>
            </div>
            <div className="rounded-xl border border-border/70 bg-card px-4 py-3">
              <p className="text-xs uppercase leading-5 tracking-[0.1em] text-muted-foreground break-words">{t("Latest Failure", "Dernier ?chec", "Letzter Fehler", "Último fallo", "Última falha")}</p>
              <p className="mt-1 text-sm font-semibold text-foreground">
                {summary?.latestFailureAt ? formatDateTimeDMY(new Date(summary.latestFailureAt), LANGUAGE_LOCALES[language]) : t("N/A", "N/D", "k. A.", "N/D", "N/D")}
              </p>
            </div>
          </>
        )}
      </section>

      <section className="rounded-xl border border-border/60 bg-card px-5 py-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-semibold text-foreground">{t("Most impacted flows", "Flux les plus impactes", "Am starksten betroffene Flows", "Flujos más afectados", "Fluxos mais afetados")}</p>
          <p className="text-xs text-muted-foreground">{t("Last 24 hours", "Dernieres 24 heures", "Letzte 24 Stunden", "Últimas 24 horas", "Ultimas 24 horas")}</p>
        </div>
        {isLoading ? (
          <Skeleton className="h-24 rounded-lg" />
        ) : data?.topImpactedFlows?.length ? (
          <div className="space-y-2">
            {data.topImpactedFlows.map((flow) => (
              <button
                key={flow.flowId}
                type="button"
                onClick={() => {
                  setFlowId(flow.flowId);
                  setPage(1);
                  setCursors([""]);
                }}
                className={clsx(
                  "flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left transition hover:bg-muted/30",
                  flowId === flow.flowId ? "border-indigo-400 bg-indigo-50/60 dark:border-indigo-500/50 dark:bg-indigo-500/10" : "border-border/70"
                )}
              >
                <span className="text-sm font-medium text-foreground">{flow.flowName}</span>
                 <span className="text-xs text-muted-foreground">
                   {t(
                     text(
                       `${flow.failureCount} failures`,
                       `${flow.failureCount} echecs`,
                       `${flow.failureCount} Fehler`,
                       `${flow.failureCount} fallos`,
                       `${flow.failureCount} falhas`
                     )
                   )}
                 </span>
              </button>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t("No automation failures detected. System is operating normally.", "Aucun ?chec d'automatisation detecte. Le système fonctionne normalement.", "Keine Automatisierungsfehler erkannt. Das System arbeitet normal.", "No se detectaron fallos de automatización. El sistema funciona con normalidad.", "Não foram detetadas falhas de automação. O sistema esta a funcionar normalmente.")}</p>
        )}
      </section>

      <section className="rounded-xl border border-border/60 bg-card px-5 py-4">
        <div className="grid gap-2 lg:grid-cols-[minmax(220px,1fr)_170px_170px_170px_170px]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              ref={searchRef}
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder={t("Search flow, subscriber email, run id", "Rechercher un flux, un email d'abonne, un ID d'ex?cution", "Flow, Abonnenten-E-Mail oder Lauf-ID suchen", "Buscar flujo, correo del suscriptor o ID de ejecución", "Pesquisar fluxo, email do subscritor ou ID da execução")}
              className="h-11 w-full rounded-md border border-border/70 bg-background pl-9 pr-3 text-sm text-foreground"
            />
          </div>
          <Input
            value={flowId}
            onChange={(event) => {
              setFlowId(event.target.value);
              setPage(1);
              setCursors([""]);
            }}
            placeholder={t("Flow ID", "ID du flux", "Flow-ID", "ID del flujo", "ID do fluxo")}
          />
          <Input
            value={subscriber}
            onChange={(event) => {
              setSubscriber(event.target.value);
              setPage(1);
              setCursors([""]);
            }}
            placeholder={t("Subscriber", "Abonne", "Abonnent", "Suscriptor", "Subscritor")}
          />
          <Input
            value={tenant}
            onChange={(event) => {
              setTenant(event.target.value);
              setPage(1);
              setCursors([""]);
            }}
            placeholder={t("Tenant", "Locataire", "Mandant", "Tenant", "Tenant")}
          />
          <select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value as "ALL" | RecoveryStatus);
              setPage(1);
              setCursors([""]);
            }}
            className="h-11 rounded-md border border-border/70 bg-background px-3 text-sm"
          >
            {statusOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {t(option.label)}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-2 grid gap-2 lg:grid-cols-[170px_170px_1fr]">
          <select
            value={range}
            onChange={(event) => applyRange(event.target.value as RangeMode)}
            className="h-10 rounded-md border border-border/70 bg-background px-3 text-sm"
          >
            <option value="1h">{t("Last 1 hour", "Derni?re heure", "Letzte 1 Stunde", "Última hora", "Última hora")}</option>
            <option value="24h">{t("Last 24 hours", "Dernieres 24 heures", "Letzte 24 Stunden", "Últimas 24 horas", "Ultimas 24 horas")}</option>
            <option value="7d">{t("Last 7 days", "Derniers 7 jours", "Letzte 7 Tage", "Últimos 7 días", "Últimos 7 dias")}</option>
            <option value="custom">{t("Custom range", "Plage personnalisee", "Benutzerdefinierter Bereich", "Rango personalizado", "Intervalo personalizado")}</option>
          </select>
          <select
            value={sort}
            onChange={(event) => {
              setSort(event.target.value as SortMode);
              setPage(1);
              setCursors([""]);
            }}
            className="h-10 rounded-md border border-border/70 bg-background px-3 text-sm"
          >
            <option value="created_desc">{t("Newest first", "Plus recentes d'abord", "Neueste zuerst", "Más recientes primero", "Mais recentes primeiro")}</option>
            <option value="created_asc">{t("Oldest first", "Plus anciennes d'abord", "Alteste zuerst", "Más antiguos primero", "Mais antigos primeiro")}</option>
          </select>
          {range === "custom" ? (
            <div className="grid gap-2 sm:grid-cols-2">
              <input
                type="datetime-local"
                value={toDateInput(from)}
                onChange={(event) => {
                  setFrom(parseDateInput(event.target.value));
                  setPage(1);
                  setCursors([""]);
                }}
                className="h-10 rounded-md border border-border/70 bg-background px-2 text-sm"
              />
              <input
                type="datetime-local"
                value={toDateInput(to)}
                onChange={(event) => {
                  setTo(parseDateInput(event.target.value));
                  setPage(1);
                  setCursors([""]);
                }}
                className="h-10 rounded-md border border-border/70 bg-background px-2 text-sm"
              />
            </div>
          ) : (
            <div />
          )}
        </div>

        {activeFilters.length ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {activeFilters.map((filter) => (
              <button
                key={filter.id}
                type="button"
                onClick={filter.clear}
                className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-muted/25 px-3 py-1 text-xs text-foreground transition hover:bg-muted/45"
              >
                {filter.label}
                <X className="h-3 w-3" />
              </button>
            ))}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearchInput("");
                setSearch("");
                setFlowId("");
                setSubscriber("");
                setTenant("");
                setStatus("ALL");
                applyRange("24h");
                setSort("created_desc");
                setPage(1);
                setCursors([""]);
              }}
            >
              {t("Reset all", "Tout r?initialiser", "Alles zurücksetzen", "Restablecer todo", "Repor tudo")}
            </Button>
          </div>
        ) : null}
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="rounded-xl border border-border/60 bg-card">
          <div className="grid grid-cols-[minmax(160px,1fr)_minmax(180px,1fr)_120px_minmax(180px,1.3fr)_170px_110px_130px] gap-2 border-b border-border/70 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            <span>{t("Flow", "Flux", "Flow", "Flujo", "Fluxo")}</span>
            <span>{t("Subscriber", "Abonne", "Abonnent", "Suscriptor", "Subscritor")}</span>
            <span>{t("Status", "Statut", "Status", "Estado", "Estado")}</span>
            <span>{t("Error summary", "Resume de l'erreur", "Fehlerzusammenfassung", "Resumen del error", "Resumo do erro")}</span>
            <span>{t("Created", "Cr??", "Erstellt", "Creado", "Criado")}</span>
            <span>{t("Retry count", "Nombre de tentatives", "Anzahl Wiederholungen", "Número de reintentos", "Número de tentativas")}</span>
            <span>{t("Actions", "Actions", "Aktionen", "Acciones", "Ações")}</span>
          </div>
          <div className="max-h-[calc(100vh-380px)] overflow-y-auto">
            {isLoading ? (
              <div className="space-y-2 p-3">
                {Array.from({ length: 8 }).map((_, index) => (
                  <Skeleton key={index} className="h-11 rounded-md" />
                ))}
              </div>
            ) : rows.length === 0 ? (
              <div className="flex min-h-[280px] flex-col items-center justify-center px-5 text-center">
                 <p className="text-base font-semibold text-foreground">{t("No automation failures detected.", "Aucun ?chec d'automatisation detecte.", "Keine Automatisierungsfehler erkannt.", "No se detectaron fallos de automatización.", "Não foram detetadas falhas de automação.")}</p>
                 <p className="text-sm text-muted-foreground">{t("System is operating normally.", "Le système fonctionne normalement.", "Das System arbeitet normal.", "El sistema funciona con normalidad.", "O sistema esta a funcionar normalmente.")}</p>
              </div>
            ) : (
              rows.map((row) => (
                <div
                  key={row.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedRunId(row.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setSelectedRunId(row.id);
                    }
                  }}
                  className={clsx(
                    "grid w-full cursor-pointer grid-cols-[minmax(160px,1fr)_minmax(180px,1fr)_120px_minmax(180px,1.3fr)_170px_110px_130px] gap-2 border-b border-border/50 px-3 py-2 text-left transition-colors hover:bg-muted/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/70 focus-visible:ring-offset-1",
                    selectedRunId === row.id && "bg-indigo-50/70 dark:bg-indigo-500/10"
                  )}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-foreground">{row.flow.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">{row.flow.id}</span>
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-foreground">{row.subscriber.email}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {row.subscriber.publicId || row.subscriber.id}
                    </span>
                  </span>
                  <span className={clsx("inline-flex h-fit w-fit items-center rounded-full px-2 py-0.5 text-xs font-semibold ring-1", statusBadgeClass(row.status))}>
                    {t(statusLabel(row.status))}
                  </span>
                  <span className="truncate text-sm text-foreground">{row.errorSummary}</span>
                  <span className="text-xs text-muted-foreground">
                      <span className="block">{formatRelative(row.createdAt, LANGUAGE_LOCALES[language])}</span>
                    <span className="block">{formatDateTimeDMY(new Date(row.createdAt), LANGUAGE_LOCALES[language])}</span>
                  </span>
                  <span className="text-sm font-semibold text-foreground">{row.retryCount}</span>
                  <span>
                    <Button
                      size="sm"
                      variant={row.status === "FAILED" ? "danger" : "secondary"}
                      disabled={row.status !== "FAILED" || replayBusyId === row.id}
                      loading={replayBusyId === row.id}
                      onClick={(event) => {
                        event.stopPropagation();
                        setReplayModalRunId(row.id);
                        setReplayReason("");
                      }}
                    >
                      {t("Replay", "Relancer", "Replay", "Repetir", "Repetir")}
                    </Button>
                  </span>
                </div>
              ))
            )}
          </div>
          <div className="flex items-center justify-between border-t border-border/70 px-3 py-2 text-xs text-muted-foreground">
             <span>
               {t(
                 text(
                   `Total failed roots: ${data?.total ?? 0}`,
                   `Total des racines echouees : ${data?.total ?? 0}`,
                   `Gesamtzahl fehlgeschlagener Wurzeln: ${data?.total ?? 0}`,
                   `Total de raices fallidas: ${data?.total ?? 0}`,
                   `Total de raizes falhadas: ${data?.total ?? 0}`
                 )
               )}
             </span>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="ghost"
                disabled={page <= 1}
                onClick={() => setPage((prev) => Math.max(1, prev - 1))}
              >
                {t("Previous", "Precedent", "Zurück", "Anterior", "Anterior")}
              </Button>
              <span>{t(text(`Page ${page}`, `Page ${page}`, `Seite ${page}`, `Pagina ${page}`, `Pagina ${page}`))}</span>
              <Button
                size="sm"
                variant="ghost"
                disabled={!data?.hasMore}
                onClick={() => {
                  if (!data?.hasMore || !data.nextCursor) return;
                  setCursors((prev) => {
                    const next = [...prev];
                    next[page] = data.nextCursor!;
                    return next;
                  });
                  setPage((prev) => prev + 1);
                }}
              >
                {t("Next", "Suivant", "Weiter", "Siguiente", "Seguinte")}
              </Button>
            </div>
          </div>
        </div>

        <aside className="rounded-xl border border-border/60 bg-card p-4">
          {!selectedRunId ? (
            <div className="flex min-h-[220px] items-center justify-center text-sm text-muted-foreground">
              {t("Select a failed run to view diagnostics.", "Sélectionnez une ex?cution échouée pour voir les diagnostics.", "Wähle einen fehlgeschlagenen Lauf aus, um Diagnosen zu sehen.", "Selecciona una ejecución fallida para ver los diagnósticos.", "Selecione uma execução falhada para ver diagnósticos.")}
            </div>
          ) : detailLoading || !detail ? (
            <div className="space-y-3">
              <Skeleton className="h-7 w-2/3 rounded-md" />
              <Skeleton className="h-24 rounded-md" />
              <Skeleton className="h-24 rounded-md" />
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-foreground">{t("Run details", "D?tails de l'ex?cution", "Laufdetails", "Detalles de la ejecución", "Detalhes da execução")}</h2>
                <span className={clsx("inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ring-1", statusBadgeClass(detail.status))}>
                  {t(statusLabel(detail.status))}
                </span>
              </div>

              <section className="space-y-2 rounded-lg border border-border/70 bg-muted/20 p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">{t("Run metadata", "Métadonnées de l'ex?cution", "Lauf-Metadaten", "Metadatos de la ejecución", "Metadados da execução")}</p>
                <dl className="space-y-1 text-xs">
                  <div className="flex items-start justify-between gap-2">
                    <dt className="text-muted-foreground">{t("Run ID", "ID d'ex?cution", "Lauf-ID", "ID de ejecución", "ID da execução")}</dt>
                    <dd className="flex items-center gap-1">
                      <span className="font-mono text-foreground">{detail.runMetadata.runId}</span>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => void copyText("run-id", detail.runMetadata.runId)}
                      >
                        <Copy className="h-3.5 w-3.5" />
                         {copiedValue === "run-id" ? t("Copied", "Copie", "Kopiert", "Copiado", "Copiado") : t("Copy", "Copier", "Kopieren", "Copiar", "Copiar")}
                       </Button>
                     </dd>
                   </div>
                  <div className="flex justify-between gap-2"><dt className="text-muted-foreground">{t("Flow", "Flux", "Flow", "Flujo", "Fluxo")}</dt><dd className="text-right text-foreground">{detail.runMetadata.flowName}<br /><span className="font-mono text-[11px] text-muted-foreground">{detail.runMetadata.flowId}</span></dd></div>
                  <div className="flex justify-between gap-2"><dt className="text-muted-foreground">{t("Subscriber", "Abonne", "Abonnent", "Suscriptor", "Subscritor")}</dt><dd className="text-right text-foreground">{detail.runMetadata.subscriberEmail}<br /><span className="font-mono text-[11px] text-muted-foreground">{detail.runMetadata.subscriberId}</span></dd></div>
                  <div className="flex justify-between gap-2"><dt className="text-muted-foreground">{t("Tenant", "Locataire", "Mandant", "Tenant", "Tenant")}</dt><dd className="text-right text-foreground">{detail.runMetadata.tenantName || detail.runMetadata.tenantId || t("N/A", "N/D", "k. A.", "N/D", "N/D")}</dd></div>
                  <div className="flex justify-between gap-2"><dt className="text-muted-foreground">{t("Trigger", "Declencheur", "Ausloser", "Disparador", "Gatilho")}</dt><dd className="text-foreground">{detail.runMetadata.triggerType}</dd></div>
                  <div className="flex justify-between gap-2"><dt className="text-muted-foreground">{t("Created", "Cr??", "Erstellt", "Creado", "Criado")}</dt><dd className="text-foreground">{formatDateTimeDMY(new Date(detail.runMetadata.createdAt), LANGUAGE_LOCALES[language])}</dd></div>
                  <div className="flex justify-between gap-2"><dt className="text-muted-foreground">{t("Retry count", "Nombre de tentatives", "Anzahl Wiederholungen", "Número de reintentos", "Número de tentativas")}</dt><dd className="text-foreground">{detail.retryCount}</dd></div>
                  <div className="flex justify-between gap-2"><dt className="text-muted-foreground">{t("Last retry", "Derni?re tentative", "Letzte Wiederholung", "Último reintento", "Última tentativa")}</dt><dd className="text-foreground">{detail.lastRetryAt ? formatDateTimeDMY(new Date(detail.lastRetryAt), LANGUAGE_LOCALES[language]) : t("Never", "Jamais", "Nie", "Nunca", "Nunca")}</dd></div>
                  {detail.relatedLinks.tenant || detail.relatedLinks.subscriber || detail.relatedLinks.flow ? (
                    <div className="pt-1">
                      <dt className="mb-1 text-muted-foreground">{t("Links", "Liens", "Links", "Enlaces", "Ligacoes")}</dt>
                      <dd className="flex flex-wrap items-center gap-2">
                        {detail.relatedLinks.tenant ? (
                          <a href={detail.relatedLinks.tenant} className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:underline dark:text-indigo-300">
                            {t("Tenant", "Locataire", "Mandant", "Tenant", "Tenant")} <ExternalLink className="h-3 w-3" />
                          </a>
                        ) : null}
                        {detail.relatedLinks.subscriber ? (
                          <a href={detail.relatedLinks.subscriber} className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:underline dark:text-indigo-300">
                            {t("Subscriber", "Abonne", "Abonnent", "Suscriptor", "Subscritor")} <ExternalLink className="h-3 w-3" />
                          </a>
                        ) : null}
                        {detail.relatedLinks.flow ? (
                          <a href={detail.relatedLinks.flow} className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:underline dark:text-indigo-300">
                            {t("Flow", "Flux", "Flow", "Flujo", "Fluxo")} <ExternalLink className="h-3 w-3" />
                          </a>
                        ) : null}
                      </dd>
                    </div>
                  ) : null}
                </dl>
              </section>

              <section className="space-y-2 rounded-lg border border-border/70 bg-muted/20 p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">{t("Error information", "Informations sur l'erreur", "Fehlerinformationen", "Información del error", "Informação do erro")}</p>
                <p className="text-sm font-semibold text-foreground">{detail.errorMessage || detail.error.message}</p>
                {detail.failedStep ? (
                  <p className="text-xs text-muted-foreground">
                    {t("Failed step:", "Etape échouée :", "Fehlgeschlagener Schritt:", "Paso fallido:", "Etapa falhada:")} <span className="font-medium text-foreground">{detail.failedStep.stepId || detail.failedStep.stepType || t("unknown", "inconnu", "unbekannt", "desconocido", "desconhecido")}</span>
                    {detail.failedStep.stepIndex !== null ? ` (#${detail.failedStep.stepIndex})` : ""}
                  </p>
                ) : null}
                {/business profile required|missing recipient email|missing invoice id/i.test(detail.errorMessage || "") ? (
                  <p className="text-xs text-amber-700 dark:text-amber-300">
                    {t("Likely fix: subscriber profile/data is incomplete. Resolve data then replay.", "Correction probable : le profil ou les données de l'abonne sont incomplets. Corrigez les données puis relancez.", "Wahrscheinliche Lösung: Das Abonnentenprofil bzw. die Daten sind unvollstandig. Daten korrigieren und dann erneut ausführen.", "Posible solucion: el perfil o los datos del suscriptor est?n incompletos. Corrige los datos y luego repite.", "Correcao provavel: o perfil ou os dados do subscritor estão incompletos. Corrija os dados e depois repita.")}
                  </p>
                ) : null}
                <details className="rounded-md border border-border/70 bg-background/80 p-2">
                  <summary className="cursor-pointer text-xs font-medium text-muted-foreground">{t("Stack trace", "Trace de pile", "Stacktrace", "Traza de pila", "Stack trace")}</summary>
                  <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap text-xs text-foreground">
                    {detail.stackTrace || detail.error.stackTrace || t("No stack trace captured.", "Aucune trace de pile capturee.", "Kein Stacktrace erfasst.", "No se capturo la traza de pila.", "Nenhum stack trace capturado.")}
                  </pre>
                </details>
              </section>

              <section className="space-y-2">
                <JsonCard
                  title={text(
                    "Input payload (sanitized)",
                    "Charge utile d'entree (sanitisee)",
                    "Eingabenutzlast (bereinigt)",
                    "Carga de entrada (sanitizada)",
                    "Carga de entrada (sanitizada)"
                  )}
                  value={detail.inputPayload || detail.executionContext.inputPayload}
                />
                <JsonCard
                  title={text(
                    "Flow configuration snapshot (sanitized)",
                    "Instantane de configuration du flux (sanitise)",
                    "Flow-Konfigurationssnapshot (bereinigt)",
                    "Instantanea de configuración del flujo (sanitizada)",
                    "Instantaneo da configuração do fluxo (sanitizado)"
                  )}
                  value={detail.flowSnapshot || detail.executionContext.flowSnapshot}
                />
              </section>

              <section className="space-y-2 rounded-lg border border-border/70 bg-muted/20 p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">{t("Execution timeline", "Chronologie d'ex?cution", "Ausführungszeitlinie", "Cronologia de ejecución", "Cronologia de execução")}</p>
                {detail.stepsTimeline.length ? (
                  <div className="max-h-48 space-y-2 overflow-auto pr-1">
                    {detail.stepsTimeline.map((step) => (
                      <details key={step.id} className="rounded-md border border-border/60 bg-background/80 p-2">
                        <summary className="flex cursor-pointer items-center justify-between gap-2">
                          <span className="min-w-0 truncate text-xs font-medium text-foreground">
                            {step.stepKey}
                            {step.stepType ? <span className="ml-1 text-muted-foreground">({step.stepType})</span> : null}
                          </span>
                          <span className={clsx("inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1", stepStatusClass(step.status))}>
                            {t(stepStatusLabel(step.status))}
                          </span>
                        </summary>
                        <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                          <p>{t("Started:", "Demarre :", "Gestartet:", "Iniciado:", "Iniciado:")} {step.startedAt ? formatDateTimeDMY(new Date(step.startedAt), LANGUAGE_LOCALES[language]) : t("N/A", "N/D", "k. A.", "N/D", "N/D")}</p>
                          <p>{t("Finished:", "Termin? :", "Beendet:", "Finalizado:", "Conclu?do:")} {step.finishedAt ? formatDateTimeDMY(new Date(step.finishedAt), LANGUAGE_LOCALES[language]) : t("N/A", "N/D", "k. A.", "N/D", "N/D")}</p>
                          <p>{t("Duration:", "Durée :", "Dauer:", "Duración:", "Duracao:")} {typeof step.durationMs === "number" ? `${step.durationMs}ms` : t("N/A", "N/D", "k. A.", "N/D", "N/D")}</p>
                          {step.errorMessage ? <p className="text-rose-700 dark:text-rose-300">{t("Error:", "Erreur :", "Fehler:", "Error:", "Erro:")} {step.errorMessage}</p> : null}
                          {step.safeOutput ? (
                            <pre className="max-h-28 overflow-auto rounded border border-border/60 bg-muted/20 p-2 text-[11px] text-foreground">
                              {JSON.stringify(step.safeOutput, null, 2)}
                            </pre>
                          ) : null}
                        </div>
                      </details>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">{t("No step execution timeline captured for this run.", "Aucune chronologie d'ex?cution capturee pour cette ex?cution.", "Keine Ausführungszeitlinie für diesen Lauf erfasst.", "No se capturo cronologia de ejecución para esta ejecución.", "Nenhuma cronologia de execução foi capturada para esta execução.")}</p>
                )}
              </section>

              <section className="space-y-2 rounded-lg border border-border/70 bg-muted/20 p-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">{t("Recovery attempts", "Tentatives de recuperation", "Wiederherstellungsversuche", "Intentos de recuperacion", "Tentativas de recuperacao")}</p>
                  <Button
                    size="sm"
                    variant={detail.status === "FAILED" ? "danger" : "secondary"}
                    disabled={detail.status !== "FAILED" || replayBusyId === detail.id}
                    loading={replayBusyId === detail.id}
                    onClick={() => {
                      setReplayModalRunId(detail.id);
                      setReplayReason("");
                    }}
                  >
                    {t("Replay", "Relancer", "Replay", "Repetir", "Repetir")}
                  </Button>
                </div>
                {detail.status !== "FAILED" ? (
                  <p className="text-xs text-muted-foreground">{t("Replay is only available while this run is in FAILED state.", "La relecture est disponible uniquement lorsque cette ex?cution est en etat d'?chec.", "Replay ist nur verfügbar, solange dieser Lauf den Status FEHLGESCHLAGEN hat.", "La repeticion solo esta disponible mientras esta ejecución este en estado FALLIDO.", "A repeticao so esta disponível enquanto esta execução estiver no estado FALHADO.")}</p>
                ) : null}
                {detail.recoveryAttempts.length ? (
                  <div className="max-h-36 space-y-1 overflow-auto">
                    {detail.recoveryAttempts.map((entry) => (
                      <div key={entry.id} className="rounded-md border border-border/60 bg-background/80 px-2 py-1.5 text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono text-foreground">{entry.id}</span>
                          <span className={clsx("inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1", attemptStatusClass(entry.resultStatus))}>
                            {t(attemptStatusLabel(entry.resultStatus))}
                          </span>
                        </div>
                        <div className="mt-1 space-y-0.5 text-muted-foreground">
                          <p>{formatDateTimeDMY(new Date(entry.createdAt), LANGUAGE_LOCALES[language])}</p>
                          <p>{t("Actor:", "Acteur :", "Akteur:", "Actor:", "Ator:")} {entry.actorAdminName || entry.actorAdminId}</p>
                          {entry.newRunId ? (
                            <div className="flex items-center gap-1">
                              <span className="font-mono text-foreground">{entry.newRunId}</span>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => void copyText(`new-run-${entry.id}`, entry.newRunId)}
                              >
                                <Copy className="h-3.5 w-3.5" />
                                {copiedValue === `new-run-${entry.id}` ? t("Copied", "Copie", "Kopiert", "Copiado", "Copiado") : t("Copy", "Copier", "Kopieren", "Copiar", "Copiar")}
                              </Button>
                            </div>
                          ) : null}
                          {entry.blockReason ? <p className="text-rose-700 dark:text-rose-300">{t("Blocked:", "Bloque :", "Blockiert:", "Bloqueado:", "Bloqueado:")} {entry.blockReason}</p> : null}
                          {entry.reason ? <p>{t("Reason:", "Raison :", "Grund:", "Motivo:", "Motivo:")} {entry.reason}</p> : null}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">{t("No replay attempts yet.", "Aucune relecture pour le moment.", "Noch keine Replay-Versuche.", "Aún no hay intentos de repeticion.", "Ainda não existem tentativas de repeticao.")}</p>
                )}
              </section>

              <p className="text-[11px] text-muted-foreground">{t("Sensitive fields are redacted.", "Les champs sensibles sont masqués.", "Sensible Felder sind geschwarzt.", "Los campos sensibles est?n ocultos.", "Os campos sensíveis estão ocultos.")}</p>
            </div>
          )}
        </aside>
      </section>

      <Modal
        open={Boolean(replayModalRunId)}
        onClose={() => {
          if (replayBusyId) return;
          setReplayModalRunId(null);
          setReplayReason("");
        }}
        title={t("Replay automation run?", "Relancer l'ex?cution d'automatisation ?", "Automatisierungslauf erneut ausführen?", "Repetir la ejecución de automatización?", "Repetir a execução da automação?")}
      >
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {t("This creates a new run linked to the original execution. Replay may fail again if the root cause is unresolved.", "Cela crée une nouvelle ex?cution liee ? l'ex?cution d'origine. La relecture peut echouer a nouveau si la cause profonde n'est pas résolue.", "Dies erstellt einen neuen Lauf, der mit der ursprunglichen Ausführung verknupft ist. Das Replay kann erneut fehlschlagen, wenn die Grundursache nicht behoben ist.", "Esto crea una nueva ejecución vinculada a la ejecución original. La repeticion puede volver a fallar si la causa raiz no se ha resuelto.", "Isto cria uma nova execução ligada a execução original. A repeticao pode voltar a falhar se a causa raiz não tiver sido resolvida.")}
          </p>
          <div className="rounded-lg border border-border/70 bg-muted/20 p-3 text-xs text-muted-foreground">
            <p className="font-medium text-foreground">
              {replayModalRun?.flow.name || t("Selected run", "Ex?cution selectionnee", "Ausgewählter Lauf", "Ejecución seleccionada", "Execução selecionada")}
            </p>
            <p className="mt-1">{t("Run ID:", "ID d'ex?cution :", "Lauf-ID:", "ID de ejecución:", "ID da execução:")} <span className="font-mono text-foreground">{replayModalRun?.id || replayModalRunId}</span></p>
            <p className="mt-1">{t("Subscriber:", "Abonne :", "Abonnent:", "Suscriptor:", "Subscritor:")} <span className="text-foreground">{replayModalRun?.subscriber.email || t("N/A", "N/D", "k. A.", "N/D", "N/D")}</span></p>
          </div>
          <Textarea
            label={t("Reason (optional, for audit log)", "Raison (facultatif, pour le journal d'audit)", "Grund (optional, für das Audit-Protokoll)", "Motivo (opcional, para el registro de auditoria)", "Motivo (opcional, para o registo de auditoria)")}
            maxLength={280}
            value={replayReason}
            onChange={(event) => setReplayReason(event.target.value)}
            placeholder={t("Describe why this replay is needed", "Decrivez pourquoi cette relecture est n?cessaire", "Beschreibe, warum dieses Replay erforderlich ist", "Describe por que se necesita esta repeticion", "Descreva porque esta repeticao e necessária")}
            className="min-h-[110px]"
          />
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                setReplayModalRunId(null);
                setReplayReason("");
              }}
              disabled={Boolean(replayBusyId)}
            >
              {t("Cancel", "Annuler", "Abbrechen", "Cancelar", "Cancelar")}
            </Button>
            <Button
              variant="danger"
              onClick={() => void onReplay()}
              loading={Boolean(replayBusyId && replayBusyId === replayModalRunId)}
            >
              {t("Replay", "Relancer", "Replay", "Repetir", "Repetir")}
            </Button>
          </div>
        </div>
      </Modal>

      <Toast message={toast} show={Boolean(toast)} />
    </div>
  );
}
