"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import useSWRInfinite from "swr/infinite";
import { Activity, ArrowLeft, Clock3, FileText, Mail, Receipt, UserCheck, UserCircle2 } from "lucide-react";
import { useLanguage } from "@/components/providers/language-provider";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { localizeAdminServerMessage } from "@/lib/admin/localization";
import { LANGUAGE_LOCALES, type CompleteLocalizedText } from "@/lib/i18n";

const EVENT_OPTIONS = [
  "all",
  "login",
  "logout",
  "invoice_created",
  "invoice_sent",
  "invoice_paid",
  "receipt_generated",
  "automation_triggered",
  "notification_sent",
  "payment_attempt",
  "payment_failed",
  "payment_succeeded",
  "impersonation_started",
  "impersonation_ended",
] as const;

type EventFilter = (typeof EVENT_OPTIONS)[number];

const text = (en: string, fr: string, de: string, es: string, pt: string): CompleteLocalizedText => ({ en, fr, de, es, pt });

type TimelineItem = {
  id: string;
  eventType: string;
  actorId: string | null;
  actorName: string | null;
  actorEmail: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
};

type TimelineResponse = {
  user: {
    id: string;
    name: string;
    email: string;
  };
  items: TimelineItem[];
  pagination: {
    mode: "offset" | "cursor";
    page: number;
    pageSize: number;
    totalItems: number | null;
    totalPages: number | null;
    hasMore: boolean;
    nextCursor: string | null;
  };
};

const fetcher = async (url: string): Promise<TimelineResponse> => {
  const response = await fetch(url, { cache: "no-store" });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      (payload && typeof payload === "object" && "error" in payload && typeof (payload as { error?: unknown }).error === "string"
        ? String((payload as { error: string }).error)
        : null) || `Request failed (${response.status})`;
    throw new Error(message);
  }
  return payload as TimelineResponse;
};

