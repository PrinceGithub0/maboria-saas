"use client";

import Link from "next/link";
import useSWR from "swr";
import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { de, es, fr, ptBR } from "date-fns/locale";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, ChevronLeft, Mail, Phone } from "lucide-react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmationModal } from "@/components/ui/ConfirmationModal";
import { TransientAlert } from "@/components/ui/transient-alert";
import { isCustomerReminderInvoiceStatus } from "@/lib/customers/statuses";
import { formatCurrency } from "@/lib/currency";
import { useLanguage } from "@/components/providers/language-provider";
import { LANGUAGE_LOCALES } from "@/lib/i18n";

type TabKey = "overview" | "invoices" | "payments" | "activity" | "notes";

type CustomerDetailResponse = {
  displayCurrency: string;
  notesSharedWithTeam: boolean;
  lateFeePolicy?: {
    enabled: boolean;
    allowAutomationLateFee?: boolean;
  };
  customer: {
    id: string;
    name: string;
    email: string;
    phone: string | null;
    addressLine1: string | null;
    addressLine2: string | null;
    city: string | null;
    state: string | null;
    postalCode: string | null;
    country: string | null;
    deliveryPreference: "EMAIL" | "WHATSAPP" | "BOTH";
    createdAt: string;
    status: "ACTIVE" | "ATTENTION" | "NEW" | "DISABLED";
    compliance: {
      emailOptOut: boolean;
      whatsappOptOut: boolean;
      processingRestrictedAt: string | null;
      consentCapturedAt: string | null;
      consentSource: string | null;
      erasedAt: string | null;
    };
    lifetimeValue: number;
    totals: {
      invoiced: number;
      paid: number;
      outstanding: number;
    };
    lastInvoice: {
      id: string;
      invoiceNumber: string;
      amount: number;
      currency: string;
      createdAt: string;
      status: string;
    } | null;
    lastPayment: {
      id: string;
      amount: number;
      currency: string;
      createdAt: string;
      reference: string;
    } | null;
  };
  chart: Array<{ date: string; value: number }>;
  invoices: Array<{
    id: string;
    invoiceNumber: string;
    amount: number;
    currency: string;
    status: string;
    outstandingAmount: number;
    issueDate: string;
    dueDate: string | null;
  }>;
  payments: Array<{
    id: string;
    amount: number;
    currency: string;
    status: string;
    provider: string;
    reference: string;
    createdAt: string;
    invoiceId: string | null;
    invoiceNumber: string | null;
  }>;
  activity: Array<{
    id: string;
    type: "invoice" | "payment";
    title: string;
    timestamp: string;
    amount: number;
    currency: string;
    invoiceNumber: string | null;
    status?: string;
  }>;
  notes: Array<{
    id: string;
    content: string;
    createdAt: string;
    updatedAt: string;
    author: {
      id: string;
      name: string | null;
      email: string;
    } | null;
  }>;
};

const fetcher = async (url: string): Promise<CustomerDetailResponse> => {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const error = new Error(
      typeof payload?.error === "string" ? payload.error : "Failed to load customer details"
    ) as Error & { status?: number };
    error.status = response.status;
    throw error;
  }
  return response.json();
};

const STATUS_CLASS = {
  ACTIVE:
    "border-emerald-300 bg-emerald-100 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-200",
  ATTENTION:
    "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-200",
  NEW:
    "border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200",
  DISABLED:
    "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/15 dark:text-rose-200",
} as const;

const DATE_FNS_LOCALES = {
  en: undefined,
  fr: fr,
  de: de,
  es: es,
  pt: ptBR,
} as const;

const TAB_ITEMS: Array<{ key: TabKey; labels: { en: string; fr: string; de: string; es: string; pt: string } }> = [
  { key: "overview", labels: { en: "Overview", fr: "Vue d'ensemble", de: "überblick", es: "Resumen", pt: "Visao geral" } },
  { key: "invoices", labels: { en: "Invoices", fr: "Factures", de: "Rechnungen", es: "Facturas", pt: "Faturas" } },
  { key: "payments", labels: { en: "Payments", fr: "Paiements", de: "Zahlungen", es: "Pagos", pt: "Pagamentos" } },
  { key: "activity", labels: { en: "Activity", fr: "Activit?", de: "Aktivität", es: "Actividad", pt: "Atividade" } },
  { key: "notes", labels: { en: "Private Notes", fr: "Notes priv?es", de: "Private Notizen", es: "Notas privadas", pt: "Notas privadas" } },
];

function localizeCustomerServerMessage(
  message: string,
  t: ReturnType<typeof useLanguage>["t"]
) {
  const normalized = String(message || "").trim();
  if (!normalized) return "";
  const translations: Record<string, string> = {
    Unauthorized: t("Unauthorized.", "Non autorise.", "Nicht autorisiert.", "No autorizado.", "Não autorizado."),
    "Not found": t("Customer not found.", "Client introuvable.", "Kunde nicht gefunden.", "Cliente no encontrado.", "Cliente não encontrado."),
    "Unsupported action": t("Unsupported action.", "Action non prise en charge.", "Nicht unterstützte Aktion.", "Acción no compatible.", "Ação não suportada."),
    "Invalid payload": t("Invalid customer details.", "D?tails client invalides.", "Ungültige Kundendaten.", "Datos de cliente no validos.", "Dados de cliente invalidos."),
    "Invalid query parameters": t("Invalid customer filters.", "Filtres client invalides.", "Ungültige Kundenfilter.", "Filtros de cliente no validos.", "Filtros de cliente invalidos."),
    "Phone is required for WhatsApp delivery": t(
      "Phone is required for WhatsApp delivery.",
      "Le téléphone est requis pour la livraison WhatsApp.",
      "Für die WhatsApp-Zustellung ist eine Telefonnummer erforderlich.",
      "El teléfono es obligatorio para la entrega por WhatsApp.",
      "O telefone e obrigatório para a entrega por WhatsApp."
    ),
    "Late fees are disabled for this account.": t(
      "Late fees are disabled for this account.",
      "Les frais de retard sont desactives pour ce compte.",
      "Mahngebühren sind für dieses Konto deaktiviert.",
      "Los recargos por demora est?n desactivados para esta cuenta.",
      "As taxas de atraso estão desativadas para esta conta."
    ),
    "Automations are not allowed to apply late fees.": t(
      "Automations are not allowed to apply late fees.",
      "Les automatisations ne sont pas autorisees a appliquer des frais de retard.",
      "Automationen dürfen keine Mahngebühren anwenden.",
      "Las automatizaciones no pueden aplicar recargos por demora.",
      "As automatizacoes não podem aplicar taxas de atraso."
    ),
    "Unable to send reminder.": t(
      "Unable to send reminder.",
      "Impossible d envoyer le rappel.",
      "Die Erinnerung konnte nicht gesendet werden.",
      "No se pudo enviar el recordatorio.",
      "Não foi possível enviar o lembrete."
    ),
    "You do not have access to this customer.": t(
      "You do not have access to this customer.",
      "Vous n'avez pas accès a ce client.",
      "Du hast keinen Zugriff auf diesen Kunden.",
      "No tienes acceso a este cliente.",
      "Não tem acesso a este cliente."
    ),
  };
  translations["Note content is required."] = t(
    "Note content is required.",
    "Le contenu de la note est requis.",
    "Der Inhalt der Notiz ist erforderlich.",
    "El contenido de la nota es obligatorio.",
    "O conteudo da nota e obrigatório."
  );
  translations["Note not found."] = t(
    "Note not found.",
    "Note introuvable.",
    "Notiz nicht gefunden.",
    "Nota no encontrada.",
    "Nota não encontrada."
  );
  translations["Customer is disabled."] = t(
    "Customer is disabled.",
    "Le client est d?sactiv?.",
    "Der Kunde ist deaktiviert.",
    "El cliente esta desactivado.",
    "O cliente esta desativado."
  );
  translations["No unpaid invoice found for this customer."] = t(
    "No unpaid invoice found for this customer.",
    "Aucune facture impayee trouvée pour ce client.",
    "Keine unbezahlte Rechnung f?r diesen Kunden gefunden.",
    "No se encontró ninguna factura pendiente para este cliente.",
    "Não foi encontrada nenhuma fatura em aberto para este cliente."
  );
  translations["Customer has no contact information."] = t(
    "Customer has no contact information.",
    "Le client n'a aucune information de contact.",
    "Der Kunde hat keine Kontaktinformationen.",
    "El cliente no tiene información de contacto.",
    "O cliente não tem informação de contacto."
  );
  translations["A reminder was already sent recently."] = t(
    "A reminder was already sent recently.",
    "Un rappel a déjà été envoy? recemment.",
    "Vor Kurzem wurde bereits eine Erinnerung gesendet.",
    "Ya se envio un recordatorio recientemente.",
    "Ja foi enviado um lembrete recentemente."
  );
  translations["Reminder limit reached for this invoice today."] = t(
    "Reminder limit reached for this invoice today.",
    "La limite de rappels a été atteinte pour cette facture aujourd'hui.",
    "Das Erinnerungslimit f?r diese Rechnung wurde heute erreicht.",
    "Se alcanzo el limite de recordatorios para esta factura hoy.",
    "O limite de lembretes para esta fatura foi atingido hoje."
  );
  translations["Customer contact policy blocks delivery."] = t(
    "Customer contact policy blocks delivery.",
    "La politique de contact du client bloque l envoi.",
    "Die Kontaktpolitik des Kunden blockiert die Zustellung.",
    "La política de contacto del cliente bloquea la entrega.",
    "A política de contacto do cliente bloqueia o envio."
  );
  translations["Customer has opted out of email contact."] = t(
    "Customer has opted out of email contact.",
    "Le client s est desinscrit des contacts par email.",
    "Der Kunde hat E-Mail-Kontakt abgelehnt.",
    "El cliente rechazo el contacto por correo.",
    "O cliente recusou o contacto por email."
  );
  translations["Customer has opted out of WhatsApp contact."] = t(
    "Customer has opted out of WhatsApp contact.",
    "Le client s est desinscrit des contacts WhatsApp.",
    "Der Kunde hat WhatsApp-Kontakt abgelehnt.",
    "El cliente rechazo el contacto por WhatsApp.",
    "O cliente recusou o contacto por WhatsApp."
  );
  translations["Customer processing is restricted."] = t(
    "Customer processing is restricted.",
    "Le traitement du client est restreint.",
    "Die Verarbeitung des Kunden ist eingeschrankt.",
    "El tratamiento del cliente esta restringido.",
    "O tratamento do cliente esta restringido."
  );
  translations["Customer personal data has been erased."] = t(
    "Customer personal data has been erased.",
    "Les données personnelles du client ont été effacees.",
    "Die personenbezogenen Daten des Kunden wurden gelöscht.",
    "Los datos personales del cliente füron borrados.",
    "Os dados pessoais do cliente foram apagados."
  );
  translations["Erased customers cannot be restored."] = t(
    "Erased customers cannot be restored.",
    "Les clients effaces ne peuvent pas être restaures.",
    "Gelöschte Kunden können nicht wiederhergestellt werden.",
    "Los clientes borrados no se pueden restaurar.",
    "Os clientes apagados não podem ser restaurados."
  );
  translations["Erased customers cannot resume processing."] = t(
    "Erased customers cannot resume processing.",
    "Les clients effaces ne peuvent pas reprendre le traitement.",
    "Gelöschte Kunden können nicht wieder verarbeitet werden.",
    "Los clientes borrados no pueden reanudar el tratamiento.",
    "Os clientes apagados não podem retomar o tratamento."
  );
  translations["Erased customers cannot be edited."] = t(
    "Erased customers cannot be edited.",
    "Les clients effaces ne peuvent pas être modifies.",
    "Gelöschte Kunden können nicht bearbeitet werden.",
    "Los clientes borrados no se pueden editar.",
    "Os clientes apagados não podem ser editados."
  );
  return translations[normalized] || "";
}

