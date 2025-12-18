 "use client";

import { useEffect, useState } from "react";

export function Announcement({ message }: { message?: string }) {
  const [visible, setVisible] = useState(!!message);
  useEffect(() => setVisible(!!message), [message]);
  if (!visible || !message) return null;
  return (
    <div className="bg-indigo-500/20 text-indigo-100 border-b border-indigo-500/40 px-4 py-2 text-sm flex items-center justify-between">
      <span>{message}</span>
      <button className="text-indigo-200" onClick={() => setVisible(false)} aria-label="Dismiss announcement">
        ×
      </button>
    </div>
  );
}
