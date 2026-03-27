import { enGB, fr, de, es, pt } from "date-fns/locale";
import { getLocalizedText, type Language, type LocalizedText } from "@/lib/i18n";

export const SUPPORT_CATEGORY_OPTIONS: Array<{
  value: string;
  label: LocalizedText;
  aliases: string[];
}> = [
  {
    value: "billing-payments",
    label: {
      en: "Billing & Payments",
      fr: "Facturation et paiements",
      de: "Abrechnung und Zahlungen",
      es: "Facturación y pagos",
      pt: "Faturação e pagamentos",
    },
    aliases: ["billing & payments", "facturation et paiements", "abrechnung und zahlungen", "facturación y pagos", "faturação e pagamentos"],
  },
  {
    value: "invoices",
    label: { en: "Invoices", fr: "Factures", de: "Rechnungen", es: "Facturas", pt: "Faturas" },
    aliases: ["invoices", "factures", "rechnungen", "facturas", "faturas"],
  },
  {
    value: "subscriptions",
    label: { en: "Subscriptions", fr: "Abonnements", de: "Abonnements", es: "Suscripciones", pt: "Assinaturas" },
    aliases: ["subscriptions", "abonnements", "suscripciones", "assinaturas"],
  },
  {
    value: "automation",
    label: { en: "Automation", fr: "Automatisation", de: "Automatisierung", es: "Automatización", pt: "Automação" },
    aliases: ["automation", "automatisation", "automatisierung", "automatización", "automação"],
  },
  {
    value: "ai-assistant",
    label: { en: "AI Assistant", fr: "Assistant IA", de: "KI-Assistent", es: "Asistente de IA", pt: "Assistente de IA" },
    aliases: ["ai assistant", "assistant ia", "ki-assistent", "asistente de ia", "assistente de ia"],
  },
  {
    value: "account-security",
    label: { en: "Account & Security", fr: "Compte et sécurité", de: "Konto und Sicherheit", es: "Cuenta y seguridad", pt: "Conta e seguranca" },
    aliases: ["account & security", "compte et sécurité", "konto und sicherheit", "cuenta y seguridad", "conta e seguranca"],
  },
  {
    value: "payouts",
    label: { en: "Payouts", fr: "Decaissements", de: "Auszahlungen", es: "Cobros", pt: "Recebimentos" },
    aliases: ["payouts", "decaissements", "auszahlungen", "cobros", "recebimentos"],
  },
  {
    value: "business-profile",
    label: { en: "Business Profile", fr: "Profil entreprise", de: "Unternehmensprofil", es: "Perfil de la empresa", pt: "Perfil da empresa" },
    aliases: ["business profile", "profil entreprise", "unternehmensprofil", "perfil de la empresa", "perfil da empresa"],
  },
  {
    value: "technical-issue",
    label: { en: "Technical Issue", fr: "Probleme technique", de: "Technisches Problem", es: "Problema técnico", pt: "Problema técnico" },
    aliases: ["technical issue", "probleme technique", "technisches problem", "problema técnico"],
  },
  {
    value: "other",
    label: { en: "Other", fr: "Autre", de: "Sonstiges", es: "Otro", pt: "Outro" },
    aliases: ["other", "autre", "sonstiges", "otro", "outro"],
  },
];

export function getSupportDateLocale(language: Language) {
  switch (language) {
    case "fr":
      return fr;
    case "de":
      return de;
    case "es":
      return es;
    case "pt":
      return pt;
    default:
      return enGB;
  }
}

export function getSupportCategoryLabel(value: string, language: Language) {
  const match = SUPPORT_CATEGORY_OPTIONS.find((option) => option.value === value) || SUPPORT_CATEGORY_OPTIONS[SUPPORT_CATEGORY_OPTIONS.length - 1];
  return getLocalizedText(match.label, language);
}

