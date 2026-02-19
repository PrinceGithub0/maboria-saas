import { createHash } from "crypto";
import { AutomationFlow, Prisma } from "@prisma/client";

type AutomationFlowLike = Pick<AutomationFlow, "id" | "title" | "description" | "steps" | "updatedAt">;

export type AutomationFlowSnapshot = {
  version: string;
  title: string;
  description: string;
  steps: Prisma.JsonValue;
  capturedAt: string;
};

const stableSerialize = (value: unknown): string => {
  if (value === null || value === undefined) return String(value);
  if (typeof value !== "object") return String(value);
  if (Array.isArray(value)) return `[${value.map((entry) => stableSerialize(entry)).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([key, entry]) => `${key}:${stableSerialize(entry)}`).join(",")}}`;
};

const hash = (value: string) => createHash("sha256").update(value).digest("hex");

export const buildFlowVersion = (flow: AutomationFlowLike) => {
  const updatedAt = flow.updatedAt?.toISOString?.() || new Date().toISOString();
  const fingerprint = stableSerialize(flow.steps);
  return `v_${hash(`${flow.id}|${updatedAt}|${fingerprint}`).slice(0, 16)}`;
};

export const buildFlowSnapshot = (flow: AutomationFlowLike): AutomationFlowSnapshot => ({
  version: buildFlowVersion(flow),
  title: flow.title,
  description: flow.description,
  steps: flow.steps as Prisma.JsonValue,
  capturedAt: new Date().toISOString(),
});

export const readFlowSnapshotFromRunOutput = (output: unknown): AutomationFlowSnapshot | null => {
  if (!output || typeof output !== "object") return null;
  const snapshot = (output as Record<string, unknown>)["flowSnapshot"];
  if (!snapshot || typeof snapshot !== "object") return null;

  const version = String((snapshot as Record<string, unknown>)["version"] || "").trim();
  const title = String((snapshot as Record<string, unknown>)["title"] || "").trim();
  const description = String((snapshot as Record<string, unknown>)["description"] || "").trim();
  const steps = (snapshot as Record<string, unknown>)["steps"] as Prisma.JsonValue | undefined;
  const capturedAt = String((snapshot as Record<string, unknown>)["capturedAt"] || "").trim();

  if (!version || !title || !description || !steps) return null;
  return {
    version,
    title,
    description,
    steps,
    capturedAt: capturedAt || new Date().toISOString(),
  };
};
