"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { AlertTriangle, CheckCircle2, Clock3, Loader2, RefreshCw, XCircle } from "lucide-react";

import type { SubscriberDashboardData } from "@/lib/dashboard/subscriber-data";
import { formatCurrency } from "@/lib/currency";
import { rangeToQuery } from "@/lib/shared/date-range";
import { useLanguage } from "@/components/providers/language-provider";
import { LANGUAGE_LOCALES } from "@/lib/i18n";

const AUTO_REFRESH_KEY = "subscriber_dashboard_auto_refresh";
const RANGE_STATE_KEY = "subscriber_dashboard_range";
type DashboardRequestError = Error & {
  status?: number;
  code?: string;
};

function normalizeDashboardErrorMessage(message: unknown) {
  return String(message || "")
    .trim()
    .toLowerCase()
    .replace(/[.!?]+$/, "");
}

function matchesDashboardErrorMessage(error: DashboardRequestError, expected: string) {
  return normalizeDashboardErrorMessage(error.message) === normalizeDashboardErrorMessage(expected);
}

function statusClass(status: SubscriberDashboardData["status"]) {
  if (status === "critical") return "border-red-300 bg-red-100 text-red-900 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-200";
  if (status === "attention") return "border-amber-300 bg-amber-100 text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200";
  return "border-emerald-300 bg-emerald-100 text-emerald-900 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-200";
}

function MiniTrend({ values }: { values: number[] }) {
  const safeValues = values.length > 0 ? values : [0];
  const max = Math.max(...safeValues, 1);
  const width = 76;
  const height = 18;
  const points = safeValues
    .map((value, index) => {
      const x = (index / Math.max(safeValues.length - 1, 1)) * width;
      const y = height - (value / max) * height;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-4 w-20" aria-hidden="true">
      <polyline fill="none" stroke="#2563eb" strokeWidth="1.8" points={points} />
    </svg>
  );
}

function Skeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="h-12 rounded border border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-900" />
      <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, idx) => (
          <div key={idx} className="h-28 rounded border border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-900" />
        ))}
      </div>
      <div className="h-28 rounded border border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-900" />
      <div className="grid gap-3 lg:grid-cols-3">
        <div className="h-32 rounded border border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-900" />
        <div className="h-32 rounded border border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-900" />
        <div className="h-32 rounded border border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-900" />
      </div>
      <div className="h-64 rounded border border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-900" />
    </div>
  );
}

function buildRangeFromKey(key: "today" | "last7" | "last30" | "custom", current: SubscriberDashboardData["dateRange"]) {
  if (key === "today") {
    const day = new Date().toISOString().slice(0, 10);
    return { key: "today" as const, from: day, to: day, label: key };
  }
  if (key === "last30") {
    const to = new Date();
    const from = new Date(to.getTime() - 29 * 24 * 60 * 60 * 1000);
    return {
      key: "last30" as const,
      from: from.toISOString().slice(0, 10),
      to: to.toISOString().slice(0, 10),
      label: key,
    };
  }
  if (key === "custom") {
    return { key: "custom" as const, from: current.from, to: current.to, label: key };
  }
  const to = new Date();
  const from = new Date(to.getTime() - 6 * 24 * 60 * 60 * 1000);
  return {
    key: "last7" as const,
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
    label: key,
  };
}

