"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import useSWR from "swr";
import {
  Inbox,
  Paperclip,
  RefreshCw,
  Search,
  Send,
  Sparkles,
  Tag,
  UserCircle2,
} from "lucide-react";
import { WhatsAppEmbeddedSignupCard } from "@/components/inbox/whatsapp-embedded-signup-card";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { TransientAlert } from "@/components/ui/transient-alert";
import { useLanguage } from "@/components/providers/language-provider";
import { LANGUAGE_LOCALES } from "@/lib/i18n";
import { formatDateTimeDMY } from "@/lib/date";

type ConversationStatus = "OPEN" | "WAITING_ON_CUSTOMER" | "SNOOZED" | "RESOLVED";
type ConversationTab = "ALL" | ConversationStatus;
type AssigneeFilter = "all" | "mine" | "unassigned";

type Agent = {
  id: string;
  name: string | null;
  email: string;
  role: string;
};

type ConversationListItem = {
  id: string;
  status: ConversationStatus;
  inbox: { id: string; name: string; type: "EMAIL" | "WHATSAPP"; status: string };
  contact: { id: string; name: string; email: string; phone: string | null; status: string };
  assignedUser: { id: string; name: string | null; email: string } | null;
  tags: Array<{ id: string; label: string }>;
  unreadCount: number;
  lastMessageAt: string | null;
  snoozedUntil: string | null;
  waitingSince: string | null;
  lastInboundAt: string | null;
  lastOutboundAt: string | null;
  resolvedAt: string | null;
  lastMessage: { id: string; direction: string; content: string; createdAt: string; deliveryStatus: string } | null;
};

type ConversationListPayload = { items: ConversationListItem[] };

type ConversationDetail = {
  id: string;
  status: ConversationStatus;
  unreadCount: number;
  snoozedUntil: string | null;
  waitingSince: string | null;
  lastInboundAt: string | null;
  lastOutboundAt: string | null;
  lastCustomerReplyAt: string | null;
  resolvedAt: string | null;
  inbox: { id: string; name: string; type: "EMAIL" | "WHATSAPP"; status: string };
  contact: {
    id: string;
    name: string;
    email: string;
    phone: string | null;
    status: string;
    createdAt: string;
    updatedAt: string;
  };
  assignedUser: { id: string; name: string | null; email: string } | null;
  tags: Array<{ id: string; label: string }>;
  messages: Array<{
    id: string;
    direction: "INBOUND" | "OUTBOUND" | "INTERNAL" | "SYSTEM";
    channel: "EMAIL" | "WHATSAPP";
    senderIdentifier: string | null;
    content: string;
    attachments?: Array<{ name?: string; type?: string; size?: number; dataUrl?: string }>;
    deliveryStatus: string;
    createdAt: string;
  }>;
  notes: Array<{
    id: string;
    content: string;
    createdAt: string;
    author: { id: string; name: string | null; email: string };
  }>;
  canViewBillingInsights: boolean;
  customerInsights: {
    recentInvoices: Array<{ id: string; invoiceNumber: string; total: string; currency: string; status: string; generatedAt: string }>;
    recentPayments: Array<{ id: string; amount: string; currency: string; status: string; reference: string; createdAt: string }>;
    overdueInvoices: Array<{ id: string; invoiceNumber: string; total: string; currency: string; status: string; generatedAt: string }>;
  } | null;
};

type CannedReply = { id: string; title: string; content: string };
type InboxSetupItem = {
  id: string;
  name: string;
  type: "EMAIL" | "WHATSAPP";
  status: string;
  connection:
    | {
        mode: "oauth";
        connectedMailboxId: string;
        provider: "GMAIL" | "OUTLOOK";
        status: string;
        emailAddress: string;
        displayName: string | null;
        updatedAt: string;
      }
    | {
        mode: "smtp";
        host: string;
        username: string;
        from: string;
        configured: true;
      }
    | {
        mode: "whatsapp_api";
        configured: true;
        phoneNumberId: string;
        displayPhoneNumber?: string | null;
        verifiedName?: string | null;
        qualityRating?: string | null;
        apiVersion: string;
        hasVerifyToken: boolean;
        hasAppSecret: boolean;
      }
    | {
        mode: "none";
        configured: false;
      };
};

type InboxSetupPayload = {
  items: InboxSetupItem[];
  oauthProviders?: {
    gmail?: { configured: boolean };
    outlook?: { configured: boolean };
  };
};

const LEGACY_IMPORTED_EMAIL_DOMAINS = ["inbox.maboria.local", "placeholder.maboria.local"];

const fetcher = async (url: string) => {
  const response = await fetch(url);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error || "Request failed");
  return data;
};

const statusPillClasses: Record<ConversationStatus, string> = {
  OPEN: "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-400/30 dark:bg-rose-400/10 dark:text-rose-300",
  WAITING_ON_CUSTOMER: "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-400/30 dark:bg-sky-400/10 dark:text-sky-300",
  SNOOZED: "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-400/30 dark:bg-violet-400/10 dark:text-violet-300",
  RESOLVED: "border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200",
};

const directionBubble = {
  INBOUND: "bg-white border border-slate-200 text-slate-900 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-100",
  OUTBOUND: "bg-indigo-600 text-white",
  INTERNAL: "bg-amber-50 border border-amber-200 text-amber-900 dark:bg-amber-400/10 dark:border-amber-400/30 dark:text-amber-200",
  SYSTEM: "bg-slate-100 border border-slate-200 text-slate-700 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200",
} as const;

function isLegacyImportedEmail(value: string | null | undefined) {
  const normalized = String(value || "").trim().toLowerCase();
  return LEGACY_IMPORTED_EMAIL_DOMAINS.some((domain) => normalized.endsWith(`@${domain}`));
}

function getConversationDisplayEmail(value: string | null | undefined) {
  return isLegacyImportedEmail(value) ? null : String(value || "").trim() || null;
}

function getConversationPrimaryLabel(
  contact: ConversationListItem["contact"] | ConversationDetail["contact"] | undefined,
  fallback = "Customer"
) {
  if (!contact) return fallback;
  return contact.name || contact.phone || getConversationDisplayEmail(contact.email) || fallback;
}

function getConversationSecondaryLabel(
  contact: ConversationListItem["contact"] | ConversationDetail["contact"] | undefined,
  fallback = "Imported legacy conversation"
) {
  if (!contact) return "";
  return contact.phone || getConversationDisplayEmail(contact.email) || fallback;
}

function getConversationInitials(contact: ConversationListItem["contact"] | ConversationDetail["contact"] | undefined) {
  const label = getConversationPrimaryLabel(contact).trim();
  if (!label) return "CU";
  const parts = label.split(/\s+/).filter(Boolean);
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("") || label.slice(0, 2).toUpperCase();
}

function isEmailChannelConnected(setup: InboxSetupItem | null) {
  if (!setup || setup.type !== "EMAIL" || setup.status !== "ACTIVE") return false;
  if (setup.connection.mode === "oauth") {
    return setup.connection.status === "ACTIVE";
  }
  return setup.connection.mode === "smtp";
}

function isWhatsAppChannelConnected(setup: InboxSetupItem | null) {
  return Boolean(setup && setup.type === "WHATSAPP" && setup.status === "ACTIVE" && setup.connection.mode === "whatsapp_api");
}

function setupBadgeClasses(status: "connected" | "history" | "setup") {
  if (status === "connected") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-300";
  }
  if (status === "history") {
    return "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-400/30 dark:bg-sky-400/10 dark:text-sky-300";
  }
  return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-300";
}

