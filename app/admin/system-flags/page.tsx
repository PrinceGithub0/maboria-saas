"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { Skeleton } from "@/components/ui/skeleton";
import { useLanguage } from "@/components/providers/language-provider";
import { localizeAdminServerMessage, localizeAdminStatus } from "@/lib/admin/localization";
import { formatDateTimeDMY } from "@/lib/date";
import { LANGUAGE_LOCALES, type CompleteLocalizedText } from "@/lib/i18n";

type SystemFlag =
  | "maintenance_mode"
  | "allow_signup"
  | "payments_enabled"
  | "automation_enabled"
  | "automation_replay_enabled"
  | "ai_enabled"
  | "support_enabled"
  | "admin_notifications_enabled"
  | "system_logs_enabled"
  | "impersonation_enabled"
  | "webhooks_ingest_enabled"
  | "exports_enabled";

type ActorRole = "OPS_ADMIN" | "SUPER_ADMIN" | "USER";

type FlagRow = {
  key: SystemFlag;
  value: boolean;
  dangerous: boolean;
  lastModifiedAt: string | null;
  lastModifiedBy: { id: string; name: string | null; email: string | null } | null;
};

type FlagsResponse = {
  flags: FlagRow[];
  actorRole: ActorRole;
};

type HistoryItem = {
  id: string;
  flagKey: SystemFlag;
  oldValue: boolean;
  newValue: boolean;
  actorUserId: string;
  actorName: string | null;
  actorEmail: string | null;
  createdAt: string;
};

type HistoryResponse = { history: HistoryItem[] };

const fetcher = async <T,>(url: string): Promise<T> => {
  const res = await fetch(url, { cache: "no-store" });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(String((payload as { error?: string }).error || `Request failed (${res.status})`));
  return payload as T;
};

const text = (en: string, fr: string, de: string, es: string, pt: string): CompleteLocalizedText => ({ en, fr, de, es, pt });

