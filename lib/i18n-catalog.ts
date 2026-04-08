import { repairLocalizedString, type Language } from "@/lib/i18n";

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

function sanitizeCatalog<T extends Record<string, string>>(catalog: T, language: Language): T {
  return Object.fromEntries(
    Object.entries(catalog).map(([key, value]) => [key, repairLocalizedString(value, language)])
  ) as T;
}

const sanitizedCatalogs = {
  en: sanitizeCatalog(catalogs.en, "en"),
  fr: sanitizeCatalog(catalogs.fr, "fr"),
  de: sanitizeCatalog(catalogs.de, "de"),
  es: sanitizeCatalog(catalogs.es, "es"),
  pt: sanitizeCatalog(catalogs.pt, "pt"),
} as const;

export type MessageCatalog = typeof en;
export type MessageKey = keyof MessageCatalog;
export type MessageValues = Record<string, string | number | boolean | Date | null | undefined>;

export const DEFAULT_MESSAGE_CATALOG = sanitizedCatalogs.en;

export function getMessageCatalog(language: Language): MessageCatalog {
  return {
    ...sanitizedCatalogs.en,
    ...sanitizedCatalogs[language],
  } as MessageCatalog;
}

export function isMessageKey(value: string): value is MessageKey {
  return Object.prototype.hasOwnProperty.call(sanitizedCatalogs.en, value);
}
