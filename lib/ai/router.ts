import OpenAI from "openai";
import { prisma } from "../prisma";
import { systemPrompt, flowGenerationPrompt, flowImprovementPrompt, stepGeneratorPrompt, insightPrompt, errorDiagnosisPrompt } from "./templates";
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
      input = prompt;
  }

  try {
    const res = await client.responses.create({
      model: "gpt-4.1-mini",
      input: [{ role: "system", content: systemPrompt }, { role: "user", content: input }],
    });
    const output = res.output_text;
    await prisma.aiUsageLog.create({
      data: { userId, model: "gpt-4.1-mini", tokens: 0, prompt: input },
    });
    return output;
  } catch (error: any) {
    log("error", "AI router failure", { error: error.message, mode });
    throw error;
  }
}