const FLAG_DEFS: Array<{
  key: SystemFlag;
  section: "Platform" | "Billing" | "Automation" | "Infrastructure" | "Admin Tools" | "AI";
  label: CompleteLocalizedText;
  description: CompleteLocalizedText;
}> = [
  { key: "maintenance_mode", section: "Platform", label: text("Maintenance Mode", "Mode maintenance", "Wartungsmodus", "Modo mantenimiento", "Modo de manutencao"), description: text("Block non-admin traffic platform-wide.", "Bloquer le trafic non admin sur toute la plateforme.", "Nicht-Admin-Datenverkehr plattformweit blockieren.", "Bloquear el trafico no administrativo en toda la plataforma.", "Bloquear trafego não administrativo em toda a plataforma.") },
  { key: "allow_signup", section: "Platform", label: text("Allow Signups", "Autoriser les inscriptions", "Registrierungen zulassen", "Permitir registros", "Permitir registos"), description: text("Allow new account registration routes.", "Autoriser les routes d'inscription de nouveaux comptes.", "Routen für neue Kontoregistrierungen zulassen.", "Permitir las rutas de registro de nuevas cuentas.", "Permitir rotas de registo de novas contas.") },
  { key: "payments_enabled", section: "Billing", label: text("Payments", "Paiements", "Zahlungen", "Pagos", "Pagamentos"), description: text("Enable checkout and subscription write flows.", "Activer les flux de paiement et d'ecriture d'abonnement.", "Checkout- und Schreibablaufe für Abonnements aktivieren.", "Activar los flujos de pago y escritura de suscripciones.", "Ativar fluxos de checkout e escrita de subscricoes.") },
  { key: "automation_enabled", section: "Automation", label: text("Automation Engine", "Moteur d'automatisation", "Automatisierungs-Engine", "Motor de automatización", "Motor de automação"), description: text("Allow automation processing and execution.", "Autoriser le traitement et l'ex?cution de l'automatisation.", "Verarbeitung und Ausfuhrung von Automatisierungen zulassen.", "Permitir el procesamiento y la ejecuci?n de automatizaciones.", "Permitir o processamento e a execu??o de automatizacoes.") },
  { key: "automation_replay_enabled", section: "Automation", label: text("Automation Replay", "Relecture d'automatisation", "Automatisierungs-Wiederholung", "Repeticion de automatización", "Repeticao de automação"), description: text("Allow replay endpoints for failed runs.", "Autoriser les points de terminaison de relecture pour les executions échouées.", "Replay-Endpunkte für fehlgeschlagene Ausfuhrungen zulassen.", "Permitir endpoints de repeticion para ejecuciones fallidas.", "Permitir endpoints de repeticao para execucoes falhadas.") },
  { key: "webhooks_ingest_enabled", section: "Infrastructure", label: text("Webhooks Ingest", "Ingestion des webhooks", "Webhook-Erfassung", "Ingestion de webhooks", "Ingestao de webhooks"), description: text("Allow non-critical webhook ingestion routes.", "Autoriser les routes d'ingestion de webhooks non critiques.", "Nicht-kritische Webhook-Erfassungsrouten zulassen.", "Permitir rutas de ingestion de webhooks no criticos.", "Permitir rotas de ingestao de webhooks não criticos.") },
  { key: "impersonation_enabled", section: "Admin Tools", label: text("Impersonation", "Usurpation", "Identit?tswechsel", "Suplantacion", "Representacao"), description: text("Allow admin impersonation start endpoint.", "Autoriser le point de terminaison de demarrage de l'usurpation admin.", "Start-Endpunkt für Admin-Identit?tswechsel zulassen.", "Permitir el endpoint de inicio de suplantacion administrativa.", "Permitir o endpoint de inicio de representacao administrativa.") },
  { key: "admin_notifications_enabled", section: "Admin Tools", label: text("Admin Notifications", "Notifications admin", "Admin-Benachrichtigungen", "Notificaciones admin", "Notificacoes admin"), description: text("Enable admin notifications ingestion/listing.", "Activer l'ingestion et la liste des notifications admin.", "Erfassung und Auflistung von Admin-Benachrichtigungen aktivieren.", "Activar la ingestion y el listado de notificaciones admin.", "Ativar ingestao e listagem de notificacoes admin.") },
  { key: "system_logs_enabled", section: "Admin Tools", label: text("System Logs", "Journaux systeme", "Systemprotokolle", "Registros del sistema", "Registos do sistema"), description: text("Enable system logs export APIs.", "Activer les API d'export des journaux systeme.", "Export-APIs für Systemprotokolle aktivieren.", "Activar las API de exportacion de registros del sistema.", "Ativar APIs de exportacao de registos do sistema.") },
  { key: "exports_enabled", section: "Admin Tools", label: text("Exports", "Exports", "Exporte", "Exportaciones", "Exportacoes"), description: text("Enable CSV/JSON export routes.", "Activer les routes d'export CSV/JSON.", "CSV/JSON-Exportrouten aktivieren.", "Activar las rutas de exportacion CSV/JSON.", "Ativar rotas de exportacao CSV/JSON.") },
  { key: "ai_enabled", section: "AI", label: text("AI Assistant", "Assistant IA", "KI-Assistent", "Asistente de IA", "Assistente de IA"), description: text("Enable AI assistant APIs and related features.", "Activer les API de l'assistant IA et les fonctionnalites associees.", "APIs des KI-Assistenten und zugehorige Funktionen aktivieren.", "Activar las API del asistente de IA y las funciones relacionadas.", "Ativar APIs do assistente de IA e funcionalidades relacionadas.") },
  { key: "support_enabled", section: "Admin Tools", label: text("Support", "Support", "Support", "Soporte", "Suporte"), description: text("Enable support ticket create/reply routes.", "Activer les routes de cr?ation et de réponse des tickets de support.", "Routen zum Erstellen und Beantworten von Support-Tickets aktivieren.", "Activar las rutas para crear y responder tickets de soporte.", "Ativar rotas de criacao e resposta de tickets de suporte.") },
];

