"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import useSWR from "swr";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Skeleton } from "@/components/ui/skeleton";
import { Table } from "@/components/ui/table";
import { useLanguage } from "@/components/providers/language-provider";
import {
  localizeAdminActionLabel,
  localizeAdminProvider,
  localizeAdminServerMessage,
  localizeAdminSource,
  localizeAdminStatus,
} from "@/lib/admin/localization";
import { formatDateDMY, formatDateTimeDMY } from "@/lib/date";
import { LANGUAGE_LOCALES } from "@/lib/i18n";
import type { AdminTenantDetailResponse } from "@/lib/admin/tenants-types";
import { ConfirmImpersonationModal } from "@/components/admin/ConfirmImpersonationModal";

const fetcher = async <T,>(url: string): Promise<T> => {
  const response = await fetch(url, { cache: "no-store" });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(String((json as { error?: string })?.error || `Request failed (${response.status})`));
  }
  return json as T;
};

function statusBadgeVariant(status: string) {
  if (status === "ACTIVE") return "success" as const;
  if (status === "SUSPENDED") return "warning" as const;
  return "danger" as const;
}

const usageFeatureLabels: Record<string, string> = {
  ai_requests: "AI requests",
  invoices: "Invoices",
  whatsapp_messages: "WhatsApp messages",
  automations_runs: "Automation runs",
  team_members_seats: "Team seats",
};

