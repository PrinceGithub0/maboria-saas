"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { JsonViewer } from "@/components/runs/JsonViewer";

type StepLog = {
  step?: string | null;
  result?: any;
  error?: string | null;
  reason?: string | null;
  skipped?: boolean;
  input?: any;
  payload?: any;
  createdAt?: string | null;
  timestamp?: string | null;
};

const MAX_PREVIEW_LINES = 4;
const MAX_PREVIEW_CHARS = 300;

const detectAiStep = (value?: string | null) =>
  Boolean(value && value.toLowerCase().includes("ai"));

const normalizeText = (value: any) => {
  if (value == null) return "";
  if (typeof value === "string") return value;
  return JSON.stringify(value, null, 2);
};

const truncateText = (text: string) => {
  const lines = text.split("\n");
  const truncatedByLines = lines.length > MAX_PREVIEW_LINES;
  let preview = lines.slice(0, MAX_PREVIEW_LINES).join("\n");
  let truncated = truncatedByLines;
  if (!truncated && preview.length > MAX_PREVIEW_CHARS) {
    preview = preview.slice(0, MAX_PREVIEW_CHARS).trimEnd() + "…";
    truncated = true;
  }
  return { preview, truncated };
};

const resolveStatus = (log: StepLog) => {
  if (log?.error) return "FAILED";
  if (log?.skipped) return "SKIPPED";
  return "SUCCESS";
};

const resolveStatusVariant = (status: string) => {
  switch (status) {
    case "FAILED":
      return "danger";
    case "SKIPPED":
      return "warning";
    default:
      return "success";
  }
};

