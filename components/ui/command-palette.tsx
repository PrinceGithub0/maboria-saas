"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Search, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useLanguage } from "@/components/providers/language-provider";

export type CommandItem = {
  id: string;
  label: string;
  description?: string;
  href: string;
  icon?: LucideIcon;
  group?: string;
  keywords?: string[];
};

export function CommandPalette({
  open,
  onOpenChange,
  items,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: CommandItem[];
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const { language } = useLanguage();
  const t = useCallback((en: string, fr: string) => (language === "fr" ? fr : en), [language]);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    const id = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(id);
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => {
      const haystack = [
        item.label,
        item.description,
        ...(item.keywords || []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [items, query]);

  const grouped = useMemo(() => {
    const map = new Map<string, CommandItem[]>();
    for (const item of filtered) {
      const key = item.group || t("Navigate", "Naviguer");
      const list = map.get(key) || [];
      list.push(item);
      map.set(key, list);
    }
    return Array.from(map.entries());
  }, [filtered, t]);

  const handleSelect = (item: CommandItem) => {
    onOpenChange(false);
    router.push(item.href);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-slate-950/50 px-4 py-16 backdrop-blur">
      <div className="w-full max-w-2xl overflow-hidden rounded-3xl border border-border bg-card shadow-[0_30px_80px_rgba(15,23,42,0.25)]">
        <div className="flex items-center gap-3 border-b border-border px-4 py-3">
          <Search className="h-5 w-5 text-muted-foreground" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("Search pages, actions, and tools", "Rechercher pages, actions et outils")}
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
            onKeyDown={(e) => {
              if (e.key === "Enter" && filtered[0]) {
                e.preventDefault();
                handleSelect(filtered[0]);
              }
            }}
          />
          <button
            onClick={() => onOpenChange(false)}
            className="rounded-lg border border-border bg-card p-1.5 text-muted-foreground hover:text-foreground"
            aria-label={t("Close command palette", "Fermer la palette")}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="max-h-[60vh] overflow-y-auto px-4 py-4">
          {grouped.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
              {t("No results found. Try another search term.", "Aucun resultat. Essayez un autre terme.")}
            </div>
          ) : (
            <div className="space-y-6">
              {grouped.map(([group, groupItems]) => (
                <div key={group} className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                    {group}
                  </p>
                  <div className="grid gap-2">
                    {groupItems.map((item) => {
                      const Icon = item.icon;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => handleSelect(item)}
                          className={clsx(
                            "flex w-full items-center gap-3 rounded-2xl border border-transparent bg-muted/40 px-4 py-3 text-left transition",
                            "hover:border-indigo-500/40 hover:bg-indigo-500/10"
                          )}
                        >
                          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-background">
                            {Icon ? <Icon className="h-5 w-5 text-foreground" /> : null}
                          </div>
                          <div className="flex-1">
                            <p className="text-sm font-semibold text-foreground">{item.label}</p>
                            {item.description ? (
                              <p className="text-xs text-muted-foreground">{item.description}</p>
                            ) : null}
                          </div>
                          <span className="rounded-full border border-border bg-background px-2 py-1 text-[11px] text-muted-foreground">
                            {t("Enter", "Entree")}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