function toLabel(eventType: string, t: ReturnType<typeof useLanguage>["t"]) {
  const knownLabels: Record<string, CompleteLocalizedText> = {
    all: text("All events", "Tous les événements", "Alle Ereignisse", "Todos los eventos", "Todos os eventos"),
    login: text("Login", "Connexion", "Anmeldung", "Inicio de sesión", "Inicio de sessão"),
    logout: text("Logout", "Deconnexion", "Abmeldung", "Cierre de sesión", "Terminar sessão"),
    invoice_created: text("Invoice created", "Facture creee", "Rechnung erstellt", "Factura creada", "Fatura criada"),
    invoice_sent: text("Invoice sent", "Facture envoyée", "Rechnung gesendet", "Factura enviada", "Fatura enviada"),
    invoice_paid: text("Invoice paid", "Facture payee", "Rechnung bezahlt", "Factura pagada", "Fatura paga"),
    receipt_generated: text("Receipt generated", "Recu genere", "Beleg erstellt", "Recibo generado", "Recibo gerado"),
    automation_triggered: text("Automation triggered", "Automatisation declenchee", "Automatisierung ausgelöst", "Automatización activada", "Automação acionada"),
    notification_sent: text("Notification sent", "Notification envoyée", "Benachrichtigung gesendet", "Notificación enviada", "Notificacao enviada"),
    payment_attempt: text("Payment attempt", "Tentative de paiement", "Zahlungsversuch", "Intento de pago", "Tentativa de pagamento"),
    payment_failed: text("Payment failed", "Paiement échoué", "Zahlung fehlgeschlagen", "Pago fallido", "Pagamento falhou"),
    payment_succeeded: text("Payment succeeded", "Paiement r?ussi", "Zahlung erfolgreich", "Pago correcto", "Pagamento conclu?do"),
    impersonation_started: text("Impersonation started", "Usurpation commencee", "Identitätsübernahme gestartet", "Suplantacion iniciada", "Impersonacao iniciada"),
    impersonation_ended: text("Impersonation ended", "Usurpation terminée", "Identitätsübernahme beendet", "Suplantacion finalizada", "Impersonacao terminada"),
  };
  const known = knownLabels[eventType];
  if (known) return t(known);
  return eventType
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function eventIcon(eventType: string) {
  if (eventType.includes("invoice")) return FileText;
  if (eventType.includes("receipt")) return Receipt;
  if (eventType.includes("notification")) return Mail;
  if (eventType.includes("payment")) return UserCheck;
  if (eventType.includes("login") || eventType.includes("logout")) return UserCircle2;
  return Activity;
}

function eventBadgeVariant(eventType: string) {
  if (eventType.includes("failed")) return "danger" as const;
  if (eventType.includes("succeeded") || eventType.includes("paid")) return "success" as const;
  if (eventType.includes("attempt")) return "warning" as const;
  if (eventType.includes("login") || eventType.includes("logout") || eventType.includes("notification")) {
    return "pending" as const;
  }
  if (eventType.includes("invoice") || eventType.includes("receipt") || eventType.includes("impersonation")) {
    return "country" as const;
  }
  return "warning" as const;
}

function metadataSummary(
  metadata: Record<string, unknown>,
  t: ReturnType<typeof useLanguage>["t"]
) {
  const keys = Object.keys(metadata || {});
  if (!keys.length) return null;
  const primaryKey = keys[0];
  const value = metadata[primaryKey];
  const keyLabel =
    primaryKey === "provider"
      ? t(text("Provider", "Fournisseur", "Anbieter", "Proveedor", "Fornecedor"))
      : primaryKey === "reason"
        ? t(text("Reason", "Raison", "Grund", "Motivo", "Motivo"))
        : primaryKey === "invoiceId"
          ? t(text("Invoice", "Facture", "Rechnung", "Factura", "Fatura"))
          : primaryKey;

  const valueLabel =
    value === null || value === undefined
      ? "-"
      : typeof value === "object"
        ? "[object]"
        : primaryKey === "provider" && String(value).toLowerCase() === "credentials"
          ? t(text("Password", "Mot de passe", "Passwort", "Contraseña", "Palavra-passe"))
          : primaryKey === "provider" && String(value).toLowerCase() === "google"
            ? "Google"
            : primaryKey === "provider" && String(value).toLowerCase() === "sso"
              ? "SSO"
              : String(value);

  return `${keyLabel}: ${valueLabel}`;
}

function toDayStart(value: string) {
  const parsed = new Date(value);
  parsed.setHours(0, 0, 0, 0);
  return parsed.toISOString();
}

function toDayEnd(value: string) {
  const parsed = new Date(value);
  parsed.setHours(23, 59, 59, 999);
  return parsed.toISOString();
}

export default function UserActivityTimelineClient({ userId }: { userId: string }) {
  const router = useRouter();
  const { language, t } = useLanguage();
  const [eventType, setEventType] = useState<EventFilter>("all");
  const [searchDraft, setSearchDraft] = useState("");
  const [query, setQuery] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const next = searchDraft.trim();
      setQuery((prev) => (prev === next ? prev : next));
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchDraft]);

  const filterSignature = useMemo(
    () => JSON.stringify({ eventType, query, from, to }),
    [eventType, query, from, to]
  );
  const locale = LANGUAGE_LOCALES[language];

  const getKey = (pageIndex: number, previousPageData: TimelineResponse | null) => {
    if (pageIndex > 0 && !previousPageData?.pagination?.nextCursor) return null;

    const params = new URLSearchParams();
    params.set("cursorMode", "1");
    params.set("pageSize", "50");
    if (eventType !== "all") params.set("eventType", eventType);
    if (query) params.set("q", query);
    if (from) params.set("from", toDayStart(from));
    if (to) params.set("to", toDayEnd(to));
    if (pageIndex > 0 && previousPageData?.pagination?.nextCursor) {
      params.set("cursor", previousPageData.pagination.nextCursor);
    }

    return `/api/admin/users/${encodeURIComponent(userId)}/activity?${params.toString()}`;
  };

  const { data, error, isLoading, mutate, isValidating, size, setSize } = useSWRInfinite<TimelineResponse>(
    getKey,
    fetcher,
    {
      revalidateFirstPage: true,
      revalidateAll: true,
    }
  );

  useEffect(() => {
    void setSize(1);
  }, [filterSignature, setSize]);

  const user = data?.[0]?.user;
  const items = useMemo(() => data?.flatMap((pageData) => pageData.items) || [], [data]);
  const lastPage = data?.[data.length - 1];
  const hasMore = Boolean(lastPage?.pagination?.hasMore);

  async function handleRefresh() {
    await setSize(1);
    await mutate();
  }

  return (
    <div className="space-y-4 px-6 py-6 max-md:px-4 max-md:py-4">
      <header className="space-y-2">
        <Button variant="secondary" size="sm" onClick={() => router.push("/admin/users")}>
          <ArrowLeft className="h-4 w-4" />
          {t(text("Back to users", "Retour aux utilisateurs", "Zurück zu den Benutzern", "Volver a usuarios", "Voltar aos utilizadores"))}
        </Button>
        <h1 className="text-3xl font-semibold text-foreground">{t(text("User Activity Timeline", "Chronologie d'activité utilisateur", "Aktivitätsverlauf des Benutzers", "Cronologia de actividad del usuario", "Cronologia de atividade do utilizador"))}</h1>
        <p className="text-sm text-muted-foreground">{t(text("Chronological record of user actions.", "Historique chronologique des actions de l'utilisateur.", "Chronologische Aufzeichnung der Benutzeraktionen.", "Registro cronologico de las acciones del usuario.", "Registo cronologico das ações do utilizador."))}</p>
        {user ? (
          <p className="text-xs text-muted-foreground">
            {user.name} {" - "} {user.email}
          </p>
        ) : null}
      </header>

      {error ? (
        <Alert variant="error">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>
              {localizeAdminServerMessage(
                error.message,
                language,
                t(text("Activity history unavailable.", "Historique d'activité indisponible.", "Aktivitaetsverlauf nicht verfügbar.", "Historial de actividad no disponible.", "Histórico de atividade indisponível."))
              )}
            </span>
            <Button size="sm" variant="secondary" onClick={() => void handleRefresh()} loading={isValidating}>
              {t(text("Retry", "Reessayer", "Erneut versuchen", "Reintentar", "Tentar novamente"))}
            </Button>
          </div>
        </Alert>
      ) : null}

      <Card className="space-y-3 p-4">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[220px_minmax(0,1fr)_180px_180px_auto]">
          <select
            value={eventType}
            onChange={(event) => {
              setEventType(event.target.value as EventFilter);
            }}
            className="h-10 rounded-lg border border-input bg-background px-3 text-sm text-foreground"
          >
            {EVENT_OPTIONS.map((entry) => (
              <option key={entry} value={entry}>
                {toLabel(entry, t)}
              </option>
            ))}
          </select>
          <Input
            value={searchDraft}
            onChange={(event) => setSearchDraft(event.target.value)}
            placeholder={t(text("Search events", "Rechercher des événements", "Ereignisse suchen", "Buscar eventos", "Pesquisar eventos"))}
          />
          <Input
            type="date"
            value={from}
            onChange={(event) => {
              setFrom(event.target.value);
            }}
          />
          <Input
            type="date"
            value={to}
            onChange={(event) => {
              setTo(event.target.value);
            }}
          />
          <Button variant="secondary" onClick={() => void handleRefresh()} loading={isValidating}>
            {t(text("Refresh", "Actualiser", "Aktualisieren", "Actualizar", "Atualizar"))}
          </Button>
        </div>
      </Card>

      <Card className="p-0">
        {isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 8 }).map((_, idx) => (
              <Skeleton key={idx} className="h-14 rounded-md" />
            ))}
          </div>
        ) : !items.length ? (
          <div className="p-8 text-center text-sm text-muted-foreground">{t(text("No activity events found for current filters.", "Aucun evenement d'activité trouvé pour les filtres actuels.", "Keine Aktivitätsereignisse für die aktuellen Filter gefunden.", "No se encontraron eventos de actividad para los filtros actuales.", "Nenhum evento de atividade encontrado para os filtros atuais."))}</div>
        ) : (
          <ul className="divide-y divide-border/60">
            {items.map((item) => {
              const Icon = eventIcon(item.eventType);
              const summary = metadataSummary(item.metadata, t);
              return (
                <li key={item.id} className="space-y-1 px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Clock3 className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">{new Date(item.createdAt).toLocaleString(locale)}</span>
                    <Badge variant={eventBadgeVariant(item.eventType)}>{toLabel(item.eventType, t)}</Badge>
                  </div>
                  <div className="flex items-start gap-2 text-sm text-foreground">
                    <Icon className="mt-0.5 h-4 w-4 text-muted-foreground" />
                    <div className="space-y-0.5">
                      <p>{toLabel(item.eventType, t)}</p>
                      {summary ? <p className="text-xs text-muted-foreground">{summary}</p> : null}
                      {item.actorEmail ? (
                        <p className="text-xs text-muted-foreground">{t(text("Actor:", "Acteur :", "Akteur:", "Actor:", "Ator:"))} {item.actorName || item.actorEmail}</p>
                      ) : null}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-muted-foreground">
          {t(
            text(
              `Showing ${items.length} events${isValidating ? " - refreshing..." : ""}`,
              `Affichage de ${items.length} evenements${isValidating ? " - actualisation..." : ""}`,
              `${items.length} Ereignisse werden angezeigt${isValidating ? " - wird aktualisiert..." : ""}`,
              `Mostrando ${items.length} eventos${isValidating ? " - actualizando..." : ""}`,
              `A mostrar ${items.length} eventos${isValidating ? " - a atualizar..." : ""}`
            )
          )}
        </span>
        <Button
          variant="secondary"
          disabled={!hasMore || isValidating}
          onClick={() => void setSize(size + 1)}
        >
          {hasMore
            ? t(text("Load more", "Charger plus", "Mehr laden", "Cargar más", "Carregar mais"))
            : t(text("No more events", "Plus d'événements", "Keine weiteren Ereignisse", "No hay más eventos", "Não há mais eventos"))}
        </Button>
      </div>
    </div>
  );
}
