"use client";

import { useEffect, useState } from "react";
import { useLanguage } from "@/components/providers/language-provider";
import { localizeAdminServerMessage } from "@/lib/admin/localization";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Props = {
  open: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  tenantName: string;
};

export function ConfirmImpersonationModal({ open, onClose, onConfirm, tenantName }: Props) {
  const { language, t } = useLanguage();
  const [confirmChecked, setConfirmChecked] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setConfirmChecked(false);
      setConfirmText("");
      setSubmitting(false);
      setError(null);
    }
  }, [open]);

  const canSubmit = confirmChecked && confirmText === "IMPERSONATE" && !submitting;

  const handleConfirm = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      await onConfirm();
    } catch (confirmError) {
      setError(
        confirmError instanceof Error
          ? localizeAdminServerMessage(
              confirmError.message,
              language,
              t(
                "Unable to start impersonation.",
                "Impossible de démarrer l'impersonation.",
                "Identitätsübernahme konnte nicht gestartet werden.",
                "No se puede iniciar la suplantación.",
                "Não foi possível iniciar a impersonação."
              )
            )
          : t(
              "Unable to start impersonation.",
              "Impossible de démarrer l'impersonation.",
              "Identitätsübernahme konnte nicht gestartet werden.",
              "No se puede iniciar la suplantación.",
              "Não foi possível iniciar a impersonação."
            )
      );
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={() => !submitting && onClose()}
      title={t("Confirm Impersonation", "Confirmer l'impersonation", "Identitätsübernahme bestätigen", "Confirmar suplantación", "Confirmar impersonação")}
    >
      <div className="space-y-4">
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <p className="font-semibold">{t("You are about to impersonate this tenant account.", "Vous êtes sur le point d'impersonner ce compte locataire.", "Du bist dabei, dieses Mandantenkonto zu übernehmen.", "Estás a punto de suplantar esta cuenta de inquilino.", "Está prestes a impersonar esta conta de tenant.")}</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>{t("This will switch your session from Admin -> Tenant view.", "Votre session passera du mode admin à la vue locataire.", "Dadurch wechselt deine Sitzung von Admin zur Mandantenansicht.", "Esto cambiará tu sesión de administrador a la vista de inquilino.", "Isto vai mudar a sua sessão de Admin para a vista do tenant.")}</li>
            <li>{t("You will no longer have admin access during impersonation.", "Vous n'aurez plus d'accès admin pendant l'impersonation.", "Während der Identitätsübernahme hast du keinen Admin-Zugriff mehr.", "Ya no tendrás acceso de administrador durante la suplantación.", "Deixará de ter acesso de administrador durante a impersonação.")}</li>
            <li>{t("Subscription rules and restrictions will apply.", "Les règles et restrictions d'abonnement s'appliqueront.", "Abonnementregeln und -einschränkungen gelten weiterhin.", "Se aplicarán las reglas y restricciones de suscripción.", "Aplicam-se as regras e restrições da subscrição.")}</li>
            <li>{t("Actions are audited.", "Les actions sont auditées.", "Aktionen werden protokolliert.", "Las acciones se auditan.", "As ações são auditadas.")}</li>
            <li>{t('Click "Exit Impersonation" to return to Admin.', "Cliquez sur \"Quitter l'impersonation\" pour revenir à l'admin.", `Klicke auf "Identitätsübernahme beenden", um zur Admin-Ansicht zurückzukehren.`, `Haz clic en "Salir de la suplantación" para volver al administrador.`, `Clique em "Sair da impersonação" para voltar ao Admin.`)}</li>
          </ul>
          <p className="mt-2 text-xs text-amber-800">
            {t("Tenant:", "Locataire :", "Mandant:", "Tenant:", "Tenant:")} {" "}
            {tenantName || t("Unknown tenant", "Locataire inconnu", "Unbekannter Mandant", "Tenant desconocido", "Tenant desconhecido")}
          </p>
        </div>

        <label className="flex items-start gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            checked={confirmChecked}
            onChange={(event) => setConfirmChecked(event.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-input"
          />
          <span>{t("I understand I will act as the tenant user and not as Admin.", "Je comprends que j'agirai comme l'utilisateur locataire et non comme admin.", "Ich verstehe, dass ich als Mandantenbenutzer und nicht als Admin handle.", "Entiendo que actuaré como usuario del tenant y no como administrador.", "Compreendo que vou agir como utilizador do tenant e não como Admin.")}</span>
        </label>

        <Input
          label={t('Type "IMPERSONATE" to confirm', `Tapez "IMPERSONATE" pour confirmer`, `Gib zur Bestätigung "IMPERSONATE" ein`, `Escribe "IMPERSONATE" para confirmar`, `Escreva "IMPERSONATE" para confirmar`)}
          placeholder={t('Type "IMPERSONATE" to confirm', `Tapez "IMPERSONATE" pour confirmer`, `Gib zur Bestätigung "IMPERSONATE" ein`, `Escribe "IMPERSONATE" para confirmar`, `Escreva "IMPERSONATE" para confirmar`)}
          value={confirmText}
          onChange={(event) => setConfirmText(event.target.value)}
        />

        {error ? <p className="text-sm text-rose-700 dark:text-rose-300">{error}</p> : null}

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            {t("Cancel", "Annuler", "Abbrechen", "Cancelar", "Cancelar")}
          </Button>
          <Button
            variant="danger"
            onClick={handleConfirm}
            disabled={!canSubmit}
            loading={submitting}
            className="border border-rose-700"
          >
            {t("Confirm & Impersonate", "Confirmer et impersonner", "Bestätigen und übernehmen", "Confirmar y suplantar", "Confirmar e impersonar")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
