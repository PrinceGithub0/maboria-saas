"use client";

import useSWR from "swr";
import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Table } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { Alert } from "@/components/ui/alert";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export default function RunsPage() {
  const { data: runs, mutate } = useSWR("/api/automation/runs", fetcher);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [isLogOpen, setLogOpen] = useState(false);
  const [runActionStatus, setRunActionStatus] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const runList = Array.isArray(runs) ? runs : [];
  const selectedRun = useMemo(
    () => runList.find((run: any) => run.id === selectedRunId) || null,
    [runList, selectedRunId]
  );
  useEffect(() => {
    if (isLogOpen && !selectedRun) setLogOpen(false);
  }, [isLogOpen, selectedRun]);

  const resolveRunBadge = (value?: string) => {
    switch (String(value || "").toUpperCase()) {
      case "SUCCESS":
        return "success";
      case "FAILED":
        return "danger";
      default:
        return "warning";
    }
  };
  const formatStepLabel = (value?: string) => {
    const raw = String(value || "").trim();
    if (!raw) return "Step";
    const normalized = raw.toLowerCase();
    const map: Record<string, string> = {
      parse_text: "Parse text",
      extract_data: "Extract data",
      call_external_api: "Call external API",
      generate_invoice: "Generate invoice",
      send_email: "Send email",
      generate_report: "Generate report",
      send_whatsapp: "Send WhatsApp",
      ai_transform: "AI transform",
    };
    return map[normalized] || raw.replace(/[_-]+/g, " ");
  };
  const formatRunMessage = (log: any) => {
    const raw =
      log?.reason ||
      (typeof log?.result === "string" ? log.result : "") ||
      (log?.result ? JSON.stringify(log.result) : "") ||
      "";
    const error = String(log?.error || "");
    const combined = `${raw} ${error}`.toLowerCase();
    if (combined.includes("apicall") || combined.includes("unknown step")) {
      return "Step failed. Please review the configuration and try again.";
    }
    if (error) return "Step failed. Please try again.";
    return raw || "Completed";
  };

  const restart = async (flowId?: string) => {
    if (!flowId) {
      setRunActionStatus({
        type: "error",
        message: "Cannot restart run: missing automation id.",
      });
      return;
    }
    setRunActionStatus(null);
    try {
      const res = await fetch("/api/automation/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flowId, input: { text: "Restarted from run viewer" } }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setRunActionStatus({
          type: "error",
          message:
            data?.reason ||
            data?.error ||
            "Unable to restart the automation. Please try again.",
        });
        return;
      }
      setRunActionStatus({
        type: "success",
        message: "Automation run started.",
      });
      await mutate();
    } catch {
      setRunActionStatus({
        type: "error",
        message: "Network error. Please try again.",
      });
    }
  };
  const toggleLogs = (runId: string) => {
    if (selectedRunId === runId && isLogOpen) {
      setLogOpen(false);
      return;
    }
    setSelectedRunId(runId);
    setLogOpen(true);
  };

  return (
    <div className="space-y-4 max-md:space-y-6">
      <div className="md:contents max-md:rounded-[28px] max-md:border max-md:border-border/60 max-md:bg-card max-md:p-4 max-md:shadow-[0_16px_36px_rgba(15,23,42,0.18)]">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-indigo-600 dark:text-indigo-300">Automation</p>
          <h1 className="text-3xl font-semibold text-foreground">Runs</h1>
        </div>
      </div>
      {runActionStatus && (
        <Alert variant={runActionStatus.type}>{runActionStatus.message}</Alert>
      )}
      <Card>
        <Table
          data={runList}
          keyExtractor={(row: any) => row.id}
          columns={[
            { key: "flow", label: "Flow", render: (row: any) => row.flow?.title },
            { key: "runStatus", label: "Status" },
            {
              key: "createdAt",
              label: "Created",
              render: (row: any) => new Date(row.createdAt).toLocaleString(),
            },
            {
              key: "actions",
              label: "Actions",
              render: (row: any) => (
                <div className="flex flex-wrap items-center gap-2">
                  <Button size="sm" variant="ghost" onClick={() => restart(row.flowId)}>
                    Restart
                  </Button>
                  <Button
                    size="sm"
                    variant={selectedRunId === row.id ? "secondary" : "ghost"}
                    onClick={() => toggleLogs(row.id)}
                  >
                    {selectedRunId === row.id && isLogOpen ? "Hide logs" : "View logs"}
                  </Button>
                </div>
              ),
            },
          ]}
        />
      </Card>
      <Modal
        open={Boolean(isLogOpen && selectedRun)}
        onClose={() => setLogOpen(false)}
        title="Run log"
      >
        {selectedRun && (
          <>
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span className="font-semibold text-foreground">{selectedRun.flow?.title || "Flow"}</span>
              <Badge variant={resolveRunBadge(selectedRun.runStatus)}>
                {String(selectedRun.runStatus || "RUNNING")}
              </Badge>
              <span className="text-muted-foreground">
                {new Date(selectedRun.createdAt).toLocaleString()}
              </span>
            </div>
            <div className="mt-4 space-y-2">
              {(Array.isArray(selectedRun.logs) ? selectedRun.logs : []).length === 0 && (
                <p className="text-sm text-muted-foreground">No step logs captured for this run.</p>
              )}
              {(Array.isArray(selectedRun.logs) ? selectedRun.logs : []).map(
                (log: any, idx: number) => {
                  const status =
                    log?.error ? "FAILED" : log?.skipped ? "SKIPPED" : "SUCCESS";
                  const badgeVariant =
                    status === "FAILED" ? "danger" : status === "SKIPPED" ? "warning" : "success";
                  const message =
                    log?.error ||
                    log?.reason ||
                    (typeof log?.result === "string" ? log.result : "") ||
                    (log?.result ? JSON.stringify(log.result) : "Completed");
                return (
                  <div
                    key={`${log?.step || "step"}-${idx}`}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/60 bg-muted/30 px-3 py-2 text-sm"
                  >
                    <div className="flex flex-wrap items-center gap-2 text-foreground">
                      <span className="font-medium">{formatStepLabel(log?.step)}</span>
                      <Badge variant={badgeVariant}>{status}</Badge>
                    </div>
                    <span className="text-muted-foreground">{formatRunMessage(log)}</span>
                  </div>
                );
              }
            )}
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}