const DANGEROUS_CONFIRM: Record<SystemFlag, { title: CompleteLocalizedText; body: CompleteLocalizedText }> = {
  maintenance_mode: {
    title: text("Enable Maintenance Mode?", "Activer le mode maintenance ?", "Wartungsmodus aktivieren?", "Activar el modo mantenimiento?", "Ativar o modo de manutencao?"),
    body: text("This blocks all non-admin traffic until disabled. Confirm to continue.", "Cela bloque tout le trafic non admin jusqu'a desactivation. Confirmez pour continuer.", "Dies blockiert den gesamten Nicht-Admin-Datenverkehr bis zur Deaktivierung. Bestatige, um fortzufahren.", "Esto bloquea todo el trafico no administrativo hasta desactivarlo. Confirma para continuar.", "Isto bloqueia todo o trafego não administrativo at? ser desativado. Confirme para continuar."),
  },
  payments_enabled: {
    title: text("Change Payments Flag?", "Modifier le drapeau paiements ?", "Zahlungs-Flag ?ndern?", "Cambiar el indicador de pagos?", "Alterar o indicador de pagamentos?"),
    body: text("Disabling payments stops checkout and subscription creation flows platform-wide.", "Desactiver les paiements arrete les flux de paiement et de cr?ation d'abonnement sur toute la plateforme.", "Das Deaktivieren von Zahlungen stoppt Checkout- und Abo-Erstellungsablaufe plattformweit.", "Desactivar los pagos detiene los flujos de checkout y creacion de suscripciones en toda la plataforma.", "Desativar pagamentos interrompe os fluxos de checkout e criacao de subscricoes em toda a plataforma."),
  },
  impersonation_enabled: {
    title: text("Change Impersonation Flag?", "Modifier le drapeau d'usurpation ?", "Identit?tswechsel-Flag ?ndern?", "Cambiar el indicador de suplantacion?", "Alterar o indicador de representacao?"),
    body: text("Disabling impersonation blocks support impersonation starts immediately.", "Desactiver l'usurpation bloque immediatement le demarrage des usurpations de support.", "Das Deaktivieren des Identitatswechsels blockiert sofort den Start von Support-Identitatswechseln.", "Desactivar la suplantacion bloquea de inmediato el inicio de suplantaciones de soporte.", "Desativar a representacao bloqueia imediatamente o inicio de representacoes de suporte."),
  },
  automation_replay_enabled: {
    title: text("Change Automation Replay Flag?", "Modifier le drapeau de relecture d'automatisation ?", "Automatisierungs-Replay-Flag ?ndern?", "Cambiar el indicador de repeticion de automatización?", "Alterar o indicador de repeticao de automação?"),
    body: text("Disabling replay blocks automation recovery replay endpoints.", "Desactiver la relecture bloque les points de terminaison de reprise d'automatisation.", "Das Deaktivieren des Replays blockiert Replay-Endpunkte für die Automatisierungswiederherstellung.", "Desactivar la repeticion bloquea los endpoints de recuperacion de automatizaciones.", "Desativar a repeticao bloqueia os endpoints de recuperacao da automação."),
  },
  allow_signup: { title: text("Change Signup Flag?", "Modifier le drapeau d'inscription ?", "Registrierungs-Flag ?ndern?", "Cambiar el indicador de registro?", "Alterar o indicador de registo?"), body: text("This changes account registration availability.", "Cela modifie la disponibilite des inscriptions de compte.", "Dies andert die Verfügbarkeit der Kontoregistrierung.", "Esto cambia la disponibilidad del registro de cuentas.", "Isto altera a disponibilidade do registo de contas.") },
  automation_enabled: { title: text("Change Automation Engine Flag?", "Modifier le drapeau du moteur d'automatisation ?", "Automatisierungs-Engine-Flag ?ndern?", "Cambiar el indicador del motor de automatización?", "Alterar o indicador do motor de automação?"), body: text("This changes automation execution and scheduler behavior.", "Cela modifie l'ex?cution de l'automatisation et le comportement du planificateur.", "Dies andert die Automatisierungsausfuhrung und das Verhalten des Planers.", "Esto cambia la ejecuci?n de automatizaciones y el comportamiento del programador.", "Isto altera a execu??o da automação e o comportamento do agendador.") },
  ai_enabled: { title: text("Change AI Flag?", "Modifier le drapeau IA ?", "KI-Flag ?ndern?", "Cambiar el indicador de IA?", "Alterar o indicador de IA?"), body: text("This changes AI assistant API availability.", "Cela modifie la disponibilite des API de l'assistant IA.", "Dies andert die Verfügbarkeit der APIs des KI-Assistenten.", "Esto cambia la disponibilidad de las API del asistente de IA.", "Isto altera a disponibilidade das APIs do assistente de IA.") },
  support_enabled: { title: text("Change Support Flag?", "Modifier le drapeau support ?", "Support-Flag ?ndern?", "Cambiar el indicador de soporte?", "Alterar o indicador de suporte?"), body: text("This changes support ticket create/reply availability.", "Cela modifie la disponibilite de cr?ation et de réponse des tickets de support.", "Dies andert die Verfügbarkeit zum Erstellen und Beantworten von Support-Tickets.", "Esto cambia la disponibilidad de creacion y respuesta de tickets de soporte.", "Isto altera a disponibilidade de criacao e resposta de tickets de suporte.") },
  admin_notifications_enabled: { title: text("Change Admin Notifications Flag?", "Modifier le drapeau des notifications admin ?", "Admin-Benachrichtigungs-Flag ?ndern?", "Cambiar el indicador de notificaciones admin?", "Alterar o indicador de notificacoes admin?"), body: text("This changes admin notifications listing and ingestion.", "Cela modifie la liste et l'ingestion des notifications admin.", "Dies andert die Auflistung und Erfassung von Admin-Benachrichtigungen.", "Esto cambia el listado y la ingestion de notificaciones admin.", "Isto altera a listagem e ingestao de notificacoes admin.") },
  system_logs_enabled: { title: text("Change System Logs Flag?", "Modifier le drapeau des journaux systeme ?", "Systemprotokoll-Flag ?ndern?", "Cambiar el indicador de registros del sistema?", "Alterar o indicador de registos do sistema?"), body: text("This changes logs export endpoint availability.", "Cela modifie la disponibilite des points de terminaison d'export des journaux.", "Dies andert die Verfügbarkeit der Export-Endpunkte für Protokolle.", "Esto cambia la disponibilidad de los endpoints de exportacion de registros.", "Isto altera a disponibilidade dos endpoints de exportacao de registos.") },
  webhooks_ingest_enabled: { title: text("Change Webhooks Flag?", "Modifier le drapeau des webhooks ?", "Webhook-Flag ?ndern?", "Cambiar el indicador de webhooks?", "Alterar o indicador de webhooks?"), body: text("This changes non-critical webhook ingest endpoints.", "Cela modifie les points de terminaison d'ingestion de webhooks non critiques.", "Dies andert nicht-kritische Webhook-Erfassungsendpunkte.", "Esto cambia los endpoints de ingestion de webhooks no criticos.", "Isto altera os endpoints de ingestao de webhooks não criticos.") },
  exports_enabled: { title: text("Change Exports Flag?", "Modifier le drapeau des exports ?", "Export-Flag ?ndern?", "Cambiar el indicador de exportaciones?", "Alterar o indicador de exportacoes?"), body: text("This changes CSV/JSON export endpoint availability.", "Cela modifie la disponibilite des points de terminaison d'export CSV/JSON.", "Dies andert die Verfügbarkeit der CSV/JSON-Export-Endpunkte.", "Esto cambia la disponibilidad de los endpoints de exportacion CSV/JSON.", "Isto altera a disponibilidade dos endpoints de exportacao CSV/JSON.") },
};

