import type { Language } from "@/lib/i18n";

type TranslateInput = {
  message: string;
  language: Language;
};

const statusMap: Record<string, string> = {
  SUCCESS: "SUCCES",
  FAILED: "ECHEC",
  RUNNING: "EN COURS",
};

export function translateNotificationMessage({ message, language }: TranslateInput) {
  if (language !== "fr" || !message) return message;
  const trimmed = message.trim();

  if (trimmed === "Paystack payment failed") {
    return "Paiement Paystack échoué";
  }
  if (trimmed === "Flutterwave payment failed") {
    return "Paiement Flutterwave échoué";
  }
  if (trimmed === "We could not process your payment. Please update your billing details.") {
    return "Nous n'avons pas pu traiter votre paiement. Veuillez mettre a jour vos informations de facturation.";
  }

  const automationMatch = trimmed.match(/^Automation (.+) finished with (.+)$/);
  if (automationMatch) {
    const title = automationMatch[1];
    const status = automationMatch[2]?.toUpperCase();
    const translatedStatus = statusMap[status] || status;
    return `Automatisation ${title} terminee avec ${translatedStatus}`;
  }

  return message;
}
