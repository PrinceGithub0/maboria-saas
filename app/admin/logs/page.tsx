"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import useSWR from "swr";
import clsx from "clsx";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLanguage } from "@/components/providers/language-provider";
import { Skeleton } from "@/components/ui/skeleton";
import { localizeAdminLogMessage } from "@/lib/admin/localization";
import { LANGUAGE_LOCALES, type CompleteLocalizedText, type Language } from "@/lib/i18n";

type LogSeverity = "INFO" | "WARN" | "ERROR" | "CRITICAL";
type LogActor = "user" | "admin" | "system";
type LogTab = "all" | "errors" | "security" | "webhooks" | "billing" | "infrastructure";
type Density = "comfortable" | "compact";
type TimezoneMode = "local" | "utc";
type LiveMode = "off" | "15" | "30" | "60";
type TimeRangePreset = "all" | "24h" | "7d" | "30d" | "custom";

type LogItem = {
  id: string;
  source: "activity" | "audit" | "webhook";
  timestamp: string;
  severity: LogSeverity;
  service: string;
  message: string;
  actor: LogActor;
  actorId: string | null;
  actorName: string | null;
  tenantId: string | null;
  scope: "tenant" | "global";
  requestId: string | null;
  correlationId: string | null;
  eventId: string | null;
  ip: string | null;
  userAgent: string | null;
  metadata: Record<string, unknown>;
};

type LogsResponse = {
  items: LogItem[];
  total: number | null;
  page: number;
  pageSize: number;
  showingFrom: number;
  showingTo: number;
  hasMore: boolean;
  nextCursor: string | null;
  highVolumeDetected: boolean;
  highVolumeCount: number;
  retentionDays: number;
};

const fetcher = async <T,>(url: string): Promise<T> => {
  const res = await fetch(url, { cache: "no-store" });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(String((payload as { error?: string }).error || `Request failed (${res.status})`));
  return payload as T;
};

const text = (en: string, fr: string, de: string, es: string, pt: string): CompleteLocalizedText => ({ en, fr, de, es, pt });

const tabs: Array<{ id: LogTab; label: CompleteLocalizedText }> = [
  { id: "all", label: text("All", "Tous", "Alle", "Todos", "Todos") },
  { id: "errors", label: text("Errors", "Erreurs", "Fehler", "Errores", "Erros") },
  { id: "security", label: text("Security", "Sécurité", "Sicherheit", "Seguridad", "Segurança") },
  { id: "webhooks", label: text("Webhooks", "Webhooks", "Webhooks", "Webhooks", "Webhooks") },
  { id: "billing", label: text("Billing", "Facturation", "Abrechnung", "Facturación", "Faturação") },
  { id: "infrastructure", label: text("Infrastructure", "Infrastructure", "Infrastruktur", "Infraestructura", "Infraestrutura") },
];

const severityOptions: LogSeverity[] = ["INFO", "WARN", "ERROR", "CRITICAL"];
const serviceOptions = ["AUTOMATION", "BILLING", "WEBHOOKS", "SECURITY", "SUPPORT", "INFRASTRUCTURE", "CORE"];
const columnLabels: Record<"timestamp" | "severity" | "service" | "message" | "actor" | "tenant" | "scope" | "correlationId", CompleteLocalizedText> = {
  timestamp: text("Timestamp", "Horodatage", "Zeitstempel", "Marca de tiempo", "Carimbo temporal"),
  severity: text("Severity", "Gravite", "Schweregrad", "Severidad", "Severidade"),
  service: text("Service", "Service", "Dienst", "Servicio", "Servico"),
  message: text("Message", "Message", "Nachricht", "Mensaje", "Mensagem"),
  actor: text("Actor", "Acteur", "Akteur", "Actor", "Ator"),
  tenant: text("Tenant", "Locataire", "Mandant", "Tenant", "Tenant"),
  scope: text("Scope", "Portee", "Umfang", "Alcance", "Escopo"),
  correlationId: text("Correlation ID", "ID de correlation", "Korrelations-ID", "ID de correlacion", "ID de correlacao"),
};

function relTime(input: string, locale: string) {
  const ts = new Date(input).getTime();
  const diff = ts - Date.now();
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  if (Math.abs(diff) < 60_000) return rtf.format(0, "minute");
  if (Math.abs(diff) < 3_600_000) return rtf.format(Math.round(diff / 60_000), "minute");
  if (Math.abs(diff) < 86_400_000) return rtf.format(Math.round(diff / 3_600_000), "hour");
  return rtf.format(Math.round(diff / 86_400_000), "day");
}

function formatTimestamp(iso: string, mode: TimezoneMode, locale: string) {
  const date = new Date(iso);
  return date.toLocaleString(locale, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: mode === "utc" ? "UTC" : undefined,
  });
}

function truncateToken(value: string, size = 16) {
  if (value.length <= size) return value;
  return `${value.slice(0, size)}...`;
}

function severityClass(severity: LogSeverity) {
  if (severity === "CRITICAL") return "bg-rose-100 text-rose-700 ring-rose-300";
  if (severity === "ERROR") return "bg-red-100 text-red-700 ring-red-300";
  if (severity === "WARN") return "bg-amber-100 text-amber-700 ring-amber-300";
  return "bg-slate-100 text-slate-700 ring-slate-300";
}

function severityLabel(
  severity: LogSeverity,
  t: (value: CompleteLocalizedText) => string
) {
  if (severity === "CRITICAL") return t(text("Critical", "Critique", "Kritisch", "Critico", "Critico"));
  if (severity === "ERROR") return t(text("Error", "Erreur", "Fehler", "Error", "Erro"));
  if (severity === "WARN") return t(text("Warning", "Alerte", "Warnung", "Advertencia", "Aviso"));
  return t(text("Info", "Info", "Info", "Info", "Info"));
}

