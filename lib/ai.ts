import "server-only";

import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function suggestAutomationFlow(prompt: string) {
  const res = await client.responses.create({
    model: "gpt-4.1-mini",
    input: `Create a concise JSON automation flow with steps for: ${prompt}. Return JSON with fields: title, description, steps (array of {type, config}).`,
  });
  return res.output_text;
}

export async function answerAssistantQuestion(context: string) {
  const res = await client.responses.create({
    model: "gpt-4.1-mini",
    input: context,
  });
  return res.output_text;
}
