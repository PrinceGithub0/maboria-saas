"use client";

import { useState } from "react";

export function Announcement({ message }: { message?: string }) {
  const [dismissedMessage, setDismissedMessage] = useState<string | null>(null);
  if (!message || dismissedMessage === message) return null;

  return (
    <div className="flex items-center justify-between border-b border-indigo-500/40 bg-indigo-500/15 px-4 py-2 text-sm text-indigo-900 dark:text-indigo-100">
      <span>{message}</span>
      <button
        className="text-indigo-800 hover:text-indigo-950 dark:text-indigo-200 dark:hover:text-indigo-50"
        onClick={() => setDismissedMessage(message)}
        aria-label="Dismiss announcement"
      >
        &times;
      </button>
    </div>
  );
}

