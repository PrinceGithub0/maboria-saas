"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  Clock3,
  CreditCard,
  FileText,
  GripVertical,
  Mail,
  MessageCircle,
  Plus,
  Receipt,
  Sparkles,
  Trash2,
  UserPlus,
  XCircle,
} from "lucide-react";
import {
  cloneAutomationTemplate,
  getAutomationTemplate,
  type AutomationTemplateStep,
  type AutomationTemplateTrigger,
} from "@/lib/automation-templates";
import {
  isSupportedDashboardActionId,
  isSupportedDashboardStartId,
} from "@/lib/automation/dashboard-definition";
import { useLanguage } from "@/components/providers/language-provider";
import { getLocalizedText, LANGUAGE_LOCALES, type LocalizedText } from "@/lib/i18n";
import { ConfirmationModal } from "@/components/ui/ConfirmationModal";

type StartId =
  | "invoice_created"
  | "invoice_paid"
  | "invoice_overdue"
  | "payment_received"
  | "payment_failed"
  | "customer_created"
  | "whatsapp_received"
  | "email_received";

type Start = {
  id: StartId;
  group: "Invoices" | "Payments" | "Customers" | "Messaging";
  title: string;
  desc: string;
  phrase: string;
  type: string;
  available?: boolean;
};

type Def = { id: string; group: string; title: string; phrase: string; type: string; available?: boolean };
type Mode = "now" | "after";
type Unit = "minutes" | "hours" | "days";
type Window = "anytime" | "business" | "outside";
type Act = {
  id: number;
  aid: string;
  type: string;
  note: string;
  mode: Mode;
  val: string;
  unit: Unit;
  window: Window;
  stop: boolean;
  edit: boolean;
  extraConfig?: Record<string, unknown>;
};

const TEMPLATE_TRIGGER_TO_START_ID: Record<AutomationTemplateTrigger, StartId> = {
  INVOICE_OVERDUE: "invoice_overdue",
  INVOICE_PAID: "invoice_paid",
};

const TEMPLATE_STEP_TO_ACTION_ID: Record<AutomationTemplateStep["type"], string> = {
  SEND_EMAIL: "send_email",
  SEND_WHATSAPP: "send_whatsapp_message",
};

const VALID_AUTOMATION_STATUSES = ["DRAFT", "ACTIVE", "PAUSED", "ARCHIVED"] as const;
type AutomationStatus = (typeof VALID_AUTOMATION_STATUSES)[number];

const STARTS: Start[] = [
  { id: "invoice_created", group: "Invoices", title: "Invoice Created", desc: "When a new invoice is issued", phrase: "an invoice is created", type: "generateInvoice" },
  { id: "invoice_paid", group: "Invoices", title: "Invoice Paid", desc: "When a customer completes payment", phrase: "an invoice is paid", type: "generateInvoice" },
  { id: "invoice_overdue", group: "Invoices", title: "Invoice Overdue", desc: "When an unpaid invoice passes its due date", phrase: "an invoice becomes overdue", type: "generateInvoice" },
  { id: "payment_received", group: "Payments", title: "Payment Received", desc: "When money is received successfully", phrase: "a payment is received", type: "generateInvoice" },
  { id: "payment_failed", group: "Payments", title: "Payment Failed", desc: "When a payment attempt does not complete", phrase: "a payment fails", type: "generateInvoice" },
  { id: "customer_created", group: "Customers", title: "New Customer Created", desc: "When a new customer profile is added", phrase: "a new customer is created", type: "generateInvoice", available: false },
  { id: "whatsapp_received", group: "Messaging", title: "New WhatsApp Message Received", desc: "When a customer sends a WhatsApp message", phrase: "a WhatsApp message is received", type: "generateInvoice", available: false },
  { id: "email_received", group: "Messaging", title: "New Email Received", desc: "When a customer sends an email", phrase: "an email is received", type: "generateInvoice", available: false },
];

const DEFS: Def[] = [
  { id: "send_whatsapp_message", group: "Send a Message", title: "Send WhatsApp message", phrase: "send a WhatsApp message", type: "sendWhatsApp" },
  { id: "send_email", group: "Send a Message", title: "Send Email", phrase: "send an email", type: "sendEmail" },
  { id: "send_receipt", group: "Send a Message", title: "Send Receipt", phrase: "send a receipt", type: "sendEmail" },
  { id: "send_payment_reminder", group: "Send a Message", title: "Send Payment Reminder", phrase: "send a payment reminder", type: "sendWhatsApp" },
  { id: "send_payment_confirmation", group: "Send a Message", title: "Send Payment Confirmation", phrase: "send a payment confirmation", type: "sendWhatsApp" },
  { id: "send_failed_payment_message", group: "Send a Message", title: "Send Failed Payment Message", phrase: "send a failed payment message", type: "sendWhatsApp" },
  { id: "create_invoice", group: "Manage Invoice", title: "Create Invoice", phrase: "create an invoice", type: "generateInvoice" },
  { id: "mark_as_paid", group: "Manage Invoice", title: "Mark as Paid", phrase: "mark the invoice as paid", type: "generateInvoice", available: false },
  { id: "apply_late_fee", group: "Manage Invoice", title: "Apply Late Fee", phrase: "apply a late fee", type: "generateInvoice" },
  { id: "cancel_invoice", group: "Manage Invoice", title: "Cancel Invoice", phrase: "cancel the invoice", type: "generateInvoice", available: false },
  { id: "issue_refund", group: "Payment & Confirmation", title: "Issue Refund", phrase: "issue a refund", type: "generateReport", available: false },
  { id: "notify_team_payment", group: "Payment & Confirmation", title: "Notify Team of Payment", phrase: "notify the team about payment", type: "sendEmail" },
  { id: "send_payment_link", group: "Payment & Confirmation", title: "Send Payment Link", phrase: "send a payment link", type: "sendWhatsApp" },
  { id: "add_tag", group: "Update Customer", title: "Add Tag", phrase: "add a customer tag", type: "generateReport", available: false },
  { id: "remove_tag", group: "Update Customer", title: "Remove Tag", phrase: "remove a customer tag", type: "generateReport", available: false },
  { id: "update_status", group: "Update Customer", title: "Update Status", phrase: "update customer status", type: "generateReport", available: false },
  { id: "assign_team_member", group: "Update Customer", title: "Assign to Team Member", phrase: "assign to a team member", type: "generateReport", available: false },
  { id: "add_internal_note", group: "Update Customer", title: "Add Internal Note", phrase: "add an internal note", type: "generateReport", available: false },
  { id: "improve_message", group: "AI Assist", title: "Improve Message", phrase: "improve a message with AI", type: "aiTransform" },
  { id: "rewrite_tone", group: "AI Assist", title: "Rewrite Tone", phrase: "rewrite the message tone", type: "aiTransform" },
  { id: "generate_auto_reply", group: "AI Assist", title: "Generate Auto Reply", phrase: "generate an automatic reply", type: "aiTransform" },
  { id: "generate_summary", group: "AI Assist", title: "Generate Summary", phrase: "generate a summary", type: "aiTransform" },
  { id: "create_internal_task", group: "Internal / Team Action", title: "Create Internal Task", phrase: "create an internal task", type: "generateReport", available: false },
  { id: "log_activity", group: "Internal / Team Action", title: "Log Activity", phrase: "log activity", type: "generateReport", available: false },
  { id: "notify_team", group: "Internal / Team Action", title: "Notify Team", phrase: "notify the team", type: "sendEmail" },
];

const GROUPS = ["Send a Message", "Manage Invoice", "Payment & Confirmation", "Update Customer", "AI Assist", "Internal / Team Action"] as const;
const isRawValidationError = (value: unknown) =>
  typeof value === "string" &&
  (value.includes("Invalid option: expected one of") || value.includes(`path: ["status"]`));
const resolveFriendlyApiMessage = (payload: any, fallback: string, devLabel: string) => {
  const raw = payload?.reason ?? payload?.error;
  if (typeof raw === "string" && !isRawValidationError(raw)) {
    return raw;
  }
  if (process.env.NODE_ENV !== "production") {
    console.error(devLabel, payload);
  }
  return fallback;
};

type AutomationBuilderProps = {
  mode: "create" | "edit";
  automationId?: string;
};

const isStartId = (value: unknown): value is StartId =>
  typeof value === "string" && STARTS.some((start) => start.id === value);

const normalizeAutomationStatus = (value: unknown, fallback: AutomationStatus = "DRAFT"): AutomationStatus => {
  const normalized = String(value || "").trim().toUpperCase();
  return (VALID_AUTOMATION_STATUSES as readonly string[]).includes(normalized)
    ? (normalized as AutomationStatus)
    : fallback;
};