export function localizeSupportCategory(category: string, language: Language) {
  const normalized = String(category || "").trim().toLowerCase();
  if (!normalized) return getLocalizedText(SUPPORT_CATEGORY_OPTIONS[SUPPORT_CATEGORY_OPTIONS.length - 1].label, language);
  const match =
    SUPPORT_CATEGORY_OPTIONS.find((option) => option.aliases.includes(normalized)) ||
    SUPPORT_CATEGORY_OPTIONS.find((option) => option.value === normalized);
  return getLocalizedText((match || SUPPORT_CATEGORY_OPTIONS[SUPPORT_CATEGORY_OPTIONS.length - 1]).label, language);
}

const SUPPORT_SERVER_MESSAGES: Record<string, LocalizedText> = {
  Unauthorized: { en: "Unauthorized", fr: "Non autorise", de: "Nicht autorisiert", es: "No autorizado", pt: "Não autorizado" },
  "Workspace not found": {
    en: "Workspace not found.",
    fr: "Espace de travail introuvable.",
    de: "Workspace nicht gefunden.",
    es: "Espacio de trabajo no encontrado.",
    pt: "Espaco de trabalho não encontrado.",
  },
  "Attachment is invalid or exceeds 5MB.": {
    en: "Attachment is invalid or exceeds 5MB.",
    fr: "La piece jointe est invalide ou depasse 5 Mo.",
    de: "Der Anhang ist ungültig oder grosser als 5 MB.",
    es: "El archivo adjunto no es valido o supera los 5 MB.",
    pt: "O anexo e invalido ou excede 5 MB.",
  },
  "Failed to submit ticket": {
    en: "Failed to submit ticket.",
    fr: "Impossible de soumettre le ticket.",
    de: "Ticket konnte nicht gesendet werden.",
    es: "No se pudo enviar el ticket.",
    pt: "Não foi possivel submeter o ticket.",
  },
  "Not found": { en: "Not found.", fr: "Introuvable.", de: "Nicht gefunden.", es: "No encontrado.", pt: "Não encontrado." },
  "Subscribers can only reopen tickets.": {
    en: "Subscribers can only reopen tickets.",
    fr: "Les abonnes peuvent uniquement rouvrir des tickets.",
    de: "Abonnenten können nur Tickets erneut öffnen.",
    es: "Los suscriptores solo pueden reabrir tickets.",
    pt: "Os subscritores so podem reabrir tickets.",
  },
  "Only closed tickets can be reopened.": {
    en: "Only closed tickets can be reopened.",
    fr: "Seuls les tickets fermes peuvent être rouverts.",
    de: "Nur geschlossene Tickets können erneut geöffnet werden.",
    es: "Solo los tickets cerrados pueden reabrirse.",
    pt: "Apenas os tickets fechados podem ser reabertos.",
  },
  "Ticket was updated. Refresh and try again.": {
    en: "Ticket was updated. Refresh and try again.",
    fr: "Le ticket a ?t? mis ? jour. Actualisez et reessayez.",
    de: "Das Ticket wurde aktualisiert. Bitte aktualisieren und erneut versuchen.",
    es: "El ticket fue actualizado. Actualiza e intentalo de nuevo.",
    pt: "O ticket foi atualizado. Atualize e tente novamente.",
  },
  "Attachment not found": {
    en: "Attachment not found.",
    fr: "Piece jointe introuvable.",
    de: "Anhang nicht gefunden.",
    es: "Adjunto no encontrado.",
    pt: "Anexo não encontrado.",
  },
  "Support is currently disabled.": {
    en: "Support is currently disabled.",
    fr: "Le support est actuellement desactive.",
    de: "Der Support ist derzeit deaktiviert.",
    es: "El soporte esta desactivado en este momento.",
    pt: "O suporte esta desativado neste momento.",
  },
};

export function localizeSupportServerMessage(message: unknown, language: Language, fallback?: string | null) {
  const normalized = String(message || "").trim();
  if (!normalized) return fallback || "";
  const translated = SUPPORT_SERVER_MESSAGES[normalized];
  if (translated) return getLocalizedText(translated, language);
  return fallback || normalized;
}
