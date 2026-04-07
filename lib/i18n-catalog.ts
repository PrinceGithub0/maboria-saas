import type { Language } from "@/lib/i18n";

import de from "@/messages/de.json";
import en from "@/messages/en.json";
import es from "@/messages/es.json";
import fr from "@/messages/fr.json";
import pt from "@/messages/pt.json";

const catalogs = {
  en,
  fr,
  de,
  es,
  pt,
} as const;

export type MessageCatalog = typeof en;
export type MessageKey = keyof MessageCatalog;
export type MessageValues = Record<string, string | number | boolean | Date | null | undefined>;

export const DEFAULT_MESSAGE_CATALOG = catalogs.en;

export function getMessageCatalog(language: Language): MessageCatalog {
  return {
    ...catalogs.en,
    ...catalogs[language],
  } as MessageCatalog;
}

export function isMessageKey(value: string): value is MessageKey {
  return Object.prototype.hasOwnProperty.call(catalogs.en, value);
}
