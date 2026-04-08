"use client";

import { useMemo, useState } from "react";

import { useLanguage } from "@/components/providers/language-provider";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  getEInvoiceCountryProductionSignoff,
  summarizeEInvoiceProductionSignoff,
} from "@/lib/einvoicing/production-signoffs";
import { getEInvoiceProviderDefinition } from "@/lib/einvoicing/provider-registry";
import { getEInvoiceRolloutItem } from "@/lib/einvoicing/rollout-matrix";
import type { InvoiceEInvoicingSnapshot } from "@/lib/einvoicing/types";
import { LANGUAGE_LOCALES } from "@/lib/i18n";

type Props = {
  invoiceId: string;
  initialSnapshot: InvoiceEInvoicingSnapshot | null;
  invoiceStatus: string;
};

const badgeToneByStatus: Record<string, string> = {
  NOT_REQUIRED: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
  NOT_CONFIGURED: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
  READY: "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200",
  QUEUED: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-200",
  SUBMITTED: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-200",
  ACCEPTED: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
  REJECTED: "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200",
  VALIDATION_FAILED: "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200",
  CANCELLED: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
};

export function EInvoicingStatusCard({ invoiceId, initialSnapshot, invoiceStatus }: Props) {
  const [snapshot, setSnapshot] = useState<InvoiceEInvoicingSnapshot | null>(initialSnapshot);
  const [busyAction, setBusyAction] = useState<"sync" | "retry" | null>(null);
  const [status, setStatus] = useState<{ type: "success" | "error" | "info"; message: string } | null>(null);
  const { language, t } = useLanguage();

  const provider = useMemo(
    () => getEInvoiceProviderDefinition(snapshot?.providerKey || null),
    [snapshot?.providerKey]
  );
  const rollout = useMemo(() => getEInvoiceRolloutItem(snapshot?.country || null), [snapshot?.country]);
  const productionSignoff = useMemo(
    () => getEInvoiceCountryProductionSignoff(snapshot?.country || null),
    [snapshot?.country]
  );
  const signoffSummary = useMemo(
    () => summarizeEInvoiceProductionSignoff(productionSignoff),
    [productionSignoff]
  );

  if (!snapshot || snapshot.requirement === "NOT_REQUIRED") {
    return null;
  }

  const badgeTone = badgeToneByStatus[String(snapshot.status || "").toUpperCase()] || badgeToneByStatus.READY;
  const canSync = Boolean(snapshot.submissionId) && Boolean(snapshot.statusSyncAvailable || provider?.supportsStatusSync);
  const canRetry =
    Boolean(provider?.liveSubmissionAvailable) &&
    snapshot.status !== "ACCEPTED" &&
    snapshot.status !== "CANCELLED" &&
    (snapshot.requirement !== "REQUIRED" || snapshot.productionReady);
  const stageLabel = provider?.completionStage || rollout?.completionStage || null;
  const capabilitySummary = provider?.capabilitySummary || rollout?.notes || null;
  const promotionStateLabel = productionSignoff?.promotionState?.replace(/_/g, " ") || null;

  const localizeBoolean = (value: boolean) =>
    value ? t("Yes", "Oui", "Ja", "Sí", "Sim") : t("No", "Non", "Nein", "No", "Não");

  const localizeStatus = (value: string) => {
    const normalized = String(value || "").toUpperCase();
    const labels: Record<string, string> = {
      NOT_REQUIRED: t("Not required", "Non requis", "Nicht erforderlich", "No requerido", "Não obrigatório"),
      NOT_CONFIGURED: t("Not configured", "Non configuré", "Nicht konfiguriert", "No configurado", "Não configurado"),
      READY: t("Ready", "Prêt", "Bereit", "Listo", "Pronto"),
      QUEUED: t("Queued", "En file d'attente", "In Warteschlange", "En cola", "Em fila"),
      SUBMITTED: t("Submitted", "Soumis", "Übermittelt", "Enviado", "Submetido"),
      ACCEPTED: t("Accepted", "Accepté", "Akzeptiert", "Aceptado", "Aceite"),
      REJECTED: t("Rejected", "Rejeté", "Abgelehnt", "Rechazado", "Rejeitado"),
      VALIDATION_FAILED: t(
        "Validation failed",
        "Échec de validation",
        "Validierung fehlgeschlagen",
        "Error de validación",
        "Falha na validação"
      ),
      CANCELLED: t("Cancelled", "Annulé", "Storniert", "Cancelado", "Cancelado"),
    };
    return labels[normalized] || normalized.replace(/_/g, " ");
  };

  const localizeRequirement = (value: string) => {
    const normalized = String(value || "").toUpperCase();
    const labels: Record<string, string> = {
      REQUIRED: t("Required", "Requis", "Erforderlich", "Requerido", "Obrigatório"),
      NOT_REQUIRED: t("Not required", "Non requis", "Nicht erforderlich", "No requerido", "Não obrigatório"),
      CONDITIONAL: t("Conditional", "Conditionnel", "Bedingt", "Condicional", "Condicional"),
      OPTIONAL: t("Optional", "Facultatif", "Optional", "Opcional", "Opcional"),
      MANDATORY: t("Mandatory", "Obligatoire", "Verpflichtend", "Obligatorio", "Obrigatório"),
    };
    return labels[normalized] || normalized.replace(/_/g, " ").toLowerCase();
  };

  const localizeStage = (value: string | null | undefined) => {
    const normalized = String(value || "").toUpperCase();
    if (!normalized) {
      return t("Not classified", "Non classé", "Nicht klassifiziert", "Sin clasificar", "Não classificado");
    }
    const labels: Record<string, string> = {
      SCHEMA_ONLY: t("Schema only", "Schéma seul", "Nur Schema", "Solo esquema", "Só esquema"),
      AUTH_READY: t("Auth ready", "Auth prête", "Auth bereit", "Auth lista", "Auth pronta"),
      SUBMIT_READY: t("Submit ready", "Envoi prêt", "Versandbereit", "Listo para enviar", "Pronto para envio"),
      SYNC_READY: t("Sync ready", "Sync prête", "Sync bereit", "Listo para sincronizar", "Pronto para sincronizar"),
      CANCEL_READY: t("Cancel ready", "Annulation prête", "Storno bereit", "Listo para cancelar", "Pronto para cancelar"),
      PRODUCTION_READY: t("Production ready", "Prêt pour production", "Produktionsbereit", "Listo para producción", "Pronto para produção"),
    };
    return labels[normalized] || normalized.replace(/_/g, " ");
  };

  const formatDateTime = (value: string) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    try {
      return date.toLocaleString(LANGUAGE_LOCALES[language]);
    } catch {
      return date.toLocaleString();
    }
  };

  const runAction = async (action: "sync" | "retry") => {
    setBusyAction(action);
    setStatus(null);
    try {
      const res = await fetch(`/api/invoice/${encodeURIComponent(invoiceId)}/einvoicing/${action}`, {
        method: "POST",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatus({
          type: "error",
          message:
            data?.error ||
            t(
              "E-invoicing action failed.",
              "L'action de facturation électronique a échoué.",
              "Die E-Rechnungsaktion ist fehlgeschlagen.",
              "La acción de facturación electrónica falló.",
              "A ação de faturação eletrónica falhou."
            ),
        });
        return;
      }
      if (data?.eInvoicing) {
        setSnapshot(data.eInvoicing);
      }
      if (action === "retry" && data?.promotedToSent) {
        setStatus({
          type: "success",
          message: t(
            "E-invoice submitted successfully and the invoice was marked as sent.",
            "La facture électronique a été envoyée avec succès et la facture a été marquée comme envoyée.",
            "Die E-Rechnung wurde erfolgreich übermittelt und die Rechnung als gesendet markiert.",
            "La factura electrónica se envió correctamente y la factura quedó marcada como enviada.",
            "A fatura eletrónica foi enviada com sucesso e a fatura ficou marcada como enviada."
          ),
        });
        return;
      }
      setStatus({
        type: "success",
        message:
          action === "sync"
            ? t(
                "E-invoice status synced.",
                "Le statut de la facture électronique a été synchronisé.",
                "Der Status der E-Rechnung wurde synchronisiert.",
                "Se sincronizó el estado de la factura electrónica.",
                "O estado da fatura eletrónica foi sincronizado."
              )
            : t(
                "E-invoice submission retried.",
                "Nouvelle tentative d'envoi de la facture électronique effectuée.",
                "Die Übermittlung der E-Rechnung wurde erneut versucht.",
                "Se volvió a intentar el envío de la factura electrónica.",
                "Foi feita nova tentativa de envio da fatura eletrónica."
              ),
      });
    } catch {
      setStatus({
        type: "error",
        message: t(
          "E-invoicing action failed.",
          "L'action de facturation électronique a échoué.",
          "Die E-Rechnungsaktion ist fehlgeschlagen.",
          "La acción de facturación electrónica falló.",
          "A ação de faturação eletrónica falhou."
        ),
      });
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <section className="rounded-2xl border border-slate-200/80 bg-white/90 p-5 shadow-sm dark:border-slate-700/80 dark:bg-slate-950/70">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
            {t("E-Invoicing", "Facturation électronique", "E-Rechnungen", "Facturación electrónica", "Faturação eletrónica")}
          </p>
          <h2 className="text-lg font-semibold text-foreground">
            {provider?.displayName || snapshot.providerKey || t("Provider", "Prestataire", "Anbieter", "Proveedor", "Fornecedor")}{" "}
            {snapshot.country
              ? t(
                  `for ${snapshot.country}`,
                  `pour ${snapshot.country}`,
                  `für ${snapshot.country}`,
                  `para ${snapshot.country}`,
                  `para ${snapshot.country}`
                )
              : ""}
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            {`${t("Requirement", "Exigence", "Anforderung", "Requisito", "Requisito")}: ${localizeRequirement(snapshot.requirement)}${
              invoiceStatus
                ? ` • ${t("Invoice status", "Statut de facture", "Rechnungsstatus", "Estado de la factura", "Estado da fatura")}: ${localizeStatus(String(invoiceStatus))}`
                : ""
            }`}
          </p>
        </div>
        <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${badgeTone}`}>
          {localizeStatus(snapshot.status)}
        </span>
      </div>

      <div className="mt-4 grid gap-3 text-sm text-slate-700 dark:text-slate-200 md:grid-cols-2">
        <div className="rounded-xl border border-slate-200/70 bg-slate-50/80 p-3 dark:border-slate-800 dark:bg-slate-900/70">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
            {t("Provider", "Prestataire", "Anbieter", "Proveedor", "Fornecedor")}
          </p>
          <p className="mt-1 font-medium">
            {provider?.displayName || snapshot.providerKey || t("Not set", "Non défini", "Nicht festgelegt", "No definido", "Não definido")}
          </p>
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            {`${t("Format", "Format", "Format", "Formato", "Formato")}: ${
              snapshot.documentFormat || t("Not set", "Non défini", "Nicht festgelegt", "No definido", "Não definido")
            } • ${t("Clearance", "Contrôle", "Freigabe", "Validación", "Validação")}: ${localizeBoolean(snapshot.supportsClearance)}`}
          </p>
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            {`${t("Stage", "Étape", "Stufe", "Etapa", "Etapa")}: ${localizeStage(stageLabel)} • ${t(
              "Live submit",
              "Envoi en direct",
              "Live-Übermittlung",
              "Envío en vivo",
              "Envio em direto"
            )}: ${localizeBoolean(Boolean(provider?.liveSubmissionAvailable))} • ${t(
              "Sync",
              "Sync",
              "Sync",
              "Sincronización",
              "Sincronização"
            )}: ${localizeBoolean(Boolean(snapshot.statusSyncAvailable || provider?.supportsStatusSync))} • ${t(
              "Cancel",
              "Annulation",
              "Storno",
              "Cancelación",
              "Cancelamento"
            )}: ${localizeBoolean(Boolean(snapshot.cancellationAvailable))} • ${t(
              "Production",
              "Production",
              "Produktion",
              "Producción",
              "Produção"
            )}: ${localizeBoolean(Boolean(snapshot.productionReady))}`}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200/70 bg-slate-50/80 p-3 dark:border-slate-800 dark:bg-slate-900/70">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
            {t("Submission", "Soumission", "Übermittlung", "Envío", "Submissão")}
          </p>
          <p className="mt-1 font-medium">
            {snapshot.submissionId || t("Not submitted yet", "Pas encore envoyée", "Noch nicht übermittelt", "Todavía no enviada", "Ainda não enviada")}
          </p>
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            {snapshot.lastSyncAt
              ? `${t("Last sync", "Dernière synchronisation", "Letzte Synchronisierung", "Última sincronización", "Última sincronização")} ${formatDateTime(snapshot.lastSyncAt)}`
              : t("No sync yet", "Aucune synchronisation pour le moment", "Noch keine Synchronisierung", "Sin sincronización todavía", "Ainda sem sincronização")}
          </p>
          {productionSignoff ? (
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              {`${t("Go-live signoff", "Validation go-live", "Go-live-Freigabe", "Aprobación go-live", "Aprovacao go-live")}: ${promotionStateLabel || t("Pending", "En attente", "Ausstehend", "Pendiente", "Pendente")} • ${t("Gates", "Étapes", "Gates", "Puertas", "Etapas")}: ${signoffSummary.passedCount}/${signoffSummary.totalCount} • ${t("Evidence", "Preuves", "Nachweise", "Evidencia", "Evidência")}: ${productionSignoff.evidenceCount}`}
            </p>
          ) : null}
        </div>
      </div>

      {snapshot.note ? (
        <p className="mt-4 text-sm text-slate-600 dark:text-slate-300">{snapshot.note}</p>
      ) : null}
      {capabilitySummary && capabilitySummary !== snapshot.note ? (
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{capabilitySummary}</p>
      ) : null}
      {snapshot.lastError ? (
        <div className="mt-4">
          <Alert variant="error">{snapshot.lastError}</Alert>
        </div>
      ) : null}
      {snapshot.warnings?.length ? (
        <div className="mt-4 space-y-2">
          {snapshot.warnings.slice(0, 2).map((warning) => (
            <Alert key={warning} variant="info">
              {warning}
            </Alert>
          ))}
        </div>
      ) : null}
      {snapshot.productionBlockers?.length ? (
        <div className="mt-4 space-y-2">
          {snapshot.productionBlockers.slice(0, 3).map((blocker) => (
            <Alert key={blocker} variant="info">
              {blocker}
            </Alert>
          ))}
        </div>
      ) : null}
      {productionSignoff && signoffSummary.pendingGateLabels.length > 0 ? (
        <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-amber-700 dark:text-amber-200">
            {t("Go-live blockers", "Blocages go-live", "Go-live-Blocker", "Bloqueos go-live", "Bloqueios go-live")}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {signoffSummary.pendingGateLabels.slice(0, 4).map((label) => (
              <span
                key={label}
                className="inline-flex rounded-full border border-amber-500/40 bg-white/70 px-2.5 py-1 text-[11px] font-medium text-amber-800 dark:bg-slate-950/60 dark:text-amber-100"
              >
                {label}
              </span>
            ))}
          </div>
        </div>
      ) : null}
      {status ? (
        <div className="mt-4">
          <Alert variant={status.type === "error" ? "error" : status.type === "success" ? "success" : "info"}>
            {status.message}
          </Alert>
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          variant="secondary"
          loading={busyAction === "sync"}
          disabled={!canSync || busyAction !== null}
          onClick={() => runAction("sync")}
        >
          {t("Sync status", "Synchroniser le statut", "Status synchronisieren", "Sincronizar estado", "Sincronizar estado")}
        </Button>
        <Button
          variant="primary"
          loading={busyAction === "retry"}
          disabled={!canRetry || busyAction !== null}
          onClick={() => runAction("retry")}
        >
          {t("Retry submission", "Réessayer l'envoi", "Übermittlung erneut versuchen", "Reintentar envío", "Tentar envio novamente")}
        </Button>
      </div>
      {provider && !provider.liveSubmissionAvailable ? (
        <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
          {t(
            "Retry is disabled because this provider does not have live submission wired yet.",
            "La nouvelle tentative est désactivée car ce prestataire ne prend pas encore en charge l'envoi en direct.",
            "Erneutes Senden ist deaktiviert, weil dieser Anbieter noch keine Live-Übermittlung unterstützt.",
            "El reintento está desactivado porque este proveedor todavía no admite envío en vivo.",
            "A nova tentativa está desativada porque este fornecedor ainda não suporta envio em direto."
          )}
        </p>
      ) : null}
      {!snapshot.statusSyncAvailable && snapshot.submissionId ? (
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          {t(
            "Sync is disabled because this provider does not expose automated status sync yet.",
            "La synchronisation est désactivée car ce prestataire n'expose pas encore de synchronisation automatique du statut.",
            "Die Synchronisierung ist deaktiviert, weil dieser Anbieter noch keine automatische Statussynchronisierung bereitstellt.",
            "La sincronización está desactivada porque este proveedor todavía no ofrece sincronización automática del estado.",
            "A sincronização está desativada porque este fornecedor ainda não disponibiliza sincronização automática do estado."
          )}
        </p>
      ) : null}
      {snapshot.requirement === "REQUIRED" && !snapshot.productionReady ? (
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          {t(
            "Retry is disabled until country laúnch signoff is complete, even if transport is already wired.",
            "La nouvelle tentative est désactivée tant que la validation de lancement du pays n'est pas terminée, même si le transport est déjà cable.",
            "Erneutes Senden ist deaktiviert, bis die Länder-Go-live-Freigabe abgeschlossen ist, auch wenn der Transport bereits verdrahtet ist.",
            "El reintento está desactivado hasta que se complete la aprobación de lanzamiento del país, aúnque el transporte ya esté conectado.",
            "A nova tentativa está desativada até que a aprovacão de lancamento do pais esteja concluida, mesmo que o transporte ja esteja ligado."
          )}
        </p>
      ) : null}
    </section>
  );
}