export default function CustomerProfilePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { language, t } = useLanguage();
  const locale = LANGUAGE_LOCALES[language];
  const dateFnsLocale = DATE_FNS_LOCALES[language];

  const rawTab = searchParams.get("tab");
  const activeTab: TabKey = TAB_ITEMS.some((item) => item.key === rawTab) ? (rawTab as TabKey) : "overview";

  const { data, error, isLoading, mutate } = useSWR<CustomerDetailResponse>(
    id ? `/api/customers/${id}/intelligence` : null,
    fetcher,
    {
      dedupingInterval: 0,
      revalidateOnMount: true,
    }
  );

  const [status, setStatus] = useState<{ variant: "success" | "error" | "info" | "warning"; message: string } | null>(null);
  const [showDisableModal, setShowDisableModal] = useState(false);
  const [showReminderModal, setShowReminderModal] = useState(false);
  const [showEraseModal, setShowEraseModal] = useState(false);
  const [disableSubmitting, setDisableSubmitting] = useState(false);
  const [reminderSubmitting, setReminderSubmitting] = useState(false);
  const [policySubmitting, setPolicySubmitting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [noteSubmitting, setNoteSubmitting] = useState(false);
  const [deletingNoteId, setDeletingNoteId] = useState<string | null>(null);

  const formatDate = (value: string | Date | null | undefined) => {
    if (!value) return "--";
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return "--";
    return new Intl.DateTimeFormat(locale, {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(date);
  };

  const formatDateTime = (value: string | Date | null | undefined) => {
    if (!value) return "--";
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return "--";
    return new Intl.DateTimeFormat(locale, {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  };

  const formatRelative = (value: string | Date | null | undefined) => {
    if (!value) return "--";
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return "--";
    return formatDistanceToNow(date, { addSuffix: true, locale: dateFnsLocale });
  };

  const localizeInvoiceStatus = (value: string) => {
    switch (String(value || "").toUpperCase()) {
      case "DRAFT":
        return t("Draft", "Brouillon", "Entwurf", "Borrador", "Rascunho");
      case "SENT":
        return t("Sent", "Envoyee", "Gesendet", "Enviada", "Enviada");
      case "OVERDUE":
        return t("Overdue", "En retard", "überfällig", "Vencida", "Em atraso");
      case "FAILED":
        return t("Failed", "échouée", "Fehlgeschlagen", "Fallida", "Falhada");
      case "PAID":
        return t("Paid", "Payee", "Bezahlt", "Pagada", "Paga");
      case "PARTIALLY_REFUNDED":
        return t("Partially refunded", "Partiellement remboursee", "Teilweise erstattet", "Reembolsada parcialmente", "Parcialmente reembolsada");
      case "REFUNDED":
        return t("Refunded", "Remboursee", "Erstattet", "Reembolsada", "Reembolsada");
      case "CANCELED":
        return t("Canceled", "Annulee", "Storniert", "Cancelada", "Cancelada");
      case "EXPIRED":
        return t("Expired", "Expiree", "Abgelaufen", "Expirada", "Expirada");
      case "VOID":
        return t("Void", "Annulee", "Storniert", "Anulada", "Anulada");
      default:
        return value;
    }
  };

  const localizePaymentStatus = (value: string) => {
    switch (String(value || "").toUpperCase()) {
      case "SUCCEEDED":
        return t("Succeeded", "R?ussi", "Erfolgreich", "Completado", "Conclu?do");
      case "PENDING":
        return t("Pending", "En attente", "Ausstehend", "Pendiente", "Pendente");
      case "FAILED":
        return t("Failed", "échoué", "Fehlgeschlagen", "Fallido", "Falhou");
      case "REFUNDED":
        return t("Refunded", "Rembourse", "Erstattet", "Reembolsado", "Reembolsado");
      default:
        return value;
    }
  };

  const localizeCustomerStatus = (value: CustomerDetailResponse["customer"]["status"]) => {
    switch (value) {
      case "ATTENTION":
        return t("Attention", "Attention", "Achtung", "Atencion", "Atencao");
      case "DISABLED":
        return t("Disabled", "D?sactiv?", "Deaktiviert", "Desactivado", "Desativado");
      case "ACTIVE":
        return t("Active", "Actif", "Aktiv", "Activo", "Ativo");
      default:
        return t("New", "Nouveau", "Neu", "Nuevo", "Novo");
    }
  };

  const localizeActivityTitle = (event: CustomerDetailResponse["activity"][number]) => {
    if (event.type === "invoice") {
      return t(
        `Invoice ${event.invoiceNumber || ""} created`.trim(),
        `Facture ${event.invoiceNumber || ""} creee`.trim(),
        `Rechnung ${event.invoiceNumber || ""} erstellt`.trim(),
        `Factura ${event.invoiceNumber || ""} creada`.trim(),
        `Fatura ${event.invoiceNumber || ""} criada`.trim()
      );
    }
    const invoiceLabel = event.invoiceNumber || t("invoice", "facture", "Rechnung", "factura", "fatura");
    if (String(event.status || "").toUpperCase() === "SUCCEEDED") {
      return t(
        `Payment received for ${invoiceLabel}`,
        `Paiement recu pour ${invoiceLabel}`,
        `Zahlung erhalten fur ${invoiceLabel}`,
        `Pago recibido para ${invoiceLabel}`,
        `Pagamento recebido para ${invoiceLabel}`
      );
    }
    return t(
      `${localizePaymentStatus(String(event.status || ""))} payment for ${invoiceLabel}`,
      `Paiement ${localizePaymentStatus(String(event.status || ""))} pour ${invoiceLabel}`,
      `${localizePaymentStatus(String(event.status || ""))}e Zahlung fur ${invoiceLabel}`,
      `Pago ${localizePaymentStatus(String(event.status || ""))} para ${invoiceLabel}`,
      `Pagamento ${localizePaymentStatus(String(event.status || ""))} para ${invoiceLabel}`
    );
  };

  const setTab = (tab: TabKey) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", tab);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const saveNote = async () => {
    if (!data?.customer?.id || noteSubmitting) return;
    const content = noteDraft.trim();
    if (!content) return;
    setNoteSubmitting(true);
    try {
      const endpoint = editingNoteId
        ? `/api/customers/${data.customer.id}/notes/${encodeURIComponent(editingNoteId)}`
        : `/api/customers/${data.customer.id}/notes`;
      const response = await fetch(endpoint, {
        method: editingNoteId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setStatus({
          variant: "error",
          message:
            (typeof payload?.error === "string" && localizeCustomerServerMessage(payload.error, t)) ||
            t(
              "Unable to save note.",
              "Impossible d enregistrer la note.",
              "Die Notiz konnte nicht gespeichert werden.",
              "No se pudo guardar la nota.",
              "Não foi possível guardar a nota."
            ),
        });
        return;
      }
      await mutate();
      setEditingNoteId(null);
      setNoteDraft("");
      setStatus({
        variant: "success",
        message: editingNoteId
          ? t("Note updated.", "Note mise ? jour.", "Notiz aktualisiert.", "Nota actualizada.", "Nota atualizada.")
          : t("Note added.", "Note ajoutee.", "Notiz hinzugefugt.", "Nota agregada.", "Nota adicionada."),
      });
    } catch {
      setStatus({
        variant: "error",
        message: t(
          "Unable to save note.",
          "Impossible d enregistrer la note.",
          "Die Notiz konnte nicht gespeichert werden.",
          "No se pudo guardar la nota.",
          "Não foi possível guardar a nota."
        ),
      });
    } finally {
      setNoteSubmitting(false);
    }
  };

  const editNote = (note: CustomerDetailResponse["notes"][number]) => {
    setEditingNoteId(note.id);
    setNoteDraft(note.content);
  };

  const removeNote = async (noteId: string) => {
    if (!data?.customer?.id || deletingNoteId) return;
    setDeletingNoteId(noteId);
    try {
      const response = await fetch(
        `/api/customers/${data.customer.id}/notes/${encodeURIComponent(noteId)}`,
        { method: "DELETE" }
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setStatus({
          variant: "error",
          message:
            (typeof payload?.error === "string" && localizeCustomerServerMessage(payload.error, t)) ||
            t(
              "Unable to delete note.",
              "Impossible de supprimer la note.",
              "Die Notiz konnte nicht gelöscht werden.",
              "No se pudo eliminar la nota.",
              "Não foi possível eliminar a nota."
            ),
        });
        return;
      }
      await mutate();
      if (editingNoteId === noteId) {
        setEditingNoteId(null);
        setNoteDraft("");
      }
      setStatus({
        variant: "success",
        message: t("Note deleted.", "Note supprimee.", "Notiz gelöscht.", "Nota eliminada.", "Nota eliminada."),
      });
    } catch {
      setStatus({
        variant: "error",
        message: t(
          "Unable to delete note.",
          "Impossible de supprimer la note.",
          "Die Notiz konnte nicht gelöscht werden.",
          "No se pudo eliminar la nota.",
          "Não foi possível eliminar a nota."
        ),
      });
    } finally {
      setDeletingNoteId(null);
    }
  };

  const handleDisable = async () => {
    if (!data?.customer?.id) return;
    if (disableSubmitting) return;
    setDisableSubmitting(true);
    try {
      const response = await fetch(`/api/customers/${data.customer.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "disable" }),
      });
      if (!response.ok) {
        setStatus({
          variant: "error",
          message: t(
            "Unable to disable customer.",
            "Impossible de désactiver le client.",
            "Der Kunde konnte nicht deaktiviert werden.",
            "No se pudo desactivar el cliente.",
            "Não foi possível desativar o cliente."
          ),
        });
        return;
      }

      setStatus({
        variant: "success",
        message: t("Customer disabled.", "Client d?sactiv?.", "Kunde deaktiviert.", "Cliente desactivado.", "Cliente desativado."),
      });
      setShowDisableModal(false);
      mutate();
    } catch {
      setStatus({
        variant: "error",
        message: t(
          "Unable to disable customer.",
          "Impossible de désactiver le client.",
          "Der Kunde konnte nicht deaktiviert werden.",
          "No se pudo desactivar el cliente.",
          "Não foi possível desativar o cliente."
        ),
      });
    } finally {
      setDisableSubmitting(false);
    }
  };

  const handleRestore = async () => {
    if (!data?.customer?.id) return;
    if (disableSubmitting) return;
    setDisableSubmitting(true);
    try {
      const response = await fetch(`/api/customers/${data.customer.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "restore" }),
      });
      if (!response.ok) {
        setStatus({
          variant: "error",
          message: t(
            "Unable to restore customer.",
            "Impossible de restaurer le client.",
            "Der Kunde konnte nicht wiederhergestellt werden.",
            "No se pudo restaurar el cliente.",
            "Não foi possível restaurar o cliente."
          ),
        });
        return;
      }

      setStatus({
        variant: "success",
        message: t("Customer restored.", "Client restaure.", "Kunde wiederhergestellt.", "Cliente restaurado.", "Cliente restaurado."),
      });
      mutate();
    } catch {
      setStatus({
        variant: "error",
        message: t(
          "Unable to restore customer.",
          "Impossible de restaurer le client.",
          "Der Kunde konnte nicht wiederhergestellt werden.",
          "No se pudo restaurar el cliente.",
          "Não foi possível restaurar o cliente."
        ),
      });
    } finally {
      setDisableSubmitting(false);
    }
  };

  const handleSendReminder = async (applyLateFee: boolean) => {
    if (!data?.customer?.id) return;
    if (reminderSubmitting) return;
    setReminderSubmitting(true);
    try {
      const response = await fetch(`/api/customers/${data.customer.id}/send-reminder`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ applyLateFee }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setStatus({
          variant: "error",
          message:
            (typeof payload?.error === "string" && localizeCustomerServerMessage(payload.error, t)) ||
            t(
              "Unable to send reminder.",
              "Impossible d'envoyer le rappel.",
              "Die Erinnerung konnte nicht gesendet werden.",
              "No se pudo enviar el recordatorio.",
              "Não foi possível enviar o lembrete."
            ),
        });
        return;
      }

      setStatus({
        variant: "success",
        message: applyLateFee
          ? t(
              "Late fee applied and reminder sent.",
              "Frais de retard appliques et rappel envoy?.",
              "Mahngebühr angewendet und Erinnerung gesendet.",
              "Se aplico el recargo y se envio el recordatorio.",
              "A taxa de atraso foi aplicada e o lembrete foi enviado."
            )
          : t("Reminder sent.", "Rappel envoy?.", "Erinnerung gesendet.", "Recordatorio enviado.", "Lembrete enviado."),
      });
      setShowReminderModal(false);
      mutate();
    } catch {
      setStatus({
        variant: "error",
        message: t(
          "Unable to send reminder.",
          "Impossible d'envoyer le rappel.",
          "Die Erinnerung konnte nicht gesendet werden.",
          "No se pudo enviar el recordatorio.",
          "Não foi possível enviar o lembrete."
        ),
      });
    } finally {
      setReminderSubmitting(false);
    }
  };

  const runCustomerAction = async (
    action:
      | "block_email"
      | "allow_email"
      | "block_whatsapp"
      | "allow_whatsapp"
      | "restrict_processing"
      | "resume_processing"
      | "erase",
    successMessage: string
  ) => {
    if (!data?.customer?.id || policySubmitting) return;
    setPolicySubmitting(true);
    try {
      const response = await fetch(`/api/customers/${data.customer.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setStatus({
          variant: "error",
          message:
            (typeof payload?.error === "string" && localizeCustomerServerMessage(payload.error, t)) ||
            t(
              "Unable to update customer compliance settings.",
              "Impossible de mettre a jour les paramêtres de conformité du client.",
              "Die Compliance-Einstellungen des Kunden konnten nicht aktualisiert werden.",
              "No se pudo actualizar la configuración de cumplimiento del cliente.",
              "Não foi possível atualizar a configuração de conformidade do cliente."
            ),
        });
        return;
      }
      await mutate();
      setStatus({ variant: "success", message: successMessage });
      if (action === "erase") {
        setShowEraseModal(false);
      }
    } catch {
      setStatus({
        variant: "error",
        message: t(
          "Unable to update customer compliance settings.",
          "Impossible de mettre a jour les paramêtres de conformité du client.",
          "Die Compliance-Einstellungen des Kunden konnten nicht aktualisiert werden.",
          "No se pudo actualizar la configuración de cumplimiento del cliente.",
          "Não foi possível atualizar a configuração de conformidade do cliente."
        ),
      });
    } finally {
      setPolicySubmitting(false);
    }
  };

  const handleExportCustomerData = async () => {
    if (!data?.customer?.id || exporting) return;
    setExporting(true);
    try {
      window.location.assign(`/api/customers/${data.customer.id}/export`);
      setStatus({
        variant: "success",
        message: t(
          "Customer export started.",
          "Export client demarre.",
          "Kundenexport gestartet.",
          "La exportacion del cliente ha comenzado.",
          "A exportacao do cliente foi iniciada."
        ),
      });
    } finally {
      setExporting(false);
    }
  };

  const customer = data?.customer;
  const displayCurrency = data?.displayCurrency || "USD";
  const canApplyLateFeeManually = Boolean(data?.lateFeePolicy?.enabled);
  const chartPoints = data?.chart.slice(-10) || [];
  const chartValues = chartPoints.map((point) => point.value);
  const hasNegativeChartValues = chartValues.some((value) => value < 0);
  const maxPositiveChartValue = Math.max(0, ...chartValues, 0);
  const maxNegativeChartValue = Math.abs(Math.min(0, ...chartValues, 0));
  const recentInvoices = data?.invoices.slice(0, 2) || [];
  const recentPayments = data?.payments.slice(0, 2) || [];
  const notes = data?.notes || [];
  const compliance = customer?.compliance;
  const processingRestricted = Boolean(compliance?.processingRestrictedAt);
  const erased = Boolean(compliance?.erasedAt);
  const hasReminderCandidate = (data?.invoices || []).some((invoice) =>
    isCustomerReminderInvoiceStatus(invoice.status) && invoice.outstandingAmount > 0
  );

  if (isLoading) {
    return (
      <div className="mx-auto w-full max-w-[1200px] space-y-6 py-8">
        <div className="h-32 animate-pulse rounded-2xl border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900" />
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="h-28 animate-pulse rounded-2xl border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900" />
          <div className="h-28 animate-pulse rounded-2xl border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900" />
          <div className="h-28 animate-pulse rounded-2xl border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900" />
        </div>
      </div>
    );
  }

  if (error || !customer) {
    return (
      <div className="mx-auto w-full max-w-[1200px] py-8">
        <Alert variant="error">
          {typeof (error as { status?: unknown } | null)?.status === "number" &&
          Number((error as { status?: number }).status) === 403
            ? t(
                "You do not have access to this customer.",
                "Vous n'avez pas accès a ce client.",
                "Du hast keinen Zugriff auf diesen Kunden.",
                "No tienes acceso a este cliente.",
                "Não tem acesso a este cliente."
              )
            : t(
                "Could not load customer details.",
                "Impossible de charger les d?tails client.",
                "Die Kundendetails konnten nicht geladen werden.",
                "No se pudieron cargar los detalles del cliente.",
                "Não foi possível carregar os detalhes do cliente."
              )}
        </Alert>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1200px] space-y-10 py-8">
      {status ? (
        <TransientAlert variant={status.variant} onDismiss={() => setStatus(null)}>
          {status.message}
        </TransientAlert>
      ) : null}

      <section className="rounded-2xl border border-slate-200 bg-slate-50/80 px-8 py-7 dark:border-slate-800 dark:bg-slate-900/80">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <Link href="/dashboard/customers" className="inline-flex items-center gap-1 text-sm text-indigo-600 hover:underline">
              <ChevronLeft className="h-4 w-4" />
              {t("Back to customers", "Retour aux clients", "Zurück zu Kunden", "Volver a clientes", "Voltar aos clientes")}
            </Link>
            <h1 className="text-4xl font-bold tracking-tight text-foreground">{customer.name}</h1>
            <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <Mail className="h-4 w-4" />
                {customer.email}
              </span>
              {customer.phone ? (
                <span className="inline-flex items-center gap-1">
                  <Phone className="h-4 w-4" />
                  {customer.phone}
                </span>
              ) : null}
              <span>|</span>
              <span>{t("ID:", "ID :", "ID:", "ID:", "ID:")} {customer.id.slice(0, 8)}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {customer.status === "DISABLED" ? (
              <Button variant="secondary" disabled>
                {t("Customer disabled", "Client d?sactiv?", "Kunde deaktiviert", "Cliente desactivado", "Cliente desativado")}
              </Button>
            ) : (
              <Link href={`/dashboard/invoices?customerId=${encodeURIComponent(customer.id)}`}>
                <Button>{t("Create Invoice", "Créer une facture", "Rechnung erstellen", "Crear factura", "Criar fatura")}</Button>
              </Link>
            )}
            <details className="relative">
              <summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200">
                {t("More Actions", "Plus d'actions", "Weitere Aktionen", "Más acciones", "Mais ações")}
                <ChevronDown className="h-4 w-4" />
              </summary>
              <div className="absolute right-0 top-11 z-20 min-w-[170px] rounded-xl border border-slate-200 bg-white p-1 shadow-lg dark:border-slate-700 dark:bg-slate-950 dark:shadow-[0_18px_40px_rgba(2,6,23,0.75)]">
                {customer.status === "DISABLED" ? (
                  <button
                    type="button"
                    onClick={handleRestore}
                    disabled={disableSubmitting}
                    className="w-full rounded-lg px-3 py-2 text-left text-sm text-emerald-700 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60 dark:text-emerald-300 dark:hover:bg-emerald-500/10"
                  >
                    {disableSubmitting
                      ? t("Restoring...", "Restauration...", "Wiederherstellung...", "Restaurando...", "A restaurar...")
                      : t("Restore customer", "Restaurer le client", "Kunden wiederherstellen", "Restaurar cliente", "Restaurar cliente")}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowDisableModal(true)}
                    className="w-full rounded-lg px-3 py-2 text-left text-sm text-rose-700 transition hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-500/10"
                  >
                    {t("Disable customer", "Desactiver le client", "Kunden deaktivieren", "Desactivar cliente", "Desativar cliente")}
                  </button>
                )}
              </div>
            </details>
          </div>
        </div>
      </section>

      <section className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        <Card className="min-w-0 rounded-2xl border border-slate-200 bg-white p-7 shadow-sm dark:border-slate-800 dark:bg-slate-950 dark:shadow-[0_18px_40px_rgba(2,6,23,0.45)]">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">{t("Total Invoiced", "Total facture", "Gesamt in Rechnung gestellt", "Total facturado", "Total faturado")}</p>
          <p
            title={formatCurrency(customer.totals.invoiced, displayCurrency)}
            className="mt-3 block w-full min-w-0 truncate text-[clamp(1.5rem,1.4vw+1rem,2.5rem)] font-semibold leading-none tracking-tight text-foreground tabular-nums"
          >
            {formatCurrency(customer.totals.invoiced, displayCurrency)}
          </p>
        </Card>
        <Card className="min-w-0 rounded-2xl border border-slate-200 bg-white p-7 shadow-sm dark:border-slate-800 dark:bg-slate-950 dark:shadow-[0_18px_40px_rgba(2,6,23,0.45)]">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">{t("Total Paid", "Total paye", "Gesamt bezahlt", "Total pagado", "Total pago")}</p>
          <p
            title={formatCurrency(customer.totals.paid, displayCurrency)}
            className="mt-3 block w-full min-w-0 truncate text-[clamp(1.5rem,1.4vw+1rem,2.5rem)] font-semibold leading-none tracking-tight text-foreground tabular-nums"
          >
            {formatCurrency(customer.totals.paid, displayCurrency)}
          </p>
        </Card>
        <Card className="min-w-0 rounded-2xl border border-amber-200 bg-amber-50/70 p-7 shadow-sm dark:border-amber-500/30 dark:bg-amber-500/10 dark:shadow-[0_18px_40px_rgba(2,6,23,0.45)]">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-700 dark:text-amber-300">{t("Outstanding Balance", "Solde en attente", "Offener Betrag", "Saldo pendiente", "Saldo pendente")}</p>
          <p
            title={formatCurrency(customer.totals.outstanding, displayCurrency)}
            className="mt-3 block w-full min-w-0 truncate text-[clamp(1.5rem,1.4vw+1rem,2.5rem)] font-semibold leading-none tracking-tight text-slate-900 tabular-nums dark:text-slate-50"
          >
            {formatCurrency(customer.totals.outstanding, displayCurrency)}
          </p>
        </Card>
      </section>

      <section className="grid gap-8 lg:grid-cols-[minmax(0,1.65fr)_minmax(300px,1fr)]">
        <div className="space-y-6">
          <div className="flex overflow-x-auto border-b border-slate-200 dark:border-slate-800">
            {TAB_ITEMS.map((item) => {
              const active = item.key === activeTab;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setTab(item.key)}
                  className={`relative whitespace-nowrap px-4 py-3 text-sm font-medium transition-colors ${
                    active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {t(item.labels)}
                  {active ? <span className="absolute inset-x-0 bottom-0 h-0.5 bg-indigo-600" /> : null}
                </button>
              );
            })}
          </div>

          {activeTab === "overview" ? (
            <div className="space-y-6">
              <Card className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-950 dark:shadow-[0_18px_40px_rgba(2,6,23,0.45)]">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-foreground">{t("Revenue trend (30 days)", "Tendance revenus (30 jours)", "Umsatztrend (30 Tage)", "Tendencia de ingresos (30 días)", "Tendencia de receita (30 dias)")}</p>
                  <p className="text-xs text-muted-foreground">{t("Last 30 days", "30 derniers jours", "Letzte 30 Tage", "Últimos 30 días", "Últimos 30 dias")}</p>
                </div>
                <div className="mt-5 grid grid-cols-10 items-end gap-2">
                  {chartPoints.map((point) => {
                    const positiveHeight =
                      point.value > 0 && maxPositiveChartValue > 0
                        ? Math.max(6, Math.round((point.value / maxPositiveChartValue) * (hasNegativeChartValues ? 44 : 96)))
                        : 0;
                    const negativeHeight =
                      point.value < 0 && maxNegativeChartValue > 0
                        ? Math.max(6, Math.round((Math.abs(point.value) / maxNegativeChartValue) * 44))
                        : 0;

                    return (
                      <div key={point.date} className="flex flex-col items-center gap-2">
                        <div className="relative h-24 w-full">
                          <div
                            className={`absolute inset-x-0 border-t border-slate-200 dark:border-slate-700 ${
                              hasNegativeChartValues ? "top-1/2" : "bottom-0"
                            }`}
                          />
                          {point.value > 0 ? (
                            <div
                              className="absolute inset-x-1 rounded-md bg-indigo-500/35"
                              style={{
                                bottom: hasNegativeChartValues ? "50%" : "0",
                                height: `${positiveHeight}px`,
                              }}
                            />
                          ) : null}
                          {point.value < 0 ? (
                            <div
                              className="absolute inset-x-1 rounded-md bg-rose-400/55"
                              style={{
                                top: "50%",
                                height: `${negativeHeight}px`,
                              }}
                            />
                          ) : null}
                          {point.value === 0 ? (
                            <div
                              className="absolute inset-x-[32%] h-1.5 rounded-full bg-slate-200 dark:bg-slate-700"
                              style={{ top: hasNegativeChartValues ? "calc(50% - 3px)" : "calc(100% - 3px)" }}
                            />
                          ) : null}
                        </div>
                        <span className="text-[10px] text-slate-500 dark:text-slate-400">{point.date.slice(5).replace("-", "/")}</span>
                      </div>
                    );
                  })}
                </div>
              </Card>

              <div className="grid gap-6 xl:grid-cols-2">
                <Card className="rounded-2xl border border-slate-200 bg-white p-0 shadow-sm dark:border-slate-800 dark:bg-slate-950 dark:shadow-[0_18px_40px_rgba(2,6,23,0.45)]" title={t("Recent invoices", "Factures recentes", "Letzte Rechnungen", "Facturas recientes", "Faturas recentes")}>
                  <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {recentInvoices.length === 0 ? (
                      <p className="p-4 text-sm text-muted-foreground">{t("No invoices yet.", "Aucune facture pour le moment.", "Noch keine Rechnungen.", "Todavia no hay facturas.", "Ainda não existem faturas.")}</p>
                    ) : (
                      recentInvoices.map((invoice) => (
                        <div key={invoice.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-4 py-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-foreground" title={invoice.invoiceNumber}>
                              {invoice.invoiceNumber}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {formatRelative(invoice.issueDate)}
                            </p>
                          </div>
                          <p className="justify-self-end whitespace-nowrap text-right text-sm font-semibold text-foreground tabular-nums">
                            {formatCurrency(invoice.amount, invoice.currency || displayCurrency)}
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                </Card>
                <Card className="rounded-2xl border border-slate-200 bg-white p-0 shadow-sm dark:border-slate-800 dark:bg-slate-950 dark:shadow-[0_18px_40px_rgba(2,6,23,0.45)]" title={t("Recent payments", "Paiements r?cents", "Letzte Zahlungen", "Pagos recientes", "Pagamentos recentes")}>
                  <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {recentPayments.length === 0 ? (
                      <p className="p-4 text-sm text-muted-foreground">{t("No payments yet.", "Aucun paiement pour le moment.", "Noch keine Zahlungen.", "Todavia no hay pagos.", "Ainda não existem pagamentos.")}</p>
                    ) : (
                      recentPayments.map((payment) => (
                        <div key={payment.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-4 py-3">
                          <div className="min-w-0">
                            <p
                              className="truncate text-sm font-medium text-foreground"
                              title={payment.invoiceNumber || t("Unlinked payment", "Paiement non lie", "Nicht verknupfte Zahlung", "Pago no vinculado", "Pagamento não associado")}
                            >
                              {payment.invoiceNumber || t("Unlinked payment", "Paiement non lie", "Nicht verknupfte Zahlung", "Pago no vinculado", "Pagamento não associado")}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {formatRelative(payment.createdAt)}
                            </p>
                          </div>
                          <p className="justify-self-end whitespace-nowrap text-right text-sm font-semibold text-foreground tabular-nums">
                            {formatCurrency(payment.amount, payment.currency || displayCurrency)}
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                </Card>
              </div>
            </div>
          ) : null}

          {activeTab === "invoices" ? (
            <Card className="rounded-2xl border border-slate-200 bg-white p-0 shadow-sm dark:border-slate-800 dark:bg-slate-950 dark:shadow-[0_18px_40px_rgba(2,6,23,0.45)]">
              <div className="overflow-x-auto">
                {data.invoices.length === 0 ? (
                  <p className="p-6 text-sm text-muted-foreground">{t("No invoices yet.", "Aucune facture pour le moment.", "Noch keine Rechnungen.", "Todavia no hay facturas.", "Ainda não existem faturas.")}</p>
                ) : (
                  <div className="min-w-[880px]">
                    <div className={data.invoices.length >= 5 ? "max-h-[20rem] overflow-y-auto" : ""}>
                    <div className="sticky top-0 z-10 grid grid-cols-[minmax(132px,1.25fr)_minmax(96px,0.8fr)_minmax(168px,1fr)_minmax(168px,1fr)_minmax(144px,1.05fr)_minmax(88px,auto)] items-center gap-4 border-b border-slate-200 bg-white/95 px-5 py-3 text-center text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-600 shadow-[0_14px_28px_-24px_rgba(15,23,42,0.45)] backdrop-blur dark:border-slate-800 dark:bg-slate-950/95 dark:text-slate-400 md:text-[11px]">
                      <p className="break-words leading-tight">{t("Invoice #", "Facture #", "Rechnung #", "Factura #", "Fatura #")}</p>
                      <p className="break-words leading-tight">{t("Status", "Statut", "Status", "Estado", "Estado")}</p>
                      <p className="break-words leading-tight">{t("Issue Date", "Date emission", "Ausstellungsdatum", "Fecha de emision", "Data de emissao")}</p>
                      <p className="break-words leading-tight">{t("Due Date", "Date echeance", "Falligkeitsdatum", "Fecha de vencimiento", "Data de vencimento")}</p>
                      <p className="break-words leading-tight">{t("Amount", "Montant", "Betrag", "Importe", "Montante")}</p>
                      <p className="break-words leading-tight">{t("Action", "Action", "Aktion", "Acción", "Ação")}</p>
                    </div>
                    <div className="divide-y divide-slate-100 dark:divide-slate-800">
                      {data.invoices.map((invoice) => (
                        <div
                          key={invoice.id}
                          className="grid min-h-16 grid-cols-[minmax(132px,1.25fr)_minmax(96px,0.8fr)_minmax(168px,1fr)_minmax(168px,1fr)_minmax(144px,1.05fr)_minmax(88px,auto)] items-center gap-4 px-5 py-3 text-sm hover:bg-slate-50/80 dark:hover:bg-slate-900/80"
                        >
                          <div className="truncate whitespace-nowrap text-center font-medium text-foreground" title={invoice.invoiceNumber}>
                            {invoice.invoiceNumber}
                          </div>
                          <div className="text-center text-slate-600 dark:text-slate-400">{localizeInvoiceStatus(invoice.status)}</div>
                          <div className="text-center text-slate-600 dark:text-slate-400">{formatDate(invoice.issueDate)}</div>
                          <div className="text-center text-slate-600 dark:text-slate-400">{invoice.dueDate ? formatDate(invoice.dueDate) : "--"}</div>
                          <div className="whitespace-nowrap text-center font-semibold text-foreground tabular-nums">
                            {formatCurrency(invoice.amount, invoice.currency || displayCurrency)}
                          </div>
                          <div className="flex justify-center">
                            <Link href={`/dashboard/invoices/${invoice.id}`} className="text-indigo-600 hover:underline">
                              {t("View", "Voir", "Ansehen", "Ver", "Ver")}
                            </Link>
                          </div>
                        </div>
                      ))}
                    </div>
                    </div>
                  </div>
                )}
              </div>
            </Card>
          ) : null}

          {activeTab === "payments" ? (
            <Card className="rounded-2xl border border-slate-200 bg-white p-0 shadow-sm dark:border-slate-800 dark:bg-slate-950 dark:shadow-[0_18px_40px_rgba(2,6,23,0.45)]">
              <div className="overflow-x-auto">
                {data.payments.length === 0 ? (
                  <p className="p-6 text-sm text-muted-foreground">{t("No payments yet.", "Aucun paiement pour le moment.", "Noch keine Zahlungen.", "Todavia no hay pagos.", "Ainda não existem pagamentos.")}</p>
                ) : (
                  <div className="min-w-[720px]">
                    <div className={data.payments.length >= 4 ? "max-h-[15rem] overflow-y-auto" : ""}>
                      <div className="sticky top-0 z-10 grid grid-cols-[minmax(132px,1fr)_minmax(148px,1.15fr)_minmax(144px,0.95fr)_minmax(120px,0.9fr)_minmax(112px,0.85fr)] items-center gap-4 border-b border-slate-200 bg-white/95 px-5 py-3 text-center text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-600 shadow-[0_14px_28px_-24px_rgba(15,23,42,0.45)] backdrop-blur dark:border-slate-800 dark:bg-slate-950/95 dark:text-slate-400 md:text-[11px]">
                        <p className="break-words leading-tight">{t("Date", "Date", "Datum", "Fecha", "Data")}</p>
                        <p className="break-words leading-tight">{t("Invoice #", "Facture #", "Rechnung #", "Factura #", "Fatura #")}</p>
                        <p className="break-words leading-tight">{t("Amount", "Montant", "Betrag", "Importe", "Montante")}</p>
                        <p className="break-words leading-tight">{t("Provider", "Fournisseur", "Anbieter", "Proveedor", "Provedor")}</p>
                        <p className="break-words leading-tight">{t("Status", "Statut", "Status", "Estado", "Estado")}</p>
                      </div>
                      <div className="divide-y divide-slate-100 dark:divide-slate-800">
                        {data.payments.map((payment) => (
                          <div
                            key={payment.id}
                            className="grid min-h-16 grid-cols-[minmax(132px,1fr)_minmax(148px,1.15fr)_minmax(144px,0.95fr)_minmax(120px,0.9fr)_minmax(112px,0.85fr)] items-center gap-4 px-5 py-3 text-center text-sm hover:bg-slate-50/80 dark:hover:bg-slate-900/80"
                          >
                            <div className="text-slate-600 dark:text-slate-400">{formatDate(payment.createdAt)}</div>
                            <div
                              className="truncate font-medium text-foreground"
                              title={payment.invoiceNumber || t("Unlinked payment", "Paiement non lie", "Nicht verknupfte Zahlung", "Pago no vinculado", "Pagamento n\u00e3o associado")}
                            >
                              {payment.invoiceNumber || "--"}
                            </div>
                            <div className="whitespace-nowrap font-semibold text-foreground tabular-nums">
                              {formatCurrency(payment.amount, payment.currency || displayCurrency)}
                            </div>
                            <div className="truncate text-slate-600 dark:text-slate-400" title={payment.provider}>
                              {payment.provider}
                            </div>
                            <div className="text-slate-600 dark:text-slate-400">{localizePaymentStatus(payment.status)}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </Card>
          ) : null}

          {activeTab === "activity" ? (
            <Card className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-950 dark:shadow-[0_18px_40px_rgba(2,6,23,0.45)]">
              {data.activity.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("No recent activity.", "Aucune activité recente.", "Keine aktuelle Aktivität.", "No hay actividad reciente.", "Não há atividade recente.")}</p>
              ) : (
                <div className={data.activity.length >= 6 ? "max-h-[18rem] overflow-y-auto pr-2" : "pr-2"}>
                  <div className="relative ml-3 border-l border-slate-200 pl-6 dark:border-slate-800">
                    <div className="space-y-6">
                      {data.activity.map((event) => (
                        <div key={event.id} className="relative">
                          <span className="absolute -left-[30px] top-1 h-2.5 w-2.5 rounded-full bg-indigo-500" />
                          <p className="text-sm font-medium text-foreground">{localizeActivityTitle(event)}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatRelative(event.timestamp)}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </Card>
          ) : null}

          {activeTab === "notes" ? (
            <Card className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-950 dark:shadow-[0_18px_40px_rgba(2,6,23,0.45)]">
              <div className="mb-4 flex items-center justify-between">
                <p className="text-sm font-semibold text-foreground">{t("Private Notes", "Notes priv?es", "Private Notizen", "Notas privadas", "Notas privadas")}</p>
              </div>
              <p className="mb-4 text-xs text-muted-foreground">
                {data?.notesSharedWithTeam
                  ? t(
                      "Private notes are saved to this workspace and shared with your team members who can access billing.",
                      "Les notes priv?es sont enregistrees dans cet espace de travail et partagees avec les membres de votre équipe qui peuvent acceder a la facturation.",
                      "Private Notizen werden in diesem Workspace gespeichert und mit Teammitgliedern geteilt, die Zugriff auf die Abrechnung haben.",
                      "Las notas privadas se guardan en este espacio de trabajo y se comparten con los miembros del equipo que tienen acceso a facturación.",
                      "As notas privadas são guardadas neste espa?o de trabalho e partilhadas com os membros da sua equipa que podem aceder a faturação."
                    )
                  : t(
                      "Private notes are saved to this workspace.",
                      "Les notes priv?es sont enregistrees dans cet espace de travail.",
                      "Private Notizen werden in diesem Workspace gespeichert.",
                      "Las notas privadas se guardan en este espacio de trabajo.",
                      "As notas privadas são guardadas neste espa?o de trabalho."
                    )}
              </p>
              <div className="space-y-3">
                <textarea
                  value={noteDraft}
                  onChange={(event) => setNoteDraft(event.target.value)}
                  placeholder={t("Add a note about this customer", "Ajouter une note sur ce client", "Notiz zu diesem Kunden hinzufügen", "Agregar una nota sobre este cliente", "Adicionar uma nota sobre este cliente")}
                  className="min-h-[110px] w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-400 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:placeholder:text-slate-500"
                />
                <div className="flex items-center gap-2">
                  <Button type="button" onClick={() => void saveNote()} disabled={noteSubmitting}>
                    {editingNoteId
                      ? t("Update note", "Mettre ? jour la note", "Notiz aktualisieren", "Actualizar nota", "Atualizar nota")
                      : t("Add note", "Ajouter une note", "Notiz hinzufügen", "Agregar nota", "Adicionar nota")}
                  </Button>
                  {editingNoteId ? (
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={noteSubmitting}
                      onClick={() => {
                        setEditingNoteId(null);
                        setNoteDraft("");
                      }}
                    >
                      {t("Cancel", "Annuler", "Abbrechen", "Cancelar", "Cancelar")}
                    </Button>
                  ) : null}
                </div>
              </div>

              <div className={`mt-5 overflow-y-auto pr-2 ${notes.length > 1 ? "max-h-[9.5rem]" : ""}`}>
                <div className="space-y-3">
                {notes.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("No notes yet.", "Aucune note pour le moment.", "Noch keine Notizen.", "Todavia no hay notas.", "Ainda não existem notas.")}</p>
                ) : (
                  notes.map((note) => (
                    <div key={note.id} className="rounded-xl border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-900/80">
                      <p className="whitespace-pre-wrap text-sm text-foreground">{note.content}</p>
                      <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                        <span>
                          {formatDateTime(note.updatedAt)}
                          {note.author?.name || note.author?.email ? ` • ${note.author?.name || note.author?.email}` : ""}
                        </span>
                        <div className="flex items-center gap-3">
                          <button type="button" className="text-indigo-600 hover:underline" onClick={() => editNote(note)}>
                            {t("Edit", "Modifier", "Bearbeiten", "Editar", "Editar")}
                          </button>
                          <button
                            type="button"
                            className="text-rose-600 hover:underline disabled:cursor-not-allowed disabled:opacity-60"
                            disabled={deletingNoteId === note.id}
                            onClick={() => void removeNote(note.id)}
                          >
                            {deletingNoteId === note.id
                              ? t("Deleting...", "Suppression...", "Loscht...", "Eliminando...", "A eliminar...")
                              : t("Delete", "Supprimer", "L?schen", "Eliminar", "Eliminar")}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
                </div>
              </div>
            </Card>
          ) : null}
        </div>

        <aside className="h-fit space-y-4 lg:sticky lg:top-24">
          <Card className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-950 dark:shadow-[0_18px_40px_rgba(2,6,23,0.45)]">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">{t("Customer intelligence", "Intelligence client", "Kundenintelligenz", "Inteligencia del cliente", "Inteligencia do cliente")}</p>
            <div className="mt-4 space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">{t("Status", "Statut", "Status", "Estado", "Estado")}</span>
                <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${STATUS_CLASS[customer.status]}`}>
                  {localizeCustomerStatus(customer.status)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">{t("Lifetime value", "Valeur vie", "Lifetime-Wert", "Valor de vida", "Valor vitalicio")}</span>
                <span className="max-w-[11rem] truncate text-right font-semibold text-foreground tabular-nums">
                  {formatCurrency(customer.lifetimeValue, displayCurrency)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">{t("Outstanding", "En attente", "Offen", "Pendiente", "Pendente")}</span>
                <span className="max-w-[11rem] truncate text-right font-semibold text-foreground tabular-nums">
                  {formatCurrency(customer.totals.outstanding, displayCurrency)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">{t("Last payment", "Dernier paiement", "Letzte Zahlung", "Último pago", "Último pagamento")}</span>
                <span className="font-medium text-foreground">
                  {customer.lastPayment
                    ? formatRelative(customer.lastPayment.createdAt)
                    : "--"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">{t("Last invoice", "Derni?re facture", "Letzte Rechnung", "Última factura", "Última fatura")}</span>
                <span className="font-medium text-foreground">
                  {customer.lastInvoice
                    ? formatRelative(customer.lastInvoice.createdAt)
                    : "--"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">{t("Customer since", "Client depuis", "Kunde seit", "Cliente desde", "Cliente desde")}</span>
                <span className="font-medium text-foreground">{formatDate(customer.createdAt)}</span>
              </div>
            </div>
            <div className="mt-5 space-y-2">
              {customer.status === "DISABLED" ? (
                <Button variant="secondary" className="h-10 w-full" disabled>
                  {t("Customer disabled", "Client d?sactiv?", "Kunde deaktiviert", "Cliente desactivado", "Cliente desativado")}
                </Button>
              ) : (
                <Link href={`/dashboard/invoices?customerId=${encodeURIComponent(customer.id)}`} className="block">
                  <Button className="h-10 w-full">{t("Create Invoice", "Créer une facture", "Rechnung erstellen", "Crear factura", "Criar fatura")}</Button>
                </Link>
              )}
              <Button
                variant="secondary"
                className="h-10 w-full"
                onClick={() => setShowReminderModal(true)}
                disabled={customer.status === "DISABLED" || !hasReminderCandidate}
              >
                  {t("Send Reminder", "Envoyer un rappel", "Erinnerung senden", "Enviar recordatorio", "Enviar lembrete")}
              </Button>
              {customer.status === "DISABLED" ? (
                <Button
                  variant="secondary"
                  className="h-10 w-full"
                  onClick={handleRestore}
                  loading={disableSubmitting}
                  disabled={erased}
                >
                  {t("Restore Customer", "Restaurer le client", "Kunden wiederherstellen", "Restaurar cliente", "Restaurar cliente")}
                </Button>
              ) : (
                <Button
                  variant="danger"
                  className="h-10 w-full"
                  onClick={() => setShowDisableModal(true)}
                >
                  {t("Disable Customer", "Desactiver le client", "Kunden deaktivieren", "Desactivar cliente", "Desativar cliente")}
                </Button>
              )}
            </div>
          </Card>
          <Card className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-950 dark:shadow-[0_18px_40px_rgba(2,6,23,0.45)]">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
              {t("Compliance", "Conformité", "Compliance", "Cumplimiento", "Conformidade")}
            </p>
            <div className="mt-4 space-y-3 text-sm">
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">{t("Email contact", "Contact email", "E-Mail-Kontakt", "Contacto por correo", "Contacto por email")}</span>
                <span className="font-medium text-foreground">
                  {compliance?.emailOptOut
                    ? t("Blocked", "Bloque", "Blockiert", "Bloqueado", "Bloqueado")
                    : t("Allowed", "Autorise", "Erlaubt", "Permitido", "Permitido")}
                </span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">{t("WhatsApp contact", "Contact WhatsApp", "WhatsApp-Kontakt", "Contacto por WhatsApp", "Contacto por WhatsApp")}</span>
                <span className="font-medium text-foreground">
                  {compliance?.whatsappOptOut
                    ? t("Blocked", "Bloque", "Blockiert", "Bloqueado", "Bloqueado")
                    : t("Allowed", "Autorise", "Erlaubt", "Permitido", "Permitido")}
                </span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">{t("Processing", "Traitement", "Verarbeitung", "Tratamiento", "Tratamento")}</span>
                <span className="font-medium text-foreground">
                  {erased
                    ? t("Erased", "Efface", "Gelöscht", "Borrado", "Apagado")
                    : processingRestricted
                      ? t("Restricted", "Restreint", "Eingeschrankt", "Restringido", "Restrito")
                      : t("Active", "Actif", "Aktiv", "Activo", "Ativo")}
                </span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">{t("Consent updated", "Consentement mis à jour", "Einwilligung aktualisiert", "Consentimiento actualizado", "Consentimento atualizado")}</span>
                <span className="font-medium text-foreground">
                  {compliance?.consentCapturedAt ? formatDateTime(compliance.consentCapturedAt) : "--"}
                </span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">{t("Consent source", "Source du consentement", "Quelle der Einwilligung", "Fuente del consentimiento", "Fonte do consentimento")}</span>
                <span className="font-medium text-foreground">{compliance?.consentSource || "--"}</span>
              </div>
            </div>
            <div className="mt-5 space-y-2">
              <Button
                variant="secondary"
                className="h-10 w-full"
                disabled={exporting}
                onClick={() => void handleExportCustomerData()}
              >
                {exporting
                  ? t("Preparing export...", "Preparation de l export...", "Export wird vorbereitet...", "Preparando exportacion...", "A preparar exportacao...")
                  : t("Export Customer Data", "Exporter les données client", "Kundendaten exportieren", "Exportar datos del cliente", "Exportar dados do cliente")}
              </Button>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="secondary"
                  className="h-10 w-full"
                  disabled={policySubmitting || erased}
                  onClick={() =>
                    void runCustomerAction(
                      compliance?.emailOptOut ? "allow_email" : "block_email",
                      compliance?.emailOptOut
                        ? t("Email contact restored.", "Contact email restaure.", "E-Mail-Kontakt wiederhergestellt.", "Contacto por correo restaurado.", "Contacto por email restaurado.")
                        : t("Email contact blocked.", "Contact email bloque.", "E-Mail-Kontakt blockiert.", "Contacto por correo bloqueado.", "Contacto por email bloqueado.")
                    )
                  }
                >
                  {compliance?.emailOptOut
                    ? t("Allow Email", "Autoriser email", "E-Mail erlauben", "Permitir correo", "Permitir email")
                    : t("Block Email", "Bloquer email", "E-Mail blockieren", "Bloquear correo", "Bloquear email")}
                </Button>
                <Button
                  variant="secondary"
                  className="h-10 w-full"
                  disabled={policySubmitting || erased}
                  onClick={() =>
                    void runCustomerAction(
                      compliance?.whatsappOptOut ? "allow_whatsapp" : "block_whatsapp",
                      compliance?.whatsappOptOut
                        ? t("WhatsApp contact restored.", "Contact WhatsApp restaure.", "WhatsApp-Kontakt wiederhergestellt.", "Contacto por WhatsApp restaurado.", "Contacto por WhatsApp restaurado.")
                        : t("WhatsApp contact blocked.", "Contact WhatsApp bloque.", "WhatsApp-Kontakt blockiert.", "Contacto por WhatsApp bloqueado.", "Contacto por WhatsApp bloqueado.")
                    )
                  }
                >
                  {compliance?.whatsappOptOut
                    ? t("Allow WhatsApp", "Autoriser WhatsApp", "WhatsApp erlauben", "Permitir WhatsApp", "Permitir WhatsApp")
                    : t("Block WhatsApp", "Bloquer WhatsApp", "WhatsApp blockieren", "Bloquear WhatsApp", "Bloquear WhatsApp")}
                </Button>
              </div>
              <Button
                variant="secondary"
                className="h-10 w-full"
                disabled={policySubmitting || erased}
                onClick={() =>
                  void runCustomerAction(
                    processingRestricted ? "resume_processing" : "restrict_processing",
                    processingRestricted
                      ? t("Customer processing resumed.", "Traitement du client repris.", "Kundenverarbeitung fortgesetzt.", "Tratamiento del cliente reanudado.", "Tratamento do cliente retomado.")
                      : t("Customer processing restricted.", "Traitement du client restreint.", "Kundenverarbeitung eingeschrankt.", "Tratamiento del cliente restringido.", "Tratamento do cliente restringido.")
                  )
                }
              >
                {processingRestricted
                  ? t("Resume Processing", "Reprendre le traitement", "Verarbeitung fortsetzen", "Reanudar tratamiento", "Retomar tratamento")
                  : t("Restrict Processing", "Restreindre le traitement", "Verarbeitung einschranken", "Restringir tratamiento", "Restringir tratamento")}
              </Button>
              <Button
                variant="danger"
                className="h-10 w-full"
                disabled={policySubmitting || erased}
                onClick={() => setShowEraseModal(true)}
              >
                {erased
                  ? t("Customer Erased", "Client efface", "Kunde gelöscht", "Cliente borrado", "Cliente apagado")
                  : t("Erase Customer Data", "Effacer les données client", "Kundendaten loschen", "Borrar datos del cliente", "Apagar dados do cliente")}
              </Button>
            </div>
          </Card>
        </aside>
      </section>

      <ConfirmationModal
        open={showDisableModal}
        variant="danger"
        title={t("Disable Customer", "Desactiver le client", "Kunden deaktivieren", "Desactivar cliente", "Desativar cliente")}
        description={t(
          "Are you sure you want to disable this customer? Existing invoices will remain available after disabling.",
          "Voulez-vous vraiment désactiver ce client ? Les factures existantes resteront disponibles après la desactivation.",
          "Mochtest du diesen Kunden wirklich deaktivieren? Bestehende Rechnungen bleiben nach der Deaktivierung verfügbar.",
          "Seguro que quieres desactivar a este cliente? Las facturas existentes seguiran disponibles después de desactivarlo.",
          "Tem a certeza de que pretende desativar este cliente? As faturas existentes continuarao disponíveis após a desativacao."
        )}
        confirmLabel={disableSubmitting
          ? t("Disabling...", "Desactivation...", "Deaktivierung...", "Desactivando...", "A desativar...")
          : t("Disable Customer", "Desactiver le client", "Kunden deaktivieren", "Desactivar cliente", "Desativar cliente")}
        onConfirm={handleDisable}
        onCancel={() => {
          if (!disableSubmitting) setShowDisableModal(false);
        }}
      />

      <ConfirmationModal
        open={showReminderModal}
        variant="primary"
        title={t("Send Payment Reminder?", "Envoyer un rappel de paiement ?", "Zahlungserinnerung senden?", "Enviar recordatorio de pago?", "Enviar lembrete de pagamento?")}
        description={
          canApplyLateFeeManually
            ? t(
                "This will notify the customer about their unpaid invoice. You can apply the late fee before sending.",
                "Cela informera le client de sa facture impayee. Vous pouvez appliquer les frais de retard avant l envoi.",
                "Der Kunde wird über seine unbezahlte Rechnung informiert. Du kannst vor dem Senden eine Mahngebühr anwenden.",
                "Esto avisara al cliente sobre su factura impagada. Puedes aplicar el recargo antes de enviarlo.",
                "Isto notificara o cliente sobre a sua fatura em atraso. Pode aplicar a taxa de atraso antes de enviar."
              )
            : t(
                "This will notify the customer about their unpaid invoice.",
                "Cela informera le client de sa facture impayee.",
                "Der Kunde wird über seine unbezahlte Rechnung informiert.",
                "Esto avisara al cliente sobre su factura impagada.",
                "Isto notificara o cliente sobre a sua fatura em atraso."
              )
        }
        confirmLabel={
          reminderSubmitting
            ? canApplyLateFeeManually
              ? t("Applying & Sending...", "Application et envoi...", "Wird angewendet und gesendet...", "Aplicando y enviando...", "A aplicar e enviar...")
              : t("Sending...", "Envoi...", "Wird gesendet...", "Enviando...", "A enviar...")
            : canApplyLateFeeManually
              ? t("Apply Late Fee & Send Reminder", "Appliquer les frais et envoyer le rappel", "Mahngebühr anwenden und Erinnerung senden", "Aplicar recargo y enviar recordatorio", "Aplicar taxa de atraso e enviar lembrete")
              : t("Send Reminder", "Envoyer un rappel", "Erinnerung senden", "Enviar recordatorio", "Enviar lembrete")
        }
        secondaryConfirmLabel={
          canApplyLateFeeManually
            ? reminderSubmitting
              ? t("Sending...", "Envoi...", "Wird gesendet...", "Enviando...", "A enviar...")
              : t("Send Reminder Only", "Envoyer le rappel seulement", "Nur Erinnerung senden", "Enviar solo recordatorio", "Enviar apenas lembrete")
            : undefined
        }
        onConfirm={() => handleSendReminder(canApplyLateFeeManually)}
        onSecondaryConfirm={canApplyLateFeeManually ? () => handleSendReminder(false) : undefined}
        onCancel={() => {
          if (!reminderSubmitting) setShowReminderModal(false);
        }}
      />

      <ConfirmationModal
        open={showEraseModal}
        variant="danger"
        title={t("Erase Customer Data", "Effacer les données client", "Kundendaten loschen", "Borrar datos del cliente", "Apagar dados do cliente")}
        description={t(
          "This will immediately redact the live customer record, block future contact, and remove private notes. Historical invoices and payments remain for accounting records.",
          "Cela anonymisera immediatement la fiche client active, bloquera les contacts futurs et supprimera les notes privees. Les factures et paiements historiques restent conserves pour la comptabilite.",
          "Dies anonymisiert den aktiven Kundendatensatz sofort, blockiert zukunftigen Kontakt und entfernt private Notizen. Historische Rechnungen und Zahlungen bleiben für Buchhaltungszwecke erhalten.",
          "Esto anonimizara de inmediato el registro activo del cliente, bloqueara el contacto futuro y eliminara las notas privadas. Las facturas y pagos historicos se conservan por motivos contables.",
          "Isto anonimiza imediatamente o registo ativo do cliente, bloqueia contactos futuros e remove notas privadas. As faturas e pagamentos historicos mantem-se para fins contabilisticos."
        )}
        confirmLabel={
          policySubmitting
            ? t("Erasing...", "Effacement...", "Loschen...", "Borrando...", "A apagar...")
            : t("Erase Customer Data", "Effacer les données client", "Kundendaten loschen", "Borrar datos del cliente", "Apagar dados do cliente")
        }
        onConfirm={() =>
          void runCustomerAction(
            "erase",
            t(
              "Customer data erased.",
              "Les données du client ont été effacees.",
              "Kundendaten wurden gelöscht.",
              "Los datos del cliente füron borrados.",
              "Os dados do cliente foram apagados."
            )
          )
        }
        onCancel={() => {
          if (!policySubmitting) setShowEraseModal(false);
        }}
      />
    </div>
  );
}
