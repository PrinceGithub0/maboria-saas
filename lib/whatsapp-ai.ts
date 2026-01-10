import "server-only";

import OpenAI from "openai";
import { env } from "./env";
import { log } from "./logger";

const client = new OpenAI({ apiKey: env.openaiKey });

type AutoReplyDecision = {
  shouldRespond: boolean;
  confidence: number;
  reply?: string;
  reason?: string;
};

export async function generateWhatsAppAutoReply({
  message,
  businessName,
}: {
  message: string;
  businessName?: string | null;
}): Promise<AutoReplyDecision | null> {
  const prompt = `
You are a customer support assistant for ${businessName || "a business"}.
Decide if the message should be answered automatically.
If you respond, keep it under 60 words and be direct.
Return ONLY valid JSON with:
{ "shouldRespond": boolean, "confidence": number (0-1), "reply": string, "reason": string }.
If you cannot safely respond, set shouldRespond=false and provide reason.
Message: """${message}"""
`;

  try {
    const res = await client.responses.create({
      model: "gpt-4.1-mini",
      input: [{ role: "user", content: prompt }],
    });
    const raw = res.output_text?.trim() || "";
    const parsed = JSON.parse(raw) as AutoReplyDecision;
    if (typeof parsed?.shouldRespond !== "boolean") return null;
    return parsed;
  } catch (error: any) {
    log("error", "whatsapp_ai_reply_failed", { error: error.message });
    return null;
  }
}
