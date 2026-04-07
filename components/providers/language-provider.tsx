"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  createIntl,
  createIntlCache,
  RawIntlProvider,
} from "react-intl";
import {
  DEFAULT_LANGUAGE,
  LANGUAGE_LOCALES,
  getLocalizedText,
  type Language,
  type LocalizedText,
  normalizeLanguage,
} from "@/lib/i18n";
import {
  DEFAULT_MESSAGE_CATALOG,
  getMessageCatalog,
  type MessageKey,
  type MessageValues,
} from "@/lib/i18n-catalog";

const STORAGE_KEY = "maboria_language";
const COOKIE_KEY = "maboria_language";
const intlCache = createIntlCache();

type LanguageContextValue = {
  language: Language;
  setLanguage: (language: Language) => void;
  m: (id: MessageKey, values?: MessageValues) => string;
  t: {
    (text: LocalizedText): string;
    (en: string, fr?: string, de?: string, es?: string, pt?: string): string;
  };
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

function getCookieLanguage() {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${COOKIE_KEY}=([^;]*)`));
  if (!match) return null;
  return normalizeLanguage(decodeURIComponent(match[1]), DEFAULT_LANGUAGE);
}

export function LanguageProvider({ children, initialLanguage }: { children: React.ReactNode; initialLanguage: Language }) {
  const [language, setLanguageState] = useState<Language>(initialLanguage);

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    const cookieLang = getCookieLanguage();
    const resolved = normalizeLanguage(stored || cookieLang || initialLanguage, initialLanguage);
    setLanguageState(resolved);
    document.documentElement.lang = resolved;
    document.documentElement.dataset.lang = resolved;
  }, [initialLanguage]);

  const setLanguage = useCallback((next: Language) => {
    setLanguageState(next);
    window.localStorage.setItem(STORAGE_KEY, next);
    document.cookie = `${COOKIE_KEY}=${encodeURIComponent(next)}; path=/; max-age=31536000`;
    document.documentElement.lang = next;
    document.documentElement.dataset.lang = next;
  }, []);

  const tImpl = useCallback(
    (input: string | LocalizedText, fr?: string, de?: string, es?: string, pt?: string) => {
      if (typeof input === "string") {
        return getLocalizedText({ en: input, fr, de, es, pt }, language);
      }
      return getLocalizedText(input, language);
    },
    [language]
  );
  const t = tImpl as LanguageContextValue["t"];

  const messages = useMemo(() => getMessageCatalog(language), [language]);
  const intl = useMemo(
    () =>
      createIntl(
        {
          locale: LANGUAGE_LOCALES[language],
          defaultLocale: LANGUAGE_LOCALES.en,
          messages,
          onError(error) {
            if (error.code === "MISSING_TRANSLATION") {
              return;
            }
            console.error(error);
          },
        },
        intlCache
      ),
    [language, messages]
  );
  const m = useCallback<LanguageContextValue["m"]>(
    (id, values) =>
      intl.formatMessage(
        {
          id,
          defaultMessage: DEFAULT_MESSAGE_CATALOG[id],
        },
        values
      ),
    [intl]
  );

  const value: LanguageContextValue = { language, setLanguage, m, t };

  return (
    <RawIntlProvider value={intl}>
      <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
    </RawIntlProvider>
  );
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    throw new Error("useLanguage must be used within LanguageProvider");
  }
  return ctx;
}
