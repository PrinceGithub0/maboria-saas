import "server-only";

import OpenAI from "openai";
import { prisma } from "../prisma";
import {
  systemPrompt,
  flowGenerationPrompt,
  flowImprovementPrompt,
  stepGeneratorPrompt,
  insightPrompt,
  errorDiagnosisPrompt,
} from "./templates";
import { resolveAssistantOpenAiModel, type AssistantModelChoice } from "./model-selection";
import { getAssistantBoundaryResponse } from "./assistant-boundaries";
import { env } from "../env";
import { log } from "../logger";
import { recordAnalyticsEvent } from "../analytics";
import { getWorkspaceScope } from "../entitlements";
import { assertSystemFlagEnabled } from "../system-flags";

const client = new OpenAI({ apiKey: env.openaiKey });

type RouterMode = "assistant" | "flow-generate" | "flow-improve" | "step-generate" | "insight" | "diagnose";

const GRATITUDE_TOKENS = new Set([
  "thanks",
  "thank",
  "thankyou",
  "thx",
  "ty",
  "appreciate",
  "you",
  "it",
  "a",
  "lot",
  "so",
  "much",
  "for",
  "your",
  "help",
  "the",
  "quick",
  "response",
  "ok",
  "okay",
  "great",
  "boss",
  "bro",
  "mate",
  "sir",
  "ma",
  "maam",
  "madam",
  "miss",
  "mr",
  "mrs",
  "ms",
]);

const POLITE_ONLY_PATTERNS = [/^please$/, /^pls$/, /^plz$/];

const GREETING_PATTERNS = [
  /^(hi|hello|hey)$/,
  /^(hi|hello|hey)\s+(there|maboria|team)$/,
  /^(good\s+morning|good\s+afternoon|good\s+evening)$/,
  /^(whats\s+up|sup)$/,
];

function getAssistantShortCircuitResponse(rawPrompt: string) {
  const normalized = rawPrompt.trim().toLowerCase();
  const normalizedClean = normalized.replace(/[^\w\s]/g, "").replace(/\s+/g, " ").trim();
  const tokens = normalizedClean.split(" ").filter(Boolean);
  const isGreeting = GREETING_PATTERNS.some((re) => re.test(normalizedClean));

  if (isGreeting) {
    return "Hi - how can I help with automations, invoices, billing, or payments in Maboria?";
  }

  const hasGratitude = tokens.some((token) =>
    ["thanks", "thank", "thankyou", "thx", "ty", "appreciate"].includes(token)
  );
  const isGratitudeOnly = hasGratitude && tokens.every((token) => GRATITUDE_TOKENS.has(token));
  if (isGratitudeOnly) {
    return "You're welcome. What would you like to do next?";
  }

  const isPoliteOnly = POLITE_ONLY_PATTERNS.some((re) => re.test(normalizedClean));
  if (isPoliteOnly) {
    return "Of course. What would you like me to do?";
  }

  return getAssistantBoundaryResponse(rawPrompt)?.response ?? null;
}

function createStaticStreamResponse(message: string) {
  async function* quickReply() {
    yield message;
  }

  return { stream: quickReply(), done: Promise.resolve(message) };
}

