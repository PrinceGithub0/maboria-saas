import { LANGUAGE_LOCALES, getLocalizedText, type Language, type LocalizedText } from "@/lib/i18n";

const ASSISTANT_SERVER_MESSAGES: Record<string, LocalizedText> = {
  Unauthorized: { en: "Unauthorized", fr: "Non autorise", de: "Nicht autorisiert", es: "No autorizado", pt: "Não autorizado" },
  "Upgrade required": {
    en: "Upgrade required.",
    fr: "Mise a niveau requise.",
    de: "Upgrade erforderlich.",
    es: "Se requiere una mejora del plan.",
    pt: "Atualiza??o de plano necessária.",
  },
  "Payment required": {
    en: "Payment required.",
    fr: "Paiement requis.",
    de: "Zahlung erforderlich.",
    es: "Pago requerido.",
    pt: "Pagamento obrigatório.",
  },
  "Conversation not found": {
    en: "Conversation not found.",
    fr: "Conversation introuvable.",
    de: "Konversation nicht gefunden.",
    es: "Conversación no encontrada.",
    pt: "Conversa não encontrada.",
  },
  "Title is required": {
    en: "Title is required.",
    fr: "Le titre est requis.",
    de: "Ein Titel ist erforderlich.",
    es: "El título es obligatorio.",
    pt: "O título e obrigatório.",
  },
  "Active subscription required to use AI": {
    en: "An active subscription is required to use AI.",
    fr: "Un abonnement actif est requis pour utiliser l IA.",
    de: "Ein aktives Abonnement ist erforderlich, um KI zu nutzen.",
    es: "Se requiere una suscripción activa para usar la IA.",
    pt: "E necessario um plano ativo para usar a IA.",
  },
  "AI usage limit reached for this month": {
    en: "AI usage limit reached for this month.",
    fr: "La limite d utilisation IA de ce mois est atteinte.",
    de: "Das KI-Nutzungslimit für diesen Monat ist erreicht.",
    es: "Se alcanzo el limite de uso de IA de este mes.",
    pt: "O limite de utilização de IA deste mes foi atingido.",
  },
  "Assistant is unavailable right now.": {
    en: "Assistant is unavailable right now.",
    fr: "Assistant indisponible pour le moment.",
    de: "Der Assistent ist momentan nicht verfügbar.",
    es: "El asistente no est? disponible ahora mismo.",
    pt: "O assistente não esta disponível neste momento.",
  },
  "Chat history is unavailable right now. Sending without history.": {
    en: "Chat history is unavailable right now. Sending without history.",
    fr: "L'historique du chat est indisponible. Envoi sans historique.",
    de: "Der Chatverlauf ist momentan nicht verfügbar. Es wird ohne Verlauf gesendet.",
    es: "El historial del chat no est? disponible ahora mismo. Se enviara sin historial.",
    pt: "O histórico do chat não esta disponível neste momento. O envio seguira sem histórico.",
  },
  "Session expired. Please sign in again.": {
    en: "Session expired. Please sign in again.",
    fr: "Session expiree. Veuillez vous reconnecter.",
    de: "Die Sitzung ist abgelaufen. Bitte melde dich erneut an.",
    es: "La sesión ha expirado. Vuelve a iniciar sesión.",
    pt: "A sessão expirou. Inicia sessão novamente.",
  },
  "Unable to rename chat right now.": {
    en: "Unable to rename chat right now.",
    fr: "Impossible de renommer le chat pour le moment.",
    de: "Der Chat kann momentan nicht umbenannt werden.",
    es: "No se puede cambiar el nombre del chat en este momento.",
    pt: "Não e poss?vel renomear o chat neste momento.",
  },
  "Unable to delete chat right now.": {
    en: "Unable to delete chat right now.",
    fr: "Impossible de supprimer le chat pour le moment.",
    de: "Der Chat kann momentan nicht gelöscht werden.",
    es: "No se puede eliminar el chat en este momento.",
    pt: "Não e poss?vel eliminar o chat neste momento.",
  },
  "Thanks for the feedback.": {
    en: "Thanks for the feedback.",
    fr: "Merci pour votre retour.",
    de: "Danke für dein Feedback.",
    es: "Gracias por tu comentario.",
    pt: "Obrigado pelo teu feedback.",
  },
};

export function localizeAssistantServerMessage(message: unknown, language: Language, fallback?: string | null) {
  const normalized = String(message || "").trim();
  if (!normalized) return fallback || "";
  const translated = ASSISTANT_SERVER_MESSAGES[normalized];
  if (translated) return getLocalizedText(translated, language);
  return fallback || normalized;
}

export function formatAssistantDate(value: Date | string | null | undefined, language: Language) {
  if (!value) return "";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(LANGUAGE_LOCALES[language], {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

export function formatAssistantTime(value: Date | number | string | null | undefined, language: Language) {
  if (!value) return "";
  const date = typeof value === "number" ? new Date(value) : typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(LANGUAGE_LOCALES[language], {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
