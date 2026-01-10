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
import { env } from "../env";
import { log } from "../logger";

const client = new OpenAI({ apiKey: env.openaiKey });

type RouterMode = "assistant" | "flow-generate" | "flow-improve" | "step-generate" | "insight" | "diagnose";

export async function aiRouter({
  mode,
  prompt,
  context,
  userId,
}: {
  mode: RouterMode;
  prompt: string;
  context?: any;
  userId: string;
}) {
  const rawPrompt = prompt.split(/\nRecent memory:/i)[0] || prompt;
  const normalized = rawPrompt.trim().toLowerCase();
  const normalizedClean = normalized.replace(/[^\w\s]/g, "").replace(/\s+/g, " ").trim();
  const gratitudeTokens = new Set([
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
  const politeOnlyPatterns = [/^please$/, /^pls$/, /^plz$/];
  const greetingPatterns = [
    /^(hi|hello|hey)$/,
    /^(hi|hello|hey)\s+(there|maboria|team)$/,
    /^(good\s+morning|good\s+afternoon|good\s+evening)$/,
    /^(whats\s+up|sup)$/,
  ];

  if (mode === "assistant") {
    const tokens = normalizedClean.split(" ").filter(Boolean);
    const isGreeting = greetingPatterns.some((re) => re.test(normalizedClean));
    if (isGreeting) {
      return "Hi — how can I help with automations, invoices, billing, or workflows in Maboria?";
    }
    const hasGratitude = tokens.some((t) =>
      ["thanks", "thank", "thankyou", "thx", "ty", "appreciate"].includes(t)
    );
    const isGratitudeOnly = hasGratitude && tokens.every((t) => gratitudeTokens.has(t));
    if (isGratitudeOnly) {
      return "You're welcome. What would you like to do next?";
    }
    const isPoliteOnly = politeOnlyPatterns.some((re) => re.test(normalizedClean));
    if (isPoliteOnly) {
      return "Of course. What would you like me to do?";
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
      model: "gpt-4.1-mini",
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
    await prisma.aiUsageLog.create({
      data: { userId, model: "gpt-4.1-mini", tokens: 0, prompt: input },
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