function serviceLabel(
  service: string,
  t: (value: CompleteLocalizedText) => string
) {
  const normalized = String(service || "").trim().toUpperCase();
  const map: Record<string, CompleteLocalizedText> = {
    AUTOMATION: text("Automation", "Automatisation", "Automatisierung", "Automatizaci?n", "Automação"),
    BILLING: text("Billing", "Facturation", "Abrechnung", "Facturación", "Faturação"),
    WEBHOOKS: text("Webhooks", "Webhooks", "Webhooks", "Webhooks", "Webhooks"),
    SECURITY: text("Security", "Sécurité", "Sicherheit", "Seguridad", "Segurança"),
    SUPPORT: text("Support", "Support", "Support", "Soporte", "Suporte"),
    INFRASTRUCTURE: text("Infrastructure", "Infrastructure", "Infrastruktur", "Infraestructura", "Infraestrutura"),
    CORE: text("Core", "Noyau", "Kern", "Nucleo", "Nucleo"),
  };
  return t(map[normalized] || text(normalized || "-", normalized || "-", normalized || "-", normalized || "-", normalized || "-"));
}

function scopeLabel(
  scope: "tenant" | "global",
  t: (value: CompleteLocalizedText) => string
) {
  return scope === "tenant"
    ? t(text("Tenant", "Locataire", "Mandant", "Tenant", "Tenant"))
    : t(text("Global", "Global", "Global", "Global", "Global"));
}

function actorLabel(
  actor: LogActor,
  t: (value: CompleteLocalizedText) => string
) {
  if (actor === "admin") return t(text("Admin", "Admin", "Admin", "Admin", "Admin"));
  if (actor === "user") return t(text("User", "Utilisateur", "Benutzer", "Usuario", "Utilizador"));
  return t(text("System", "Systeme", "System", "Sistema", "Sistema"));
}

function timeRangeLabel(
  range: TimeRangePreset,
  t: (value: CompleteLocalizedText) => string
) {
  if (range === "24h") return t(text("Last 24 hours", "Dernieres 24 heures", "Letzte 24 Stunden", "Últimas 24 horas", "Ultimas 24 horas"));
  if (range === "7d") return t(text("Last 7 days", "Derniers 7 jours", "Letzte 7 Tage", "Últimos 7 días", "Últimos 7 dias"));
  if (range === "30d") return t(text("Last 30 days", "Derniers 30 jours", "Letzte 30 Tage", "Últimos 30 días", "Últimos 30 dias"));
  if (range === "custom") return t(text("Custom range", "Plage personnalisee", "Benutzerdefinierter Bereich", "Rango personalizado", "Intervalo personalizado"));
  return t(text("All time", "Toute la periode", "Gesamter Zeitraum", "Todo el tiempo", "Todo o periodo"));
}

function messageLabel(
  message: string,
  language: Language
) {
  return localizeAdminLogMessage(message, language, "-");
}

