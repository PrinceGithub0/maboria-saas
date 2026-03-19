"use client";

import clsx from "clsx";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import { COUNTRY_DIAL_CODES, getCountryFlag, getCountryName } from "@/lib/countries";

type CountrySelectProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  locale?: "en" | "fr";
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
  placeholder = "Select country",
  triggerClassName,
}: CountrySelectProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [placement, setPlacement] = useState<"top" | "bottom">("bottom");

  const options = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return COUNTRY_DIAL_CODES.map((entry) => {
      const name = getCountryName(entry.code, locale);
      return { code: entry.code, name, flag: getCountryFlag(entry.code) };
    })
      .filter((item) => {
        if (!normalizedQuery) return true;
        return (
          item.code.toLowerCase().includes(normalizedQuery) ||
          item.name.toLowerCase().includes(normalizedQuery)
        );
      })
      .sort((a, b) => a.name.localeCompare(b.name, locale));
  }, [query, locale]);

  const selectedCode = normalizeCode(value);
  const selectedName = getCountryName(selectedCode, locale);
  const selectedFlag = getCountryFlag(selectedCode);

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
    triggerRef.current?.scrollIntoView({ block: "nearest" });
    searchInputRef.current?.focus();
  }, [open]);

  const openMenu = () => {
    const triggerRect = triggerRef.current?.getBoundingClientRect();
    if (triggerRect) {
      const estimatedMenuHeight = 320;
      const spaceBelow = window.innerHeight - triggerRect.bottom;
      const spaceAbove = triggerRect.top;
      setPlacement(spaceBelow < estimatedMenuHeight && spaceAbove > spaceBelow ? "top" : "bottom");
    } else {
      setPlacement("bottom");
    }
    setQuery("");
    setOpen(true);
  };

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
          openMenu();
        }}
        className={clsx(
          "flex items-center justify-between rounded-lg border border-input bg-background px-3 py-2 text-left text-foreground focus:border-indigo-400 focus:outline-none",
          triggerClassName
        )}
      >
        <span className="flex items-center gap-2">
          <span className="text-base">{selectedFlag}</span>
          <span>{selectedName || placeholder}</span>
          {selectedCode ? (
            <span className="text-muted-foreground">({selectedCode})</span>
          ) : null}
        </span>
        <ChevronDown className="h-4 w-4 text-muted-foreground" />
      </button>
      {open ? (
        <div
          className={`absolute z-50 w-full rounded-xl border border-border bg-card p-2 shadow-xl ${
            placement === "top" ? "bottom-[calc(100%+8px)]" : "top-[calc(100%+8px)]"
          }`}
        >
          <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-2 py-1">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input
              ref={searchInputRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={locale === "fr" ? "Rechercher un pays" : "Search country"}
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
                <span className="flex-1">{option.name}</span>
                <span className="text-xs text-muted-foreground">{option.code}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
