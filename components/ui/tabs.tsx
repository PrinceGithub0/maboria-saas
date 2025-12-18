"use client";

import { useState } from "react";
import clsx from "clsx";

export function Tabs({
  tabs,
  defaultTab,
}: {
  tabs: { id: string; label: string; content: React.ReactNode }[];
  defaultTab?: string;
}) {
  const [active, setActive] = useState(defaultTab ?? tabs[0]?.id);
  return (
    <div>
      <div className="mb-4 inline-flex gap-2 rounded-full bg-slate-900/70 p-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActive(tab.id)}
            className={clsx(
              "rounded-full px-4 py-2 text-xs font-semibold transition",
              active === tab.id
                ? "bg-indigo-500 text-white shadow-lg shadow-indigo-500/30"
                : "text-slate-300 hover:text-white"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div>{tabs.find((tab) => tab.id === active)?.content}</div>
    </div>
  );
}
