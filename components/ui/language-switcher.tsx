"use client";

import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { Check, ChevronDown, Globe } from "lucide-react";
import {
  getLanguageDisplayName,
  getLocalizedText,
  getLanguageShortCode,
  SUPPORTED_LANGUAGES,
  type Language,
} from "@/lib/i18n";

type Props = {
  value: Language;
  onChange: (value: Language) => void;
};

const languageSwitcherText = {
  buttonLabel: {
    en: "Language",
    fr: "Langue",
    de: "Sprache",
    es: "Idioma",
    pt: "Idioma",
  },
  menuLabel: {
    en: "Language menu",
    fr: "Menu des langues",
    de: "Sprachmenu",
    es: "Menu de idiomas",
    pt: "Menu de idiomas",
  },
};

export function LanguageSwitcher({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const el = wrapperRef.current;
      if (!el) return;
      if (event.target instanceof Node && el.contains(event.target)) return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  return (
    <div ref={wrapperRef} className="relative z-[60]">
      <button
        type="button"
        aria-label={getLocalizedText(languageSwitcherText.buttonLabel, value)}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        className="inline-flex items-center gap-2 rounded-full border border-border bg-card/95 px-3 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-foreground shadow-sm hover:bg-muted focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
      >
        <Globe className="h-4 w-4 text-muted-foreground" />
        <span>{getLanguageShortCode(value)}</span>
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
      </button>

      {open && (
        <div
          role="menu"
          aria-label={getLocalizedText(languageSwitcherText.menuLabel, value)}
          className="absolute right-0 mt-2 w-48 overflow-hidden rounded-2xl border border-border bg-background shadow-2xl"
        >
          <div className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            {getLanguageDisplayName(value, value)}
          </div>
          <div className="border-t border-border">
            {SUPPORTED_LANGUAGES.map((language) => {
              const active = language === value;
              return (
                <button
                  key={language}
                  type="button"
                  role="menuitemradio"
                  aria-checked={active}
                  onClick={() => {
                    onChange(language);
                    setOpen(false);
                  }}
                  className={clsx(
                    "flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-sm transition focus:outline-none focus:ring-2 focus:ring-indigo-500/40",
                    active ? "bg-indigo-500/10 text-foreground" : "hover:bg-muted"
                  )}
                >
                  <span className="text-foreground">{getLanguageDisplayName(language, value)}</span>
                  {active && <Check className="h-4 w-4 text-indigo-500" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