export function AutomationBuilder({ mode, automationId }: AutomationBuilderProps) {
  const { language, t } = useLanguage();
  const locale = LANGUAGE_LOCALES[language];
  const router = useRouter();
  const searchParams = useSearchParams();
  const [form, setForm] = useState({ title: "", description: "", category: "" });
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saveStatus, setSaveStatus] = useState<AutomationStatus>("DRAFT");
  const [isHydratingEdit, setIsHydratingEdit] = useState(mode === "edit");
  const [hasUnsupportedContent, setHasUnsupportedContent] = useState(false);
  const [userPlan, setUserPlan] = useState<string | null>(null);
  const [planReady, setPlanReady] = useState(false);
  const [startId, setStartId] = useState<StartId | null>(null);
  const [showCatalog, setShowCatalog] = useState(false);
  const [highlightActionId, setHighlightActionId] = useState<number | null>(null);
  const [dragging, setDragging] = useState<number | null>(null);
  const [hydratedTemplateId, setHydratedTemplateId] = useState<string | null>(null);
  const [pendingDeleteActionId, setPendingDeleteActionId] = useState<number | null>(null);
  const [cfg, setCfg] = useState({ overdueDays: "3", onlyIfUnpaid: true, paidDelayHours: "0", markAsClosed: true, paymentConfirmMinutes: "5", paymentRetryHours: "6", notifyOnFailure: true, customerDelayDays: "1", messageDelayMinutes: "2" });
  const [actions, setActions] = useState<Act[]>([]);
  const templateParam = String(searchParams.get("template") || "").trim();
  const safeAutomationId = String(automationId || "").trim();
  const localize = (text: LocalizedText) => getLocalizedText(text, language);
  const groupLabel = (group: string) =>
    localize(
      {
        Invoices: { en: "Invoices", fr: "Factures", de: "Rechnungen", es: "Facturas", pt: "Faturas" },
        Payments: { en: "Payments", fr: "Paiements", de: "Zahlungen", es: "Pagos", pt: "Pagamentos" },
        Customers: { en: "Customers", fr: "Clients", de: "Kunden", es: "Clientes", pt: "Clientes" },
        Messaging: { en: "Messaging", fr: "Messagerie", de: "Nachrichten", es: "Mensajeria", pt: "Mensagens" },
        "Send a Message": { en: "Send a Message", fr: "Envoyer un message", de: "Nachricht senden", es: "Enviar un mensaje", pt: "Enviar uma mensagem" },
        "Manage Invoice": { en: "Manage Invoice", fr: "Gerer la facture", de: "Rechnung verwalten", es: "Gestionar factura", pt: "Gerir fatura" },
        "Payment & Confirmation": { en: "Payment & Confirmation", fr: "Paiement et confirmation", de: "Zahlung und Bestätigung", es: "Pago y confirmaci?n", pt: "Pagamento e confirma??o" },
        "Update Customer": { en: "Update Customer", fr: "Mettre ? jour le client", de: "Kunde aktualisieren", es: "Actualizar cliente", pt: "Atualizar cliente" },
        "AI Assist": { en: "AI Assist", fr: "Assistance IA", de: "KI-Hilfe", es: "Asistencia IA", pt: "Assistencia IA" },
        "Internal / Team Action": { en: "Internal / Team Action", fr: "Action interne / équipe", de: "Interne / Team-Aktion", es: "Acción interna / equipo", pt: "Ação interna / equipa" },
      }[group] || { en: group }
    );
  const actionLabel = (id: string) =>
    localize(
      {
        send_whatsapp_message: { en: "Send WhatsApp message", fr: "Envoyer un message WhatsApp", de: "WhatsApp-Nachricht senden", es: "Enviar mensaje de WhatsApp", pt: "Enviar mensagem WhatsApp" },
        send_email: { en: "Send Email", fr: "Envoyer un email", de: "E-Mail senden", es: "Enviar correo", pt: "Enviar email" },
        send_receipt: { en: "Send Receipt", fr: "Envoyer le recu", de: "Beleg senden", es: "Enviar recibo", pt: "Enviar recibo" },
        send_payment_reminder: { en: "Send Payment Reminder", fr: "Envoyer un rappel de paiement", de: "Zahlungserinnerung senden", es: "Enviar recordatorio de pago", pt: "Enviar lembrete de pagamento" },
        send_payment_confirmation: { en: "Send Payment Confirmation", fr: "Envoyer une confirmation de paiement", de: "Zahlungsbestätigung senden", es: "Enviar confirmaci?n de pago", pt: "Enviar confirma??o de pagamento" },
        send_failed_payment_message: { en: "Send Failed Payment Message", fr: "Envoyer un message d ?chec de paiement", de: "Nachricht bei fehlgeschlagener Zahlung senden", es: "Enviar mensaje de pago fallido", pt: "Enviar mensagem de falha de pagamento" },
        create_invoice: { en: "Create Invoice", fr: "Creer une facture", de: "Rechnung erstellen", es: "Crear factura", pt: "Criar fatura" },
        mark_as_paid: { en: "Mark as Paid", fr: "Marquer comme payee", de: "Als bezahlt markieren", es: "Marcar como pagada", pt: "Marcar como paga" },
        apply_late_fee: { en: "Apply Late Fee", fr: "Appliquer des frais de retard", de: "Mahngebühr anwenden", es: "Aplicar recargo por demora", pt: "Aplicar taxa de atraso" },
        cancel_invoice: { en: "Cancel Invoice", fr: "Annuler la facture", de: "Rechnung stornieren", es: "Cancelar factura", pt: "Cancelar fatura" },
        issue_refund: { en: "Issue Refund", fr: "Emettre un remboursement", de: "Erstattung auslosen", es: "Emitir reembolso", pt: "Emitir reembolso" },
        notify_team_payment: { en: "Notify Team of Payment", fr: "Informer l équipe du paiement", de: "Team über Zahlung informieren", es: "Notificar al equipo del pago", pt: "Notificar a equipa do pagamento" },
        send_payment_link: { en: "Send Payment Link", fr: "Envoyer un lien de paiement", de: "Zahlungslink senden", es: "Enviar enlace de pago", pt: "Enviar link de pagamento" },
        add_tag: { en: "Add Tag", fr: "Ajouter une etiquette", de: "Tag hinzufügen", es: "Agregar etiqueta", pt: "Adicionar etiqueta" },
        remove_tag: { en: "Remove Tag", fr: "Supprimer une etiquette", de: "Tag entfernen", es: "Eliminar etiqueta", pt: "Remover etiqueta" },
        update_status: { en: "Update Status", fr: "Mettre ? jour le statut", de: "Status aktualisieren", es: "Actualizar estado", pt: "Atualizar estado" },
        assign_team_member: { en: "Assign to Team Member", fr: "Assigner a un membre de l équipe", de: "Teammitglied zuweisen", es: "Asignar a un miembro del equipo", pt: "Atribuir a um membro da equipa" },
        add_internal_note: { en: "Add Internal Note", fr: "Ajouter une note interne", de: "Interne Notiz hinzufügen", es: "Agregar nota interna", pt: "Adicionar nota interna" },
        improve_message: { en: "Improve Message", fr: "Ameliorer le message", de: "Nachricht verbessern", es: "Mejorar mensaje", pt: "Melhorar mensagem" },
        rewrite_tone: { en: "Rewrite Tone", fr: "Reecrire le ton", de: "Ton umschreiben", es: "Reescribir tono", pt: "Reescrever tom" },
        generate_auto_reply: { en: "Generate Auto Reply", fr: "Generer une réponse automatique", de: "Automatische Antwort erzeugen", es: "Generar respuesta autom?tica", pt: "Gerar resposta autom?tica" },
        generate_summary: { en: "Generate Summary", fr: "Generer un resume", de: "Zusammenfassung erzeugen", es: "Generar resumen", pt: "Gerar resumo" },
        create_internal_task: { en: "Create Internal Task", fr: "Creer une tache interne", de: "Interne Aufgabe erstellen", es: "Crear tarea interna", pt: "Criar tarefa interna" },
        log_activity: { en: "Log Activity", fr: "Journaliser l activité", de: "Aktivität protokollieren", es: "Registrar actividad", pt: "Registar atividade" },
        notify_team: { en: "Notify Team", fr: "Notifier l équipe", de: "Team benachrichtigen", es: "Notificar al equipo", pt: "Notificar a equipa" },
      }[id] || { en: id }
    );
  const startTitle = (id: StartId) =>
    localize(
      {
        invoice_created: { en: "Invoice Created", fr: "Facture creee", de: "Rechnung erstellt", es: "Factura creada", pt: "Fatura criada" },
        invoice_paid: { en: "Invoice Paid", fr: "Facture payee", de: "Rechnung bezahlt", es: "Factura pagada", pt: "Fatura paga" },
        invoice_overdue: { en: "Invoice Overdue", fr: "Facture en retard", de: "Rechnung überfällig", es: "Factura vencida", pt: "Fatura vencida" },
        payment_received: { en: "Payment Received", fr: "Paiement recu", de: "Zahlung erhalten", es: "Pago recibido", pt: "Pagamento recebido" },
        payment_failed: { en: "Payment Failed", fr: "Paiement échoué", de: "Zahlung fehlgeschlagen", es: "Pago fallido", pt: "Pagamento falhou" },
        customer_created: { en: "New Customer Created", fr: "Nouveau client cr?e", de: "Neuer Kunde erstellt", es: "Nuevo cliente creado", pt: "Novo cliente criado" },
        whatsapp_received: { en: "New WhatsApp Message Received", fr: "Nouveau message WhatsApp recu", de: "Neue WhatsApp-Nachricht erhalten", es: "Nuevo mensaje de WhatsApp recibido", pt: "Nova mensagem de WhatsApp recebida" },
        email_received: { en: "New Email Received", fr: "Nouvel email recu", de: "Neue E-Mail erhalten", es: "Nuevo correo recibido", pt: "Novo email recebido" },
      }[id]
    );
  const startDesc = (id: StartId) =>
    localize(
      {
        invoice_created: { en: "When a new invoice is issued", fr: "Lorsqu une nouvelle facture est emise", de: "Wenn eine neue Rechnung erstellt wird", es: "Cuando se emite una nueva factura", pt: "Quando uma nova fatura e emitida" },
        invoice_paid: { en: "When a customer completes payment", fr: "Lorsqu un client termin? le paiement", de: "Wenn ein Kunde die Zahlung abschliesst", es: "Cuando un cliente completa el pago", pt: "Quando um cliente conclui o pagamento" },
        invoice_overdue: { en: "When an unpaid invoice passes its due date", fr: "Lorsqu une facture impayee depasse son echeance", de: "Wenn eine unbezahlte Rechnung ihr Falligkeitsdatum überschreitet", es: "Cuando una factura impagada supera su vencimiento", pt: "Quando uma fatura por pagar ultrapassa a data de vencimento" },
        payment_received: { en: "When money is received successfully", fr: "Lorsqu un paiement est recu avec succes", de: "Wenn Geld erfolgreich eingeht", es: "Cuando se recibe el pago correctamente", pt: "Quando o pagamento e recebido com sucesso" },
        payment_failed: { en: "When a payment attempt does not complete", fr: "Lorsqu une tentative de paiement n aboutit pas", de: "Wenn ein Zahlungsversuch nicht abgeschlossen wird", es: "Cuando un intento de pago no se completa", pt: "Quando uma tentativa de pagamento não e conclu?da" },
        customer_created: { en: "When a new customer profile is added", fr: "Lorsqu un nouveau profil client est ajoute", de: "Wenn ein neues Kundenprofil hinzugefugt wird", es: "Cuando se agrega un nuevo perfil de cliente", pt: "Quando um novo perfil de cliente e adicionado" },
        whatsapp_received: { en: "When a customer sends a WhatsApp message", fr: "Lorsqu un client envoie un message WhatsApp", de: "Wenn ein Kunde eine WhatsApp-Nachricht sendet", es: "Cuando un cliente envia un mensaje de WhatsApp", pt: "Quando um cliente envia uma mensagem de WhatsApp" },
        email_received: { en: "When a customer sends an email", fr: "Lorsqu un client envoie un email", de: "Wenn ein Kunde eine E-Mail sendet", es: "Cuando un cliente envia un correo", pt: "Quando um cliente envia um email" },
      }[id]
    );
  const startPhrase = (id: StartId) =>
    localize(
      {
        invoice_created: { en: "an invoice is created", fr: "une facture est creee", de: "eine Rechnung erstellt wird", es: "se crea una factura", pt: "uma fatura e criada" },
        invoice_paid: { en: "an invoice is paid", fr: "une facture est payee", de: "eine Rechnung bezahlt wird", es: "se paga una factura", pt: "uma fatura e paga" },
        invoice_overdue: { en: "an invoice becomes overdue", fr: "une facture devient en retard", de: "eine Rechnung überfällig wird", es: "una factura vence", pt: "uma fatura entra em atraso" },
        payment_received: { en: "a payment is received", fr: "un paiement est recu", de: "eine Zahlung eingeht", es: "se recibe un pago", pt: "um pagamento e recebido" },
        payment_failed: { en: "a payment fails", fr: "un paiement échoué", de: "eine Zahlung fehlschlagt", es: "un pago falla", pt: "um pagamento falha" },
        customer_created: { en: "a new customer is created", fr: "un nouveau client est cr?e", de: "ein neuer Kunde erstellt wird", es: "se crea un nuevo cliente", pt: "um novo cliente e criado" },
        whatsapp_received: { en: "a WhatsApp message is received", fr: "un message WhatsApp est recu", de: "eine WhatsApp-Nachricht eingeht", es: "se recibe un mensaje de WhatsApp", pt: "uma mensagem de WhatsApp e recebida" },
        email_received: { en: "an email is received", fr: "un email est recu", de: "eine E-Mail eingeht", es: "se recibe un correo", pt: "um email e recebido" },
      }[id]
    );
  const unitLabel = (unit: Unit) =>
    localize(
      {
        minutes: { en: "minutes", fr: "minutes", de: "Minuten", es: "minutos", pt: "minutos" },
        hours: { en: "hours", fr: "heures", de: "Stunden", es: "horas", pt: "horas" },
        days: { en: "days", fr: "jours", de: "Tage", es: "d?as", pt: "dias" },
      }[unit]
    );

  const start = STARTS.find((s) => s.id === startId) ?? null;
  const mappedTriggerConfig = useMemo(() => {
    if (!start) return null;

    const buildTimedTriggerConfig = (rawValue: string, unit: Unit, extra: Record<string, unknown> = {}) => {
      const normalizedValue = Math.max(0, Number(rawValue || 0));
      return {
        startId: start.id,
        mode: normalizedValue > 0 ? "after" : "now",
        delayValue: normalizedValue,
        ...(normalizedValue > 0 ? { delayUnit: unit } : {}),
        ...extra,
      };
    };

    switch (start.id) {
      case "invoice_overdue":
        return buildTimedTriggerConfig(cfg.overdueDays, "days", { onlyIfUnpaid: cfg.onlyIfUnpaid });
      case "invoice_paid":
        return buildTimedTriggerConfig(cfg.paidDelayHours, "hours");
      case "payment_received":
        return buildTimedTriggerConfig(cfg.paymentConfirmMinutes, "minutes");
      case "payment_failed":
        return buildTimedTriggerConfig(cfg.paymentRetryHours, "hours");
      case "customer_created":
        return buildTimedTriggerConfig(cfg.customerDelayDays, "days");
      case "whatsapp_received":
      case "email_received":
        return buildTimedTriggerConfig(cfg.messageDelayMinutes, "minutes");
      default:
        return { startId: start.id };
    }
  }, [
    start,
    cfg.customerDelayDays,
    cfg.messageDelayMinutes,
    cfg.onlyIfUnpaid,
    cfg.overdueDays,
    cfg.paidDelayHours,
    cfg.paymentConfirmMinutes,
    cfg.paymentRetryHours,
  ]);
  const mappedSteps = useMemo(
    () => [
      ...(start && mappedTriggerConfig
        ? [
            {
              type: start.type,
              config: mappedTriggerConfig,
            },
          ]
        : []),
      ...actions.map((a) => ({
        type: a.type,
        config: {
          actionId: a.aid,
          note: a.note,
          mode: a.mode,
          delayValue: a.mode === "after" ? Number(a.val || 1) : 0,
          delayUnit: a.mode === "after" ? a.unit : undefined,
          window: a.window,
          stopOnFailure: a.stop,
          ...(a.extraConfig ? { ...a.extraConfig } : {}),
        },
      })),
    ],
    [actions, mappedTriggerConfig, start]
  );

  useEffect(() => {
    let active = true;
    const loadPlan = async () => {
      try {
        const res = await fetch("/api/user/me", { cache: "no-store" });
        const data = await res.json().catch(() => ({}));
        if (!active) return;
        setUserPlan(String(data?.plan || "free").toLowerCase());
      } catch {
        if (!active) return;
        setUserPlan("free");
      } finally {
        if (active) setPlanReady(true);
      }
    };
    loadPlan();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (mode !== "edit") {
      setIsHydratingEdit(false);
      return;
    }
    if (!safeAutomationId) {
      setStatus(t("Invalid automation link.", "Lien d automatisation invalide.", "Ungültiger Link zur Automatisierung.", "Enlace de automatización no valido.", "Liga??o de automação invalida."));
      setIsHydratingEdit(false);
      return;
    }

    let active = true;
    const hydrateFromAutomation = async () => {
      setIsHydratingEdit(true);
      setStatus(null);
      try {
        const res = await fetch(`/api/automation/${encodeURIComponent(safeAutomationId)}`, { cache: "no-store" });
        const json = await res.json().catch(() => ({}));
        if (!active) return;
        if (!res.ok) {
          setStatus(
            resolveFriendlyApiMessage(
              json,
              t("Unable to load automation. Please try again.", "Impossible de charger l automatisation. R?essayez.", "Automatisierung konnte nicht geladen werden. Bitte versuche es erneut.", "No se pudo cargar la automatización. Intentalo de nuevo.", "Não foi poss?vel carregar a automação. Tente novamente."),
              "automation_edit_load_failed"
            )
          );
          return;
        }

        const flow = JSON.parse(JSON.stringify(json || {}));
        const flowSteps = Array.isArray(flow.steps) ? flow.steps : [];
        const startStep = flowSteps.find((step: any) => isStartId(step?.config?.startId));
        const nextStartId = startStep?.config?.startId && isStartId(startStep.config.startId)
          ? startStep.config.startId
          : null;

        const hydrateActions: Act[] = flowSteps
          .filter((step: any) => !isStartId(step?.config?.startId))
          .map((step: any, index: number) => {
            const config = step?.config && typeof step.config === "object" ? step.config : {};
            const configuredActionId = typeof config.actionId === "string" ? config.actionId : "";
            if (!configuredActionId || !isSupportedDashboardActionId(configuredActionId)) {
              return null;
            }
            const matchedDef = DEFS.find((def) => def.id === configuredActionId && def.available !== false);
            if (!matchedDef) return null;

            const rawDelayValue = Number(config.delayValue ?? 0);
            const nextMode: Mode = config.mode === "after" || rawDelayValue > 0 ? "after" : "now";
            const nextUnit: Unit =
              config.delayUnit === "minutes" || config.delayUnit === "hours" || config.delayUnit === "days"
                ? config.delayUnit
                : "days";
            const nextWindow: Window =
              config.window === "business" || config.window === "outside" || config.window === "anytime"
                ? config.window
                : "anytime";

            const knownKeys = new Set([
              "startId",
              "actionId",
              "note",
              "mode",
              "delayValue",
              "delayUnit",
              "window",
              "stopOnFailure",
            ]);
            const extraConfig = Object.fromEntries(
              Object.entries(config).filter(([key]) => !knownKeys.has(key))
            ) as Record<string, unknown>;

            return {
              id: Date.now() + index + 1,
              aid: matchedDef.id,
              type: matchedDef.type,
              note: typeof config.note === "string" ? config.note : "",
              mode: nextMode,
              val: nextMode === "after" ? String(Math.max(1, rawDelayValue || 1)) : "1",
              unit: nextUnit,
              window: nextWindow,
              stop: Boolean(config.stopOnFailure),
              edit: true,
              extraConfig: Object.keys(extraConfig).length ? extraConfig : undefined,
            } satisfies Act;
          })
          .filter(Boolean) as Act[];
        const expectedActionCount = flowSteps.filter((step: any) => !isStartId(step?.config?.startId)).length;
        const unsupportedContentDetected =
          expectedActionCount !== hydrateActions.length ||
          (flowSteps.length > 0 && (!nextStartId || !isSupportedDashboardStartId(nextStartId)));

        setForm({
          title: String(flow.title || ""),
          description: String(flow.description || ""),
          category: String(flow.category || ""),
        });
        setHasUnsupportedContent(unsupportedContentDetected);
        setCfg((current) => {
          const next = { ...current };
          const delayValue = String(Math.max(0, Number(startStep?.config?.delayValue ?? 0)));
          if (nextStartId === "invoice_overdue") {
            next.overdueDays = delayValue;
            next.onlyIfUnpaid =
              typeof startStep?.config?.onlyIfUnpaid === "boolean"
                ? Boolean(startStep.config.onlyIfUnpaid)
                : current.onlyIfUnpaid;
          } else if (nextStartId === "invoice_paid") {
            next.paidDelayHours = delayValue;
          } else if (nextStartId === "payment_received") {
            next.paymentConfirmMinutes = delayValue;
          } else if (nextStartId === "payment_failed") {
            next.paymentRetryHours = delayValue;
          } else if (nextStartId === "customer_created") {
            next.customerDelayDays = delayValue;
          } else if (nextStartId === "whatsapp_received" || nextStartId === "email_received") {
            next.messageDelayMinutes = delayValue;
          }
          return next;
        });
        setStartId(nextStartId);
        setActions(hydrateActions);
        setShowCatalog(false);
        setSaveStatus(normalizeAutomationStatus(flow.status, "DRAFT"));
        if (unsupportedContentDetected) {
          setStatus(
            t(
              "This automation contains steps or triggers that are not supported by the live builder yet. Editing is blocked here to avoid losing configuration.",
              "Cette automatisation contient des etapes ou declencheurs non pris en charge par le generateur actif. La modification est bloquee ici pour eviter toute perte de configuration.",
              "Diese Automatisierung enthalt Schritte oder Ausloser, die vom Live-Builder noch nicht unterst?tzt werden. Das Bearbeiten ist hier blockiert, um Konfigurationsverlust zu vermeiden.",
              "Esta automatizaci?n contiene pasos o disparadores que el generador en vivo a?n no admite. La edicion se bloquea aqui para evitar perder configuraci?n.",
              "Esta automa??o contem passos ou acionadores que o construtor ativo ainda n?o suporta. A edicao esta bloqueada aqui para evitar perda de configura??o."
            )
          );
        }
      } catch {
        if (!active) return;
        setStatus(t("Unable to load automation. Please try again.", "Impossible de charger l automatisation. R?essayez.", "Automatisierung konnte nicht geladen werden. Bitte versuche es erneut.", "No se pudo cargar la automatización. Intentalo de nuevo.", "Não foi poss?vel carregar a automação. Tente novamente."));
      } finally {
        if (active) setIsHydratingEdit(false);
      }
    };

    hydrateFromAutomation();
    return () => {
      active = false;
    };
  }, [mode, safeAutomationId, t]);

  useEffect(() => {
    if (mode !== "create") return;
    if (!planReady) return;
    const templateId = templateParam;
    if (!templateId) return;
    if (hydratedTemplateId === templateId) return;

    if (userPlan === "free") {
      setStatus(t("Upgrade required to use automation templates.", "Mise a niveau requise pour utiliser les modeles d automatisation.", "Upgrade erforderlich, um Automatisierungsvorlagen zu verwenden.", "Se requiere una mejora para usar plantillas de automatización.", "E necessario atualizar o plano para usar modelos de automação."));
      setHydratedTemplateId(templateId);
      return;
    }

    const templateFromRegistry = getAutomationTemplate(templateId);
    if (!templateFromRegistry) return;
    const template = cloneAutomationTemplate(templateFromRegistry);
    const nextStartId = TEMPLATE_TRIGGER_TO_START_ID[template.trigger];
    if (!nextStartId) return;

    let actionCounter = 0;
    const hydratedActions: Act[] = template.steps
      .map((step) => {
        const actionId = TEMPLATE_STEP_TO_ACTION_ID[step.type];
        const actionDef = DEFS.find((item) => item.id === actionId);
        if (!actionDef) return null;
        actionCounter += 1;
        return {
          id: Date.now() + actionCounter,
          aid: actionDef.id,
          type: actionDef.type,
          note: String(step.note || ""),
          mode: step.delay ? "after" : "now",
          val: step.delay ? String(step.delay.value) : "1",
          unit: step.delay ? step.delay.unit : "days",
          window: "anytime",
          stop: false,
          edit: true,
          extraConfig: step.config ? { ...step.config } : undefined,
        } satisfies Act;
      })
      .filter(Boolean) as Act[];

    setForm({ title: template.name, description: template.description, category: "" });
    setStartId(nextStartId);
    setActions(hydratedActions);
    setShowCatalog(false);
    setSaveStatus("DRAFT");
    setStatus(null);
    setHydratedTemplateId(templateId);
  }, [mode, planReady, templateParam, userPlan, hydratedTemplateId, t]);

  const validationIssues = [
    !form.title.trim()
      ? t("Enter an automation name.", "Entrez un nom d'automatisation.", "Gib einen Namen für die Automatisierung ein.", "Introduce un nombre para la automatización.", "Introduza um nome para a automação.")
      : form.title.trim().length < 3
        ? t("Automation name must be at least 3 characters.", "Le nom de l'automatisation doit contenir au moins 3 caracteres.", "Der Name der Automatisierung muss mindestens 3 Zeichen lang sein.", "El nombre de la automatización debe tener al menos 3 caracteres.", "O nome da automação deve ter pelo menos 3 caracteres.")
        : null,
    !form.description.trim()
      ? t("Enter a short description.", "Entrez une courte description.", "Gib eine kurze Beschreibung ein.", "Introduce una descripcion breve.", "Introduza uma descricao curta.")
      : form.description.trim().length < 5
        ? t("Description must be at least 5 characters.", "La description doit contenir au moins 5 caracteres.", "Die Beschreibung muss mindestens 5 Zeichen lang sein.", "La descripcion debe tener al menos 5 caracteres.", "A descricao deve ter pelo menos 5 caracteres.")
        : null,
    !start ? t("Select what starts this automation.", "Sélectionnez ce qui demarre cette automatisation.", "Wähle aus, was diese Automatisierung startet.", "Selecciona que inicia esta automatización.", "Selecione o que inicia esta automação.") : null,
    actions.length === 0 ? t("Add at least one step to complete this automation.", "Ajoutez au moins une etape pour completer cette automatisation.", "Füge mindestens einen Schritt hinzu, um diese Automatisierung abzuschliessen.", "Agrega al menos un paso para completar esta automatización.", "Adicione pelo menos um passo para concluir esta automação.") : null,
  ].filter(Boolean) as string[];
  const canSave = validationIssues.length === 0 && !loading && !isHydratingEdit && !hasUnsupportedContent;

  const inputClass = "h-11 w-full rounded-xl border border-border bg-background px-3 text-foreground outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20";

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim() || !start || actions.length === 0) return;
    if (mode === "edit" && !safeAutomationId) {
      setStatus(t("Invalid automation link.", "Lien d automatisation invalide.", "Ungültiger Link zur Automatisierung.", "Enlace de automatización no valido.", "Liga??o de automação invalida."));
      return;
    }
    setLoading(true);
    try {
      const payload = { ...form, steps: mappedSteps, status: saveStatus };
      const endpoint = mode === "edit" ? `/api/automation/${encodeURIComponent(safeAutomationId)}` : "/api/automation";
      const method = mode === "edit" ? "PATCH" : "POST";
      const res = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      let json: any = {};
      try { json = await res.json(); } catch { json = {}; }
      if (!res.ok) {
        setStatus(
          resolveFriendlyApiMessage(
            json,
            mode === "edit"
              ? t("Unable to update automation. Please try again.", "Impossible de mettre ? jour l automatisation. R?essayez.", "Automatisierung konnte nicht aktualisiert werden. Bitte versuche es erneut.", "No se pudo actualizar la automatización. Intentalo de nuevo.", "Não foi poss?vel atualizar a automação. Tente novamente.")
              : t("Unable to save automation. Please try again.", "Impossible d enregistrer l automatisation. R?essayez.", "Automatisierung konnte nicht gespeichert werden. Bitte versuche es erneut.", "No se pudo guardar la automatización. Intentalo de nuevo.", "Não foi poss?vel guardar a automação. Tente novamente."),
            mode === "edit" ? "automation_update_failed" : "automation_create_failed"
          )
        );
        return;
      }
      const id = mode === "edit" ? safeAutomationId : json?.id || json?.flow?.id;
      if (!id) {
        router.push("/dashboard/automations");
        return;
      }
      router.push(`/dashboard/automations/${encodeURIComponent(id)}`);
    } catch {
      setStatus(
        mode === "edit"
          ? t("Network error while updating automation. Please try again.", "Erreur r?seau pendant la mise ? jour de l automatisation. R?essayez.", "Netzwerkfehler beim Aktualisieren der Automatisierung. Bitte versuche es erneut.", "Error de red al actualizar la automatización. Intentalo de nuevo.", "Erro de rede ao atualizar a automação. Tente novamente.")
          : t("Network error while saving automation. Please try again.", "Erreur r?seau pendant l enregistrement de l automatisation. R?essayez.", "Netzwerkfehler beim Speichern der Automatisierung. Bitte versuche es erneut.", "Error de red al guardar la automatización. Intentalo de nuevo.", "Erro de rede ao guardar a automação. Tente novamente.")
      );
    } finally {
      setLoading(false);
    }
  };

  const def = (id: string) => DEFS.find((d) => d.id === id);
  const label = (id: string) => actionLabel(id);
  const phrase = (id: string) => actionLabel(id);

  const addAction = (id: string) => {
    const d = def(id);
    if (!d) return;
    const nextId = Date.now() + Math.floor(Math.random() * 1000);
    setActions((p) => [...p, { id: nextId, aid: d.id, type: d.type, note: "", mode: "now", val: "1", unit: "days", window: "anytime", stop: false, edit: true }]);
    setShowCatalog(false);
    setHighlightActionId(nextId);
    setTimeout(() => {
      setHighlightActionId((current) => (current === nextId ? null : current));
    }, 1600);
  };
  const updateAction = (id: number, patch: Partial<Act>) => setActions((p) => p.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  const removeAction = (id: number) => {
    setPendingDeleteActionId(id);
  };
  const confirmRemoveAction = () => {
    if (pendingDeleteActionId == null) return;
    setActions((p) => p.filter((a) => a.id !== pendingDeleteActionId));
    setPendingDeleteActionId(null);
  };
  const reorder = (fromId: number, toId: number) => setActions((p) => {
    const from = p.findIndex((a) => a.id === fromId); const to = p.findIndex((a) => a.id === toId);
    if (from < 0 || to < 0 || from === to) return p;
    const n = [...p]; const [m] = n.splice(from, 1); n.splice(to, 0, m); return n;
  });
  const iconStart = (id: StartId) => {
    if (id === "invoice_created") return <FileText className="h-4 w-4" />;
    if (id === "invoice_paid") return <CheckCircle2 className="h-4 w-4" />;
    if (id === "invoice_overdue") return <AlertCircle className="h-4 w-4" />;
    if (id === "payment_received") return <CreditCard className="h-4 w-4" />;
    if (id === "payment_failed") return <XCircle className="h-4 w-4" />;
    if (id === "customer_created") return <UserPlus className="h-4 w-4" />;
    if (id === "whatsapp_received") return <MessageCircle className="h-4 w-4" />;
    if (id === "email_received") return <Mail className="h-4 w-4" />;
    return <Clock3 className="h-4 w-4" />;
  };

  const iconStartTone = (id: StartId) => {
    if (id === "invoice_created") return "border-blue-200 bg-blue-100 text-blue-700";
    if (id === "invoice_paid") return "border-emerald-200 bg-emerald-100 text-emerald-700";
    if (id === "invoice_overdue") return "border-amber-200 bg-amber-100 text-amber-700";
    if (id === "payment_received") return "border-lime-200 bg-lime-100 text-lime-700";
    if (id === "payment_failed") return "border-rose-200 bg-rose-100 text-rose-700";
    if (id === "customer_created") return "border-indigo-200 bg-indigo-100 text-indigo-700";
    if (id === "whatsapp_received") return "border-teal-200 bg-teal-100 text-teal-700";
    if (id === "email_received") return "border-cyan-200 bg-cyan-100 text-cyan-700";
    return "border-slate-200 bg-slate-100 text-slate-700";
  };

  const iconAction = (id: string) => {
    if (id.includes("whatsapp")) return <MessageCircle className="h-4 w-4" />;
    if (id.includes("email") || id.includes("receipt") || id.includes("notify")) return <Mail className="h-4 w-4" />;
    if (id.includes("invoice") || id.includes("late_fee")) return <Receipt className="h-4 w-4" />;
    if (id.includes("payment") || id.includes("refund")) return <CreditCard className="h-4 w-4" />;
    if (id.includes("ai") || id.includes("rewrite") || id.includes("summary") || id.includes("reply") || id.includes("improve")) return <Sparkles className="h-4 w-4" />;
    if (id.includes("customer") || id.includes("tag") || id.includes("status") || id.includes("assign")) return <UserPlus className="h-4 w-4" />;
    return <FileText className="h-4 w-4" />;
  };

  const iconCategory = (group: string) => {
    if (group === "Send a Message") return <MessageCircle className="h-4 w-4" />;
    if (group === "Manage Invoice") return <Receipt className="h-4 w-4" />;
    if (group === "Payment & Confirmation") return <CreditCard className="h-4 w-4" />;
    if (group === "Update Customer") return <UserPlus className="h-4 w-4" />;
    if (group === "AI Assist") return <Sparkles className="h-4 w-4" />;
    return <FileText className="h-4 w-4" />;
  };

  const timing = (a: Act) =>
    a.mode === "now"
      ? t("Immediately", "Immediatement", "Sofort", "Inmediatamente", "Imediatamente")
      : `${a.val || "1"} ${unitLabel(a.unit)} ${t("later", "plus tard", "spater", "despues", "depois")}`;
  const triggerDelayValue =
    mappedTriggerConfig && "delayValue" in mappedTriggerConfig ? Number(mappedTriggerConfig.delayValue || 0) : 0;
  const triggerDelayUnit =
    mappedTriggerConfig && "delayUnit" in mappedTriggerConfig ? mappedTriggerConfig.delayUnit : undefined;
  const triggerTiming =
    triggerDelayValue > 0 && triggerDelayUnit
      ? `${t("after", "apres", "nach", "despues de", "apos")} ${triggerDelayValue} ${unitLabel(triggerDelayUnit)}`
      : "";
  const previewData = (() => {
    if (!actions.length) {
      return {
        title: t("When this automation starts, nothing will happen yet.", "Quand cette automatisation demarre, rien ne se passera encore.", "Wenn diese Automatisierung startet, passiert noch nichts.", "Cuando esta automatización se inicie, aún no pasara nada.", "Quando esta automação iniciar, ainda não acontecera nada."),
        steps: [] as string[],
      };
    }

    if (!start) {
      return {
        title: t("Select what starts this automation.", "Sélectionnez ce qui demarre cette automatisation.", "Wähle aus, was diese Automatisierung startet.", "Selecciona que inicia esta automatización.", "Selecione o que inicia esta automação."),
        steps: [] as string[],
      };
    }

    if (actions.length === 1) {
      const action = actions[0];
      const line = action.mode === "now" ? phrase(action.aid) : `${phrase(action.aid)} ${t("after", "apres", "nach", "despues de", "após")} ${action.val || "1"} ${unitLabel(action.unit)}`;
      return { title: `${t("When", "Quand", "Wenn", "Cuando", "Quando")} ${startPhrase(start.id).toLocaleLowerCase(locale)}${triggerTiming ? ` ${triggerTiming}` : ""}, ${t("the system will", "le systeme va", "wird das System", "el sistema va a", "o sistema vai")} ${line}.`, steps: [] as string[] };
    }

    return {
      title: `${t("When", "Quand", "Wenn", "Cuando", "Quando")} ${startPhrase(start.id).toLocaleLowerCase(locale)}${triggerTiming ? ` ${triggerTiming}` : ""}:`,
      steps: actions.map((a) => (a.mode === "now" ? `${phrase(a.aid)} ${t("immediately", "immediatement", "sofort", "inmediatamente", "imediatamente")}` : `${phrase(a.aid)} ${t("after", "apres", "nach", "despues de", "após")} ${a.val || "1"} ${unitLabel(a.unit)}`)),
    };
  })();

  const renderStartConfig = (id: StartId) => {
    if (id === "invoice_overdue") return <div className="space-y-3"><label className="block space-y-2 text-sm text-foreground"><span>{t("Send reminder after", "Envoyer un rappel apres", "Erinnerung senden nach", "Enviar recordatorio despues de", "Enviar lembrete após")}</span><div className="flex items-center gap-2"><input type="number" min={0} value={cfg.overdueDays} onChange={(e) => setCfg((p) => ({ ...p, overdueDays: e.target.value }))} className={`${inputClass} max-w-[140px]`} /><span className="text-sm text-slate-600">{t("days", "jours", "Tage", "d?as", "dias")}</span></div></label><label className="inline-flex items-center gap-2 text-sm text-foreground"><input type="checkbox" checked={cfg.onlyIfUnpaid} onChange={(e) => setCfg((p) => ({ ...p, onlyIfUnpaid: e.target.checked }))} className="h-4 w-4 rounded border-border text-blue-600 focus:ring-blue-500" /><span>{t("Only if invoice is still unpaid", "Seulement si la facture est toujours impayee", "Nur wenn die Rechnung noch unbezahlt ist", "Solo si la factura sigue impagada", "So se a fatura continuar por pagar")}</span></label></div>;
    if (id === "invoice_paid") return <label className="block space-y-2 text-sm text-foreground"><span>{t("Send confirmation after", "Envoyer la confirmation apres", "Bestätigung senden nach", "Enviar confirmaci?n despues de", "Enviar confirma??o após")}</span><div className="flex items-center gap-2"><input type="number" min={0} value={cfg.paidDelayHours} onChange={(e) => setCfg((p) => ({ ...p, paidDelayHours: e.target.value }))} className={`${inputClass} max-w-[140px]`} /><span className="text-sm text-slate-600">{t("hours", "heures", "Stunden", "horas", "horas")}</span></div></label>;
    if (id === "payment_received") return <label className="block space-y-2 text-sm text-foreground"><span>{t("Confirm payment after", "Confirmer le paiement apres", "Zahlung bestätigen nach", "Confirmar pago despues de", "Confirmar pagamento após")}</span><div className="flex items-center gap-2"><input type="number" min={0} value={cfg.paymentConfirmMinutes} onChange={(e) => setCfg((p) => ({ ...p, paymentConfirmMinutes: e.target.value }))} className={`${inputClass} max-w-[140px]`} /><span className="text-sm text-slate-600">{t("minutes", "minutes", "Minuten", "minutos", "minutos")}</span></div></label>;
    if (id === "payment_failed") return <label className="block space-y-2 text-sm text-foreground"><span>{t("Try again after", "Reessayer apres", "Erneut versuchen nach", "Reintentar despues de", "Tentar novamente após")}</span><div className="flex items-center gap-2"><input type="number" min={0} value={cfg.paymentRetryHours} onChange={(e) => setCfg((p) => ({ ...p, paymentRetryHours: e.target.value }))} className={`${inputClass} max-w-[140px]`} /><span className="text-sm text-slate-600">{t("hours", "heures", "Stunden", "horas", "horas")}</span></div></label>;
    if (id === "customer_created") return <label className="block space-y-2 text-sm text-foreground"><span>{t("Send welcome message after", "Envoyer le message de bienvenue apres", "Willkommensnachricht senden nach", "Enviar mensaje de bienvenida despues de", "Enviar mensagem de boas-vindas após")}</span><div className="flex items-center gap-2"><input type="number" min={0} value={cfg.customerDelayDays} onChange={(e) => setCfg((p) => ({ ...p, customerDelayDays: e.target.value }))} className={`${inputClass} max-w-[140px]`} /><span className="text-sm text-slate-600">{t("days", "jours", "Tage", "d?as", "dias")}</span></div></label>;
    return <label className="block space-y-2 text-sm text-foreground"><span>{t("Send reply after", "Envoyer la réponse apres", "Antwort senden nach", "Enviar respuesta despues de", "Enviar resposta após")}</span><div className="flex items-center gap-2"><input type="number" min={0} value={cfg.messageDelayMinutes} onChange={(e) => setCfg((p) => ({ ...p, messageDelayMinutes: e.target.value }))} className={`${inputClass} max-w-[140px]`} /><span className="text-sm text-slate-600">{t("minutes", "minutes", "Minuten", "minutos", "minutos")}</span></div></label>;
  };
  const statusOptions: Array<{ value: AutomationStatus; label: string }> = [
    { value: "DRAFT", label: t("Draft", "Brouillon", "Entwurf", "Borrador", "Rascunho") },
    { value: "ACTIVE", label: t("Active", "Actif", "Aktiv", "Activa", "Ativa") },
    { value: "PAUSED", label: t("Paused", "En pause", "Pausiert", "Pausada", "Em pausa") },
    { value: "ARCHIVED", label: t("Archived", "Archive", "Archiviert", "Archivada", "Arquivada") },
  ];

  return (
    <div className="-mx-4 min-h-[calc(100vh-4rem)] bg-background px-4 py-6 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8 lg:py-8">
      <div className="mx-auto w-full max-w-4xl space-y-8 lg:space-y-10">
        <header className="space-y-5">
          <div className="flex items-center justify-between gap-3">
            <button type="button" onClick={() => router.push("/dashboard/automations")} className="inline-flex h-9 items-center gap-1.5 text-sm font-medium text-muted-foreground transition hover:text-foreground"><ArrowLeft className="h-4 w-4" />{t("Back to Automations", "Retour aux automatisations", "Zurück zu den Automatisierungen", "Volver a automatizaciones", "Voltar as automações")}</button>
            <div className="ml-auto flex max-w-sm flex-col items-end">
              <button
                type="submit"
                form="automation-form"
                disabled={!canSave}
                className={`inline-flex h-12 items-center justify-center rounded-lg px-6 text-base font-semibold transition ${
                  canSave
                    ? "border border-blue-900 bg-blue-700 text-white shadow-md hover:bg-blue-600"
                    : "cursor-not-allowed border border-blue-900 bg-blue-700 text-white opacity-70"
                }`}
              >
                {loading ? t("Saving...", "Enregistrement...", "Speichern...", "Guardando...", "A guardar...") : mode === "edit" ? t("Save Changes", "Enregistrer les modifications", "Änderungen speichern", "Guardar cambios", "Guardar alteracoes") : t("Save Automation", "Enregistrer l'automatisation", "Automatisierung speichern", "Guardar automatización", "Guardar automação")}
              </button>
            </div>
          </div>
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
              {mode === "edit" ? t("Edit Automation", "Modifier l'automatisation", "Automatisierung bearbeiten", "Editar automatización", "Editar automação") : t("Create Automation", "Creer une automatisation", "Automatisierung erstellen", "Crear automatización", "Criar automação")}
            </h1>
            <p className="mt-2 text-base text-muted-foreground">
              {mode === "edit"
                ? t("Update this automation and save your changes.", "Mettez a jour cette automatisation et enregistrez vos modifications.", "Aktualisiere diese Automatisierung und speichere deine Änderungen.", "Actualiza esta automatización y guarda tus cambios.", "Atualize esta automação e guarde as suas alteracoes.")
                : t("Automate tasks so your business runs automatically.", "Automatisez les taches pour que votre activité fonctionne automatiquement.", "Automatisiere Aufgaben, damit dein Geschäft automatisch arbeitet.", "Automatiza tareas para que tu negocio funcione autom?ticamente.", "Automatize tarefas para que o seu negocio funcione automaticamente.")}
            </p>
          </div>
        </header>
        {isHydratingEdit ? (
          <div className="rounded-xl border border-border bg-card px-4 py-3 text-sm text-foreground">
            {t("Loading automation...", "Chargement de l'automatisation...", "Automatisierung wird geladen...", "Cargando automatización...", "A carregar automação...")}
          </div>
        ) : null}
        {status ? <div className="rounded-xl border border-border bg-card px-4 py-3 text-sm text-foreground">{status}</div> : null}
        <form id="automation-form" onSubmit={save} className="space-y-10 lg:space-y-12">
          <section className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
            <h2 className="text-lg font-semibold text-foreground">
              {mode === "edit" ? t("Automation Details", "D?tails de l'automatisation", "Automatisierungsdetails", "Detalles de la automatización", "Detalhes da automação") : t("Create Automation", "Creer une automatisation", "Automatisierung erstellen", "Crear automatización", "Criar automação")}
            </h2>
            <label className="mt-4 block space-y-2 text-sm text-foreground"><span className="font-semibold text-foreground">{t("Automation Name", "Nom de l'automatisation", "Name der Automatisierung", "Nombre de la automatización", "Nome da automação")}</span><input required value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} placeholder={t("Example: Invoice reminder", "Exemple : rappel de facture", "Beispiel: Rechnungserinnerung", "Ejemplo: recordatorio de factura", "Exemplo: lembrete de fatura")} className={inputClass} /></label>
            <label className="mt-4 block space-y-2 text-sm text-foreground"><span className="font-semibold text-foreground">{t("Short Description", "Description courte", "Kurze Beschreibung", "Descripcion breve", "Descricao curta")}</span><textarea required value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} placeholder={t("Describe what this automation should do.", "Decrivez ce que cette automatisation doit faire.", "Beschreibe, was diese Automatisierung tun soll.", "Describe lo que debe hacer esta automatización.", "Descreva o que esta automação deve fazer.")} className="min-h-[110px] w-full rounded-xl border border-border bg-background px-3 py-2 text-foreground outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20" /></label>
            <label className="mt-4 block space-y-2 text-sm text-foreground">
              <span className="font-semibold text-foreground">{t("Status on Save", "Statut a l enregistrement", "Status beim Speichern", "Estado al guardar", "Estado ao guardar")}</span>
              <select value={saveStatus} onChange={(e) => setSaveStatus(normalizeAutomationStatus(e.target.value, "DRAFT"))} className={`${inputClass} text-sm`}>
                {statusOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
              <span className="block text-xs text-muted-foreground">
                {t("New automations default to draft so you can review before going live.", "Les nouvelles automatisations commencent en brouillon pour permettre une verification avant la mise en ligne.", "Neue Automatisierungen starten als Entwurf, damit du sie vor dem Livegang prufen kannst.", "Las nuevas automatizaciones empiezan como borrador para revisarlas antes de activarlas.", "As novas automacoes comecam como rascunho para rever antes de ativar.")}
              </span>
            </label>
            <div className="mt-5 rounded-xl border border-blue-200/60 bg-blue-50/70 p-4 dark:border-blue-400/20 dark:bg-blue-500/10">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-blue-900/70 dark:text-blue-200/80">{t("Live preview", "Apercu en direct", "Live-Vorschau", "Vista previa en vivo", "Pre-visualiza??o em direto")}</p>
              <p className="mt-2 text-sm text-foreground">{previewData.title}</p>
              {previewData.steps.length > 0 ? (
                <ul className="mt-2 space-y-1 text-sm text-foreground">
                  {previewData.steps.map((line, idx) => (
                    <li key={`${line}-${idx}`} className="flex items-start gap-2">
                      <span className="mt-1 h-1.5 w-1.5 rounded-full bg-muted-foreground/60" />
                      <span>{line}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </section>

          <section className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
            <h2 className="text-lg font-semibold text-foreground">{t("What starts this automation?", "Qu'est-ce qui demarre cette automatisation ?", "Was startet diese Automatisierung?", "Que inicia esta automatización?", "O que inicia esta automação?")}</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {t("Live starts are currently wired for invoice and payment events.", "Les demarrages en direct sont actuellement relies aux ?v?nements de facture et de paiement.", "Live-Starts sind derzeit für Rechnungs- und Zahlungsereignisse aktiviert.", "Los inicios en vivo est?n conectados actualmente a eventos de factura y pago.", "Os inicios em direto estão ligados atualmente aos eventos de fatura e pagamento.")}
            </p>
            <div className="mt-5 space-y-5">
              {(["Invoices", "Payments", "Customers", "Messaging"] as const).map((group) => (
                <div key={group} className="space-y-2.5">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">{groupLabel(group)}</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {STARTS.filter((s) => s.group === group && (s.available !== false || s.id === startId)).map((s) => (
                      <div key={s.id} className={`rounded-xl border transition ${s.id === startId ? "border-blue-300 bg-blue-500/10 ring-1 ring-blue-500/20" : "border-border bg-card hover:border-border/80 hover:bg-muted/40"}`}>
                        <button type="button" onClick={() => setStartId(s.id)} className="w-full px-3 py-3 text-left"><div className="flex items-start gap-3"><span className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border shadow-sm ${iconStartTone(s.id)}`}>{iconStart(s.id)}</span><div><p className="text-sm font-semibold text-foreground">{startTitle(s.id)}</p><p className="mt-0.5 text-xs text-muted-foreground">{startDesc(s.id)}</p></div></div></button>
                        {s.id === startId ? <div className="border-t border-border px-3 pb-3 pt-3">{renderStartConfig(s.id)}</div> : null}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
            <h2 className="text-lg font-semibold text-foreground">{t("What should the system do?", "Que doit faire le systeme ?", "Was soll das System tun?", "Que debe hacer el sistema?", "O que deve o sistema fazer?")}</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {t("The catalog only shows actions that have live runtime behavior today.", "Le catalogue n affiche que les actions qui ont un comportement actif aujourd hui.", "Der Katalog zeigt nur Aktionen, die heute echtes Laufzeitverhalten haben.", "El catalogo solo muestra acciones con comportamiento real en ejecuci?n hoy.", "O catalogo mostra apenas ações com comportamento real em execu??o hoje.")}
            </p>
            <div className="mt-6 border-t border-border pt-5">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">{t("Steps you have added", "Etapes ajoutees", "Hinzugefugte Schritte", "Pasos agregados", "Passos adicionados")}</p>
              <div className="mt-3 space-y-4">
                {!actions.length ? (
                  <div className="rounded-xl border border-dashed border-border bg-muted/40 p-5 text-sm text-muted-foreground">
                    {t("No steps added yet. Add your first step below.", "Aucune etape ajoutee pour le moment. Ajoutez votre premiere etape ci-dessous.", "Noch keine Schritte hinzugefugt. Füge unten deinen ersten Schritt hinzu.", "Aún no hay pasos agregados. Agrega tu primer paso abajo.", "Ainda não ha passos adicionados. Adicione o seu primeiro passo abaixo.")}
                  </div>
                ) : null}
                {actions.map((a, idx) => (
                  <article
                    key={a.id}
                    draggable
                    onDragStart={() => setDragging(a.id)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => {
                      if (dragging !== null) reorder(dragging, a.id);
                    }}
                    onDragEnd={() => setDragging(null)}
                    className={`rounded-xl border p-4 shadow-sm transition-all duration-300 hover:shadow ${
                      highlightActionId === a.id
                        ? "border-blue-300 bg-blue-50 ring-2 ring-blue-100 dark:border-blue-400/40 dark:bg-blue-500/10 dark:ring-blue-400/20"
                        : "border-border bg-muted/40"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <button type="button" className="mt-0.5 inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-background text-muted-foreground" aria-label={t("Drag to reorder", "Glisser pour reordonner", "Zum Neusortieren ziehen", "Arrastrar para reordenar", "Arrastar para reordenar")}>
                          <GripVertical className="h-4 w-4" />
                        </button>
                        <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-background text-foreground">{iconAction(a.aid)}</span>
                        <div>
                          <span className="inline-flex rounded-full border border-border bg-background px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">{t("Step", "Etape", "Schritt", "Paso", "Passo")} {idx + 1}</span>
                          <p className="mt-1 text-sm font-semibold text-foreground">{label(a.aid)}</p>
                          <p className="mt-1 text-xs text-muted-foreground">{t("Template", "Modele", "Vorlage", "Plantilla", "Modelo")}: {a.note || t("Default", "Par defaut", "Standard", "Predeterminado", "Predefinido")}</p>
                          <p className="text-xs text-muted-foreground">{t("Send", "Envoyer", "Senden", "Enviar", "Enviar")}: {timing(a)}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button type="button" onClick={() => updateAction(a.id, { edit: !a.edit })} className="inline-flex h-8 items-center justify-center rounded-lg border border-border bg-background px-2.5 text-xs font-medium text-foreground transition hover:bg-muted">{a.edit ? t("Close", "Fermer", "Schlie?en", "Cerrar", "Fechar") : t("Edit", "Modifier", "Bearbeiten", "Editar", "Editar")}</button>
                        <button type="button" onClick={() => removeAction(a.id)} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground transition hover:bg-muted hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>
                      </div>
                    </div>

                    <div className={`overflow-hidden transition-all duration-200 ${a.edit ? "mt-4 max-h-[900px] border-t border-border pt-3 opacity-100" : "max-h-0 opacity-0"}`}>
                      <div className="space-y-3">
                        <label className="block space-y-2 text-sm text-foreground"><span>{t("Choose action", "Choisir une action", "Aktion auswählen", "Elegir acción", "Escolher ação")}</span><div className="relative"><select value={a.aid} onChange={(e) => { const d = def(e.target.value); if (!d) return; updateAction(a.id, { aid: d.id, type: d.type }); }} className={`${inputClass} h-10 appearance-none pr-10 text-sm`}>{GROUPS.map((g) => {
                          const options = DEFS.filter((d) => d.group === g && (d.available !== false || d.id === a.aid));
                          if (!options.length) return null;
                          return <optgroup key={g} label={groupLabel(g)}>{options.map((d) => <option key={d.id} value={d.id}>{actionLabel(d.id)}</option>)}</optgroup>;
                        })}</select><ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /></div></label>
                        <label className="block space-y-2 text-sm text-foreground"><span>{t("Template or message details", "Modele ou d?tails du message", "Vorlage oder Nachrichtendetails", "Plantilla o detalles del mensaje", "Modelo ou detalhes da mensagem")}</span><input value={a.note} onChange={(e) => updateAction(a.id, { note: e.target.value })} placeholder={t("Example: Payment Reminder", "Exemple : rappel de paiement", "Beispiel: Zahlungserinnerung", "Ejemplo: recordatorio de pago", "Exemplo: lembrete de pagamento")} className={`${inputClass} h-10 text-sm`} /></label>
                        <div className="grid gap-3 sm:grid-cols-[minmax(0,180px)_minmax(0,1fr)] sm:items-end">
                          <label className="block space-y-2 text-sm text-foreground"><span>{t("Send timing", "Moment d envoi", "Sendezeitpunkt", "Momento de envio", "Momento de envio")}</span><select value={a.mode} onChange={(e) => updateAction(a.id, { mode: e.target.value as Mode })} className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"><option value="now">{t("Send immediately", "Envoyer immediatement", "Sofort senden", "Enviar inmediatamente", "Enviar imediatamente")}</option><option value="after">{t("Send after", "Envoyer apres", "Senden nach", "Enviar despues de", "Enviar após")}</option></select></label>
                          {a.mode === "after" ? <div className="grid gap-2 sm:grid-cols-[120px_1fr]"><input type="number" min={1} value={a.val} onChange={(e) => updateAction(a.id, { val: e.target.value })} className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20" /><select value={a.unit} onChange={(e) => updateAction(a.id, { unit: e.target.value as Unit })} className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"><option value="minutes">{t("minutes", "minutes", "Minuten", "minutos", "minutos")}</option><option value="hours">{t("hours", "heures", "Stunden", "horas", "horas")}</option><option value="days">{t("days", "jours", "Tage", "d?as", "dias")}</option></select></div> : null}
                        </div>
                        <details className="rounded-xl border border-border bg-background p-3"><summary className="cursor-pointer text-sm font-medium text-foreground">{t("Advanced settings", "Paramêtres avances", "Erweiterte Einstellungen", "Configuración avanzada", "Definições avancadas")}</summary><div className="mt-3 space-y-3"><label className="block space-y-2 text-sm text-foreground"><span>{t("Run this step", "Executer cette etape", "Diesen Schritt ausfuhren", "Ejecutar este paso", "Executar este passo")}</span><select value={a.window} onChange={(e) => updateAction(a.id, { window: e.target.value as Window })} className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"><option value="anytime">{t("Anytime", "A tout moment", "Jederzeit", "En cualquier momento", "A qualquer momento")}</option><option value="business">{t("Only during business hours", "Seulement pendant les heures ouvrables", "Nur w?hrend der Geschäftszeiten", "Solo durante el horario laboral", "Apenas durante o horario comercial")}</option><option value="outside">{t("Only outside business hours", "Seulement hors heures ouvrables", "Nur außerhalb der Geschäftszeiten", "Solo fuera del horario laboral", "Apenas fora do horario comercial")}</option></select></label><label className="inline-flex items-center gap-2 text-sm text-foreground"><input type="checkbox" checked={a.stop} onChange={(e) => updateAction(a.id, { stop: e.target.checked })} className="h-4 w-4 rounded border-border text-blue-600 focus:ring-blue-500" /><span>{t("Stop automation if this step fails", "Arreter l automatisation si cette etape échoué", "Automatisierung stoppen, wenn dieser Schritt fehlschlagt", "Detener la automatización si este paso falla", "Parar a automação se este passo falhar")}</span></label></div></details>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </div>

            <div className="mt-6 border-t border-border pt-5">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">{t("Add another step", "Ajouter une autre etape", "Weiteren Schritt hinzufügen", "Agregar otro paso", "Adicionar outro passo")}</p>
              <div className="mt-3">
                <button type="button" onClick={() => setShowCatalog(true)} className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-background px-3 text-sm font-medium text-foreground transition hover:bg-muted"><Plus className="h-4 w-4" />{t("Add another step", "Ajouter une autre etape", "Weiteren Schritt hinzufügen", "Agregar otro paso", "Adicionar outro passo")}</button>
              </div>
            </div>

            <div className={`mt-6 border-t border-border transition-all duration-300 ${showCatalog ? "pt-5 opacity-100" : "pt-0 opacity-90"}`}>
              <div className={`overflow-hidden transition-all duration-300 ${showCatalog ? "max-h-[2000px] opacity-100" : "max-h-0 opacity-0"}`}>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">{t("Available actions", "Actions disponibles", "Verfügbare Aktionen", "Acciones disponibles", "Ações dispon?veis")}</p>
                <div className="mt-3 grid gap-4 sm:grid-cols-2">
                  {GROUPS.map((g) => (
                    <div key={g} className="rounded-xl border border-border bg-muted/40 p-4">
                      <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-border bg-background text-muted-foreground">{iconCategory(g)}</span>
                        {groupLabel(g)}
                      </h3>
                      <div className="mt-3 space-y-2">
                        {DEFS.filter((d) => d.group === g && d.available !== false).map((d) => (
                          <button key={d.id} type="button" onClick={() => addAction(d.id)} className="flex w-full items-center justify-between rounded-lg border border-border bg-background px-3 py-2 text-left text-sm text-foreground transition hover:bg-muted"><span>{actionLabel(d.id)}</span><Plus className="h-4 w-4 text-muted-foreground" /></button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <div className="pt-6 sm:pt-8">
            <div className="flex justify-end">
              <button
                type="submit"
                form="automation-form"
                disabled={!canSave}
                className={`inline-flex h-12 w-full items-center justify-center rounded-lg px-6 text-base font-semibold transition sm:w-auto ${
                  canSave
                    ? "border border-blue-900 bg-blue-700 text-white shadow-md hover:bg-blue-600"
                    : "cursor-not-allowed border border-blue-900 bg-blue-700 text-white opacity-70"
                }`}
              >
                {loading ? t("Saving...", "Enregistrement...", "Speichern...", "Guardando...", "A guardar...") : mode === "edit" ? t("Save Changes", "Enregistrer les modifications", "Änderungen speichern", "Guardar cambios", "Guardar alteracoes") : t("Save Automation", "Enregistrer l'automatisation", "Automatisierung speichern", "Guardar automatización", "Guardar automação")}
              </button>
            </div>
          </div>
        </form>
        <ConfirmationModal
          open={pendingDeleteActionId !== null}
          variant="danger"
          title={t("Delete this step?", "Supprimer cette etape ?", "Diesen Schritt l?schen?", "Eliminar este paso?", "Eliminar este passo?")}
          description={t(
            "This step will be removed from the automation draft.",
            "Cette etape sera supprimee du brouillon d automatisation.",
            "Dieser Schritt wird aus dem Automatisierungsentwurf entfernt.",
            "Este paso se eliminara del borrador de automatizaci?n.",
            "Este passo sera removido do rascunho da automa??o."
          )}
          confirmLabel={t("Delete step", "Supprimer l etape", "Schritt l?schen", "Eliminar paso", "Eliminar passo")}
          onConfirm={confirmRemoveAction}
          onCancel={() => setPendingDeleteActionId(null)}
        />
      </div>
    </div>
  );
}


