"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Search } from "lucide-react";
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
  locale?: "en" | "fr";
  defaultCountry?: string;
  required?: boolean;
};

const normalizeCode = (value: string) => String(value || "").toUpperCase();

export function PhoneInput({
  label,
  value,
  onChange,
  locale = "en",
  defaultCountry = "US",
  required,
}: PhoneInputProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [country, setCountry] = useState(normalizeCode(defaultCountry));
  const [nationalNumber, setNationalNumber] = useState("");

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
    const parsed = parseE164(value);
    if (parsed) {
      if (parsed.code !== country) setCountry(parsed.code);
      if (parsed.nationalNumber !== nationalNumber) {
        setNationalNumber(parsed.nationalNumber);
      }
      return;
    }
    const digits = String(value || "").replace(/\D/g, "");
    if (digits && digits !== nationalNumber) {
      setNationalNumber(digits);
    }
  }, [value, country, nationalNumber]);

  useEffect(() => {
    if (!open) return;
    const handleClick = (event: MouseEvent) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => searchInputRef.current?.focus(), 0);
    return () => window.clearTimeout(id);
  }, [open]);

  const dialCode = getDialCode(country);
  const formatted = nationalNumber ? `+${dialCode}${nationalNumber}` : "";

  useEffect(() => {
    if (formatted && formatted !== value) {
      onChange(formatted);
      return;
    }
    if (!nationalNumber && value) {
      onChange("");
    }
  }, [formatted, nationalNumber, value, onChange]);

  return (
    <div ref={containerRef} className="flex flex-col gap-1 text-sm text-foreground">
      <label className="text-sm text-foreground">
        {label}
        {required ? " *" : ""}
      </label>
      <div className="flex items-center rounded-lg border border-input bg-background px-2 py-1 text-foreground focus-within:border-indigo-400">
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
          placeholder={locale === "fr" ? "Numero de telephone" : "Phone number"}
          className="w-full bg-transparent px-2 py-1 text-sm text-foreground outline-none"
        />
      </div>
      {open ? (
        <div className="relative">
          <div className="absolute z-50 mt-2 w-full rounded-xl border border-border bg-card p-2 shadow-xl">
            <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-2 py-1">
              <Search className="h-4 w-4 text-muted-foreground" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={locale === "fr" ? "Rechercher un pays" : "Search country"}
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
          </div>
        </div>
      ) : null}
    </div>
  );
}