export function RunStepTimeline({
  logs,
  formatStepLabel,
  formatRunMessage,
  searchTerm,
  showFailuresOnly,
  formatTimestamp,
  t,
}: {
  logs: StepLog[];
  formatStepLabel: (value?: string) => string;
  formatRunMessage: (log: StepLog) => string;
  searchTerm: string;
  showFailuresOnly: boolean;
  formatTimestamp?: (value?: string | null) => string;
  t: (en: string, fr: string) => string;
}) {
  const [expandedSteps, setExpandedSteps] = useState<Record<string, boolean>>({});

  const outputUsage = useMemo(() => {
    const usage = new Map<string, { count: number; firstIndex: number }>();
    logs.forEach((log, idx) => {
      const output = normalizeText(log?.result);
      if (!output) return;
      const entry = usage.get(output);
      if (!entry) {
        usage.set(output, { count: 1, firstIndex: idx });
      } else {
        entry.count += 1;
      }
    });
    return usage;
  }, [logs]);

  const dedupedLogs = useMemo(() => {
    const seen = new Set<string>();
    return logs.filter((log) => {
      const signature = [
        String(log?.step || ""),
        normalizeText(log?.result),
        String(log?.error || ""),
        String(log?.reason || ""),
        String(log?.skipped || ""),
      ].join("|");
      if (seen.has(signature)) return false;
      seen.add(signature);
      return true;
    });
  }, [logs]);

  const filtered = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return dedupedLogs.filter((log) => {
      const status = resolveStatus(log);
      if (showFailuresOnly && status !== "FAILED") return false;
      if (!term) return true;
      const step = formatStepLabel(log?.step).toLowerCase();
      const output = normalizeText(log?.result).toLowerCase();
      const error = String(log?.error || "").toLowerCase();
      const reason = String(log?.reason || "").toLowerCase();
      const input = normalizeText(log?.input || log?.payload).toLowerCase();
      return (
        step.includes(term) ||
        output.includes(term) ||
        error.includes(term) ||
        reason.includes(term) ||
        input.includes(term)
      );
    });
  }, [dedupedLogs, formatStepLabel, searchTerm, showFailuresOnly]);

  if (!filtered.length) {
    return (
      <p className="text-sm text-muted-foreground">
        {t("No steps match this filter.", "Aucune etape ne correspond au filtre.")}
      </p>
    );
  }

  return (
    <div className="relative border-l border-border/60 pl-6">
      {filtered.map((log, idx) => {
        const status = resolveStatus(log);
        const badgeVariant = resolveStatusVariant(status);
        const outputText = normalizeText(log?.result);
        const errorText = log?.error ? String(log.error) : "";
        const reasonText = log?.reason ? String(log.reason) : "";
        const isAi = detectAiStep(log?.step || "");
        const outputKey = `${idx}-${log?.step || "step"}`;
        const isExpanded = Boolean(expandedSteps[outputKey]);
        const outputPreview = outputText ? truncateText(outputText) : null;
        const repetition = outputText ? outputUsage.get(outputText) : null;
        const isRepeated = Boolean(repetition && repetition.count > 1);
        const isFirstOccurrence = !isRepeated || repetition?.firstIndex === logs.indexOf(log);
        const showOutput = outputText && (isFirstOccurrence || isExpanded);
        const inputText = normalizeText(log?.input ?? log?.payload);
        const inputPreview = inputText ? truncateText(inputText) : null;
        const hasDetails = Boolean(outputText || errorText || reasonText || inputText);
        const hasHiddenDetails =
          Boolean(outputPreview?.truncated || inputPreview?.truncated) ||
          (isRepeated && !isFirstOccurrence);
        const rawTimestamp = log?.timestamp || log?.createdAt || "";
        const stepTimestamp =
          rawTimestamp && formatTimestamp ? formatTimestamp(rawTimestamp) : rawTimestamp;

        return (
          <div key={outputKey} className="relative pb-6 last:pb-0">
            <span className="absolute -left-3 top-2 h-2.5 w-2.5 rounded-full border border-border bg-background" />
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-foreground">
                {formatStepLabel(log?.step)}
              </span>
              <Badge
                variant={badgeVariant}
                className="bg-muted text-foreground border border-border/60 font-medium"
              >
                {status}
              </Badge>
              <span className="text-xs text-muted-foreground">{stepTimestamp || "—"}</span>
            </div>
            {!(outputText || errorText || reasonText) && (
              <p className="mt-1 text-sm text-muted-foreground">{formatRunMessage(log)}</p>
            )}

            {hasDetails && (
              <div className="mt-3 space-y-3">
                {isRepeated && isFirstOccurrence && (
                  <p className="text-xs text-muted-foreground">
                    {t("Output repeated", "Sortie repetee")} x{repetition?.count}
                  </p>
                )}

                {Boolean(inputText) && (
                  <JsonViewer
                    label={t("Input", "Entree")}
                    value={isExpanded ? inputText : inputPreview?.preview || ""}
                  />
                )}

                {showOutput && outputText && (
                  <>
                    {isAi ? (
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                          {t("Output", "Sortie")}
                        </p>
                        <p className="mt-2 text-sm text-muted-foreground whitespace-pre-wrap">
                          {isExpanded ? outputText : outputPreview?.preview}
                        </p>
                      </div>
                    ) : (
                      <JsonViewer
                        label={t("Output", "Sortie")}
                        value={isExpanded ? outputText : outputPreview?.preview || ""}
                      />
                    )}
                  </>
                )}

                {errorText && <JsonViewer label={t("Error", "Erreur")} value={errorText} />}
                {reasonText && <JsonViewer label={t("Logs", "Logs")} value={reasonText} />}

                {hasDetails && hasHiddenDetails && (
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedSteps((prev) => ({ ...prev, [outputKey]: !prev[outputKey] }))
                    }
                    className="text-xs font-semibold text-indigo-600 hover:text-indigo-500"
                  >
                    {isExpanded
                      ? t("Hide details", "Masquer details")
                      : t("Show details", "Afficher details")}
                  </button>
                )}

                {isRepeated && !isFirstOccurrence && !isExpanded && (
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedSteps((prev) => ({ ...prev, [outputKey]: true }))
                    }
                    className="text-xs font-semibold text-indigo-600 hover:text-indigo-500"
                  >
                    {t("Show repeated output", "Afficher sortie repetee")}
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
