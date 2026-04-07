"use client";

import clsx from "clsx";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Search } from "lucide-react";
import { getLocalizedText, type Language } from "@/lib/i18n";
import {
  COUNTRY_DIAL_CODES,
  getCountryFlag,
  getCountryName,
  getDialCode,
  parseE164,
} from "@/lib/countries";

type PhoneInputProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  locale?: Language;
  defaultCountry?: string;
  required?: boolean;
  fieldClassName?: string;
  inputClassName?: string;
};

const normalizeCode = (value: string) => String(value || "").toUpperCase();

export function PhoneInput({
  label,
  value,
  onChange,
  locale = "en",
  defaultCountry = "US",
  required,
  fieldClassName,
  inputClassName,
}: PhoneInputProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const fieldRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const lastEmittedRef = useRef("");
  const countryRef = useRef(normalizeCode(defaultCountry));
  const nationalRef = useRef("");
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [country, setCountry] = useState(normalizeCode(defaultCountry));
  const [nationalNumber, setNationalNumber] = useState("");
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

  const normalizedQuery = normalizeText(query);
  const options = COUNTRY_DIAL_CODES.map((entry) => {
    const name = getCountryName(entry.code, locale);
    return { code: entry.code, name, dialCode: entry.dialCode, flag: getCountryFlag(entry.code) };
  }).filter((item) => {
    if (!normalizedQuery) return true;
    const name = normalizeText(item.name);
    const code = item.code.toLowerCase();
    const dial = item.dialCode.replace(/\D/g, "");
    const queryDigits = normalizedQuery.replace(/\D/g, "");
    return (
      code.includes(normalizedQuery) ||
      name.includes(normalizedQuery) ||
      (queryDigits && dial.includes(queryDigits))
    );
  });

  useEffect(() => {
    countryRef.current = country;
  }, [country]);

  useEffect(() => {
    nationalRef.current = nationalNumber;
  }, [nationalNumber]);

  useEffect(() => {
    if (value === lastEmittedRef.current) return;
    const parsed = parseE164(value);
    if (parsed) {
      if (parsed.code !== countryRef.current) setCountry(parsed.code);
      if (parsed.nationalNumber !== nationalRef.current) {
        setNationalNumber(parsed.nationalNumber);
      }
      return;
    }
    const digits = String(value || "").replace(/\D/g, "");
    if (digits !== nationalRef.current) {
      setNationalNumber(digits);
    }
  }, [value]);

  useEffect(() => {
    if (!open) return;
    const handleClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (containerRef.current?.contains(target) || menuRef.current?.contains(target)) {
        return;
      }
      if (target) {
        setOpen(false);
      }
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
      const rect = fieldRef.current?.getBoundingClientRect();
      if (!rect) return;
      const estimatedMenuHeight = 320;
      const viewportPadding = 12;
      const spaceBelow = window.innerHeight - rect.bottom - viewportPadding;
      const spaceAbove = rect.top - viewportPadding;
      const openAbove = spaceBelow < estimatedMenuHeight && spaceAbove > spaceBelow;

      setMenuPosition({
        left: Math.max(viewportPadding, rect.left),
        width: Math.min(rect.width, window.innerWidth - viewportPadding * 2),
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

  const dialCode = getDialCode(country);
  const formatted = nationalNumber ? `+${dialCode}${nationalNumber}` : "";
  const phonePlaceholder = getLocalizedText(
    {
      en: "Phone number",
      fr: "Num?ro de t?l?phone",
      de: "Telefonnummer",
      es: "N?mero de tel?fono",
      pt: "N?mero de telefone",
    },
    locale
  );
  const searchPlaceholder = getLocalizedText(
    {
      en: "Search country",
      fr: "Rechercher un pays",
      de: "Land suchen",
      es: "Buscar pa?s",
      pt: "Pesquisar pa?s",
    },
    locale
  );

  useEffect(() => {
    if (formatted && formatted !== value) {
      lastEmittedRef.current = formatted;
      onChange(formatted);
      return;
    }
    if (!nationalNumber && value) {
      lastEmittedRef.current = "";
      onChange("");
    }
  }, [formatted, nationalNumber, value, onChange]);

  return (
    <div ref={containerRef} className="flex flex-col gap-1 text-sm text-foreground dark:text-slate-200">
      <label className="text-sm text-foreground dark:text-slate-200">
        {label}
        {required ? " *" : ""}
      </label>
      <div
        ref={fieldRef}
        className={clsx(
          "flex items-center rounded-lg border border-input bg-background px-2 py-1 text-foreground transition focus-within:border-indigo-400",
          open && "border-indigo-300 shadow-[0_0_0_3px_rgba(99,102,241,0.12)]",
          fieldClassName
        )}
      >
        <button
          type="button"
          onClick={() => {
            setOpen((prev) => !prev);
            setQuery("");
          }}
          className="flex items-center gap-2 rounded-lg px-2 py-1 text-sm hover:bg-muted"
        >
          <span className="text-base">{getCountryFlag(country)}</span>
          <span className="text-sm text-muted-foreground">+{dialCode}</span>
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        </button>
        <input
          value={nationalNumber}
          onChange={(event) => setNationalNumber(event.target.value.replace(/\D/g, ""))}
          inputMode="numeric"
          required={required}
          placeholder={phonePlaceholder}
          className={clsx(
            "w-full bg-transparent px-2 py-1 text-sm text-foreground outline-none placeholder:text-muted-foreground dark:text-slate-100 dark:placeholder:text-slate-400",
            inputClassName
          )}
        />
      </div>
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
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={searchPlaceholder}
                  className="w-full bg-transparent text-sm text-foreground outline-none"
                  ref={searchInputRef}
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>
              <div className="mt-2 max-h-56 overflow-auto">
                {options.map((option) => (
                  <button
                    key={`${option.code}-${option.dialCode}`}
                    type="button"
                    onClick={() => {
                      setCountry(option.code);
                      setOpen(false);
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm text-foreground hover:bg-muted"
                  >
                    <span className="text-base">{option.flag}</span>
                    <span className="flex-1">{option.name}</span>
                    <span className="text-xs text-muted-foreground">+{option.dialCode}</span>
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