function parseDateTimeLocal(value: string | null) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return null;
  const date = new Date(trimmed);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toLocalInputValue(date: Date | null) {
  if (!date) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function parseList(input: string | null) {
  return String(input || "")
    .split(",")
    .map((value) => value.trim().toUpperCase())
    .filter(Boolean);
}

function MetadataPanel({ row }: { row: LogItem }) {
  const { t } = useLanguage();
  const [expandedJson, setExpandedJson] = useState(false);
  const json = JSON.stringify(row.metadata || {}, null, 2);
  const isLarge = json.length > 700;
  const display = expandedJson || !isLarge ? json : `${json.slice(0, 700)}\n...`;
  const valueClass = "mt-1 block break-all font-mono text-foreground";

  return (
    <div className="min-w-0 space-y-3 rounded-lg border border-border/70 bg-muted/20 p-3">
      <div className="grid min-w-0 gap-2 text-xs text-muted-foreground md:grid-cols-2">
        <p className="min-w-0">
          {t("requestId:", "requestId :", "requestId:", "requestId:", "requestId:")}
          <span className={valueClass}>{row.requestId || "-"}</span>
        </p>
        <p className="min-w-0">
          {t("correlationId:", "correlationId :", "correlationId:", "correlationId:", "correlationId:")}
          <span className={valueClass}>{row.correlationId || "-"}</span>
        </p>
        <p className="min-w-0">
          {t("eventId:", "eventId :", "eventId:", "eventId:", "eventId:")}
          <span className={valueClass}>{row.eventId || "-"}</span>
        </p>
        <p className="min-w-0">
          {t("IP:", "IP :", "IP:", "IP:", "IP:")}
          <span className={valueClass}>{row.ip || "-"}</span>
        </p>
        <p className="min-w-0 md:col-span-2">
          {t("User agent:", "Agent utilisateur :", "User-Agent:", "Agente de usuario:", "Agente do utilizador:")}
          <span className={valueClass}>{row.userAgent || "-"}</span>
        </p>
      </div>
      <div className="space-y-2">
        <pre className="max-h-64 max-w-full overflow-auto whitespace-pre-wrap break-all rounded-md bg-background p-3 text-xs text-foreground">{display}</pre>
        <div className="flex items-center gap-2">
          {isLarge ? (
            <Button size="sm" variant="ghost" onClick={() => setExpandedJson((prev) => !prev)}>
              {expandedJson
                ? t("Collapse JSON", "Reduire JSON", "JSON einklappen", "Contraer JSON", "Recolher JSON")
                : t("Expand full JSON", "Afficher le JSON complet", "Vollständiges JSON ausklappen", "Expandir JSON completo", "Expandir JSON completo")}
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="ghost"
            onClick={async () => {
              await navigator.clipboard.writeText(json);
            }}
          >
            {t("Copy JSON", "Copier le JSON", "JSON kopieren", "Copiar JSON", "Copiar JSON")}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function AdminLogsPage() {
  const { language, t } = useLanguage();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchRef = useRef<HTMLInputElement | null>(null);
  const initRef = useRef(false);
  const refreshingRef = useRef(false);

  const [tab, setTab] = useState<LogTab>("all");
  const [page, setPage] = useState(1);
  const [pageCursors, setPageCursors] = useState<string[]>([""]);
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [severities, setSeverities] = useState<LogSeverity[]>([]);
  const [services, setServices] = useState<string[]>([]);
  const [actor, setActor] = useState<"all" | LogActor>("all");
  const [tenant, setTenant] = useState("");
  const [requestId, setRequestId] = useState("");
  const [correlationId, setCorrelationId] = useState("");
  const [eventId, setEventId] = useState("");
  const [timeRange, setTimeRange] = useState<TimeRangePreset>("all");
  const [from, setFrom] = useState<Date | null>(null);
  const [to, setTo] = useState<Date | null>(null);
  const [timezone, setTimezone] = useState<TimezoneMode>("local");
  const [liveMode, setLiveMode] = useState<LiveMode>("15");
  const [density, setDensity] = useState<Density>("comfortable");
  const [showActor, setShowActor] = useState(true);
  const [showTenant, setShowTenant] = useState(true);
  const [showScope, setShowScope] = useState(true);
  const [showCorrelation, setShowCorrelation] = useState(true);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [exporting, setExporting] = useState<"csv" | "json" | null>(null);
  const [manualRefreshing, setManualRefreshing] = useState(false);
  const [knownTotal, setKnownTotal] = useState<number | null>(null);

  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;
    const initialTab = (searchParams.get("tab") as LogTab) || "all";
    const initialPage = Number(searchParams.get("page") || "1");
    setTab(["all", "errors", "security", "webhooks", "billing", "infrastructure"].includes(initialTab) ? initialTab : "all");
    setPage(Number.isFinite(initialPage) && initialPage > 0 ? Math.floor(initialPage) : 1);
    const initialQ = searchParams.get("q") || "";
    setQInput(initialQ);
    setQ(initialQ);
    setSeverities(
      parseList(searchParams.get("severity"))
        .filter((value): value is LogSeverity => severityOptions.includes(value as LogSeverity))
        .slice(0, 1)
    );
    setServices(parseList(searchParams.get("service")).slice(0, 1));
    const initialActor = (searchParams.get("actor") || "all").toLowerCase();
    setActor(initialActor === "user" || initialActor === "admin" || initialActor === "system" ? initialActor : "all");
    setTenant(searchParams.get("tenant") || "");
    setRequestId(searchParams.get("requestId") || "");
    setCorrelationId(searchParams.get("correlationId") || "");
    setEventId(searchParams.get("eventId") || "");
    const initialRange = (searchParams.get("range") || "all").toLowerCase();
    const parsedFrom = parseDateTimeLocal(searchParams.get("from"));
    const parsedTo = parseDateTimeLocal(searchParams.get("to"));
    if (initialRange === "24h" || initialRange === "7d" || initialRange === "30d" || initialRange === "custom") {
      setTimeRange(initialRange);
    } else {
      setTimeRange(parsedFrom || parsedTo ? "custom" : "all");
    }
    setFrom(parsedFrom);
    setTo(parsedTo);
    const initialTimezone = (searchParams.get("tz") || "local").toLowerCase();
    setTimezone(initialTimezone === "utc" ? "utc" : "local");
    const initialDensity = (searchParams.get("density") || "comfortable").toLowerCase();
    setDensity(initialDensity === "compact" ? "compact" : "comfortable");
  }, [searchParams]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setQ(qInput.trim());
      setPage(1);
      setPageCursors([""]);
      setKnownTotal(null);
    }, 300);
    return () => clearTimeout(timer);
  }, [qInput]);

  useEffect(() => {
    if (!initRef.current) return;
    const params = new URLSearchParams();
    params.set("tab", tab);
    params.set("page", String(page));
    if (q) params.set("q", q);
    if (severities.length) params.set("severity", severities.join(","));
    if (services.length) params.set("service", services.join(","));
    if (actor !== "all") params.set("actor", actor);
    if (tenant) params.set("tenant", tenant);
    if (requestId) params.set("requestId", requestId);
    if (correlationId) params.set("correlationId", correlationId);
    if (eventId) params.set("eventId", eventId);
    if (timeRange !== "all") params.set("range", timeRange);
    if (from) params.set("from", from.toISOString());
    if (to) params.set("to", to.toISOString());
    params.set("tz", timezone);
    params.set("density", density);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [
    actor,
    correlationId,
    density,
    eventId,
    from,
    page,
    pathname,
    q,
    requestId,
    router,
    services,
    severities,
    tab,
    tenant,
    timeRange,
    timezone,
    to,
  ]);

  const hasActiveFilters = Boolean(
    q ||
      severities.length ||
      services.length ||
      actor !== "all" ||
      tenant ||
      requestId ||
      correlationId ||
      eventId ||
      timeRange !== "all" ||
      from ||
      to ||
      tab !== "all"
  );

  const liveSeconds = liveMode === "off" ? 0 : Number(liveMode);
  const autoRefreshAllowed = liveSeconds > 0 && page === 1 && !hasActiveFilters;
  const refreshInterval = autoRefreshAllowed ? liveSeconds * 1000 : 0;
  const currentCursor = page > 1 ? pageCursors[page - 1] || "" : "";

  const apiQuery = useMemo(() => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("pageSize", "50");
    if (currentCursor) params.set("cursor", currentCursor);
    params.set("includeTotal", page === 1 ? "true" : "false");
    params.set("tab", tab);
    if (q) params.set("q", q);
    if (severities.length) params.set("severity", severities.join(","));
    if (services.length) params.set("service", services.join(","));
    if (actor !== "all") params.set("actor", actor);
    if (tenant) params.set("tenant", tenant);
    if (requestId) params.set("requestId", requestId);
    if (correlationId) params.set("correlationId", correlationId);
    if (eventId) params.set("eventId", eventId);
    if (from) params.set("from", from.toISOString());
    if (to) params.set("to", to.toISOString());
    return params.toString();
  }, [actor, correlationId, currentCursor, eventId, from, page, q, requestId, services, severities, tab, tenant, to]);

  const { data, error, isLoading, mutate } = useSWR<LogsResponse>(`/api/admin/logs?${apiQuery}`, fetcher, {
    refreshInterval,
    revalidateOnFocus: true,
  });

  useEffect(() => {
    if (typeof data?.total === "number") {
      setKnownTotal(data.total);
    }
  }, [data?.total]);

  const refreshLogs = useCallback(async () => {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    setManualRefreshing(true);
    try {
      await mutate();
    } finally {
      refreshingRef.current = false;
      setManualRefreshing(false);
    }
  }, [mutate]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTypingElement = Boolean(target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable));
      if (event.key === "/" && !isTypingElement) {
        event.preventDefault();
        searchRef.current?.focus();
      }
      if ((event.key === "r" || event.key === "R") && !isTypingElement) {
        event.preventDefault();
        void refreshLogs();
      }
      if (event.key === "Escape") {
        setExpandedRow(null);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [refreshLogs]);

  const total = data?.total ?? knownTotal;
  const pageCount = typeof total === "number" ? Math.max(1, Math.ceil(total / 50)) : null;
  const rows = data?.items || [];
  const canExport = (typeof total === "number" ? total : rows.length) > 0;
  const rowPadding = density === "compact" ? "py-2" : "py-3.5";

  const resetCursorPagination = useCallback(() => {
    setPage(1);
    setPageCursors([""]);
    setKnownTotal(null);
  }, []);

  const applyTimeRange = (nextRange: TimeRangePreset) => {
    resetCursorPagination();
    setTimeRange(nextRange);
    if (nextRange === "custom") return;
    if (nextRange === "all") {
      setFrom(null);
      setTo(null);
      return;
    }
    const now = new Date();
    const minutes = nextRange === "24h" ? 24 * 60 : nextRange === "7d" ? 7 * 24 * 60 : 30 * 24 * 60;
    setFrom(new Date(now.getTime() - minutes * 60_000));
    setTo(now);
  };

  const resetFilters = () => {
    setTab("all");
    resetCursorPagination();
    setQInput("");
    setQ("");
    setSeverities([]);
    setServices([]);
    setActor("all");
    setTenant("");
    setRequestId("");
    setCorrelationId("");
    setEventId("");
    setTimeRange("all");
    setFrom(null);
    setTo(null);
  };

  const exportData = async (format: "csv" | "json") => {
    if (!canExport || exporting) return;
    setExporting(format);
    try {
      const params = new URLSearchParams(apiQuery);
      params.set("format", format);
      const res = await fetch(`/api/admin/logs/export?${params.toString()}`);
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `system-logs.${format}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(null);
    }
  };

  const columns = useMemo(() => {
    const base = ["timestamp", "severity", "service", "message"] as const;
    const optional = [
      showActor ? "actor" : null,
      showTenant ? "tenant" : null,
      showScope ? "scope" : null,
      showCorrelation ? "correlationId" : null,
    ].filter(Boolean) as Array<"actor" | "tenant" | "scope" | "correlationId">;
    return [...base, ...optional];
  }, [showActor, showCorrelation, showScope, showTenant]);

  const activeFilters = useMemo(
    () =>
      [
        q ? { id: "q", label: `${t("Query", "Requête", "Suche", "Consulta", "Pesquisa")}: ${q}`, clear: () => { setQInput(""); setQ(""); resetCursorPagination(); } } : null,
        tab !== "all" ? { id: "tab", label: `${t("Tab", "Onglet", "Tab", "Pestana", "Separador")}: ${t(tabs.find((entry) => entry.id === tab)?.label || text("All", "Tous", "Alle", "Todos", "Todos"))}`, clear: () => { setTab("all"); resetCursorPagination(); } } : null,
        severities[0] ? { id: "severity", label: `${t("Severity", "Gravite", "Schweregrad", "Severidad", "Severidade")}: ${severityLabel(severities[0], t)}`, clear: () => { setSeverities([]); resetCursorPagination(); } } : null,
        services[0] ? { id: "service", label: `${t("Service", "Service", "Dienst", "Servicio", "Servico")}: ${serviceLabel(services[0], t)}`, clear: () => { setServices([]); resetCursorPagination(); } } : null,
        actor !== "all" ? { id: "actor", label: `${t("Actor", "Acteur", "Akteur", "Actor", "Ator")}: ${actorLabel(actor, t)}`, clear: () => { setActor("all"); resetCursorPagination(); } } : null,
        tenant ? { id: "tenant", label: `${t("Tenant", "Locataire", "Mandant", "Tenant", "Tenant")}: ${tenant}`, clear: () => { setTenant(""); resetCursorPagination(); } } : null,
        requestId ? { id: "request", label: `${t("Request", "Requête", "Anfrage", "Solicitud", "Pedido")}: ${requestId}`, clear: () => { setRequestId(""); resetCursorPagination(); } } : null,
        correlationId ? { id: "correlation", label: `${t("Correlation", "Correlation", "Korrelation", "Correlacion", "Correlacao")}: ${correlationId}`, clear: () => { setCorrelationId(""); resetCursorPagination(); } } : null,
        eventId ? { id: "event", label: `${t("Event", "Evenement", "Ereignis", "Evento", "Evento")}: ${eventId}`, clear: () => { setEventId(""); resetCursorPagination(); } } : null,
        timeRange !== "all" ? { id: "range", label: `${t("Range", "Plage", "Zeitraum", "Rango", "Intervalo")}: ${timeRangeLabel(timeRange, t)}`, clear: () => { setTimeRange("all"); setFrom(null); setTo(null); resetCursorPagination(); } } : null,
      ].filter(Boolean) as Array<{ id: string; label: string; clear: () => void }>,
    [actor, correlationId, eventId, q, requestId, resetCursorPagination, services, severities, t, tab, tenant, timeRange]
  );

  return (
    <div className="mx-auto w-full max-w-[1440px] space-y-4 px-6 py-5">
      <header className="rounded-xl border border-border/60 bg-card px-5 py-4">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-start">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold text-foreground">{t("System Logs", "Journaux système", "Systemprotokolle", "Registros del sistema", "Registos do sistema")}</h1>
            <p className="text-sm text-muted-foreground">{t("View system activity, security events, and operational history.", "Consultez l'activité système, les événements de sécurité et l'historique operationnel.", "Systemaktivität, Sicherheitsereignisse und Betriebshistorie anzeigen.", "Ver la actividad del sistema, los eventos de seguridad y el historial operativo.", "Ver a atividade do sistema, os eventos de segurança e o histórico operaciónal.")}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 xl:justify-end">
            <span title={t("Old logs are archived automatically.", "Les anciens journaux sont archives automatiquement.", "Alte Protokolle werden automatisch archiviert.", "Los registros antiguos se archivan automáticamente.", "Os registos antigos são arquivados automaticamente.")} className="rounded-full border border-border/70 bg-muted/20 px-3 py-1 text-xs text-muted-foreground">
              {t("Retention: 30 days", "Rétention : 30 jours", "Aufbewährung: 30 Tage", "Retención: 30 días", "Retenção: 30 dias")}
            </span>
            <select value={timezone} onChange={(e) => setTimezone(e.target.value as TimezoneMode)} className="h-9 rounded-md border border-border/70 bg-background px-2 text-sm">
              <option value="local">{t("Local", "Locale", "Lokal", "Local", "Local")}</option>
              <option value="utc">UTC</option>
            </select>
            <select value={liveMode} onChange={(e) => setLiveMode(e.target.value as LiveMode)} className="h-9 rounded-md border border-border/70 bg-background px-2 text-sm">
              <option value="off">{t("Live: Off", "Direct : arr?t", "Live: aus", "En directo: desactivado", "Em direto: desligado")}</option>
              <option value="15">{t("Live: 15s", "Direct : 15 s", "Live: 15 s", "En directo: 15 s", "Em direto: 15 s")}</option>
              <option value="30">{t("Live: 30s", "Direct : 30 s", "Live: 30 s", "En directo: 30 s", "Em direto: 30 s")}</option>
              <option value="60">{t("Live: 60s", "Direct : 60 s", "Live: 60 s", "En directo: 60 s", "Em direto: 60 s")}</option>
            </select>
            <span className={clsx("rounded-full px-2 py-1 text-xs font-medium", autoRefreshAllowed ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" : "bg-slate-100 text-slate-700 dark:bg-slate-500/20 dark:text-slate-300")}>
              {autoRefreshAllowed
                ? t(text(`Live ${liveSeconds}s`, `Direct ${liveSeconds} s`, `Live ${liveSeconds}s`, `En directo ${liveSeconds}s`, `Em direto ${liveSeconds}s`))
                : t("Paused", "En pause", "Pausiert", "Pausado", "Pausado")}
            </span>
          </div>
        </div>
        {data?.highVolumeDetected ? (
          <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
            {t(
              text(
                `High log volume detected (${data.highVolumeCount} events in last 5 minutes).`,
                `Volume eleve de journaux detecte (${data.highVolumeCount} evenements sur les 5 dernieres minutes).`,
                `Hohes Protokollvolumen erkannt (${data.highVolumeCount} Ereignisse in den letzten 5 Minuten).`,
                `Se detecto un alto volumen de registros (${data.highVolumeCount} eventos en los ultimos 5 minutos).`,
                `Foi detetado um volume elevado de registos (${data.highVolumeCount} eventos nos ultimos 5 minutos).`
              )
            )}
          </p>
        ) : null}
      </header>

      <section className="rounded-xl border border-border/60 bg-card px-5 py-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
          <input
            ref={searchRef}
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
            placeholder={t("Search message, requestId, correlationId...", "Rechercher un message, requestId, correlationId...", "Nachricht, requestId, correlationId suchen...", "Buscar mensaje, requestId, correlationId...", "Pesquisar mensagem, requestId, correlationId...")}
            className="h-11 w-full rounded-md border border-border/70 bg-background px-3 text-sm text-foreground xl:flex-1"
          />
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 xl:w-[560px]">
            <select value={timeRange} onChange={(e) => applyTimeRange(e.target.value as TimeRangePreset)} className="h-11 rounded-md border border-border/70 bg-background px-3 text-sm">
              <option value="all">{t("All time", "Toute la periode", "Gesamter Zeitraum", "Todo el tiempo", "Todo o periodo")}</option>
              <option value="24h">{t("Last 24 hours", "Dernieres 24 heures", "Letzte 24 Stunden", "Últimas 24 horas", "Ultimas 24 horas")}</option>
              <option value="7d">{t("Last 7 days", "Derniers 7 jours", "Letzte 7 Tage", "Últimos 7 días", "Últimos 7 dias")}</option>
              <option value="30d">{t("Last 30 days", "Derniers 30 jours", "Letzte 30 Tage", "Últimos 30 días", "Últimos 30 dias")}</option>
              <option value="custom">{t("Custom range", "Plage personnalisee", "Benutzerdefinierter Bereich", "Rango personalizado", "Intervalo personalizado")}</option>
            </select>
            <select
              value={severities[0] || "all"}
              onChange={(e) => {
                resetCursorPagination();
                const next = e.target.value as LogSeverity | "all";
                setSeverities(next === "all" ? [] : [next]);
              }}
              className="h-11 rounded-md border border-border/70 bg-background px-3 text-sm"
            >
              <option value="all">{t("All severities", "Toutes les severites", "Alle Schweregrade", "Todas las severidades", "Todas as severidades")}</option>
              {severityOptions.map((value) => (
                <option key={value} value={value}>{severityLabel(value, t)}</option>
              ))}
            </select>
            <details className="relative">
              <summary className="flex h-11 cursor-pointer items-center rounded-md border border-border/70 bg-background px-3 text-sm marker:content-['']">
                {t("More filters", "Plus de filtres", "Mehr Filter", "Más filtros", "Mais filtros")}
              </summary>
              <div className="absolute right-0 z-[90] mt-2 w-[min(92vw,640px)] rounded-md border border-border/70 bg-card p-4 shadow-lg">
                <div className="grid gap-2 md:grid-cols-2">
                  <select
                    value={services[0] || "all"}
                    onChange={(e) => {
                      const value = e.target.value;
                      resetCursorPagination();
                      setServices(value === "all" ? [] : [value]);
                    }}
                    className="h-10 rounded-md border border-border/70 bg-background px-3 text-sm"
                  >
                    <option value="all">{t("All services", "Tous les services", "Alle Dienste", "Todos los servicios", "Todos os servicos")}</option>
                    {serviceOptions.map((value) => (
                      <option key={value} value={value}>{serviceLabel(value, t)}</option>
                    ))}
                  </select>
                  <select
                    value={actor}
                    onChange={(e) => {
                      setActor(e.target.value as "all" | LogActor);
                      resetCursorPagination();
                    }}
                    className="h-10 rounded-md border border-border/70 bg-background px-3 text-sm"
                  >
                    <option value="all">{t("All actors", "Tous les acteurs", "Alle Akteure", "Todos los actores", "Todos os atores")}</option>
                    <option value="admin">{t("Admin", "Admin", "Admin", "Admin", "Admin")}</option>
                    <option value="user">{t("User", "Utilisateur", "Benutzer", "Usuario", "Utilizador")}</option>
                    <option value="system">{t("System", "Systeme", "System", "Sistema", "Sistema")}</option>
                  </select>
                  <Input value={tenant} onChange={(e) => { setTenant(e.target.value); resetCursorPagination(); }} placeholder={t("Tenant", "Locataire", "Mandant", "Tenant", "Tenant")} />
                  <Input value={requestId} onChange={(e) => { setRequestId(e.target.value); resetCursorPagination(); }} placeholder={t("Request ID", "ID de requête", "Request-ID", "ID de solicitud", "ID do pedido")} />
                  <Input value={correlationId} onChange={(e) => { setCorrelationId(e.target.value); resetCursorPagination(); }} placeholder={t("Correlation ID", "ID de correlation", "Korrelations-ID", "ID de correlacion", "ID de correlacao")} />
                  <Input value={eventId} onChange={(e) => { setEventId(e.target.value); resetCursorPagination(); }} placeholder={t("Event ID", "ID d'evenement", "Ereignis-ID", "ID de evento", "ID do evento")} />
                  <input
                    type="datetime-local"
                    value={toLocalInputValue(from)}
                    onChange={(e) => {
                      setFrom(parseDateTimeLocal(e.target.value));
                      setTimeRange("custom");
                      resetCursorPagination();
                    }}
                    className="h-10 rounded-md border border-border/70 bg-background px-2 text-sm"
                  />
                  <input
                    type="datetime-local"
                    value={toLocalInputValue(to)}
                    onChange={(e) => {
                      setTo(parseDateTimeLocal(e.target.value));
                      setTimeRange("custom");
                      resetCursorPagination();
                    }}
                    className="h-10 rounded-md border border-border/70 bg-background px-2 text-sm"
                  />
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">{t("Shortcuts: `/` search, `R` refresh, `Esc` collapse", "Raccourcis : `/` recherche, `R` rafraîchir, `Esc` replier", "Kurzbefehle: `/` suchen, `R` aktualisieren, `Esc` einklappen", "Atajos: `/` buscar, `R` actualizar, `Esc` contraer", "Atalhos: `/` pesquisar, `R` atualizar, `Esc` recolher")}</span>
                  <div className="flex gap-2">
                    <Button variant="ghost" size="sm" onClick={resetFilters}>{t("Reset", "R?initialiser", "Zurücksetzen", "Restablecer", "Repor")}</Button>
                    <Button variant="ghost" size="sm" onClick={refreshLogs} disabled={manualRefreshing}>
                      {manualRefreshing ? t("Refreshing...", "Rafra?chissement...", "Wird aktualisiert...", "Actualizando...", "A atualizar...") : t("Refresh", "Rafraichir", "Aktualisieren", "Actualizar", "Atualizar")}
                    </Button>
                  </div>
                </div>
              </div>
            </details>
          </div>
        </div>
      </section>

      {activeFilters.length > 0 ? (
        <section className="rounded-xl border border-border/60 bg-card px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs uppercase tracking-[0.14em] text-muted-foreground">{t("Filters:", "Filtres :", "Filter:", "Filtros:", "Filtros:")}</span>
            {activeFilters.map((filter) => (
              <button
                key={filter.id}
                type="button"
                onClick={filter.clear}
                className="rounded-full border border-border/70 bg-muted/30 px-3 py-1 text-xs text-foreground transition hover:bg-muted/60"
              >
                {filter.label} x
              </button>
            ))}
            <Button variant="ghost" size="sm" onClick={resetFilters}>{t("Clear all", "Tout effacer", "Alle entfernen", "Borrar todo", "Limpar tudo")}</Button>
          </div>
        </section>
      ) : null}

      <section className="relative space-y-2 overflow-visible">
        <div className="min-w-0 overflow-x-auto pb-1">
          <div className="flex w-max min-w-full gap-2">
            {tabs.map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => {
                  setTab(entry.id);
                  resetCursorPagination();
                }}
                className={clsx(
                  "whitespace-nowrap rounded-md border px-3 py-1.5 text-sm transition-colors",
                  tab === entry.id
                    ? "border-indigo-500 bg-indigo-50 text-indigo-700 dark:border-indigo-400 dark:bg-indigo-500/15 dark:text-indigo-200"
                    : "border-border/70 bg-background text-foreground hover:bg-muted/40"
                )}
              >
                {t(entry.label)}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 xl:justify-end">
          <select value={density} onChange={(e) => setDensity(e.target.value as Density)} className="h-9 rounded-md border border-border/70 bg-background px-2 text-sm">
            <option value="comfortable">{t("Density: Comfortable", "Densite : confortable", "Dichte: komfortabel", "Densidad: comoda", "Densidade: confortavel")}</option>
            <option value="compact">{t("Density: Compact", "Densite : compacte", "Dichte: kompakt", "Densidad: compacta", "Densidade: compacta")}</option>
          </select>
          <details className="relative">
            <summary className="cursor-pointer rounded-md border border-border/70 bg-background px-3 py-1.5 text-sm marker:content-['']">{t("Columns", "Colonnes", "Spalten", "Columnas", "Colunas")}</summary>
            <div className="absolute right-0 z-[70] mt-2 w-44 space-y-1 rounded-md border border-border/70 bg-card p-2 text-sm shadow-lg">
              <label className="flex items-center gap-2"><input type="checkbox" checked={showActor} onChange={(e) => setShowActor(e.target.checked)} /> {t("Actor", "Acteur", "Akteur", "Actor", "Ator")}</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={showTenant} onChange={(e) => setShowTenant(e.target.checked)} /> {t("Tenant", "Locataire", "Mandant", "Tenant", "Tenant")}</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={showScope} onChange={(e) => setShowScope(e.target.checked)} /> {t("Scope", "Portee", "Umfang", "Alcance", "Escopo")}</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={showCorrelation} onChange={(e) => setShowCorrelation(e.target.checked)} /> {t("Correlation ID", "ID de correlation", "Korrelations-ID", "ID de correlacion", "ID de correlacao")}</label>
            </div>
          </details>
          <details className="relative">
            <summary className="cursor-pointer rounded-md border border-border/70 bg-background px-3 py-1.5 text-sm marker:content-['']">{t("Export", "Exporter", "Export", "Exportar", "Exportar")}</summary>
            <div className="absolute right-0 z-[70] mt-2 w-40 rounded-md border border-border/70 bg-card p-2 shadow-lg">
              <Button className="w-full justify-start" variant="ghost" size="sm" disabled={!canExport || exporting !== null} onClick={() => exportData("csv")}>
                {exporting === "csv" ? t("Exporting...", "Exportation...", "Wird exportiert...", "Exportando...", "A exportar...") : t("Export CSV", "Exporter CSV", "CSV exportieren", "Exportar CSV", "Exportar CSV")}
              </Button>
              <Button className="w-full justify-start" variant="ghost" size="sm" disabled={!canExport || exporting !== null} onClick={() => exportData("json")}>
                {exporting === "json" ? t("Exporting...", "Exportation...", "Wird exportiert...", "Exportando...", "A exportar...") : t("Export JSON", "Exporter JSON", "JSON exportieren", "Exportar JSON", "Exportar JSON")}
              </Button>
            </div>
          </details>
          <Button variant="ghost" size="sm" onClick={refreshLogs} disabled={manualRefreshing}>
            {manualRefreshing ? t("Refreshing...", "Rafra?chissement...", "Wird aktualisiert...", "Actualizando...", "A atualizar...") : t("Refresh", "Rafraichir", "Aktualisieren", "Actualizar", "Atualizar")}
          </Button>
        </div>
      </section>

      {error ? (
        <div className="space-y-2">
          <Alert variant="error">{t("Failed to load logs. Retry.", "?chec du chargement des journaux. Réessayez.", "Protokolle konnten nicht geladen werden. Erneut versuchen.", "No se pudieron cargar los registros. Reintenta.", "Não foi possível carregar os registos. Tente novamente.")}</Alert>
          <Button variant="secondary" onClick={refreshLogs} disabled={manualRefreshing}>
            {manualRefreshing ? t("Retrying...", "Nouvelle tentative...", "Versuche erneut...", "Reintentando...", "A tentar novamente...") : t("Retry", "Reessayer", "Erneut versuchen", "Reintentar", "Tentar novamente")}
          </Button>
        </div>
      ) : null}

      <section className="rounded-xl border border-border/60 bg-card">
        <div className="max-h-[calc(100vh-320px)] overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="sticky top-0 z-10 bg-card">
              <tr className="border-b border-border/70 text-left text-xs uppercase tracking-[0.14em] text-muted-foreground">
                {columns.map((column) => (
                  <th key={column} className="px-3 py-2 font-semibold">{t(columnLabels[column])}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 8 }).map((_, idx) => (
                  <tr key={`sk-${idx}`} className="border-b border-border/40">
                    <td colSpan={columns.length} className="px-3 py-2"><Skeleton className="h-7 w-full" /></td>
                  </tr>
                ))
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} className="px-3 py-12 text-center text-muted-foreground">
                    {t("No logs found for selected filters.", "Aucun journal trouvé pour les filtres selectionnes.", "Keine Protokolle für die ausgewählten Filter gefunden.", "No se encontraron registros para los filtros seleccionados.", "Não foram encontrados registos para os filtros selecionados.")}
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <Fragment key={row.id}>
                    <tr className={clsx("cursor-pointer border-b border-border/40 transition-colors hover:bg-muted/20", row.severity === "CRITICAL" && "border-l-2 border-l-rose-500")} onClick={() => setExpandedRow((prev) => (prev === row.id ? null : row.id))}>
                      {columns.includes("timestamp") ? (
                        <td className={clsx("px-3 align-top", rowPadding)}>
                          <p className="text-foreground">{formatTimestamp(row.timestamp, timezone, LANGUAGE_LOCALES[language])}</p>
                          <p className="text-xs text-muted-foreground">{relTime(row.timestamp, LANGUAGE_LOCALES[language])}{timezone === "utc" ? " UTC" : ""}</p>
                        </td>
                      ) : null}
                      {columns.includes("severity") ? (
                        <td className={clsx("px-3 align-top", rowPadding)}>
                          <span className={clsx("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ring-1", severityClass(row.severity))}>
                            <span
                              className={clsx(
                                "h-1.5 w-1.5 rounded-full",
                                row.severity === "CRITICAL"
                                  ? "bg-rose-600"
                                  : row.severity === "ERROR"
                                    ? "bg-red-600"
                                    : row.severity === "WARN"
                                    ? "bg-amber-600"
                                      : "bg-slate-500"
                              )}
                              aria-label={t("Severity", "Gravite", "Schweregrad", "Severidad", "Severidade") + ` ${severityLabel(row.severity, t)}`}
                            />
                            {severityLabel(row.severity, t)}
                          </span>
                        </td>
                      ) : null}
                      {columns.includes("service") ? <td className={clsx("px-3 align-top font-medium", rowPadding)}>{serviceLabel(row.service, t)}</td> : null}
                      {columns.includes("message") ? <td className={clsx("px-3 align-top", rowPadding)}>{messageLabel(row.message, language)}</td> : null}
                      {columns.includes("actor") ? <td className={clsx("px-3 align-top", rowPadding)}>{row.actorName || actorLabel(row.actor, t)}</td> : null}
                      {columns.includes("tenant") ? <td className={clsx("px-3 align-top font-mono text-xs", rowPadding)}>{row.tenantId || "-"}</td> : null}
                      {columns.includes("scope") ? <td className={clsx("px-3 align-top", rowPadding)}>{scopeLabel(row.scope, t)}</td> : null}
                      {columns.includes("correlationId") ? (
                        <td className={clsx("px-3 align-top font-mono text-xs", rowPadding)}>
                          {row.correlationId ? (
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                title={row.correlationId}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setCorrelationId(row.correlationId || "");
                                  resetCursorPagination();
                                }}
                                className="rounded px-1 py-0.5 text-left text-indigo-600 hover:bg-indigo-50 hover:text-indigo-700 dark:text-indigo-300 dark:hover:bg-indigo-500/15"
                              >
                                {truncateToken(row.correlationId)}
                              </button>
                              <button
                                type="button"
                                title={t("Copy correlation ID", "Copier l'ID de correlation", "Korrelations-ID kopieren", "Copiar ID de correlacion", "Copiar ID de correlacao")}
                                aria-label={t("Copy correlation ID", "Copier l'ID de correlation", "Korrelations-ID kopieren", "Copiar ID de correlacion", "Copiar ID de correlacao")}
                                onClick={async (event) => {
                                  event.stopPropagation();
                                  await navigator.clipboard.writeText(row.correlationId || "");
                                }}
                                className="rounded px-1 py-0.5 text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                              >
                                {t("Copy", "Copier", "Kopieren", "Copiar", "Copiar")}
                              </button>
                            </div>
                          ) : (
                            "-"
                          )}
                        </td>
                      ) : null}
                    </tr>
                    <tr className={clsx("border-b border-border/40 transition-opacity", expandedRow === row.id ? "table-row opacity-100" : "hidden opacity-0")}>
                      <td colSpan={columns.length} className="px-3 pb-3">
                        <MetadataPanel row={row} />
                      </td>
                    </tr>
                  </Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/70 px-3 py-2 text-sm">
          <p className="text-muted-foreground">
            {t("Showing", "Affichage", "Anzeige", "Mostrando", "A mostrar")} {data?.showingFrom || 0}-{data?.showingTo || 0}
            {typeof total === "number" ? ` ${t("of", "sur", "von", "de", "de")} ${total.toLocaleString()}` : ""}
          </p>
          <div className="flex items-center gap-2">
            <Button variant="ghost" disabled={page <= 1} onClick={() => setPage((prev) => Math.max(1, prev - 1))}>{t("Previous", "Precedent", "Zurueck", "Anterior", "Anterior")}</Button>
            <span className="text-xs text-muted-foreground">
              {t("Page", "Page", "Seite", "Página", "Página")} {page}{pageCount ? ` ${t("of", "sur", "von", "de", "de")} ${pageCount}` : ""}
            </span>
            <Button
              variant="ghost"
              disabled={!data?.hasMore}
              onClick={() => {
                if (!data?.hasMore || !data.nextCursor) return;
                setPageCursors((prev) => {
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
      </section>
    </div>
  );
}