export async function aiRouter({
  mode,
  prompt,
  context,
  userId,
  model,
}: {
  mode: RouterMode;
  prompt: string;
  context?: any;
  userId: string;
  model?: AssistantModelChoice;
}) {
  await assertSystemFlagEnabled("ai_enabled", "AI assistant is currently disabled.");
  const resolvedModel = resolveAssistantOpenAiModel(model);

  const rawPrompt = prompt.split(/\nRecent memory:/i)[0] || prompt;
  if (mode === "assistant") {
    const shortCircuitResponse = getAssistantShortCircuitResponse(rawPrompt);
    if (shortCircuitResponse) {
      return shortCircuitResponse;
    }
  }

  let input = prompt;
  switch (mode) {
    case "flow-generate":
      input = flowGenerationPrompt(prompt);
      break;
    case "flow-improve":
      input = flowImprovementPrompt(context?.flow, prompt);
      break;
    case "step-generate":
      input = stepGeneratorPrompt(prompt);
      break;
    case "insight":
      input = insightPrompt(context);
      break;
    case "diagnose":
      input = errorDiagnosisPrompt(context);
      break;
    default:
      input = `Answer the user's question clearly and helpfully. If the answer is a process, give steps.\n\nUser: ${prompt}`;
  }

  try {
    const res = await client.responses.create({
      model: resolvedModel,
      input: [{ role: "system", content: systemPrompt }, { role: "user", content: input }],
      temperature: 0.3,
      max_output_tokens: 500,
    });
    let output = res.output_text;
    if (!output || !output.trim()) {
      output = "I couldn't generate a response. Please rephrase or give a bit more detail.";
    }
    if (mode === "assistant") {
      const wantsJson = /\bjson\b/i.test(rawPrompt) || /return\s+json/i.test(rawPrompt);
      const stripFence = (value: string) => {
        const trimmed = value.trim();
        const fence = trimmed.match(/^```(?:json)?\s*([\s\S]*?)```$/i);
        return fence?.[1]?.trim() ?? trimmed;
      };
      const formatLabel = (key: string) =>
        key
          .replace(/_/g, " ")
          .replace(/([a-z])([A-Z])/g, "$1 $2")
          .trim();
      const jsonToText = (value: any): string => {
        if (value == null) return "";
        if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
          return String(value);
        }
        if (Array.isArray(value)) {
          return value.map((item) => `- ${jsonToText(item)}`).join("\n");
        }
        if (typeof value === "object") {
          const lines: string[] = [];
          for (const [key, entry] of Object.entries(value)) {
            if (Array.isArray(entry)) {
              lines.push(`${formatLabel(key)}:`);
              for (const item of entry) {
                lines.push(`- ${jsonToText(item)}`);
              }
              continue;
            }
            if (entry && typeof entry === "object") {
              lines.push(`${formatLabel(key)}:`);
              for (const [childKey, childValue] of Object.entries(entry)) {
                lines.push(`- ${formatLabel(childKey)}: ${jsonToText(childValue)}`);
              }
              continue;
            }
            lines.push(`${formatLabel(key)}: ${jsonToText(entry)}`);
          }
          return lines.join("\n");
        }
        return "";
      };
      const cleaned = stripFence(output);
      if (!wantsJson && (cleaned.startsWith("{") || cleaned.startsWith("["))) {
        try {
          const parsed = JSON.parse(cleaned);
          output = jsonToText(parsed);
        } catch {
          // Keep original output on parse errors.
        }
      }
      output = output.replace(/^\"+|\"+$/g, "").trim();
    }
    const usageTokens =
      typeof res.usage?.total_tokens === "number"
        ? res.usage.total_tokens
        : (res.usage?.input_tokens ?? 0) + (res.usage?.output_tokens ?? 0);
    const fallbackTokens = Math.max(1, Math.ceil((input.length + output.length) / 4));
    const resolvedTokens = usageTokens > 0 ? usageTokens : fallbackTokens;
    const usageLog = await prisma.aiUsageLog.create({
      data: { userId, model: resolvedModel, tokens: resolvedTokens, prompt: input },
    });
    const workspace = await getWorkspaceScope(userId);
    const workspaceId = workspace.businessId ?? userId;
    await recordAnalyticsEvent({
      userId,
      workspaceId,
      orgId: workspaceId,
      type: "AI_REQUEST",
      count: 1,
      createdAt: new Date(),
      idempotencyKey: `ai:${usageLog.id}`,
    });
    await recordAnalyticsEvent({
      userId,
      workspaceId,
      orgId: workspaceId,
      type: "AI_TOKENS",
      count: resolvedTokens,
      tokenCount: resolvedTokens,
      createdAt: new Date(),
    });
    await prisma.activityLog.create({
      data: {
        userId,
        action: "AI_CALL",
        metadata: { mode },
      },
    });
    return output;
  } catch (error: any) {
    log("error", "AI router failure", { error: error.message, mode });
    throw error;
  }
}

