"use client";

import clsx from "clsx";
import { createPortal } from "react-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import { COUNTRY_DIAL_CODES, getCountryFlag, getCountryName } from "@/lib/countries";
import { getLocalizedText, type Language } from "@/lib/i18n";

type CountrySelectProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  locale?: Language;
  required?: boolean;
  placeholder?: string;
  triggerClassName?: string;
};

const normalizeCode = (value: string) => String(value || "").toUpperCase();

export function CountrySelect({
  label,
  value,
  onChange,
  locale = "en",
  required,
  placeholder,
  triggerClassName,
}: CountrySelectProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [menuPosition, setMenuPosition] = useState<{
    left: number;
    width: number;
    top?: number;
    bottom?: number;
  } | null>(null);

  const normalizeText = (value: string) =>
    value
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .replace(/\s+/g, " ")
      .trim();

  const options = useMemo(() => {
    const normalizedQuery = normalizeText(query);
    return COUNTRY_DIAL_CODES.map((entry) => {
      const name = getCountryName(entry.code, locale);
      return { code: entry.code, name, flag: getCountryFlag(entry.code) };
    })
      .filter((item) => {
        if (!normalizedQuery) return true;
        return (
          item.code.toLowerCase().includes(normalizedQuery) ||
          normalizeText(item.name).includes(normalizedQuery)
        );
      })
      .sort((a, b) => a.name.localeCompare(b.name, locale));
  }, [query, locale]);

  const selectedCode = normalizeCode(value);
  const selectedName = getCountryName(selectedCode, locale);
  const selectedFlag = getCountryFlag(selectedCode);
  const resolvedPlaceholder =
    placeholder ||
    getLocalizedText(
      {
        en: "Select country",
        fr: "Selectionner un pays",
        de: "Land auswählen",
        es: "Seleccionar país",
        pt: "Selecionar país",
      },
      locale
    );
  const searchPlaceholder = getLocalizedText(
    {
      en: "Search country",
      fr: "Rechercher un pays",
      de: "Land suchen",
      es: "Buscar país",
      pt: "Pesquisar país",
    },
    locale
  );

  useEffect(() => {
    if (!open) return;
    const handleClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (containerRef.current?.contains(target) || menuRef.current?.contains(target)) {
        return;
      }
      setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => searchInputRef.current?.focus(), 0);
    return () => window.clearTimeout(id);
  }, [open]);

  useEffect(() => {
    if (!open) {
      setMenuPosition(null);
      return;
    }

    const updateMenuPosition = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const estimatedMenuHeight = 320;
      const viewportPadding = 12;
      const spaceBelow = window.innerHeight - rect.bottom - viewportPadding;
      const spaceAbove = rect.top - viewportPadding;
      const openAbove = spaceBelow < estimatedMenuHeight && spaceAbove > spaceBelow;
      const desiredWidth = Math.max(rect.width, 280);
      const maxWidth = window.innerWidth - viewportPadding * 2;
      const width = Math.min(desiredWidth, maxWidth);
      const left = Math.min(
        Math.max(viewportPadding, rect.left),
        Math.max(viewportPadding, window.innerWidth - width - viewportPadding)
      );

      setMenuPosition({
        left,
        width,
        ...(openAbove
          ? { bottom: window.innerHeight - rect.top + 8 }
          : { top: rect.bottom + 8 }),
      });
    };

    updateMenuPosition();
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);
    return () => {
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative flex flex-col gap-1 text-sm text-foreground">
      <label className="text-sm text-foreground">
        {label}
        {required ? " *" : ""}
      </label>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => {
          if (open) {
            setOpen(false);
            setQuery("");
            return;
          }
          setQuery("");
          setOpen(true);
        }}
        className={clsx(
          "flex items-center justify-between rounded-lg border border-input bg-background px-3 py-2 text-left text-foreground focus:border-indigo-400 focus:outline-none",
          triggerClassName
        )}
      >
        <span className="min-w-0 flex flex-1 items-center gap-2 overflow-hidden">
          <span className="shrink-0 text-base">{selectedFlag}</span>
          <span
            className="min-w-0 flex-1 truncate whitespace-nowrap"
            title={selectedName || resolvedPlaceholder}
          >
            {selectedName || resolvedPlaceholder}
          </span>
        </span>
        <ChevronDown className="ml-3 h-4 w-4 shrink-0 text-muted-foreground" />
      </button>
      {open && menuPosition && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={menuRef}
              className="z-[70] rounded-2xl border border-slate-200 bg-white p-2 shadow-[0_24px_60px_rgba(15,23,42,0.18)] dark:border-slate-700 dark:bg-slate-950"
              style={{
                position: "fixed",
                left: menuPosition.left,
                width: menuPosition.width,
                top: menuPosition.top,
                bottom: menuPosition.bottom,
              }}
            >
              <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-2 py-1">
                <Search className="h-4 w-4 text-muted-foreground" />
                <input
                  ref={searchInputRef}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={searchPlaceholder}
                  className="w-full bg-transparent text-sm text-foreground outline-none"
                />
              </div>
              <div className="mt-2 max-h-56 overflow-auto">
                {options.map((option) => (
                  <button
                    key={option.code}
                    type="button"
                    onClick={() => {
                      onChange(option.code);
                      setOpen(false);
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm text-foreground hover:bg-muted"
                  >
                    <span className="text-base">{option.flag}</span>
                    <span className="min-w-0 flex-1 break-words">{option.name}</span>
                    <span className="text-xs text-muted-foreground">{option.code}</span>
                  </button>
                ))}
              </div>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
