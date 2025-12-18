"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

export function Dropdown({
  label,
  items,
}: {
  label: string;
  items: { label: string; onClick: () => void }[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative inline-block text-left">
      <button
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground hover:bg-muted"
      >
        {label}
        <ChevronDown className="h-4 w-4" />
      </button>
      {open && (
        <div className="absolute right-0 z-10 mt-2 w-48 rounded-xl border border-border bg-card shadow-xl">
          {items.map((item) => (
            <button
              key={item.label}
              onClick={() => {
                item.onClick();
                setOpen(false);
              }}
              className="block w-full px-4 py-2 text-left text-sm text-foreground hover:bg-muted"
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
