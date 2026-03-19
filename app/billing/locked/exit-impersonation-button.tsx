"use client";

import { useState } from "react";

export function ExitImpersonationButton() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleExit = async () => {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/impersonation/stop", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });
      if (!response.ok) {
        throw new Error("Unable to exit impersonation.");
      }
      window.location.href = "/admin/tenants";
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Unable to exit impersonation.");
      setLoading(false);
    }
  };

  return (
    <div className="text-right">
      <button
        type="button"
        onClick={handleExit}
        disabled={loading}
        className="impersonation-banner-action rounded-lg border px-3 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-70"
      >
        {loading ? "Exiting..." : "Exit impersonation"}
      </button>
      {error ? <p className="mt-1 text-xs text-rose-700">{error}</p> : null}
    </div>
  );
}