export default function SystemFlagsPage() {
  const { language, t } = useLanguage();
  const { data, isLoading, mutate } = useSWR<FlagsResponse>("/api/admin/system-flags", fetcher);
  const [historyOpen, setHistoryOpen] = useState(false);
  const { data: historyData, isLoading: historyLoading, mutate: mutateHistory } = useSWR<HistoryResponse>(
    historyOpen ? "/api/admin/system-flags/history?take=50" : null,
    fetcher
  );
  const [pending, setPending] = useState<{ key: SystemFlag; value: boolean } | null>(null);
  const [actionLoading, setActionLoading] = useState<SystemFlag | "refresh" | null>(null);
  const [actionStatus, setActionStatus] = useState<{ message: string; variant: "success" | "error" | "info" } | null>(null);

  const actorRole: ActorRole = data?.actorRole || "USER";
  const sectioned = useMemo(() => {
    const flags = Array.isArray(data?.flags) ? data.flags : [];
    const map = new Map(flags.map((item) => [item.key, item]));
    return FLAG_DEFS.reduce<Record<string, Array<(typeof FLAG_DEFS)[number] & { value: boolean; meta: FlagRow | null }>>>(
      (acc, def) => {
        if (!acc[def.section]) acc[def.section] = [];
        const meta = map.get(def.key) || null;
        acc[def.section].push({ ...def, value: meta?.value ?? false, meta });
        return acc;
      },
      {}
    );
  }, [data?.flags]);

  const canToggle = () => actorRole === "SUPER_ADMIN";
  const sectionLabel = (section: "Platform" | "Billing" | "Automation" | "Infrastructure" | "Admin Tools" | "AI") => {
    if (section === "Platform") return t(text("Platform", "Plateforme", "Plattform", "Plataforma", "Plataforma"));
    if (section === "Billing") return t(text("Billing", "Facturation", "Abrechnung", "Facturación", "Faturação"));
    if (section === "Automation") return t(text("Automation", "Automatisation", "Automatisierung", "Automatización", "Automação"));
    if (section === "Infrastructure") return t(text("Infrastructure", "Infrastructure", "Infrastruktur", "Infraestructura", "Infraestrutura"));
    if (section === "Admin Tools") return t(text("Admin Tools", "Outils admin", "Admin-Werkzeuge", "Herramientas admin", "Ferramentas admin"));
    return t(text("AI", "IA", "KI", "IA", "IA"));
  };

  const submitFlag = async (key: SystemFlag, value: boolean) => {
    setActionLoading(key);
    setActionStatus(null);
    try {
      const res = await fetch("/api/admin/system-flags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, value }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          String(
            (payload as { error?: string }).error ||
              t("Unable to update flag.", "Impossible de mettre ? jour le drapeau.", "Flag kann nicht aktualisiert werden.", "No se puede actualizar el indicador.", "Não foi poss?vel atualizar o indicador.")
          )
        );
      }
      setActionStatus({
        message: t(
          text(
            `${key} updated.`,
            `${key} mis a jour.`,
            `${key} wurde aktualisiert.`,
            `${key} actualizado.`,
            `${key} atualizado.`
          )
        ),
        variant: "success",
      });
      await mutate();
      if (historyOpen) await mutateHistory();
    } catch (error) {
      setActionStatus({
        message: localizeAdminServerMessage(
          error instanceof Error ? error.message : "",
          language,
          t("Unable to update flag.", "Impossible de mettre \u00e0 jour l'indicateur.", "Flag kann nicht aktualisiert werden.", "No se puede actualizar el indicador.", "N\u00e3o foi poss\u00edvel atualizar o indicador.")
        ),
        variant: "error",
      });
    } finally {
      setActionLoading(null);
      setPending(null);
    }
  };

  const refreshCache = async () => {
    setActionLoading("refresh");
    setActionStatus(null);
    try {
      const res = await fetch("/api/admin/system-flags", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "refresh" }),
      });
      if (!res.ok) {
        throw new Error(
          t(
            "Unable to refresh flags cache.",
            "Impossible de rafraichir le cache des drapeaux.",
            "Flag-Cache kann nicht aktualisiert werden.",
            "No se puede actualizar la cache de indicadores.",
            "Não foi poss?vel atualizar a cache de indicadores."
          )
        );
      }
      await mutate();
      setActionStatus({
        message: t("Flags cache refreshed.", "Cache des drapeaux rafraichi.", "Flag-Cache aktualisiert.", "Cache de indicadores actualizada.", "Cache de indicadores atualizada."),
        variant: "success",
      });
    } catch (error) {
      setActionStatus({
        message: localizeAdminServerMessage(
          error instanceof Error ? error.message : "",
          language,
          t(
            "Unable to refresh flags cache.",
            "Impossible de rafraichir le cache des drapeaux.",
            "Flag-Cache kann nicht aktualisiert werden.",
            "No se puede actualizar la cache de indicadores.",
            "N\u00e3o foi poss\u00edvel atualizar a cache de indicadores."
          )
        ),
        variant: "error",
      });
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="space-y-4 px-6 py-6 max-md:px-4 max-md:py-4">
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-indigo-600 dark:text-indigo-300">{t("Admin", "Admin", "Admin", "Admin", "Admin")}</p>
        <h1 className="text-3xl font-semibold text-foreground">{t("System flags", "Drapeaux systeme", "System-Flags", "Indicadores del sistema", "Indicadores do sistema")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t("Platform kill-switch control plane with audit trail.", "Plan de controle des kill-switch avec piste d'audit.", "Kontrollebene für Plattform-Kill-Switches mit Audit-Trail.", "Plano de control de interruptores globales de la plataforma con rastro de auditoria.", "Plano de controlo de kill-switches da plataforma com trilho de auditoria.")}</p>
      </div>

      <Card title={t("Control plane", "Plan de controle", "Kontrollebene", "Plano de control", "Plano de controlo")}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">{t("Only SUPER_ADMIN can toggle system flags.", "Seul SUPER_ADMIN peut activer ou desactiver les drapeaux systeme.", "Nur SUPER_ADMIN kann System-Flags umschalten.", "Solo SUPER_ADMIN puede cambiar los indicadores del sistema.", "Apenas SUPER_ADMIN pode alternar os indicadores do sistema.")}</p>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setHistoryOpen(true)}>
              {t("View Flag History", "Voir l'historique des drapeaux", "Flag-Verlauf ansehen", "Ver historial de indicadores", "Ver histórico dos indicadores")}
            </Button>
            <Button variant="secondary" size="sm" loading={actionLoading === "refresh"} onClick={refreshCache}>
              {t("Refresh cache", "Rafraichir le cache", "Cache aktualisieren", "Actualizar cache", "Atualizar cache")}
            </Button>
          </div>
        </div>

        {actionStatus ? (
          <div className="mb-3">
            <Alert variant={actionStatus.variant}>{actionStatus.message}</Alert>
          </div>
        ) : null}

        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} className="h-20 rounded-xl" />
            ))}
          </div>
        ) : (
          <div className="space-y-5">
            {Object.entries(sectioned).map(([section, items]) => (
              <section key={section} className="space-y-2">
                <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-muted-foreground">{sectionLabel(section as "Platform" | "Billing" | "Automation" | "Infrastructure" | "Admin Tools" | "AI")}</h2>
                <div className="space-y-2">
                  {items.map((item) => (
                    <div key={item.key} className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-muted/25 px-4 py-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold text-foreground">{t(item.label)}</p>
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                              item.value
                                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300"
                                : "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300"
                            }`}
                          >
                            {localizeAdminStatus(item.value ? "ACTIVE" : "DISABLED", language)}
                          </span>
                          {item.meta?.dangerous ? (
                            <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:bg-amber-500/20 dark:text-amber-300">
                              {t("dangerous", "dangereux", "kritisch", "peligroso", "perigoso")}
                            </span>
                          ) : null}
                        </div>
                        <p className="text-xs text-muted-foreground">{t(item.description)}</p>
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          {t("Last modified:", "Derni?re modification :", "Zuletzt geaendert:", "?ltima modificacion:", "?ltima alteracao:")}{" "}
                          {item.meta?.lastModifiedAt
                            ? `${formatDateTimeDMY(new Date(item.meta.lastModifiedAt), LANGUAGE_LOCALES[language])} ${t("by", "par", "von", "por", "por")} ${item.meta.lastModifiedBy?.name || item.meta.lastModifiedBy?.email || t("unknown", "inconnu", "unbekannt", "desconocido", "desconhecido")}`
                            : t("never", "jamais", "nie", "nunca", "nunca")}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          if (!canToggle()) return;
                          if (item.meta?.dangerous) {
                            setPending({ key: item.key, value: !item.value });
                            return;
                          }
                          void submitFlag(item.key, !item.value);
                        }}
                        disabled={!canToggle() || actionLoading === item.key}
                        className={`relative inline-flex h-7 w-12 items-center rounded-full border transition ${
                          item.value ? "border-emerald-500/40 bg-emerald-500/80" : "border-border bg-muted"
                        } ${!canToggle() ? "cursor-not-allowed opacity-40" : ""}`}
                        aria-pressed={item.value}
                      >
                        <span
                          className={`inline-block h-5 w-5 transform rounded-full bg-background shadow transition ${
                            item.value ? "translate-x-6" : "translate-x-1"
                          }`}
                        />
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </Card>

      <Modal
        open={Boolean(pending)}
        onClose={() => {
          if (actionLoading) return;
          setPending(null);
        }}
        title={pending ? t(DANGEROUS_CONFIRM[pending.key].title) : t("Confirm change", "Confirmer la modification", "Änderung bestätigen", "Confirmar cambio", "Confirmar alteração")}
      >
        {pending ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">{t(DANGEROUS_CONFIRM[pending.key].body)}</p>
            <div className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2 text-xs">
              {t("Flag:", "Drapeau :", "Flag:", "Indicador:", "Indicador:")} <span className="font-mono">{pending.key}</span> {" -> "}
              <span className="font-semibold">{pending.value ? t("true", "vrai", "wahr", "verdadero", "verdadeiro") : t("false", "faux", "falsch", "falso", "falso")}</span>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setPending(null)} disabled={Boolean(actionLoading)}>
                {t("Cancel", "Annuler", "Abbrechen", "Cancelar", "Cancelar")}
              </Button>
              <Button
                variant="danger"
                loading={actionLoading === pending.key}
                onClick={() => void submitFlag(pending.key, pending.value)}
              >
                {t("Confirm", "Confirmer", "Bestätigen", "Confirmar", "Confirmar")}
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal open={historyOpen} onClose={() => setHistoryOpen(false)} title={t("System Flag History", "Historique des drapeaux systeme", "System-Flag-Verlauf", "Historial de indicadores del sistema", "Histórico dos indicadores do sistema")}>
        {historyLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} className="h-12 rounded-md" />
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {historyData?.history?.length ? (
              historyData.history.map((row) => (
                <div key={row.id} className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2 text-xs">
                  <p className="font-mono text-foreground">{row.flagKey}</p>
                  <p className="text-muted-foreground">
                    {row.oldValue ? t("true", "vrai", "wahr", "verdadero", "verdadeiro") : t("false", "faux", "falsch", "falso", "falso")} {" -> "} {row.newValue ? t("true", "vrai", "wahr", "verdadero", "verdadeiro") : t("false", "faux", "falsch", "falso", "falso")}
                  </p>
                  <p className="text-muted-foreground">
                    {formatDateTimeDMY(new Date(row.createdAt), LANGUAGE_LOCALES[language])} - {row.actorName || row.actorEmail || row.actorUserId}
                  </p>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">{t("No flag history found.", "Aucun historique de drapeau trouve.", "Kein Flag-Verlauf gefunden.", "No se encontro historial de indicadores.", "Nenhum histórico de indicadores encontrado.")}</p>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
