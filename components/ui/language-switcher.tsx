"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Globe, Check } from "lucide-react";

type Language = "en" | "fr";

const options: Array<{ value: Language; label: { en: string; fr: string } }> = [
  { value: "en", label: { en: "English", fr: "Anglais" } },
  { value: "fr", label: { en: "French", fr: "Francais" } },
];

type Props = {
  value: Language;
  onChange: (value: Language) => void;
};

export function LanguageSwitcher({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const router = useRouter();

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
        aria-label="Language"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        className="inline-flex items-center justify-center rounded-full border border-border bg-card p-2 text-muted-foreground hover:bg-muted focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
      >
        <Globe className="h-4 w-4" />
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Language menu"
          className="absolute right-0 mt-2 w-44 overflow-hidden rounded-xl border border-border bg-card shadow-xl"
        >
          <div className="px-3 py-2 text-xs font-semibold text-muted-foreground">
            {value === "fr" ? "Langue" : "Language"}
          </div>
          <div className="border-t border-border">
            {options.map((opt) => {
              const active = opt.value === value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  role="menuitemradio"
                  aria-checked={active}
                  onClick={() => {
                    onChange(opt.value);
                    setOpen(false);
                    router.refresh();
                  }}
                  className={clsx(
                    "flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition focus:outline-none focus:ring-2 focus:ring-indigo-500/40",
                    active ? "bg-muted" : "hover:bg-muted"
                  )}
                >
                  <span className="text-foreground">{value === "fr" ? opt.label.fr : opt.label.en}</span>
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