export async function aiRouterStream({
  mode,
  prompt,
  context,
  userId,
  model,
}: {
  mode: RouterMode;
  prompt: string;
  context?: any;
  userId: string;
  model?: AssistantModelChoice;
}) {
  await assertSystemFlagEnabled("ai_enabled", "AI assistant is currently disabled.");
  const resolvedModel = resolveAssistantOpenAiModel(model);

  const rawPrompt = prompt.split(/\nRecent memory:/i)[0] || prompt;
  if (mode === "assistant") {
    const shortCircuitResponse = getAssistantShortCircuitResponse(rawPrompt);
    if (shortCircuitResponse) {
      return createStaticStreamResponse(shortCircuitResponse);
    }
  }

  let input = prompt;
  switch (mode) {
    case "flow-generate":
      input = flowGenerationPrompt(prompt);
      break;
    case "flow-improve":
      input = flowImprovementPrompt(context?.flow, prompt);
      break;
    case "step-generate":
      input = stepGeneratorPrompt(prompt);
      break;
    case "insight":
      input = insightPrompt(context);
      break;
    case "diagnose":
      input = errorDiagnosisPrompt(context);
      break;
    default:
      input = `Answer the user's question clearly and helpfully. If the answer is a process, give steps.\n\nUser: ${prompt}`;
  }

  let output = "";
  let usageTokens = 0;

  const stream = (async function* () {
    const res = await client.responses.stream({
      model: resolvedModel,
      input: [{ role: "system", content: systemPrompt }, { role: "user", content: input }],
      temperature: 0.3,
      max_output_tokens: 500,
    });
    for await (const event of res) {
      const type = (event as any).type || "";
      if (type === "response.completed" && (event as any).response?.usage?.total_tokens) {
        usageTokens = (event as any).response.usage.total_tokens;
      }
      if (type === "response.output_text.delta") {
        const delta = (event as any).delta ?? (event as any).output_text?.delta ?? "";
        if (delta) {
          output += delta;
          yield delta;
        }
      }
    }
  })();

  const done = (async () => {
    let finalOutput = output;
    if (!finalOutput || !finalOutput.trim()) {
      finalOutput = "I couldn't generate a response. Please rephrase or give a bit more detail.";
    }
    if (mode === "assistant") {
      const wantsJson = /\bjson\b/i.test(rawPrompt) || /return\s+json/i.test(rawPrompt);
      const stripFence = (value: string) => {
        const trimmed = value.trim();
        const fence = trimmed.match(/^```(?:json)?\s*([\s\S]*?)```$/i);
        return fence?.[1]?.trim() ?? trimmed;
      };
      const formatLabel = (key: string) =>
        key
          .replace(/_/g, " ")
          .replace(/([a-z])([A-Z])/g, "$1 $2")
          .trim();
      const jsonToText = (value: any): string => {
        if (value == null) return "";
        if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
          return String(value);
        }
        if (Array.isArray(value)) {
          return value.map((item) => `- ${jsonToText(item)}`).join("\n");
        }
        if (typeof value === "object") {
          const lines: string[] = [];
          for (const [key, entry] of Object.entries(value)) {
            if (Array.isArray(entry)) {
              lines.push(`${formatLabel(key)}:`);
              for (const item of entry) {
                lines.push(`- ${jsonToText(item)}`);
              }
              continue;
            }
            if (entry && typeof entry === "object") {
              lines.push(`${formatLabel(key)}:`);
              for (const [childKey, childValue] of Object.entries(entry)) {
                lines.push(`- ${formatLabel(childKey)}: ${jsonToText(childValue)}`);
              }
              continue;
            }
            lines.push(`${formatLabel(key)}: ${jsonToText(entry)}`);
          }
          return lines.join("\n");
        }
        return "";
      };
      const cleaned = stripFence(finalOutput);
      if (!wantsJson && (cleaned.startsWith("{") || cleaned.startsWith("["))) {
        try {
          const parsed = JSON.parse(cleaned);
          finalOutput = jsonToText(parsed);
        } catch {
          // Keep original output on parse errors.
        }
      }
      finalOutput = finalOutput.replace(/^\"+|\"+$/g, "").trim();
    }
    const fallbackTokens = Math.max(1, Math.ceil((input.length + finalOutput.length) / 4));
    const resolvedTokens = usageTokens > 0 ? usageTokens : fallbackTokens;
    const usageLog = await prisma.aiUsageLog.create({
      data: { userId, model: resolvedModel, tokens: resolvedTokens, prompt: input },
    });
    const workspace = await getWorkspaceScope(userId);
    const workspaceId = workspace.businessId ?? userId;
    await recordAnalyticsEvent({
      userId,
      workspaceId,
      orgId: workspaceId,
      type: "AI_REQUEST",
      count: 1,
      createdAt: new Date(),
      idempotencyKey: `ai:${usageLog.id}`,
    });
    await recordAnalyticsEvent({
      userId,
      workspaceId,
      orgId: workspaceId,
      type: "AI_TOKENS",
      count: resolvedTokens,
      tokenCount: resolvedTokens,
      createdAt: new Date(),
    });
    await prisma.activityLog.create({
      data: {
        userId,
        action: "AI_CALL",
        metadata: { mode },
      },
    });
    return finalOutput;
  })();

  return { stream, done };
}