export default function AdminTenantDetailPage() {
  const router = useRouter();
  const { language, t } = useLanguage();
  const params = useParams<{ tenantId: string }>();
  const tenantId = String(params?.tenantId || "");
  const [reason, setReason] = useState("");
  const [showSuspend, setShowSuspend] = useState(false);
  const [showReactivate, setShowReactivate] = useState(false);
  const [showImpersonationModal, setShowImpersonationModal] = useState(false);
  const [savingAction, setSavingAction] = useState(false);
  const [startingImpersonation, setStartingImpersonation] = useState(false);
  const [feedback, setFeedback] = useState<{ variant: "success" | "error" | "info"; message: string } | null>(
    null
  );

  const { data, error, isLoading, mutate } = useSWR<AdminTenantDetailResponse>(
    tenantId ? `/api/admin/tenants/${tenantId}` : null,
    fetcher
  );

  const actorRole = data?.actorRole || "USER";
  const isSuperAdmin = actorRole === "SUPER_ADMIN";
  const isAdmin = actorRole === "OPS_ADMIN";

  const triggerAction = async (kind: "suspend" | "reactivate") => {
    if (!tenantId) return;
    setSavingAction(true);
    setFeedback(null);
    try {
      const endpoint =
        kind === "suspend"
          ? `/api/admin/tenants/${tenantId}/suspend`
          : `/api/admin/tenants/${tenantId}/reactivate`;
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: kind === "suspend" ? JSON.stringify({ reason: reason.trim() || undefined }) : undefined,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(String((payload as { error?: string })?.error || t("Action failed.", "Echec de l'action.", "Aktion fehlgeschlagen.", "La acción fallo.", "A ação falhou.")));
      }
      setShowSuspend(false);
      setShowReactivate(false);
      setReason("");
      setFeedback({
        variant: "success",
        message: kind === "suspend" ? t("Tenant suspended.", "Locataire suspendu.", "Mandant gesperrt.", "Tenant suspendido.", "Tenant suspenso.") : t("Tenant reactivated.", "Locataire reactive.", "Mandant reaktiviert.", "Tenant reactivado.", "Tenant reativado."),
      });
      await mutate();
    } catch (actionError) {
      setFeedback({
        variant: "error",
        message:
          actionError instanceof Error
            ? localizeAdminServerMessage(
                actionError.message,
                language,
                t("Action failed.", "Echec de l'action.", "Aktion fehlgeschlagen.", "La acción fallo.", "A ação falhou.")
              )
            : t("Action failed.", "Echec de l'action.", "Aktion fehlgeschlagen.", "La acción fallo.", "A ação falhou."),
      });
    } finally {
      setSavingAction(false);
    }
  };

  const startImpersonation = async () => {
    if (!data?.tenant.id || !impersonationTarget?.userId) return;
    if (isAdmin && !impersonationTarget.hasActiveTenantUser) {
      throw new Error(t("This tenant has no active USER account to impersonate.", "Ce locataire n'a aucun compte UTILISATEUR actif a usurper.", "Dieser Mandant hat kein aktives USER-Konto zur Imitation.", "Este tenant no tiene una cuenta USER activa para suplantar.", "Este tenant não tem uma conta USER ativa para impersonar."));
    }
    setStartingImpersonation(true);
    setFeedback(null);
    try {
      const response = await fetch("/api/admin/impersonation/start", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          targetUserId: impersonationTarget.userId,
          tenantId: data.tenant.id,
          reason: "Support impersonation from tenant detail",
          confirmation: "IMPERSONATE",
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(String((payload as { error?: string })?.error || t("Unable to start impersonation.", "Impossible de demarrer l'usurpation.", "Imitation konnte nicht gestartet werden.", "No se pudo iniciar la suplantacion.", "Não foi possivel iniciar a impersonação.")));
      }
      const redirectTo = String((payload as { redirectTo?: string })?.redirectTo || "/dashboard");
      setShowImpersonationModal(false);
      router.push(redirectTo);
      router.refresh();
    } catch (impersonationError) {
      setFeedback({
        variant: "error",
        message:
          impersonationError instanceof Error
            ? localizeAdminServerMessage(
                impersonationError.message,
                language,
                t("Unable to start impersonation.", "Impossible de demarrer l'usurpation.", "Imitation konnte nicht gestartet werden.", "No se pudo iniciar la suplantacion.", "Não foi possivel iniciar a impersonação.")
              )
            : t("Unable to start impersonation.", "Impossible de demarrer l'usurpation.", "Imitation konnte nicht gestartet werden.", "No se pudo iniciar la suplantacion.", "Não foi possivel iniciar a impersonação."),
      });
    } finally {
      setStartingImpersonation(false);
    }
  };

  const usageRows = useMemo(
    () =>
      (data?.usage.counters || []).map((counter) => ({
        feature: counter.feature,
        quantity: counter.quantity,
      })),
    [data]
  );

  const userRows = useMemo(
    () =>
      (data?.users || []).map((member) => ({
        id: member.id,
        name: member.user.name || "-",
        email: member.user.email,
        userId: member.user.publicId || member.user.id,
        role: member.role,
        status: member.status,
        joinedAt: member.joinedAt,
      })),
    [data]
  );

  const impersonationTarget = useMemo(() => {
    if (!data) return null;
    const activeTenantUser = data.users.find(
      (member) =>
        String(member.status || "").toLowerCase() === "active" &&
        String(member.user.role || "").toUpperCase() === "USER"
    );
    return {
      userId: activeTenantUser?.user.id || data.owner.id,
      hasActiveTenantUser: Boolean(activeTenantUser),
    };
  }, [data]);

  const activityRiskCards = useMemo(() => {
    if (!data) return [];
    return [
      {
        key: "last-activity",
        title: t("Last Activity", "Derniere activite", "Letzte Aktivitaet", "Ultima actividad", "Ultima atividade"),
        lines: [
          `${t("Created", "Cree", "Erstellt", "Creado", "Criado")} ${formatDateTimeDMY(new Date(data.tenant.createdAt), LANGUAGE_LOCALES[language])}`,
          data.tenant.lastActivityAt
            ? `${t("Last activity", "Derniere activite", "Letzte Aktivitaet", "Ultima actividad", "Ultima atividade")} ${formatDateTimeDMY(new Date(data.tenant.lastActivityAt), LANGUAGE_LOCALES[language])}`
            : t("No activity recorded yet.", "Aucune activité enregistree pour le moment.", "Noch keine Aktivitaet aufgezeichnet.", "Aún no hay actividad registrada.", "Ainda não ha atividade registada."),
        ],
      },
      {
        key: "account-risk",
        title: t("Account Risk", "Risque du compte", "Kontorisiko", "Riesgo de cuenta", "Risco da conta"),
        lines: [
          `${t("Open high-priority tickets:", "Tickets prioritaires ouverts :", "Offene Tickets mit hoher Prioritaet:", "Tickets abiertos de alta prioridad:", "Tickets abertos de alta prioridade:")} ${data.overview.riskSignals.openHighPriorityTickets}`,
          `${t("Status:", "Statut :", "Status:", "Estado:", "Estado:")} ${localizeAdminStatus(data.tenant.status, language)}`,
        ],
      },
      {
        key: "integrations",
        title: t("Integrations", "Integrations", "Integrationen", "Integraciónes", "Integrações"),
        lines: [
          `${t("Paystack subaccount:", "Sous-compte Paystack :", "Paystack-Unterkonto:", "Subcuenta Paystack:", "Subconta Paystack:")} ${data.overview.integrations.paystackSubaccountCode || t("Not connected", "Non connecte", "Nicht verbunden", "No conectado", "Não ligado")}`,
          `${t("Flutterwave subaccount:", "Sous-compte Flutterwave :", "Flutterwave-Unterkonto:", "Subcuenta Flutterwave:", "Subconta Flutterwave:")} ${data.overview.integrations.flutterwaveSubaccountId || t("Not connected", "Non connecte", "Nicht verbunden", "No conectado", "Não ligado")}`,
          `${t("Payout provider:", "Fournisseur de paiement :", "Auszahlungsanbieter:", "Proveedor de pagos:", "Fornecedor de pagamentos:")} ${data.overview.integrations.payoutProvider ? localizeAdminProvider(data.overview.integrations.payoutProvider, language) : t("Not configured", "Non configure", "Nicht konfiguriert", "No configurado", "Não configurado")}`,
        ],
      },
      {
        key: "webhook-failures",
        title: t("Webhook Failures", "Echecs webhook", "Webhook-Fehler", "Fallos de webhook", "Falhas de webhook"),
        lines: [
          `${t("Webhook failures (7d):", "Echecs webhook (7j) :", "Webhook-Fehler (7T):", "Fallos de webhook (7d):", "Falhas de webhook (7d):")} ${data.overview.riskSignals.webhookFailures7d}`,
          `${t("Webhook health:", "Sante webhook :", "Webhook-Zustand:", "Salud del webhook:", "Saude do webhook:")} ${data.billing.webhookHealth}`,
        ],
      },
    ];
  }, [data, t]);

  return (
    <div className="mx-auto w-full max-w-[1280px] space-y-8 overflow-x-hidden px-6 py-6 max-md:px-4 max-md:py-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <p className="text-xs uppercase tracking-[0.2em] text-indigo-600 dark:text-indigo-300">{t("Admin", "Admin", "Admin", "Admin", "Admin")}</p>
          <h1 className="text-[28px] font-semibold text-foreground">{t("Tenant detail", "Detail du locataire", "Mandantendetail", "Detalle del tenant", "Detalhe do tenant")}</h1>
        </div>
        <Link href="/admin/tenants" className="shrink-0">
          <Button variant="secondary">{t("Back to tenants", "Retour aux locataires", "Zurueck zu Mandanten", "Volver a tenants", "Voltar aos tenants")}</Button>
        </Link>
      </div>

      {feedback ? (
        <Alert variant={feedback.variant}>
          {feedback.variant === "error"
            ? localizeAdminServerMessage(
                feedback.message,
                language,
                t("Action failed.", "Echec de l'action.", "Aktion fehlgeschlagen.", "La acción fallo.", "A ação falhou.")
              )
            : feedback.message}
        </Alert>
      ) : null}
      {error ? (
        <Alert variant="error">
          {localizeAdminServerMessage(
            error.message,
            language,
            t(
              "Unable to load tenant detail right now.",
              "Impossible de charger le detail du locataire pour le moment.",
              "Mandantendetails koennen derzeit nicht geladen werden.",
              "No se puede cargar el detalle del tenant en este momento.",
              "Nao foi possivel carregar o detalhe do tenant neste momento."
            )
          )}
        </Alert>
      ) : null}

      <section className="border-b border-border/60 py-6">
        {isLoading || !data ? (
          <div className="space-y-3 pb-2">
            <Skeleton className="h-8 w-1/3 rounded-lg" />
            <Skeleton className="h-5 w-1/2 rounded-lg" />
            <Skeleton className="h-10 w-full rounded-xl" />
          </div>
        ) : (
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-2xl font-semibold text-foreground">{data.tenant.name}</h2>
                <Badge variant={statusBadgeVariant(data.tenant.status)}>{localizeAdminStatus(data.tenant.status, language)}</Badge>
              </div>
              <p className="mt-1 break-all font-mono text-xs text-muted-foreground">{data.tenant.id}</p>
              <p className="mt-2 break-words text-sm text-muted-foreground">{t("Owner:", "Proprietaire :", "Inhaber:", "Propietario:", "Proprietário:")} {data.owner.name || data.owner.email}</p>
              <p className="mt-1 break-words text-sm text-muted-foreground">{t("Owner email:", "E-mail du proprietaire :", "E-Mail des Inhabers:", "Correo del propietario:", "E-mail do proprietário:")} {data.owner.email}</p>
              <p className="mt-1 break-words text-xs text-muted-foreground">
                {t("Plan:", "Forfait :", "Plan:", "Plan:", "Plano:")} {data.subscription.plan || "-"} | {t("Created", "Cree", "Erstellt", "Creado", "Criado")} {formatDateTimeDMY(new Date(data.tenant.createdAt), LANGUAGE_LOCALES[language])}
                {data.tenant.lastActivityAt ? ` | ${t("Last activity", "Derniere activite", "Letzte Aktivitaet", "Ultima actividad", "Ultima atividade")} ${formatDateTimeDMY(new Date(data.tenant.lastActivityAt), LANGUAGE_LOCALES[language])}` : ""}
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-3">
              <Button onClick={() => setShowImpersonationModal(true)} loading={startingImpersonation}>
                {t("Impersonate", "Usurper", "Imitieren", "Suplantar", "Impersonar")}
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  document.getElementById("tenant-logs")?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
              >
                {t("View audit events", "Voir les evenements d'audit", "Audit-Ereignisse ansehen", "Ver eventos de auditoria", "Ver eventos de auditoria")}
              </Button>
              {isSuperAdmin ? (
                data.tenant.status === "SUSPENDED" ? (
                  <Button onClick={() => setShowReactivate(true)}>{t("Reactivate", "Reactiver", "Reaktivieren", "Reactivar", "Reativar")}</Button>
                ) : (
                  <Button variant="danger" onClick={() => setShowSuspend(true)}>
                    {t("Suspend", "Suspendre", "Sperren", "Suspender", "Suspender")}
                  </Button>
                )
              ) : null}
            </div>
          </div>
        )}
      </section>

      <div className="grid grid-cols-12 items-start gap-8">
        <div className="col-span-12 space-y-10 overflow-x-hidden lg:col-span-8">
          <section className="space-y-4">
            <div className="border-b border-border/60 pb-3">
              <h3 className="text-lg font-semibold text-foreground">{t("Activity & Risk", "Activit? et risque", "Aktivitaet und Risiko", "Actividad y riesgo", "Atividade e risco")}</h3>
            </div>
            {isLoading || !data ? (
              <div className="grid gap-4 md:grid-cols-2">
                <Skeleton className="h-20 rounded-lg" />
                <Skeleton className="h-20 rounded-lg" />
                <Skeleton className="h-20 rounded-lg" />
                <Skeleton className="h-20 rounded-lg" />
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2">
                {activityRiskCards.map((card) => (
                  <div key={card.key} className="space-y-1 text-sm">
                    <p className="text-sm text-muted-foreground">{card.title}</p>
                    {card.lines.map((line) => (
                      <p key={line} className="break-words font-medium text-foreground">
                        {line}
                      </p>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </section>

          <section id="tenant-users" className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-3">
              <h3 className="text-lg font-semibold text-foreground">{t("Users", "Utilisateurs", "Benutzer", "Usuarios", "Utilizadores")}</h3>
              <Link
                href="/admin/users"
                className="text-sm font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-300"
              >
                {t("View all users", "Voir tous les utilisateurs", "Alle Benutzer anzeigen", "Ver todos los usuarios", "Ver todos os utilizadores")} {"->"}
              </Link>
            </div>
            {isLoading || !data ? (
              <Skeleton className="h-48 w-full rounded-lg" />
            ) : (
              <Table
                data={userRows}
                keyExtractor={(row) => row.id}
                columns={[
                    { key: "name", label: t("Name", "Nom", "Name", "Nombre", "Nome") },
                    { key: "email", label: t("Email", "E-mail", "E-Mail", "Correo", "E-mail") },
                    { key: "userId", label: t("User ID", "ID utilisateur", "Benutzer-ID", "ID de usuario", "ID do utilizador") },
                    { key: "role", label: t("Role", "Role", "Rolle", "Rol", "Função") },
                    { key: "status", label: t("Status", "Statut", "Status", "Estado", "Estado") },
                    {
                      key: "joinedAt",
                      label: t("Joined", "Ajoute", "Beigêtreten", "Se unio", "Aderiu"),
                      render: (row) => (row.joinedAt ? formatDateDMY(new Date(row.joinedAt), LANGUAGE_LOCALES[language]) : "-"),
                    },
                ]}
              />
            )}
          </section>

          <section id="tenant-usage" className="space-y-4">
            <div className="space-y-1 border-b border-border/60 pb-3">
              <h3 className="text-lg font-semibold text-foreground">{t("Usage", "Utilisation", "Nutzung", "Uso", "Utilização")}</h3>
              {!isLoading && data ? (
                <p className="text-sm text-muted-foreground">
                  {t("Period:", "Periode :", "Zeitraum:", "Periodo:", "Periodo:")} {formatDateDMY(new Date(data.usage.periodStart), LANGUAGE_LOCALES[language])} - {formatDateDMY(new Date(data.usage.periodEnd), LANGUAGE_LOCALES[language])}
                </p>
              ) : null}
            </div>
            {isLoading || !data ? (
              <Skeleton className="h-40 w-full rounded-lg" />
            ) : (
              <div className="space-y-3">
                {usageRows.map((row) => (
                  <div key={row.feature} className="flex items-center justify-between gap-3 border-b border-border/50 py-2 text-sm">
                    <span className="text-muted-foreground">{usageFeatureLabels[row.feature] || row.feature}</span>
                    <span className="font-semibold text-foreground">{row.quantity.toLocaleString()}</span>
                  </div>
                ))}
                {data.usage.channelTotals ? (
                  <div className="pt-2 text-sm text-muted-foreground">
                    <p>{t("Billing period:", "Periode de facturation :", "Abrechnungszeitraum:", "Periodo de facturación:", "Periodo de faturação:")} {data.usage.channelTotals.billingPeriod}</p>
                    <p>{t("Email messages sent:", "E-mails envoyes :", "Gesendete E-Mails:", "Mensajes de correo enviados:", "Mensagens de e-mail enviadas:")} {data.usage.channelTotals.emailMessagesSent}</p>
                    <p>{t("WhatsApp messages sent:", "Messages WhatsApp envoyes :", "Gesendete WhatsApp-Nachrichten:", "Mensajes de WhatsApp enviados:", "Mensagens de WhatsApp enviadas:")} {data.usage.channelTotals.whatsappMessagesSent}</p>
                    <p>{t("Total messages sent:", "Total des messages envoyes :", "Gesamt gesendete Nachrichten:", "Total de mensajes enviados:", "Total de mensagens enviadas:")} {data.usage.channelTotals.totalMessagesSent}</p>
                  </div>
                ) : (
                  <p className="pt-2 text-sm text-muted-foreground">{t("Usage counters are not available yet for this tenant.", "Les compteurs d'utilisation ne sont pas encore disponibles pour ce locataire.", "Nutzungszaehler sind fuer diesen Mandanten noch nicht verfuegbar.", "Los contadores de uso aún no estan disponibles para este tenant.", "Os contadores de utilização ainda não estão disponiveis para este tenant.")}</p>
                )}
              </div>
            )}
          </section>
        </div>

        <aside className="col-span-12 lg:col-span-4">
          <div className="space-y-8 rounded-xl bg-muted/30 p-6 lg:sticky lg:top-6">
            <section className="space-y-3">
              <h3 className="text-base font-semibold text-foreground">{t("Subscription", "Abonnement", "Abonnement", "Suscripción", "Subscrição")}</h3>
              {isLoading || !data ? (
                <Skeleton className="h-32 rounded-lg" />
              ) : (
                <div className="space-y-2 text-sm text-muted-foreground">
                  <p className="flex items-center justify-between gap-3">
                    <span>{t("Plan", "Forfait", "Plan", "Plan", "Plano")}</span>
                    <span className="font-medium text-foreground">{data.subscription.plan || "-"}</span>
                  </p>
                  <p className="flex items-center justify-between gap-3">
                    <span>{t("Status", "Statut", "Status", "Estado", "Estado")}</span>
                    <span className="font-medium text-foreground">{data.subscription.status ? localizeAdminStatus(data.subscription.status, language) : "-"}</span>
                  </p>
                  <p className="flex items-center justify-between gap-3">
                    <span>{t("Billing interval", "Intervalle de facturation", "Abrechnungsintervall", "Intervalo de facturación", "Intervalo de faturação")}</span>
                    <span className="font-medium text-foreground">{data.subscription.billingInterval || "-"}</span>
                  </p>
                  <p className="flex items-center justify-between gap-3">
                    <span>{t("Current cycle", "Cycle actuel", "Aktueller Zyklus", "Ciclo actual", "Ciclo atual")}</span>
                    <span className="text-right font-medium text-foreground">
                      {data.subscription.currentCycleStartAt && data.subscription.currentCycleEndAt
                        ? `${formatDateDMY(new Date(data.subscription.currentCycleStartAt), LANGUAGE_LOCALES[language])} - ${formatDateDMY(
                            new Date(data.subscription.currentCycleEndAt), LANGUAGE_LOCALES[language]
                          )}`
                        : "-"}
                    </span>
                  </p>
                  <p className="flex items-center justify-between gap-3">
                    <span>{t("Provider", "Fournisseur", "Anbieter", "Proveedor", "Fornecedor")}</span>
                    <span className="font-medium text-foreground">{data.billing.provider ? localizeAdminProvider(data.billing.provider, language) : "-"}</span>
                  </p>
                  <p className="flex items-center justify-between gap-3">
                    <span>{t("Webhook health", "Sante webhook", "Webhook-Zustand", "Salud del webhook", "Saude do webhook")}</span>
                    <span className="font-medium text-foreground">{data.billing.webhookHealth}</span>
                  </p>
                </div>
              )}
            </section>

            <section id="tenant-logs" className="space-y-3">
              <h3 className="text-base font-semibold text-foreground">{t("Logs", "Journaux", "Protokolle", "Registros", "Registos")}</h3>
              {isLoading || !data ? (
                <Skeleton className="h-44 rounded-lg" />
              ) : data.logs.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
                  {t("No logs for this tenant yet.", "Aucun journal pour ce locataire pour le moment.", "Noch keine Protokolle fuer diesen Mandanten.", "Aún no hay registros para este tenant.", "Ainda não ha registos para este tenant.")}
                </p>
              ) : (
                <div className="max-h-[300px] space-y-2 overflow-y-auto pr-1">
                  {data.logs.map((entry) => (
                    <div key={`${entry.source}-${entry.id}`} className="space-y-1 rounded-lg border border-border/70 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="min-w-0 break-words text-sm font-semibold text-foreground">{localizeAdminActionLabel(entry.action, language, entry.action)}</p>
                        <Badge variant={entry.source === "audit" ? "roleUser" : "warning"}>
                          {localizeAdminSource(entry.source, language)}
                        </Badge>
                      </div>
                      <p className="break-all text-xs text-muted-foreground">
                        {formatDateTimeDMY(new Date(entry.createdAt), LANGUAGE_LOCALES[language])}
                        {entry.actorUserId ? ` - actor ${entry.actorUserId}` : ""}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        </aside>
      </div>

      <Modal open={showSuspend} onClose={() => !savingAction && setShowSuspend(false)} title={t("Suspend tenant", "Suspendre le locataire", "Mandanten sperren", "Suspender tenant", "Suspender tenant")}>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {t("This tenant will be blocked from login and API access until reactivated.", "Ce locataire sera bloque de la connexion et de l'accès API jusqu'a sa reactivation.", "Dieser Mandant wird bis zur Reaktivierung fuer Login und API-Zugriff gesperrt.", "Este tenant quedara bloqueado del inicio de sesión y del acceso a la API hasta ser reactivado.", "Este tenant ficara bloqueado do inicio de sessão e do acesso a API at? ser reativado.")}
          </p>
          <Input
            label={t("Reason (optional)", "Raison (optionnelle)", "Grund (optional)", "Motivo (opcional)", "Motivo (opcional)")}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder={t("Policy, abuse, compliance...", "Politique, abus, conformité...", "Richtlinie, Missbrauch, Compliance...", "Política, abuso, cumplimiento...", "Política, abuso, conformidade...")}
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setShowSuspend(false)}>
              {t("Cancel", "Annuler", "Abbrechen", "Cancelar", "Cancelar")}
            </Button>
            <Button onClick={() => triggerAction("suspend")} loading={savingAction}>
              {t("Suspend tenant", "Suspendre le locataire", "Mandanten sperren", "Suspender tenant", "Suspender tenant")}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={showReactivate} onClose={() => !savingAction && setShowReactivate(false)} title={t("Reactivate tenant", "Reactiver le locataire", "Mandanten reaktivieren", "Reactivar tenant", "Reativar tenant")}>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {t("Reactivating will restore tenant login and API access immediately.", "La reactivation restaurera immediatement la connexion et l'accès API du locataire.", "Die Reaktivierung stellt Login und API-Zugriff des Mandanten sofort wieder her.", "Reactivar restaurara inmediatamente el inicio de sesión y el acceso a la API del tenant.", "Reativar ira restaurar imediatamente o inicio de sessão e o acesso a API do tenant.")}
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setShowReactivate(false)}>
              {t("Cancel", "Annuler", "Abbrechen", "Cancelar", "Cancelar")}
            </Button>
            <Button onClick={() => triggerAction("reactivate")} loading={savingAction}>
              {t("Reactivate tenant", "Reactiver le locataire", "Mandanten reaktivieren", "Reactivar tenant", "Reativar tenant")}
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmImpersonationModal
        open={showImpersonationModal}
        onClose={() => {
          if (startingImpersonation) return;
          setShowImpersonationModal(false);
        }}
        onConfirm={startImpersonation}
        tenantName={data?.tenant.name || "Unknown tenant"}
      />
    </div>
  );
}

