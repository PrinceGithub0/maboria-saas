"use client";

import useSWR from "swr";
import { AlertTriangle } from "lucide-react";

type ActiveIncidentResponse = {
  activeIncident: {
    id: string;
    title: string;
    summary: string | null;
    severity: "INFO" | "WARNING" | "CRITICAL";
    startedAt: string;
  } | null;
};

const fetcher = async <T,>(url: string): Promise<T> => {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Request failed (${response.status})`);
  }
  return (await response.json()) as T;
};

type IncidentSeverity = "INFO" | "WARNING" | "CRITICAL";

function severityClasses(severity: IncidentSeverity) {
  if (severity === "CRITICAL") {
    return "border-red-300 bg-red-600 text-white dark:border-rose-800/70 dark:bg-rose-950/40 dark:text-rose-100";
  }
  if (severity === "WARNING") {
    return "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800/70 dark:bg-amber-950/35 dark:text-amber-100";
  }
  return "border-slate-300 bg-slate-50 text-slate-900 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-100";
}

export function AdminIncidentBanner() {
  const { data } = useSWR<ActiveIncidentResponse>("/api/admin/incidents/active", fetcher, {
    refreshInterval: 30000,
    revalidateOnFocus: true,
  });

  const incident = data?.activeIncident;
  if (!incident) return null;

  const wrapperClass = severityClasses(incident.severity);
  const summary = String(incident.summary || "").trim();

  return (
    <div className={`mb-4 rounded-lg border px-4 py-3 text-sm ${wrapperClass}`} role="status" aria-live="polite">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="min-w-0">
          <p className="inline-flex items-center rounded-full bg-red-600 px-3 py-1 text-sm font-semibold text-white dark:bg-red-500">
            {incident.title}
          </p>
          {summary ? <p className="mt-2 truncate text-sm font-medium">{summary}</p> : null}
        </div>
      </div>
    </div>
  );
}