async function fetchSubscriberDashboardData(
  query: URLSearchParams
): Promise<SubscriberDashboardData> {
  const response = await fetch(`/api/dashboard/subscriber?${query.toString()}`, {
    cache: "no-store",
    credentials: "same-origin",
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(
      typeof payload === "object" && payload && "error" in payload && typeof payload.error === "string"
        ? payload.error
        : "refresh_failed"
    ) as DashboardRequestError;
    error.status = response.status;
    if (typeof payload === "object" && payload && "code" in payload && typeof payload.code === "string") {
      error.code = payload.code;
    }
    throw error;
  }
  return payload as SubscriberDashboardData;
}

export function SubscriberOverviewDashboard({
  initialData,
}: {
  initialData: SubscriberDashboardData;
}) {
  const { language, t } = useLanguage();
  const locale = LANGUAGE_LOCALES[language];
  const router = useRouter();
  const [data, setData] = useState(initialData);
  const [warning, setWarning] = useState<string | null>(null);
  const [fatalError, setFatalError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const intervalRef = useRef<number | null>(null);
  const inFlightRef = useRef(false);

  const localizeAccessError = useCallback(
    (error: DashboardRequestError) => {
      const status = Number(error.status || 0);
      if (status === 401) {
        return t(
          "Your session expired. Please sign in again.",
          "Votre session a expire. Veuillez vous reconnecter.",
          "Deine Sitzung ist abgelaufen. Bitte melde dich erneut an.",
          "Tu sesión ha expirado. Vuelve a iniciar sesión.",
          "A sua sessão expirou. Inicie sessão novamente."
        );
      }
      if (status !== 403) return null;
      if (error.code === "ORG_ACCESS_DENIED" || matchesDashboardErrorMessage(error, "Organization access denied.")) {
        return t(
          "Organization access denied.",
          "Accès à l'organisation refuse.",
          "Zugriff auf die Organisation verweigert.",
          "Acceso a la organización denegado.",
          "Acesso a organização negado."
        );
      }
      if (error.code === "TENANT_SUSPENDED") {
        return matchesDashboardErrorMessage(error, "Organization access has been disabled.")
          ? t(
              "Organization access has been disabled.",
              "L'acc\u00e8s \u00e0 l'organisation a \u00e9t\u00e9 d\u00e9sactiv\u00e9.",
              "Der Organisationszugriff wurde deaktiviert.",
              "El acceso a la organización ha sido deshabilitado.",
              "O acesso a organização foi desativado."
            )
          : t(
              "Organization access is suspended.",
              "L accès à l'organisation est suspendu.",
              "Der Organisationszugriff ist ausgesetzt.",
              "El acceso a la organización esta suspendido.",
              "O acesso a organização esta suspenso."
            );
      }
      if (error.code === "SUBSCRIPTION_INACTIVE") {
        return matchesDashboardErrorMessage(error, "Organization subscription inactive. Please renew billing.")
          ? t(
              "Organization subscription inactive. Please renew billing.",
              "L abonnement de l'organisation est inactif. Veuillez renouveler la facturation.",
              "Das Organisationsabonnement ist inaktiv. Bitte erneuere die Abrechnung.",
              "La suscripción de la organización esta inactiva. Renueva la facturación.",
              "A subscrição da organização esta inativa. Renove a faturação."
            )
          : t(
              "Organization subscription inactive. Please contact the organization owner.",
              "L abonnement de l'organisation est inactif. Veuillez contacter le proprietaire de l'organisation.",
              "Das Organisationsabonnement ist inaktiv. Bitte kontaktiere den Eigentümer der Organisation.",
              "La suscripción de la organización esta inactiva. Ponte en contacto con el propietario de la organización.",
              "A subscrição da organização esta inativa. Contacte o proprietário da organização."
            );
      }
      if (error.code === "FORBIDDEN" || matchesDashboardErrorMessage(error, "You do not have permission for this action.")) {
        return t(
          "You do not have permission for this action.",
          "Vous n'avez pas l autorisation pour cette action.",
          "Du hast keine Berechtigung für diese Aktion.",
          "No tienes permiso para esta acción.",
          "Não tem permissao para esta ação."
        );
      }
      return t(
        "Dashboard access could not be verified. Please reload the page.",
        "L accès au tableau de bord n'a pas pu être verifie. Rechargez la page.",
        "Der Dashboard-Zugriff konnte nicht verifiziert werden. Bitte lade die Seite neu.",
        "No se pudo verificar el acceso al panel. Recarga la página.",
        "Não foi possível verificar o acesso ao painel. Recarregue a página."
      );
    },
    [t]
  );

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(AUTO_REFRESH_KEY);
      setAutoRefresh(saved === "true");
    } catch {
      setAutoRefresh(false);
    }
  }, []);

  useEffect(() => {
    try {
      const hasRangeInUrl = new URLSearchParams(window.location.search).has("range");
      if (hasRangeInUrl) return;
      const stored = window.localStorage.getItem(RANGE_STATE_KEY);
      if (!stored) return;
      const parsed = JSON.parse(stored) as { key?: string; from?: string; to?: string } | null;
      if (!parsed?.key || !parsed.from || !parsed.to) return;
      if (
        parsed.key === data.dateRange.key &&
        parsed.from === data.dateRange.from &&
        parsed.to === data.dateRange.to
      ) {
        return;
      }
      void setRange(parsed.key as "today" | "last7" | "last30" | "custom", parsed.from, parsed.to);
    } catch {
      // ignore invalid stored range
    }
    // run once on mount to restore range when route has no query
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      window.localStorage.setItem(RANGE_STATE_KEY, JSON.stringify(data.dateRange));
    } catch {
      // ignore
    }
  }, [data.dateRange]);

  const refresh = useCallback(
    async ({ silent = false }: { silent?: boolean } = {}) => {
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      if (!silent) setIsRefreshing(true);
      setWarning(null);
      setFatalError(null);
      try {
        const query = rangeToQuery(data.dateRange);
        const payload = await fetchSubscriberDashboardData(query);
        setData(payload);
      } catch (error) {
        const requestError = error as DashboardRequestError;
        const status = Number(requestError.status || 0);
        if (status === 401) {
          setFatalError(localizeAccessError(requestError));
          return;
        }
        if (status === 403) {
          if (silent) {
            setWarning(localizeAccessError(requestError));
            return;
          }
          setWarning(
            t(
              "Reloading the dashboard to restore access...",
              "Rechargement du tableau de bord pour restaurer l accès...",
              "Das Dashboard wird neu geladen, um den Zugriff wiederherzustellen...",
              "Recargando el panel para restaurar el acceso...",
              "A recarregar o painel para restaurar o acesso..."
            )
          );
          router.refresh();
          return;
        }
        setWarning(t("Live data temporarily unavailable. Showing last updated state.", "Les données en direct sont temporairement indisponibles. Affichage du dernier etat connu.", "Live-Daten sind vorübergehend nicht verfügbar. Letzter bekannter Stand wird angezeigt.", "Los datos en vivo no est?n disponibles temporalmente. Se muestra el Último estado conocido.", "Os dados em tempo real estão temporariamente indisponiveis. A mostrar o Último estado conhecido."));
      } finally {
        inFlightRef.current = false;
        if (!silent) setIsRefreshing(false);
      }
    },
    [data.dateRange, localizeAccessError, router, t]
  );

  useEffect(() => {
    if (intervalRef.current) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (!autoRefresh) return;
    intervalRef.current = window.setInterval(() => {
      void refresh({ silent: true });
    }, 20000);
    return () => {
      if (intervalRef.current) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [autoRefresh, refresh]);

  const compactTime = useCallback(
    (iso: string) => {
      const then = new Date(iso).getTime();
      if (!Number.isFinite(then)) return "--";
      const diff = Math.max(0, Date.now() - then);
      if (diff < 60 * 1000) {
        return t("just now", "a l instant", "gerade eben", "justo ahora", "agora mesmo");
      }
      const formatter = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
      const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
        ["day", 24 * 60 * 60 * 1000],
        ["hour", 60 * 60 * 1000],
        ["minute", 60 * 1000],
      ];
      for (const [unit, unitMs] of units) {
        const count = Math.floor(diff / unitMs);
        if (count > 0) {
          return formatter.format(-count, unit);
        }
      }
      return t("just now", "a l instant", "gerade eben", "justo ahora", "agora mesmo");
    },
    [locale, t]
  );

  const dashboardStatusLabel = useCallback(
    (status: SubscriberDashboardData["status"]) => {
      if (status === "critical") return t("Critical", "Critique", "Kritisch", "Critico", "Critico");
      if (status === "attention") return t("Attention Needed", "Attention requise", "Aufmerksamkeit erforderlich", "Atencion necesaria", "Atencao necessária");
      return t("Stable", "Stable", "Stabil", "Estable", "Estavel");
    },
    [t]
  );

  const localizeRevenueNote = useCallback(
    (note?: string | null) => {
      if (!note) return null;
      if (note === "No payment subaccount connected") {
        return t(
          "No payment subaccount connected",
          "Aucun sous-compte de paiement connecté",
          "Kein Zahlungsunterkonto verbunden",
          "No hay subcuenta de pago conectada",
          "Nenhuma subconta de pagamento ligada"
        );
      }
      return note;
    },
    [t]
  );

  const localizeTimelineTitle = useCallback(
    (title: string) => {
      const mapped: Record<string, string> = {
        "Payment failed": t("Payment failed", "Paiement échoué", "Zahlung fehlgeschlagen", "Pago fallido", "Pagamento falhou"),
        "Payment refunded": t("Payment refunded", "Paiement rembourse", "Zahlung erstattet", "Pago reembolsado", "Pagamento reembolsado"),
        "Payment pending": t("Payment pending", "Paiement en attente", "Zahlung ausstehend", "Pago pendiente", "Pagamento pendente"),
        "Payment received": t("Payment received", "Paiement recu", "Zahlung erhalten", "Pago recibido", "Pagamento recebido"),
        "Invoice overdue": t("Invoice overdue", "Facture en retard", "Rechnung überfällig", "Factura vencida", "Fatura em atraso"),
        "Invoice created": t("Invoice created", "Facture creee", "Rechnung erstellt", "Factura creada", "Fatura criada"),
        "Automation failed": t("Automation failed", "Automatisation échouée", "Automatisierung fehlgeschlagen", "Automatización fallida", "Automação falhou"),
        "Automation completed": t("Automation completed", "Automatisation terminée", "Automatisierung abgeschlossen", "Automatización completada", "Automação concluída"),
        "Automation running": t("Automation running", "Automatisation en cours", "Automatisierung läuft", "Automatización en curso", "Automação em execução"),
        "Automation queued": t("Automation queued", "Automatisation en file d attente", "Automatisierung in Warteschlange", "Automatización en cola", "Automação em fila"),
        "Message delivery failed": t("Message delivery failed", "?chec de livraison du message", "Nachrichtenzustellung fehlgeschlagen", "Fallo en la entrega del mensaje", "Falha na entrega da mensagem"),
        "Message read": t("Message read", "Message lu", "Nachricht gelesen", "Mensaje leido", "Mensagem lida"),
        "Message delivered": t("Message delivered", "Message distribue", "Nachricht zugestellt", "Mensaje entregado", "Mensagem entregue"),
        "Message sent": t("Message sent", "Message envoy?", "Nachricht gesendet", "Mensaje enviado", "Mensagem enviada"),
      };
      return mapped[title] || title;
    },
    [t]
  );

  const localizeTimelineCustomer = useCallback(
    (customer: string | null) => {
      if (!customer) return customer;
      if (customer === "Deleted Customer") {
        return t("Deleted Customer", "Client supprime", "Gelöschter Kunde", "Cliente eliminado", "Cliente eliminado");
      }
      return customer;
    },
    [t]
  );

  const navigateWithRange = useCallback(
    (path: string, extras?: Record<string, string>) => {
      const query = rangeToQuery(data.dateRange, extras);
      const qs = query.toString();
      return qs ? `${path}?${qs}` : path;
    },
    [data.dateRange]
  );

  const setRange = async (rangeKey: "today" | "last7" | "last30" | "custom", from?: string, to?: string) => {
    const nextRange =
      rangeKey === "custom" && from && to
        ? { key: "custom" as const, from, to, label: rangeKey }
        : buildRangeFromKey(rangeKey, data.dateRange);

    const query = rangeToQuery(nextRange);
    router.replace(`/dashboard?${query.toString()}`, { scroll: false });
    setWarning(null);
    setFatalError(null);
    setIsRefreshing(true);
    try {
      const payload = await fetchSubscriberDashboardData(query);
      setData(payload);
    } catch (error) {
      const requestError = error as DashboardRequestError;
      const status = Number(requestError.status || 0);
      if (status === 401) {
        setFatalError(localizeAccessError(requestError));
        return;
      }
      if (status === 403) {
        setWarning(
          t(
            "Reloading the dashboard to restore access...",
            "Rechargement du tableau de bord pour restaurer l accès...",
            "Das Dashboard wird neu geladen, um den Zugriff wiederherzustellen...",
            "Recargando el panel para restaurar el acceso...",
            "A recarregar o painel para restaurar o acesso..."
          )
        );
        router.refresh();
        return;
      }
      setWarning(t("Live data temporarily unavailable. Showing last updated state.", "Les données en direct sont temporairement indisponibles. Affichage du dernier etat connu.", "Live-Daten sind vorübergehend nicht verfügbar. Letzter bekannter Stand wird angezeigt.", "Los datos en vivo no est?n disponibles temporalmente. Se muestra el Último estado conocido.", "Os dados em tempo real estão temporariamente indisponiveis. A mostrar o Último estado conhecido."));
    } finally {
      setIsRefreshing(false);
    }
  };

  const [customFrom, setCustomFrom] = useState(data.dateRange.key === "custom" ? data.dateRange.from : "");
  const [customTo, setCustomTo] = useState(data.dateRange.key === "custom" ? data.dateRange.to : "");

  useEffect(() => {
    if (data.dateRange.key === "custom") {
      setCustomFrom(data.dateRange.from);
      setCustomTo(data.dateRange.to);
    }
  }, [data.dateRange]);

  const riskRows = useMemo(
    () =>
      [
        ...(data.permissions.canViewBilling
          ? [
              {
                label: t("Overdue invoices", "Factures en retard", "überfällige Rechnungen", "Facturas vencidas", "Faturas em atraso"),
                value: `${data.risk.overdueInvoicesCount} • ${formatCurrency(data.risk.overdueInvoicesAmount, data.overview.currency)}`,
                href: "/dashboard/invoices",
                count: data.risk.overdueInvoicesCount,
              },
              {
                label: t("Failed payments", "Paiements échoués", "Fehlgeschlagene Zahlungen", "Pagos fallidos", "Pagamentos falhados"),
                value: String(data.risk.failedPaymentsCount),
                href: navigateWithRange("/billing/payments", { status: "failed" }),
                count: data.risk.failedPaymentsCount,
              },
            ]
          : []),
        {
          label: t("Failed automations", "Automatisations échouées", "Fehlgeschlagene Automatisierungen", "Automatizaciónes fallidas", "Automações falhadas"),
          value: String(data.risk.failedAutomationsCount),
          href: navigateWithRange("/dashboard/automation-operations", { status: "FAILED" }),
          count: data.risk.failedAutomationsCount,
        },
        {
          label: t("Undelivered messages", "Messages non distribues", "Nicht zugestellte Nachrichten", "Mensajes no entregados", "Mensagens não entregues"),
          value: String(data.risk.undeliveredMessagesCount),
          href: "/dashboard/inbox/analytics",
          count: data.risk.undeliveredMessagesCount,
        },
      ].filter((row) => row.count > 0),
    [data, navigateWithRange, t]
  );

  const timelineRows = data.timeline;
  const sectionClass = "rounded-xl border border-slate-200 bg-white/90 p-3.5 dark:border-slate-800 dark:bg-slate-950/70";
  const metricGridClass =
    "mt-2 grid gap-px overflow-hidden rounded-xl border border-slate-200 bg-slate-200 dark:border-slate-800 dark:bg-slate-800";
  const metricCellClass =
    "group bg-white px-3 py-3 transition-colors hover:bg-slate-50 dark:bg-slate-950/70 dark:hover:bg-slate-900";
  const moduleCellClass = "bg-white px-3 py-3 dark:bg-slate-950/70";
  const controlClass =
    "h-8.5 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100";

  if (!data) return <Skeleton />;
  if (fatalError) {
    return (
      <section className="border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200">
        {fatalError}
      </section>
    );
  }

  return (
    <div className="space-y-3.5">
      <section className="rounded-xl border border-slate-200 bg-white/90 px-3.5 py-3 dark:border-slate-800 dark:bg-slate-950/70">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <span className={clsx("inline-flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-sm font-semibold", statusClass(data.status))}>
              <span className="h-2 w-2 rounded-full bg-current" />
              {dashboardStatusLabel(data.status)}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <select
              value={data.dateRange.key}
              onChange={(event) => void setRange(event.target.value as "today" | "last7" | "last30" | "custom")}
              className={controlClass}
            >
              <option value="today">{t("Today", "Aujourd'hui", "Heute", "Hoy", "Hoje")}</option>
              <option value="last7">{t("Last 7 Days", "7 derniers jours", "Letzte 7 Tage", "Últimos 7 días", "Últimos 7 dias")}</option>
              <option value="last30">{t("Last 30 Days", "30 derniers jours", "Letzte 30 Tage", "Últimos 30 días", "Últimos 30 dias")}</option>
              <option value="custom">{t("Custom", "Personnalise", "Benutzerdefiniert", "Personalizado", "Personalizado")}</option>
            </select>
            {data.dateRange.key === "custom" ? (
              <div className="inline-flex items-center gap-1.5">
                <input
                  type="date"
                  value={customFrom}
                  onChange={(event) => setCustomFrom(event.target.value)}
                  className={`${controlClass} px-2`}
                />
                <input
                  type="date"
                  value={customTo}
                  onChange={(event) => setCustomTo(event.target.value)}
                  className={`${controlClass} px-2`}
                />
                <button
                  type="button"
                  onClick={() => void setRange("custom", customFrom, customTo)}
                  className="h-8.5 rounded-lg border border-slate-300 px-3 text-sm font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                >
                  {t("Apply", "Appliquer", "Anwenden", "Aplicar", "Aplicar")}
                </button>
              </div>
            ) : null}
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {t("Last updated", "Derni?re mise ? jour", "Zuletzt aktualisiert", "Última actualización", "Última atualização")}{" "}
              {compactTime(data.generatedAt)}
            </span>
            <button
              type="button"
              onClick={() => void refresh({ silent: false })}
              disabled={isRefreshing}
              className="inline-flex h-8.5 items-center gap-2 rounded-lg border border-slate-300 px-3 text-sm font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            >
              {isRefreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              {t("Refresh", "Actualiser", "Aktualisieren", "Actualizar", "Atualizar")}
            </button>
            <label className="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
              {t("Auto-refresh", "Actualisation automatique", "Automatische Aktualisierung", "Actualización automática", "Atualização automática")}
              <button
                type="button"
                onClick={() => setAutoRefresh((prev) => !prev)}
                className={clsx(
                  "relative inline-flex h-6 w-11 items-center rounded-full border",
                  autoRefresh ? "border-blue-600 bg-blue-600" : "border-slate-300 bg-slate-200 dark:border-slate-700 dark:bg-slate-800"
                )}
              >
                <span
                  className={clsx(
                    "inline-block h-4 w-4 rounded-full bg-white transition",
                    autoRefresh ? "translate-x-6" : "translate-x-1"
                  )}
                />
              </button>
            </label>
          </div>
        </div>
      </section>

      {warning ? (
        <section className="rounded-xl border border-amber-300 bg-amber-50 px-3.5 py-2 text-sm text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
          {warning}
        </section>
      ) : null}

      <section className="space-y-2">
        <div className="flex items-end justify-between gap-3">
          <h1 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            {t("Business Overview", "Vue d'ensemble de l'activité", "Geschäftsübersicht", "Resumen del negocio", "Visao geral do negocio")}
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {t("Key signals for the selected range", "Signaux cles pour la periode choisie", "Wichtige Signale für den gewählten Zeitraum", "Senales clave para el periodo seleccionado", "Sinais principais para o periodo selecionado")}
          </p>
        </div>
        <div
          className={clsx(
            metricGridClass,
            "sm:grid-cols-2",
            data.permissions.canViewBilling ? "xl:grid-cols-3 2xl:grid-cols-6" : "xl:grid-cols-3"
          )}
        >
          {data.permissions.canViewBilling ? (
            <>
              <Link href={navigateWithRange("/billing/payments", { status: "paid" })} className={metricCellClass}>
                <p className="text-[11px] uppercase leading-5 tracking-[0.1em] text-slate-500 break-words dark:text-slate-400">{t("Revenue", "Revenus", "Umsatz", "Ingresos", "Receita")}</p>
                <p className="mt-1 text-2xl font-semibold leading-tight text-slate-950 dark:text-slate-100">
                  {formatCurrency(data.overview.revenue, data.overview.currency)}
                </p>
                <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
                  <MiniTrend values={data.overview.revenueTrend} />
                  {localizeRevenueNote(data.overview.revenueNote) ? (
                    <span className="min-w-0 text-right text-[11px] leading-4 text-amber-700 dark:text-amber-300">{localizeRevenueNote(data.overview.revenueNote)}</span>
                  ) : null}
                </div>
              </Link>
              <Link href={navigateWithRange("/billing/payments")} className={metricCellClass}>
                <p className="text-[11px] uppercase leading-5 tracking-[0.1em] text-slate-500 break-words dark:text-slate-400">{t("Payments", "Paiements", "Zahlungen", "Pagos", "Pagamentos")}</p>
                <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">{data.overview.paymentsCount}</p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {t("Success rate", "Taux de reussite", "Erfolgsquote", "Tasa de ?xito", "Taxa de sucesso")} {data.overview.paymentSuccessRate}%
                </p>
              </Link>
              <Link href="/dashboard/invoices" className={metricCellClass}>
                <p className="text-[11px] uppercase leading-5 tracking-[0.1em] text-slate-500 break-words dark:text-slate-400">{t("Invoices Sent", "Factures envoyées", "Gesendete Rechnungen", "Facturas enviadas", "Faturas enviadas")}</p>
                <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">{data.overview.invoicesSent}</p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {t("Overdue", "En retard", "überfällig", "Vencidas", "Em atraso")} {data.overview.invoicesOverdue}
                </p>
              </Link>
            </>
          ) : null}
          <Link href="/dashboard/inbox/analytics" className={metricCellClass}>
            <p className="text-[11px] uppercase leading-5 tracking-[0.1em] text-slate-500 break-words dark:text-slate-400">{t("Messages", "Messages", "Nachrichten", "Mensajes", "Mensagens")}</p>
            <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">{data.overview.messagesSent}</p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {t("Delivery rate", "Taux de livraison", "Zustellrate", "Tasa de entrega", "Taxa de entrega")} {data.overview.messageDeliveryRate}%
            </p>
          </Link>
          <Link href={navigateWithRange("/dashboard/automation-operations")} className={metricCellClass}>
            <p className="text-[11px] uppercase leading-5 tracking-[0.1em] text-slate-500 break-words dark:text-slate-400">{t("Automations", "Automatisations", "Automatisierungen", "Automatizaciónes", "Automações")}</p>
            <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">{data.overview.automationRuns}</p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {t("Failed", "Echouees", "Fehlgeschlagen", "Fallidas", "Falhadas")} {data.overview.failedAutomations}
            </p>
          </Link>
          {typeof data.overview.aiRequests === "number" ? (
            <Link href="/dashboard/assistant" className={metricCellClass}>
              <p className="text-[11px] uppercase leading-5 tracking-[0.1em] text-slate-500 break-words dark:text-slate-400">{t("AI", "IA", "KI", "IA", "IA")}</p>
              <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">{data.overview.aiRequests}</p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {t("Requests in range", "Requêtes sur la periode", "Anfragen im Zeitraum", "Solicitudes en el rango", "Pedidos no intervalo")}
              </p>
            </Link>
          ) : null}
        </div>
      </section>

      <section className={sectionClass}>
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">{t("Risk & Attention", "Risques et attention", "Risiko und Aufmerksamkeit", "Riesgo y atencion", "Risco e atencao")}</h2>
        {data.permissions.canViewBilling && data.risk.paymentConnectionIssue ? (
          <div className="mt-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
            {t("Payment subaccount not connected.", "Le sous-compte de paiement n'est pas connecté.", "Zahlungsunterkonto nicht verbunden.", "La subcuenta de pago no est? conectada.", "A subconta de pagamento não esta ligada.")}
            <Link href="/dashboard/settings?tab=payout" className="ml-2 font-semibold text-blue-700 hover:underline dark:text-blue-300">
              {t("Complete payout setup", "Finaliser la configuration des virements", "Auszahlungseinrichtung abschliessen", "Completar la configuración de cobros", "Concluir a configuração de recebimentos")}
            </Link>
          </div>
        ) : null}
        {riskRows.length === 0 && !(data.permissions.canViewBilling && data.risk.paymentConnectionIssue) ? (
          <p className="mt-2 text-sm text-emerald-700 dark:text-emerald-300">{t("All systems operating normally.", "Tous les systèmes fonctionnent normalement.", "Alle Systeme arbeiten normal.", "Todos los sistemas funcionan con normalidad.", "Todos os sistemas estão a funcionar normalmente.")}</p>
        ) : (
          <div className="mt-2 divide-y divide-amber-200 overflow-hidden rounded-xl border border-amber-300 bg-amber-50 dark:divide-amber-500/20 dark:border-amber-500/40 dark:bg-amber-500/10">
            {riskRows.map((row) => (
              <Link
                key={row.label}
                href={row.href}
                className="flex items-center justify-between gap-3 px-3 py-2 text-sm text-amber-900 transition hover:bg-amber-100 dark:text-amber-200 dark:hover:bg-amber-500/15"
              >
                <span>{row.label}</span>
                <span className="font-semibold">{row.value}</span>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
          {t("Module Snapshot", "Aperçu des modules", "Modulübersicht", "Resumen de modulos", "Resumo dos modulos")}
        </h2>
        <div className={clsx(metricGridClass, data.permissions.canViewBilling ? "lg:grid-cols-3" : "lg:grid-cols-2")}>
          {data.permissions.canViewBilling ? (
            <article className={moduleCellClass}>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t("Billing", "Facturation", "Abrechnung", "Facturación", "Faturação")}</h3>
              <div className="mt-2 space-y-1 text-sm text-slate-700 dark:text-slate-300">
                <p>{t("Revenue", "Revenus", "Umsatz", "Ingresos", "Receita")}: {formatCurrency(data.modules.billing.revenue, data.overview.currency)}</p>
                <p>{t("Payments", "Paiements", "Zahlungen", "Pagos", "Pagamentos")}: {data.modules.billing.paymentsCount}</p>
                <p>{t("Overdue invoices", "Factures en retard", "überfällige Rechnungen", "Facturas vencidas", "Faturas em atraso")}: {data.modules.billing.overdueInvoices}</p>
              </div>
              <Link href={navigateWithRange("/billing/payments")} className="mt-3 inline-block text-sm font-semibold text-blue-700 dark:text-blue-300">
                {t("Open payments ledger", "Ouvrir le registre des paiements", "Zahlungsledger öffnen", "Abrir libro de pagos", "Abrir razao de pagamentos")}
              </Link>
            </article>
          ) : null}
          <article className={moduleCellClass}>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t("Automation", "Automatisation", "Automatisierung", "Automatización", "Automação")}</h3>
            <div className="mt-2 space-y-1 text-sm text-slate-700 dark:text-slate-300">
              <p>{t("Runs", "Executions", "Laufe", "Ejecuciones", "Execucoes")}: {data.modules.automation.runs}</p>
              <p>{t("Failed", "Echouees", "Fehlgeschlagen", "Fallidas", "Falhadas")}: {data.modules.automation.failed}</p>
              <p>{t("Active automations", "Automatisations actives", "Aktive Automatisierungen", "Automatizaciónes activas", "Automações ativas")}: {data.modules.automation.active}</p>
            </div>
            <Link href={navigateWithRange("/dashboard/automations")} className="mt-3 inline-block text-sm font-semibold text-blue-700 dark:text-blue-300">
              {t("View automations", "Voir les automatisations", "Automatisierungen ansehen", "Ver automatizaciones", "Ver automações")}
            </Link>
          </article>
          <article className={moduleCellClass}>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t("Messaging", "Messagerie", "Nachrichten", "Mensajeria", "Mensagens")}</h3>
            <div className="mt-2 space-y-1 text-sm text-slate-700 dark:text-slate-300">
              <p>{t("Sent", "Envoyes", "Gesendet", "Enviados", "Enviadas")}: {data.modules.messaging.sent}</p>
              <p>{t("Delivered", "Distribues", "Zugestellt", "Entregados", "Entregues")}: {data.modules.messaging.delivered}</p>
              <p>{t("Failed", "Echoues", "Fehlgeschlagen", "Fallidos", "Falhados")}: {data.modules.messaging.failed}</p>
            </div>
            <Link href="/dashboard/inbox/analytics" className="mt-3 inline-block text-sm font-semibold text-blue-700 dark:text-blue-300">
              {t("View messaging", "Voir la messagerie", "Nachrichten ansehen", "Ver mensajeria", "Ver mensagens")}
            </Link>
          </article>
        </div>
      </section>

      <section className={sectionClass}>
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">{t("Recent Activity Timeline", "Chronologie de l'activité recente", "Zeitleiste der letzten Aktivität", "Cronologia de actividad reciente", "Cronologia da atividade recente")}</h2>
        {timelineRows.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{t("No recent system activity.", "Aucune activité système recente.", "Keine aktuelle Systemaktivität.", "No hay actividad reciente del sistema.", "Não há atividade recente do sistema.")}</p>
        ) : (
          <div
            className={clsx(
              "mt-2 divide-y divide-slate-200 dark:divide-slate-800",
              timelineRows.length > 4 && "max-h-[18rem] overflow-y-auto pr-1"
            )}
          >
            {timelineRows.map((item) => {
              const Icon =
                item.status === "failed"
                  ? XCircle
                  : item.status === "warning"
                    ? AlertTriangle
                    : item.status === "success"
                      ? CheckCircle2
                      : Clock3;
              return (
                <article key={item.id} className="py-2 first:pt-0 last:pb-0">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2">
                      <span
                        className={clsx(
                          "mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full",
                          item.status === "failed"
                            ? "bg-red-100 text-red-700"
                            : item.status === "warning"
                              ? "bg-amber-100 text-amber-700"
                              : item.status === "success"
                                ? "bg-emerald-100 text-emerald-700"
                                : "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200"
                        )}
                      >
                        <Icon className="h-3.5 w-3.5" />
                      </span>
                      <div>
                        <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{localizeTimelineTitle(item.title)}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {item.customer ? `${localizeTimelineCustomer(item.customer)} • ` : ""}
                          {item.invoice ? `${item.invoice} • ` : ""}
                          {compactTime(item.timestamp)}
                        </p>
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