export default function InboxPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { language, t } = useLanguage();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<ConversationTab>("ALL");
  const [assignee, setAssignee] = useState<AssigneeFilter>("all");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messageDraft, setMessageDraft] = useState("");
  const [noteDraft, setNoteDraft] = useState("");
  const [tagDraft, setTagDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [saving, setSaving] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [attachments, setAttachments] = useState<Array<{ name: string; type: string; size?: number; dataUrl?: string }>>([]);
  const [flash, setFlash] = useState<{ kind: "success" | "error" | "warning"; message: string } | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState(() => new Date().toISOString());

  const params = new URLSearchParams();
  params.set("status", status);
  params.set("assignee", assignee);
  if (query.trim()) params.set("search", query.trim());
  const listUrl = `/api/inbox/unified/conversations?${params.toString()}`;

  const {
    data: conversationsPayload,
    error: listError,
    mutate: mutateConversations,
    isLoading: listLoading,
  } = useSWR<ConversationListPayload>(listUrl, fetcher, {
    revalidateOnFocus: false,
  });

  const conversations = useMemo(() => conversationsPayload?.items ?? [], [conversationsPayload?.items]);

  const {
    data: detail,
    error: detailError,
    mutate: mutateDetail,
    isLoading: detailLoading,
  } = useSWR<ConversationDetail>(activeId ? `/api/inbox/unified/conversations/${activeId}` : null, fetcher, {
    revalidateOnFocus: false,
  });

  const { data: agentsPayload } = useSWR<{ items: Agent[] }>("/api/inbox/unified/agents", fetcher, {
    revalidateOnFocus: false,
  });
  const agents = agentsPayload?.items ?? [];

  const { data: cannedRepliesPayload } = useSWR<{ items?: CannedReply[] } | CannedReply[]>(
    "/api/inbox/unified/canned-replies",
    fetcher,
    {
      revalidateOnFocus: false,
      shouldRetryOnError: false,
    }
  );
  const cannedReplies = Array.isArray(cannedRepliesPayload)
    ? cannedRepliesPayload
    : Array.isArray(cannedRepliesPayload?.items)
      ? cannedRepliesPayload.items
      : [];

  const { data: inboxSetupPayload, mutate: mutateInboxes } = useSWR<InboxSetupPayload>(
    "/api/inbox/unified/inboxes",
    fetcher,
    {
      revalidateOnFocus: false,
      shouldRetryOnError: false,
    }
  );
  const inboxSetupItems = inboxSetupPayload?.items ?? [];
  const emailSetup = inboxSetupItems.find((item) => item.type === "EMAIL") || null;
  const whatsappSetup = inboxSetupItems.find((item) => item.type === "WHATSAPP") || null;
  const gmailOauthConfigured = inboxSetupPayload?.oauthProviders?.gmail?.configured ?? false;
  const outlookOauthConfigured = inboxSetupPayload?.oauthProviders?.outlook?.configured ?? false;
  const emailChannelConnected = isEmailChannelConnected(emailSetup);
  const whatsappChannelConnected = isWhatsAppChannelConnected(whatsappSetup);
  const emailConversationCount = conversations.filter((item) => item.inbox.type === "EMAIL").length;
  const whatsappConversationCount = conversations.filter((item) => item.inbox.type === "WHATSAPP").length;
  const emailHistoryOnly = !emailChannelConnected && emailConversationCount > 0;
  const whatsappHistoryOnly = !whatsappChannelConnected && whatsappConversationCount > 0;
  const activeChannelConnected = detail ? (detail.inbox.type === "EMAIL" ? emailChannelConnected : whatsappChannelConnected) : false;
  const localizeInboxStatus = (value: ConversationStatus) => {
    if (value === "OPEN") return t("Needs reply", "A traiter", "Benotigt Antwort", "Necesita respuesta", "Precisa de resposta");
    if (value === "WAITING_ON_CUSTOMER") return t("Waiting", "En attente", "Wartet", "En espera", "Em espera");
    if (value === "SNOOZED") return t("Snoozed", "Reporte", "Zurückgestellt", "Pospuesto", "Adiado");
    return t("Resolved", "Résolue", "Geloest", "Resuelto", "Resolvido");
  };
  const getChannelLabel = (value: "EMAIL" | "WHATSAPP") => (value === "EMAIL" ? t("Email", "Email", "E-Mail", "Correo", "Email") : "WhatsApp");
  const formatInboxDateTime = (value?: string | Date | null) => {
    const date = value instanceof Date ? value : value ? new Date(value) : null;
    if (!date) return "";
    try {
      return new Intl.DateTimeFormat(LANGUAGE_LOCALES[language], {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(date);
    } catch {
      return formatDateTimeDMY(date);
    }
  };
  const formatConversationStatusDetail = (input: {
    status: ConversationStatus;
    snoozedUntil?: string | null;
    waitingSince?: string | null;
    resolvedAt?: string | null;
  }) => {
    if (input.status === "SNOOZED" && input.snoozedUntil) {
      return `${t("Until", "Jusqu'au", "Bis", "Hasta", "At?")} ${formatInboxDateTime(input.snoozedUntil)}`;
    }
    if (input.status === "WAITING_ON_CUSTOMER" && input.waitingSince) {
      return `${t("Waiting since", "En attente depuis", "Wartet seit", "En espera desde", "Em espera desde")} ${formatInboxDateTime(input.waitingSince)}`;
    }
    if (input.status === "RESOLVED" && input.resolvedAt) {
      return `${t("Resolved", "Résolue", "Geloest", "Resuelto", "Resolvido")} ${formatInboxDateTime(input.resolvedAt)}`;
    }
    return null;
  };
  const getSetupStatusLabel = (value: "connected" | "history" | "setup") => {
    if (value === "connected") return t("Connected", "Connecte", "Verbunden", "Conectado", "Ligado");
    if (value === "history") return t("History only", "Historique seulement", "Nur Verlauf", "Solo historial", "Apenas histórico");
    return t("Setup needed", "Configuration requise", "Einrichtung erforderlich", "Configuración necesaria", "Configuração necessária");
  };
  const getMailboxQueryMessage = useCallback((value: string) => {
    if (value === "mailbox_oauth_not_configured") {
      return t(
        "Mailbox OAuth is not configured on this deployment yet.",
        "OAuth de boite mail n'est pas encore configure sur ce deploiement."
      );
    }
    if (
      value === "oauth_state_invalid" ||
      value === "oauth_state_missing" ||
      value === "oauth_state_expired" ||
      value === "oauth_state_mismatch" ||
      value === "oauth_code_missing"
    ) {
      return t(
        "Mailbox connection expired or was interrupted. Start the connection again.",
        "La connexion de la boite mail a expire ou a ?t? interrompue. Relancez la connexion."
      );
    }
    if (value === "access_denied") {
      return t("Mailbox connection was cancelled.", "La connexion de la boite mail a ?t? annulee.", "Die Mailbox-Verbindung wurde abgebrochen.", "La conexion del buzon se cancelo.", "A ligacao da caixa de correio foi cancelada.");
    }
    if (value === "unauthorized" || value === "forbidden") {
      return t("You do not have access to connect this mailbox.", "Vous n'avez pas accès pour connecter cette boite mail.", "Du hast keine Berechtigung, diese Mailbox zu verbinden.", "No tienes acceso para conectar este buzon.", "Não tem acesso para ligar esta caixa de correio.");
    }
    return t("Unable to connect the mailbox.", "Impossible de connecter la boite mail.", "Die Mailbox konnte nicht verbunden werden.", "No se pudo conectar el buzon.", "Não foi possivel ligar a caixa de correio.");
  }, [t]);
  const localizeInboxError = (value: string, fallback?: string) => {
    const normalized = String(value || "").trim();
    if (!normalized) return fallback || t("Unable to load inbox right now.", "Impossible de charger la boite de reception pour le moment.", "Der Posteingang kann gerade nicht geladen werden.", "No se pudo cargar la bandeja de entrada en este momento.", "Não foi possivel carregar a caixa de entrada neste momento.");
    const mappings: Record<string, string> = {
      Unauthorized: t("Please sign in and try again.", "Veuillez vous connecter puis réessayer.", "Bitte melde dich an und versuche es erneut.", "Inicia sesión y vuelve a intentarlo.", "Inicie sessão e tente novamente."),
      "Request failed": t("Unable to load inbox right now.", "Impossible de charger la boite de reception pour le moment.", "Der Posteingang kann gerade nicht geladen werden.", "No se pudo cargar la bandeja de entrada en este momento.", "Não foi possivel carregar a caixa de entrada neste momento."),
      "Unsupported mailbox provider.": t("This mailbox provider is not supported.", "Ce fournisseur de boite mail n'est pas pris en charge.", "Dieser Mailbox-Anbieter wird nicht unterstutzt.", "Este proveedor de buzon no es compatible.", "Este fornecedor de caixa de correio não e suportado."),
      "Valid emailAddress is required.": t("Enter a valid mailbox email address.", "Saisissez une adresse email de boite mail valide.", "Gib eine gültige Mailbox-E-Mail-Adresse ein.", "Introduce una direccion de correo valida del buzon.", "Introduza um endereco de email valido da caixa de correio."),
      "Mailbox already connected for this workspace.": t(
        "This mailbox is already connected for this workspace.",
        "Cette boite mail est déjà connectee pour cet espace de travail."
      ),
      "Mailbox not found.": t("Mailbox not found.", "Boite mail introuvable.", "Mailbox nicht gefunden.", "Buzon no encontrado.", "Caixa de correio não encontrada."),
      "Valid mailbox status is required.": t("Select a valid mailbox status.", "Sélectionnez un statut de boite mail valide.", "Wähle einen gültigen Mailbox-Status aus.", "Selecciona un estado de buzon valido.", "Selecione um estado valido da caixa de correio."),
      "Unable to update conversation.": t("Unable to update conversation.", "Impossible de mettre a jour la conversation.", "Die Konversation konnte nicht aktualisiert werden.", "No se pudo actualizar la conversación.", "Não foi possivel atualizar a conversa."),
      "Conversation updated.": t("Conversation updated.", "Conversation mise a jour.", "Konversation aktualisiert.", "Conversacion actualizada.", "Conversa atualizada."),
      "Unable to add note.": t("Unable to add note.", "Impossible d'ajouter la note.", "Die Notiz konnte nicht hinzugefugt werden.", "No se pudo anadir la nota.", "Não foi possivel adicionar a nota."),
      "Unable to send message.": t("Unable to send message.", "Impossible d'envoyer le message.", "Die Nachricht konnte nicht gesendet werden.", "No se pudo enviar el mensaje.", "Não foi possivel enviar a mensagem."),
      "AI suggestion failed.": t("AI suggestion failed.", "La suggestion IA a échoué.", "Der KI-Vorschlag ist fehlgeschlagen.", "La sugerencia de IA fallo.", "A sugestao de IA falhou."),
      "AI returned an empty suggestion.": t("AI returned an empty suggestion.", "L'IA a renvoye une suggestion vide.", "Die KI hat einen leeren Vorschlag zurückgegeben.", "La IA devolvio una sugerencia vacia.", "A IA devolveu uma sugestao vazia."),
      "Email channel connected successfully.": t("Email channel connected successfully.", "Canal email connecte avec succes.", "E-Mail-Kanal erfolgreich verbunden.", "Canal de correo conectado correctamente.", "Canal de email ligado com sucesso."),
      "Unable to connect the mailbox.": t("Unable to connect the mailbox.", "Impossible de connecter la boite mail.", "Die Mailbox konnte nicht verbunden werden.", "No se pudo conectar el buzon.", "Não foi possivel ligar a caixa de correio."),
      "Mailbox connection was cancelled.": t("Mailbox connection was cancelled.", "La connexion de la boite mail a ?t? annulee.", "Die Mailbox-Verbindung wurde abgebrochen.", "La conexion del buzon se cancelo.", "A ligacao da caixa de correio foi cancelada."),
      "Mailbox OAuth is not configured on this deployment yet.": t(
        "Mailbox OAuth is not configured on this deployment yet.",
        "OAuth de boite mail n'est pas encore configure sur ce deploiement."
      ),
      "Mailbox connection expired or was interrupted. Start the connection again.": t(
        "Mailbox connection expired or was interrupted. Start the connection again.",
        "La connexion de la boite mail a expire ou a ?t? interrompue. Relancez la connexion."
      ),
      "Failed to fetch": t("Network error. Please try again.", "Erreur reseau. Veuillez réessayer.", "Netzwerkfehler. Bitte versuche es erneut.", "Error de red. Intentalo de nuevo.", "Erro de rede. Tente novamente."),
    };
    return mappings[normalized] || fallback || normalized;
  };
  const getUnreadLabel = (count: number) => {
    if (count <= 0) return t("Seen", "Vu", "Gesehen", "Visto", "Visto");
    if (language === "fr") return `${count} non lu${count > 1 ? "s" : ""}`;
    if (language === "de") return `${count} ungelesen`;
    if (language === "es") return `${count} sin leer`;
    if (language === "pt") return `${count} por ler`;
    return `${count} unread`;
  };
  const getDeliveryStatusLabel = (value: string) => {
    const normalized = String(value || "").trim().toUpperCase();
    if (normalized === "SENT") return t("Sent", "Envoye", "Gesendet", "Enviado", "Enviado");
    if (normalized === "DELIVERED") return t("Delivered", "Livre", "Zugestellt", "Entregado", "Entregue");
    if (normalized === "FAILED") return t("Failed", "échoué", "Fehlgeschlagen", "Fallido", "Falhou");
    if (normalized === "QUEUED") return t("Queued", "En attente", "In Warteschlange", "En cola", "Em fila");
    if (normalized === "READ") return t("Read", "Lu", "Gelesen", "Leido", "Lido");
    return normalized.toLowerCase();
  };
  const customerLabel = t("Customer", "Client", "Kunde", "Cliente", "Cliente");
  const importedLegacyConversationLabel = t("Imported legacy conversation", "Conversation historique importee", "Importierte Altkonversation", "Conversación historica importada", "Conversa historica importada");
  const getPrimaryLabel = (contact: ConversationListItem["contact"] | ConversationDetail["contact"] | undefined) =>
    getConversationPrimaryLabel(contact, customerLabel);
  const getSecondaryLabel = (contact: ConversationListItem["contact"] | ConversationDetail["contact"] | undefined) =>
    getConversationSecondaryLabel(contact, importedLegacyConversationLabel);
  const getInvoiceReadyMessage = (invoiceNumber: string) => {
    if (language === "fr") return `La facture ${invoiceNumber} est prete. Merci de la verifier et d'effectuer le paiement.`;
    if (language === "de") return `Die Rechnung ${invoiceNumber} ist bereit. Bitte prufen Sie sie und schliessen Sie die Zahlung ab.`;
    if (language === "es") return `La factura ${invoiceNumber} esta lista. Revise la factura y complete el pago.`;
    if (language === "pt") return `A fatura ${invoiceNumber} esta pronta. Reveja-a e conclua o pagamento.`;
    return `Invoice ${invoiceNumber} is ready. Please review and complete payment.`;
  };
  const getChannelReconnectReason = (channelLabel: string) => {
    if (language === "fr") {
      return `${channelLabel} n'est pas connecte pour cet espace de travail. L'historique reste visible, mais reconnectez le canal avant de repondre.`;
    }
    if (language === "de") {
      return `${channelLabel} ist fur diesen Workspace nicht verbunden. Der Verlauf bleibt sichtbar, aber verbinde den Kanal erneut, bevor du antwortest.`;
    }
    if (language === "es") {
      return `${channelLabel} no esta conectado para este espacio de trabajo. El historial sigue visible, pero vuelve a conectar el canal antes de responder.`;
    }
    if (language === "pt") {
      return `${channelLabel} nao esta ligado a este espaco de trabalho. O historico continua visivel, mas volte a ligar o canal antes de responder.`;
    }
    return `${channelLabel} is not connected for this workspace. Historical messages stay visible, but reconnect the channel before replying.`;
  };
  const activeChannelLabel = detail ? getChannelLabel(detail.inbox.type) : t("Channel", "Canal");
  const emailSetupStatus = emailChannelConnected ? "connected" : emailHistoryOnly ? "history" : "setup";
  const whatsappSetupStatus = whatsappChannelConnected ? "connected" : whatsappHistoryOnly ? "history" : "setup";
  const activeReplyDisabledReason = !detail
    ? t("Select a conversation to reply.", "Sélectionnez une conversation pour repondre.")
    : !activeChannelConnected
      ? getChannelReconnectReason(activeChannelLabel)
      : detail.inbox.type === "EMAIL" && !getConversationDisplayEmail(detail.contact.email)
        ? t("This customer does not have an email address on file.", "Ce client n'a pas d'adresse email enregistree.")
        : detail.inbox.type === "WHATSAPP" && !detail.contact.phone
          ? t("This customer does not have a phone number on file for WhatsApp.", "Ce client n'a pas de numero de telephone enregistre pour WhatsApp.")
          : null;

  useEffect(() => {
    if (!activeId && conversations.length) {
      setActiveId(conversations[0].id);
    }
    if (activeId && conversations.length && !conversations.some((item) => item.id === activeId)) {
      setActiveId(conversations[0].id);
    }
  }, [activeId, conversations]);

  useEffect(() => {
    const mailboxConnected = searchParams.get("mailbox_connected");
    const mailboxError = searchParams.get("mailbox_error");
    if (mailboxConnected === "1") {
      setFlash({ kind: "success", message: t("Email channel connected successfully.", "Canal email connecte avec succes.") });
      return;
    }
    if (mailboxError) {
      setFlash({ kind: "error", message: getMailboxQueryMessage(mailboxError) });
    }
  }, [getMailboxQueryMessage, searchParams, t]);

  useEffect(() => {
    const timer = setInterval(async () => {
      try {
        const response = await fetch(`/api/inbox/unified/updates?since=${encodeURIComponent(lastSyncAt)}`);
        const data = await response.json().catch(() => ({}));
        if (response.ok && data?.now) {
          setLastSyncAt(String(data.now));
        } else {
          setLastSyncAt(new Date().toISOString());
        }
        mutateConversations();
        if (activeId) mutateDetail();
      } catch {
        // noop
      }
    }, 6000);
    return () => clearInterval(timer);
  }, [activeId, lastSyncAt, mutateConversations, mutateDetail]);

  const gmailConnectHref = "/api/mailboxes/connected/oauth/start?provider=GMAIL&bindUnifiedInbox=1&returnTo=/dashboard/inbox";
  const outlookConnectHref =
    "/api/mailboxes/connected/oauth/start?provider=OUTLOOK&bindUnifiedInbox=1&returnTo=/dashboard/inbox";

  const startMailboxConnect = (href: string, enabled: boolean) => {
    if (!enabled || typeof window === "undefined") return;
    window.location.assign(href);
  };

  const handlePatchConversation = async (payload: Record<string, unknown>) => {
    if (!activeId) return;
    setSaving(true);
    setFlash(null);
    try {
      const response = await fetch(`/api/inbox/unified/conversations/${activeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(localizeInboxError(data?.error, t("Unable to update conversation.", "Impossible de mettre a jour la conversation.")));
      await Promise.all([mutateDetail(), mutateConversations()]);
      setFlash({ kind: "success", message: t("Conversation updated.", "Conversation mise a jour.") });
    } catch (error: any) {
      setFlash({ kind: "error", message: localizeInboxError(error?.message, t("Unable to update conversation.", "Impossible de mettre a jour la conversation.")) });
    } finally {
      setSaving(false);
    }
  };

  const addNote = async () => {
    if (!activeId) return;
    const content = noteDraft.trim();
    if (!content) return;
    setFlash(null);
    try {
      const response = await fetch(`/api/inbox/unified/conversations/${activeId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(localizeInboxError(data?.error, t("Unable to add note.", "Impossible d'ajouter la note.")));
      setNoteDraft("");
      await mutateDetail();
    } catch (error: any) {
      setFlash({ kind: "error", message: localizeInboxError(error?.message, t("Unable to add note.", "Impossible d'ajouter la note.")) });
    }
  };

  const handleFileAttach = async (files: FileList | null) => {
    if (!files) return;
    const next: Array<{ name: string; type: string; size?: number; dataUrl?: string }> = [];
    for (const file of Array.from(files)) {
      const reader = new FileReader();
      const dataUrl = await new Promise<string | undefined>((resolve) => {
        reader.onload = () => resolve(reader.result?.toString());
        reader.onerror = () => resolve(undefined);
        reader.readAsDataURL(file);
      });
      next.push({ name: file.name, type: file.type, size: file.size, dataUrl });
    }
    setAttachments((prev) => [...prev, ...next]);
  };

  const sendMessage = async () => {
    if (!activeId) return;
    const content = messageDraft.trim();
    if (!content) return;
    setSending(true);
    setFlash(null);
    try {
      const response = await fetch(`/api/inbox/unified/conversations/${activeId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content,
          direction: "OUTBOUND",
          channel: detail?.inbox.type,
          attachments,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(localizeInboxError(data?.error, t("Unable to send message.", "Impossible d'envoyer le message.")));
      setMessageDraft("");
      setAttachments([]);
      await Promise.all([mutateDetail(), mutateConversations()]);
    } catch (error: any) {
      setFlash({ kind: "error", message: localizeInboxError(error?.message, t("Unable to send message.", "Impossible d'envoyer le message.")) });
    } finally {
      setSending(false);
    }
  };

  const applyAiReply = async () => {
    if (!detail) return;
    setAiLoading(true);
    setFlash(null);
    try {
      const contextWindow = detail.messages
        .slice(-8)
        .map((msg) => `${msg.direction}: ${msg.content}`)
        .join("\n");
      const response = await fetch("/api/ai/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "assistant",
          prompt: `Draft a concise support reply for this conversation.\n${contextWindow}`,
          style: "brief",
          tone: "direct",
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(localizeInboxError(data?.error, t("AI suggestion failed.", "La suggestion IA a échoué.")));
      const suggestion = String(data?.answer || "").trim();
      if (!suggestion) throw new Error(t("AI returned an empty suggestion.", "L'IA a renvoye une suggestion vide."));
      setMessageDraft(suggestion);
    } catch (error: any) {
      setFlash({ kind: "error", message: localizeInboxError(error?.message, t("AI suggestion failed.", "La suggestion IA a échoué.")) });
    } finally {
      setAiLoading(false);
    }
  };

  const applyTags = async () => {
    const tags = tagDraft
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);
    await handlePatchConversation({ tags });
  };

  const ticketCounts = useMemo(
    () => ({
      all: conversations.length,
      open: conversations.filter((item) => item.status === "OPEN").length,
      waiting: conversations.filter((item) => item.status === "WAITING_ON_CUSTOMER").length,
      snoozed: conversations.filter((item) => item.status === "SNOOZED").length,
      resolved: conversations.filter((item) => item.status === "RESOLVED").length,
    }),
    [conversations]
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.26em] text-slate-500 dark:text-slate-400">{t("Unified inbox", "Boite de reception unifiee", "Vereinheitlichter Posteingang", "Bandeja de entrada unificada", "Caixa de entrada unificada")}</p>
          <h1 className="text-3xl font-semibold text-slate-900 dark:text-slate-50">{t("Customer conversations", "Conversations clients", "Kundengesprache", "Conversaciones con clientes", "Conversas com clientes")}</h1>
          <p className="text-sm text-slate-600 dark:text-slate-300">{t("Email and WhatsApp in one workspace.", "Email et WhatsApp dans un seul'espace de travail.", "E-Mail und WhatsApp in einem Workspace.", "Correo y WhatsApp en un solo espacio de trabajo.", "Email e WhatsApp num unico espaco de trabalho.")}</p>
        </div>
        <Button variant="secondary" onClick={() => Promise.all([mutateConversations(), mutateDetail(), mutateInboxes()])}>
          <RefreshCw className="mr-2 h-4 w-4" />
          {t("Refresh", "Actualiser", "Aktualisieren", "Actualizar", "Atualizar")}
        </Button>
      </div>

      {flash ? (
        <TransientAlert variant={flash.kind} onDismiss={() => setFlash(null)}>
          {flash.message}
        </TransientAlert>
      ) : null}
      {listError && <Alert variant="error">{localizeInboxError((listError as Error).message)}</Alert>}
      {detailError && <Alert variant="error">{localizeInboxError((detailError as Error).message)}</Alert>}

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_8px_22px_rgba(15,23,42,0.06)] dark:border-slate-700 dark:bg-slate-900 dark:shadow-[0_18px_36px_rgba(2,6,23,0.4)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">{t("Channel setup", "Configuration du canal", "Kanaleinrichtung", "Configuración del canal", "Configuração do canal")}</p>
            <h2 className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">{t("Connect your business channels", "Connectez vos canaux professionnels", "Verbinde deine Geschäftskanale", "Conecta tus canales de empresa", "Ligue os seus canais de negocio")}</h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              {t(
                "Old threads stay visible. Only connected channels can send live replies.",
                "Les anciens fils restent visibles. Seuls les canaux connectes peuvent envoyer des réponses en direct.",
                "Alte Verlaufe bleiben sichtbar. Nur verbundene Kanale können Live-Antworten senden.",
                "Los hilos antiguos siguen visibles. Solo los canales conectados pueden enviar respuestas en directo.",
                "Os historicos antigos continuam visiveis. Apenas os canais ligados podem enviar respostas em direto."
              )}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className={`rounded-full border px-3 py-1 text-xs font-medium ${setupBadgeClasses(emailSetupStatus)}`}>
              {t("Email", "Email", "E-Mail", "Correo", "Email")}: {getSetupStatusLabel(emailSetupStatus)}
            </span>
            <span className={`rounded-full border px-3 py-1 text-xs font-medium ${setupBadgeClasses(whatsappSetupStatus)}`}>
              {t("WhatsApp:", "WhatsApp :", "WhatsApp:", "WhatsApp:", "WhatsApp:")} {getSetupStatusLabel(whatsappSetupStatus)}
            </span>
          </div>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-700 dark:bg-slate-950/60">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">{t("Email channel", "Canal email", "E-Mail-Kanal", "Canal de correo", "Canal de email")}</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">{t("Gmail or Outlook connect", "Connexion Gmail ou Outlook", "Gmail- oder Outlook-Verbindung", "Conexion de Gmail u Outlook", "Ligacao Gmail ou Outlook")}</p>
                  <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                    {emailChannelConnected && emailSetup?.connection.mode === "oauth"
                      ? `${emailSetup.connection.provider === "GMAIL" ? "Gmail" : "Outlook"} ${t("connected as", "connecte comme", "verbunden als", "conectado como", "ligado como")} ${emailSetup.connection.emailAddress}`
                      : emailChannelConnected && emailSetup?.connection.mode === "smtp"
                        ? `${emailSetup.connection.from} ${t("via", "via", "über", "mediante", "via")} ${emailSetup.connection.host}`
                        : emailHistoryOnly
                          ? t("History stays visible, but replies are paused until reconnect.", "L'historique reste visible, mais les réponses sont suspendues jusqu'a la reconnexion.", "Der Verlauf bleibt sichtbar, aber Antworten sind bis zur erneuten Verbindung pausiert.", "El historial sigue visible, pero las respuestas se pausan hasta volver a conectar.", "O histórico continua visivel, mas as respostas ficam suspensas at? voltar a ligar.")
                          : t("Connect Gmail or Outlook to send live replies from the inbox.", "Connectez Gmail ou Outlook pour envoyer des réponses en direct depuis la boite de reception.", "Verbinde Gmail oder Outlook, um Live-Antworten aus dem Posteingang zu senden.", "Conecta Gmail u Outlook para enviar respuestas en directo desde la bandeja de entrada.", "Ligue o Gmail ou Outlook para enviar respostas em direto a partir da caixa de entrada.")}
                  </p>
                </div>
              </div>
              <span className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${setupBadgeClasses(emailSetupStatus)}`}>
                {getSetupStatusLabel(emailSetupStatus)}
              </span>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => startMailboxConnect(gmailConnectHref, gmailOauthConfigured)}
                disabled={!gmailOauthConfigured}
                className={`inline-flex items-center justify-center rounded-full px-4 py-2 text-xs font-semibold transition ${
                  gmailOauthConfigured
                    ? "bg-slate-900 text-white hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-950 dark:hover:bg-white"
                    : "cursor-not-allowed border border-slate-200 bg-slate-100 text-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-500"
                }`}
              >
                {emailSetup?.connection.mode === "oauth" && emailSetup.connection.provider === "GMAIL" ? t("Reconnect Gmail", "Reconnecter Gmail", "Gmail erneut verbinden", "Volver a conectar Gmail", "Voltar a ligar o Gmail") : t("Connect Gmail", "Connecter Gmail", "Gmail verbinden", "Conectar Gmail", "Ligar Gmail")}
              </button>
              <button
                type="button"
                onClick={() => startMailboxConnect(outlookConnectHref, outlookOauthConfigured)}
                disabled={!outlookOauthConfigured}
                className={`inline-flex items-center justify-center rounded-full border px-4 py-2 text-xs font-semibold transition ${
                  outlookOauthConfigured
                    ? "border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-900"
                    : "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-500"
                }`}
              >
                {emailSetup?.connection.mode === "oauth" && emailSetup.connection.provider === "OUTLOOK"
                  ? t("Reconnect Outlook", "Reconnecter Outlook", "Outlook erneut verbinden", "Volver a conectar Outlook", "Voltar a ligar o Outlook")
                  : t("Connect Outlook", "Connecter Outlook", "Outlook verbinden", "Conectar Outlook", "Ligar Outlook")}
              </button>
            </div>
            {!gmailOauthConfigured && !outlookOauthConfigured ? (
              <p className="mt-3 text-[11px] text-slate-500 dark:text-slate-400">{t("Provider OAuth is not configured on this deployment yet.", "OAuth fournisseur n'est pas encore configure sur ce deploiement.", "Provider-OAuth ist in dieser Bereitstellung noch nicht konfiguriert.", "El OAuth del proveedor aún no esta configurado en este despliegue.", "O OAuth do fornecedor ainda não esta configurado nesta implementacao.")}</p>
            ) : null}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-700 dark:bg-slate-950/60">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">{t("WhatsApp channel", "Canal WhatsApp", "WhatsApp-Kanal", "Canal de WhatsApp", "Canal de WhatsApp")}</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">{t("Meta business connect", "Connexion Meta Business", "Meta-Business-Verbindung", "Conexion de Meta Business", "Ligacao Meta Business")}</p>
                  <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                    {whatsappChannelConnected && whatsappSetup?.connection.mode === "whatsapp_api"
                      ? `${whatsappSetup.connection.displayPhoneNumber || t("Business number connected", "Numero professionnel connecte", "Geschäftsnummer verbunden", "Numero de empresa conectado", "Numero empresarial ligado")} - ${t("inbound and delivery updates are live.", "les messages entrants et les mises a jour de livraison sont en direct.", "eingehende Nachrichten und Zustellungsupdates sind live.", "los mensajes entrantes y las actualizaciones de entrega estan en directo.", "as mensagens recebidas e as atualizacoes de entrega estão em direto.")}`
                      : whatsappHistoryOnly
                        ? t("History stays searchable, but reconnect Meta before replying.", "L'historique reste consultable, mais reconnectez Meta avant de repondre.", "Der Verlauf bleibt durchsuchbar, aber verbinde Meta erneut, bevor du antwortest.", "El historial sigue siendo consultable, pero vuelve a conectar Meta antes de responder.", "O histórico continua pesquisavel, mas volte a ligar a Meta antes de responder.")
                        : t("Use Meta embedded signup to bring a live business number into the inbox.", "Utilisez l'inscription integree Meta pour ajouter un numero professionnel actif a la boite de reception.", "Nutze die eingebettete Meta-Anmeldung, um eine aktive Geschäftsnummer in den Posteingang zu bringen.", "Usa el registro integrado de Meta para llevar un numero de empresa activo a la bandeja de entrada.", "Use o registo integrado da Meta para trazer um numero empresarial ativo para a caixa de entrada.")}
                  </p>
                </div>
              </div>
              <span className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${setupBadgeClasses(whatsappSetupStatus)}`}>
                {getSetupStatusLabel(whatsappSetupStatus)}
              </span>
            </div>
            <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-950">
              <WhatsAppEmbeddedSignupCard
                connection={
                  whatsappSetup?.connection.mode === "whatsapp_api"
                    ? whatsappSetup.connection
                    : {
                        mode: "none",
                        configured: false,
                      }
                }
                onConnected={() => mutateInboxes()}
              />
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[320px_1fr_320px]">
        <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-[0_10px_28px_rgba(15,23,42,0.06)] dark:border-slate-700 dark:bg-slate-900 dark:shadow-[0_18px_36px_rgba(2,6,23,0.4)]">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">{t("Queue", "File", "Warteschlange", "Cola", "Fila")}</p>
                <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">{t("Live conversation feed", "Flux de conversations en direct", "Live-Konversationsfeed", "Flujo de conversaciones en directo", "Fluxo de conversas em direto")}</p>
              </div>
              <div className="rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-xs font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-300">
                {ticketCounts.all} {t("total", "total", "gesamt", "total", "total")}
              </div>
            </div>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
              <Input
                className="rounded-xl border-slate-200/80 bg-white pl-9 dark:border-slate-700 dark:bg-slate-950"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t("Search conversations", "Rechercher des conversations", "Konversationen suchen", "Buscar conversaciones", "Pesquisar conversas")}
              />
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3 xl:grid-cols-5">
              <button
                className={`rounded-full border px-2.5 py-2 ${status === "ALL" ? "border-indigo-300 bg-indigo-50 text-indigo-700 shadow-sm dark:border-indigo-400/40 dark:bg-indigo-400/10 dark:text-indigo-300" : "border-slate-200 bg-white/80 text-slate-600 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-300"}`}
                onClick={() => setStatus("ALL")}
              >
                {t("All", "Tous", "Alle", "Todos", "Todos")} ({ticketCounts.all})
              </button>
              <button
                className={`rounded-full border px-2.5 py-2 ${status === "OPEN" ? "border-indigo-300 bg-indigo-50 text-indigo-700 shadow-sm dark:border-indigo-400/40 dark:bg-indigo-400/10 dark:text-indigo-300" : "border-slate-200 bg-white/80 text-slate-600 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-300"}`}
                onClick={() => setStatus("OPEN")}
              >
                {t("Needs reply", "A traiter", "Benotigt Antwort", "Necesita respuesta", "Precisa de resposta")} ({ticketCounts.open})
              </button>
              <button
                className={`rounded-full border px-2.5 py-2 ${status === "WAITING_ON_CUSTOMER" ? "border-indigo-300 bg-indigo-50 text-indigo-700 shadow-sm dark:border-indigo-400/40 dark:bg-indigo-400/10 dark:text-indigo-300" : "border-slate-200 bg-white/80 text-slate-600 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-300"}`}
                onClick={() => setStatus("WAITING_ON_CUSTOMER")}
              >
                {t("Waiting", "En attente", "Wartet", "En espera", "Em espera")} ({ticketCounts.waiting})
              </button>
              <button
                className={`rounded-full border px-2.5 py-2 ${status === "SNOOZED" ? "border-indigo-300 bg-indigo-50 text-indigo-700 shadow-sm dark:border-indigo-400/40 dark:bg-indigo-400/10 dark:text-indigo-300" : "border-slate-200 bg-white/80 text-slate-600 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-300"}`}
                onClick={() => setStatus("SNOOZED")}
              >
                {t("Snoozed", "Reporte", "Zurückgestellt", "Pospuesto", "Adiado")} ({ticketCounts.snoozed})
              </button>
              <button
                className={`rounded-full border px-2.5 py-2 ${status === "RESOLVED" ? "border-indigo-300 bg-indigo-50 text-indigo-700 shadow-sm dark:border-indigo-400/40 dark:bg-indigo-400/10 dark:text-indigo-300" : "border-slate-200 bg-white/80 text-slate-600 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-300"}`}
                onClick={() => setStatus("RESOLVED")}
              >
                {t("Resolved", "Résolue", "Geloest", "Resuelto", "Resolvido")} ({ticketCounts.resolved})
              </button>
            </div>
            <select
              value={assignee}
              onChange={(event) => setAssignee(event.target.value as AssigneeFilter)}
              className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            >
              <option value="all">{t("All assignments", "Toutes les attributions", "Alle Zuweisungen", "Todas las asignaciones", "Todas as atribuicoes")}</option>
              <option value="mine">{t("Assigned to me", "Assigne a moi", "Mir zugewiesen", "Asignado a mi", "Atribuido a mim")}</option>
              <option value="unassigned">{t("Unassigned", "Non assigne", "Nicht zugewiesen", "Sin asignar", "Sem atribuicao")}</option>
            </select>
          </div>

          <div className="mt-4 space-y-2">
            {listLoading && <p className="rounded-xl border border-slate-200 px-3 py-4 text-sm text-slate-500">{t("Loading conversations...", "Chargement des conversations...", "Konversationen werden geladen...", "Cargando conversaciones...", "A carregar conversas...")}</p>}
            {!listLoading && !conversations.length && (
              <div className="rounded-xl border border-dashed border-slate-300 px-3 py-4 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                {t("No conversations found.", "Aucune conversation trouvee.", "Keine Konversationen gefunden.", "No se encontraron conversaciones.", "Nenhuma conversa encontrada.")}
              </div>
            )}
            {conversations.map((conversation) => (
              (() => {
                const conversationChannelConnected =
                  conversation.inbox.type === "EMAIL" ? emailChannelConnected : whatsappChannelConnected;
                const importedLegacy = isLegacyImportedEmail(conversation.contact.email);

                return (
                  <button
                    key={conversation.id}
                    onClick={() => setActiveId(conversation.id)}
                    className={`w-full rounded-xl border p-3 text-left transition ${
                      activeId === conversation.id
                        ? "border-indigo-300 bg-indigo-50/40 shadow-[0_8px_20px_rgba(99,102,241,0.12)] dark:border-indigo-400/40 dark:bg-indigo-400/10"
                        : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-950"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-xs font-semibold tracking-[0.12em] text-white dark:bg-slate-100 dark:text-slate-950">
                        {getConversationInitials(conversation.contact)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                              {getPrimaryLabel(conversation.contact)}
                            </p>
                            <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                              {getSecondaryLabel(conversation.contact)}
                            </p>
                          </div>
                          <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] ${statusPillClasses[conversation.status]}`}>
                            {localizeInboxStatus(conversation.status)}
                          </span>
                        </div>
                        <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-600 dark:text-slate-300">
                          {conversation.lastMessage?.content || t("No messages yet.", "Aucun message pour le moment.", "Noch keine Nachrichten.", "Aún no hay mensajes.", "Ainda não ha mensagens.")}
                        </p>
                        <div className="mt-3 flex items-center justify-between gap-3 text-[11px] text-slate-500 dark:text-slate-400">
                          <span className="flex flex-wrap items-center gap-1.5">
                            <span className="rounded-full border border-slate-200 bg-white/80 px-2 py-0.5 dark:border-slate-700 dark:bg-slate-900/80">
                              {getChannelLabel(conversation.inbox.type)}
                            </span>
                            {!conversationChannelConnected ? (
                              <span className="rounded-full border border-sky-200 bg-sky-50 px-1.5 py-0.5 text-[10px] font-medium text-sky-700 dark:border-sky-400/30 dark:bg-sky-400/10 dark:text-sky-300">
                                {t("History only", "Historique seulement", "Nur Verlauf", "Solo historial", "Apenas histórico")}
                              </span>
                            ) : null}
                            {importedLegacy ? (
                              <span className="rounded-full border border-slate-200 bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                                {t("Imported", "Importe", "Importiert", "Importado", "Importado")}
                              </span>
                            ) : null}
                          </span>
                          <span className="font-medium text-slate-700 dark:text-slate-300">
                            {getUnreadLabel(conversation.unreadCount)}
                          </span>
                        </div>
                        {formatConversationStatusDetail(conversation) ? (
                          <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">{formatConversationStatusDetail(conversation)}</p>
                        ) : null}
                        {conversation.assignedUser ? (
                          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                            {t("Owner:", "Responsable :", "Verantwortlich:", "Responsable:", "Responsavel:")} {conversation.assignedUser.name || conversation.assignedUser.email}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </button>
                );
              })()
            ))}
          </div>
        </section>

        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_10px_28px_rgba(15,23,42,0.06)] dark:border-slate-700 dark:bg-slate-900 dark:shadow-[0_18px_36px_rgba(2,6,23,0.4)]">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 dark:border-slate-700">
            <div>
              <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">{t("Active thread", "Conversation active", "Aktiver Verlauf", "Hilo activo", "Conversa ativa")}</p>
              <p className="text-base font-semibold text-slate-900 dark:text-slate-100">
                {getPrimaryLabel(detail?.contact)}
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <span>{getSecondaryLabel(detail?.contact)}</span>
                {detail ? (
                  <span
                    className={`rounded-full border px-2 py-0.5 ${
                      activeChannelConnected
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-300"
                        : "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-400/30 dark:bg-sky-400/10 dark:text-sky-300"
                    }`}
                  >
                    {activeChannelConnected ? `${activeChannelLabel} ${t("live", "en direct", "live", "en directo", "em direto")}` : `${activeChannelLabel} ${t("history only", "historique seulement", "nur Verlauf", "solo historial", "apenas histórico")}`}
                  </span>
                ) : null}
                {detail && isLegacyImportedEmail(detail.contact.email) ? (
                  <span className="rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                    {t("Imported legacy thread", "Conversation historique importee", "Importierter Altverlauf", "Hilo histórico importado", "Conversa historica importada")}
                  </span>
                ) : null}
                {detail ? (
                  <span className={`rounded-full border px-2 py-0.5 ${statusPillClasses[detail.status]}`}>{localizeInboxStatus(detail.status)}</span>
                ) : null}
                {detail && formatConversationStatusDetail(detail) ? <span>{formatConversationStatusDetail(detail)}</span> : null}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={detail?.status || "OPEN"}
                onChange={(event) =>
                  handlePatchConversation(
                    event.target.value === "SNOOZED"
                      ? { status: "SNOOZED", snoozedUntil: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() }
                      : { status: event.target.value }
                  )
                }
                disabled={!detail || saving}
                className="h-9 rounded-full border border-slate-200 bg-white px-3 text-xs font-medium dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              >
                <option value="OPEN">{t("Needs reply", "A traiter", "Benotigt Antwort", "Necesita respuesta", "Precisa de resposta")}</option>
                <option value="WAITING_ON_CUSTOMER">{t("Waiting on customer", "En attente du client", "Wartet auf den Kunden", "Esperando al cliente", "Aguardando o cliente")}</option>
                <option value="SNOOZED">{t("Snoozed", "Reporte", "Zurückgestellt", "Pospuesto", "Adiado")}</option>
                <option value="RESOLVED">{t("Resolved", "Résolue", "Geloest", "Resuelto", "Resolvido")}</option>
              </select>
              <Button
                variant="secondary"
                size="sm"
                disabled={!detail || saving}
                onClick={() =>
                  handlePatchConversation(
                    detail?.status === "SNOOZED"
                      ? { status: "OPEN" }
                      : { status: "SNOOZED", snoozedUntil: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() }
                  )
                }
              >
                {detail?.status === "SNOOZED" ? t("Resume", "Reprendre", "Fortsetzen", "Reanudar", "Retomar") : t("Snooze 1 day", "Reporter 1 jour", "1 Tag zurückstellen", "Posponer 1 dia", "Adiar 1 dia")}
              </Button>
              <select
                value={detail?.assignedUser?.id || ""}
                onChange={(event) => handlePatchConversation({ assignedUserId: event.target.value || null })}
                disabled={!detail || saving}
                className="h-9 rounded-full border border-slate-200 bg-white px-3 text-xs font-medium dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              >
                <option value="">{t("Unassigned", "Non assigne", "Nicht zugewiesen", "Sin asignar", "Sem atribuicao")}</option>
                {agents.map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.name || agent.email}
                  </option>
                ))}
              </select>
            </div>
          </header>

          <div className="max-h-[460px] space-y-3 overflow-y-auto bg-slate-50 px-5 py-5 dark:bg-slate-950/70">
            {detailLoading && <p className="text-sm text-slate-500">{t("Loading thread...", "Chargement de la conversation...", "Verlauf wird geladen...", "Cargando hilo...", "A carregar conversa...")}</p>}
            {!detailLoading && detail && !detail.messages.length && (
              <p className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
                {t("No messages yet.", "Aucun message pour le moment.", "Noch keine Nachrichten.", "Aún no hay mensajes.", "Ainda não ha mensagens.")}
              </p>
            )}
            {detail?.messages.map((message) => (
              <div key={message.id} className={`flex ${message.direction === "OUTBOUND" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[78%] rounded-2xl px-4 py-3 text-sm shadow-sm ${
                    directionBubble[message.direction] ?? directionBubble.SYSTEM
                  }`}
                >
                  <p className="whitespace-pre-wrap">{message.content}</p>
                  {Array.isArray(message.attachments) && message.attachments.length > 0 && (
                    <div className="mt-2 space-y-1 text-xs">
                      {message.attachments.map((attachment, index) => (
                        <p key={`${message.id}-${index}`}>{t("Attachment:", "Piece jointe :", "Anhang:", "Adjunto:", "Anexo:")} {attachment.name || t("file", "fichier", "Datei", "archivo", "ficheiro")}</p>
                      ))}
                    </div>
                  )}
                  <div className="mt-2 text-[11px] opacity-75">
                    {formatInboxDateTime(message.createdAt)} | {getChannelLabel(message.channel)} | {getDeliveryStatusLabel(message.deliveryStatus)}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="space-y-3 border-t border-slate-100 px-5 py-4 dark:border-slate-700">
            {activeReplyDisabledReason ? <Alert variant="warning">{activeReplyDisabledReason}</Alert> : null}
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex h-9 items-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100">
                {t("Replying on", "Repondre sur", "Antworten über", "Responder por", "Responder em")} {detail ? getChannelLabel(detail.inbox.type) : t("selected channel", "canal selectionne", "ausgewahlten Kanal", "canal seleccionado", "canal selecionado")}
              </div>
              <select
                onChange={(event) => {
                  const id = event.target.value;
                  if (!id) return;
                  const selected = cannedReplies.find((reply) => reply.id === id);
                  if (selected) setMessageDraft(selected.content);
                  event.currentTarget.value = "";
                }}
                className="h-9 min-w-[180px] rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                defaultValue=""
              >
                <option value="">{t("Saved replies", "Réponses enregistrees", "Gespeicherte Antworten", "Respuestas guardadas", "Respostas guardadas")}</option>
                {cannedReplies.map((reply) => (
                  <option key={reply.id} value={reply.id}>
                    {reply.title}
                  </option>
                ))}
              </select>
              <Button variant="secondary" size="sm" onClick={applyAiReply} disabled={!detail || aiLoading}>
                <Sparkles className="mr-2 h-4 w-4" />
                {aiLoading ? t("Generating...", "Generation...", "Wird erstellt...", "Generando...", "A gerar...") : t("AI reply", "Réponse IA", "KI-Antwort", "Respuesta de IA", "Resposta de IA")}
              </Button>
              <label
                className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs ${
                  activeReplyDisabledReason
                    ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-500"
                    : "cursor-pointer border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-950"
                }`}
              >
                <Paperclip className="h-4 w-4" />
                {t("Attach", "Joindre", "Anhangen", "Adjuntar", "Anexar")}
                <input
                  type="file"
                  multiple
                  className="hidden"
                  disabled={Boolean(activeReplyDisabledReason)}
                  onChange={(event) => handleFileAttach(event.target.files)}
                />
              </label>
            </div>

            {attachments.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {attachments.map((attachment, index) => (
                  <span key={`${attachment.name}-${index}`} className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300">
                    {attachment.name}
                  </span>
                ))}
              </div>
            )}

            <div className="flex items-end gap-3">
              <Textarea
                className="min-h-[96px] flex-1"
                value={messageDraft}
                onChange={(event) => setMessageDraft(event.target.value)}
                disabled={Boolean(activeReplyDisabledReason)}
                placeholder={activeReplyDisabledReason || t("Type your reply...", "Tapez votre réponse...", "Tippe deine Antwort...", "Escribe tu respuesta...", "Escreva a sua resposta...")}
              />
              <Button onClick={sendMessage} disabled={!detail || sending || Boolean(activeReplyDisabledReason)}>
                <Send className="mr-2 h-4 w-4" />
                {sending ? t("Sending...", "Envoi...", "Wird gesendet...", "Enviando...", "A enviar...") : t("Send", "Envoyer", "Senden", "Enviar", "Enviar")}
              </Button>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-[0_10px_28px_rgba(15,23,42,0.06)] dark:border-slate-700 dark:bg-slate-900 dark:shadow-[0_18px_36px_rgba(2,6,23,0.4)]">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-700 dark:bg-indigo-400/10 dark:text-indigo-300">
              <UserCircle2 className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">{t("Customer context", "Contexte client", "Kundekontext", "Contexto del cliente", "Contexto do cliente")}</p>
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{getPrimaryLabel(detail?.contact)}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">{getSecondaryLabel(detail?.contact)}</p>
            </div>
          </div>

          <div className="mt-4 space-y-3 text-sm">
            <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">{t("Tags", "Etiquettes", "Tags", "Etiquetas", "Etiquetas")}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {detail?.tags?.length ? (
                  detail.tags.map((tag) => (
                    <span key={tag.id} className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200">
                      <Tag className="h-3 w-3" />
                      {tag.label}
                    </span>
                  ))
                ) : (
                  <span className="text-xs text-slate-500 dark:text-slate-400">{t("No tags", "Aucune etiquette", "Keine Tags", "Sin etiquetas", "Sem etiquetas")}</span>
                )}
              </div>
              <div className="mt-3 flex gap-2">
                <Input value={tagDraft} onChange={(event) => setTagDraft(event.target.value)} placeholder={t("tag1, tag2", "etiquette1, etiquette2", "tag1, tag2", "etiqueta1, etiqueta2", "etiqueta1, etiqueta2")} />
                <Button size="sm" variant="secondary" onClick={applyTags} disabled={!detail || saving}>
                  {t("Save", "Enregistrer", "Speichern", "Guardar", "Guardar")}
                </Button>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">{t("Recent invoices", "Factures recentes", "Letzte Rechnungen", "Facturas recientes", "Faturas recentes")}</p>
              <div className="mt-2 space-y-2 text-xs dark:text-slate-200">
                {detail && !detail.canViewBillingInsights ? (
                  <p className="text-slate-500 dark:text-slate-400">{t("Billing insights are limited to billing roles.", "Les insights de facturation sont limites aux roles de facturation.", "Abrechnungs-Einblicke sind auf Abrechnungsrollen beschrankt.", "Los datos de facturación estan limitados a los roles de facturación.", "Os dados de faturação estão limitados aos perfis de faturação.")}</p>
                ) : detail?.customerInsights?.recentInvoices?.length ? (
                  detail.customerInsights.recentInvoices.map((invoice) => (
                    <div key={invoice.id} className="flex items-center justify-between gap-2">
                      <span className="truncate">{invoice.invoiceNumber}</span>
                      <span>{invoice.currency} {invoice.total}</span>
                    </div>
                  ))
                ) : (
                  <p className="text-slate-500 dark:text-slate-400">{t("No invoices yet.", "Aucune facture pour le moment.", "Noch keine Rechnungen.", "Aún no hay facturas.", "Ainda não existem faturas.")}</p>
                )}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">{t("Recent payments", "Paiements recents", "Letzte Zahlungen", "Pagos recientes", "Pagamentos recentes")}</p>
              <div className="mt-2 space-y-2 text-xs dark:text-slate-200">
                {detail && !detail.canViewBillingInsights ? (
                  <p className="text-slate-500 dark:text-slate-400">{t("Payment history is limited to billing roles.", "L'historique des paiements est limite aux roles de facturation.", "Der Zahlungsverlauf ist auf Abrechnungsrollen beschrankt.", "El historial de pagos esta limitado a los roles de facturación.", "O histórico de pagamentos esta limitado aos perfis de faturação.")}</p>
                ) : detail?.customerInsights?.recentPayments?.length ? (
                  detail.customerInsights.recentPayments.map((payment) => (
                    <div key={payment.id} className="flex items-center justify-between gap-2">
                      <span className="truncate">{payment.reference}</span>
                      <span>{payment.currency} {payment.amount}</span>
                    </div>
                  ))
                ) : (
                  <p className="text-slate-500 dark:text-slate-400">{t("No payments yet", "Aucun paiement pour le moment", "Noch keine Zahlungen", "Aún no hay pagos", "Ainda não ha pagamentos")}</p>
                )}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">{t("Internal notes", "Notes internes", "Interne Notizen", "Notas internas", "Notas internas")}</p>
              <div className="mt-2 max-h-32 space-y-2 overflow-y-auto text-xs">
                {detail?.notes?.length ? (
                  detail.notes.map((note) => (
                    <div key={note.id} className="rounded-lg bg-slate-50 px-2 py-2 dark:bg-slate-950">
                      <p className="font-medium text-slate-700 dark:text-slate-200">{note.author.name || note.author.email}</p>
                      <p className="mt-1 text-slate-600 dark:text-slate-300">{note.content}</p>
                    </div>
                  ))
                ) : (
                  <p className="text-slate-500 dark:text-slate-400">{t("No notes yet.", "Aucune note pour le moment.", "Noch keine Notizen.", "Aún no hay notas.", "Ainda não ha notas.")}</p>
                )}
              </div>
              <Textarea
                className="mt-3 min-h-[84px]"
                value={noteDraft}
                onChange={(event) => setNoteDraft(event.target.value)}
                placeholder={t("Add private note...", "Ajouter une note privee...", "Private Notiz hinzufügen...", "Anadir nota privada...", "Adicionar nota privada...")}
              />
              <Button className="mt-2 w-full" variant="secondary" onClick={addNote} disabled={!detail}>
                <Inbox className="mr-2 h-4 w-4" />
                {t("Save note", "Enregistrer la note", "Notiz speichern", "Guardar nota", "Guardar nota")}
              </Button>
            </div>

            <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">{t("Quick actions", "Actions rapides", "Schnellaktionen", "Acciones rápidas", "Ações rápidas")}</p>
              <div className="mt-2 grid gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={!detail?.canViewBillingInsights || !detail?.customerInsights?.recentInvoices?.length}
                  onClick={() => {
                    const invoice = detail?.customerInsights?.recentInvoices?.[0];
                    if (!invoice) return;
                    setMessageDraft((prev) =>
                      `${prev ? `${prev}\n\n` : ""}${getInvoiceReadyMessage(invoice.invoiceNumber)}`
                    );
                  }}
                >
                  {t("Send invoice link", "Envoyer le lien de facture", "Rechnungslink senden", "Enviar enlace de factura", "Enviar link da fatura")}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={!detail?.canViewBillingInsights || !detail?.contact?.id}
                  onClick={() => router.push(`/dashboard/invoices?customerId=${detail?.contact?.id}`)}
                >
                  {t("Create invoice", "Creer une facture", "Rechnung erstellen", "Crear factura", "Criar fatura")}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setNoteDraft(t("Follow up in 24 hours.", "Faire un suivi dans 24 heures.", "In 24 Stunden nachfassen.", "Hacer seguimiento en 24 horas.", "Fazer seguimento em 24 horas."))}>
                  {t("Add follow-up note", "Ajouter une note de suivi", "Folgenotiz hinzufügen", "Anadir nota de seguimiento", "Adicionar nota de seguimento")}
                </Button>
              </div>
            </div>

            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-300">
              {!detail?.canViewBillingInsights
                ? t("Billing follow-up insights are limited to billing roles.", "Les insights de suivi de facturation sont limites aux roles de facturation.", "Abrechnungs-Follow-up-Einblicke sind auf Abrechnungsrollen beschrankt.", "Los datos de seguimiento de facturación estan limitados a los roles de facturación.", "Os dados de seguimento de faturação estão limitados aos perfis de faturação.")
                : detail?.customerInsights?.overdueInvoices?.length
                  ? t(
                      `${detail.customerInsights.overdueInvoices.length} overdue invoice(s) need follow-up.`,
                      `${detail.customerInsights.overdueInvoices.length} facture(s) en retard necessitent un suivi.`
                    )
                  : t("No overdue invoices for this customer.", "Aucune facture en retard pour ce client.", "Keine überfälligen Rechnungen für diesen Kunden.", "No hay facturas vencidas para este cliente.", "Não ha faturas em atraso para este cliente.")}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
