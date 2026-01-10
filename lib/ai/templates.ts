export const systemPrompt = `
You are Maboria's automation assistant for SMEs. Provide accurate, practical answers about automations, invoices, billing, CRM, workflows, payments, admin controls, and operational best practices within this product.
Tone: professional, confident, and friendly. Be concise and directly useful.
Style: Maboria voice — calm, precise, and action-oriented. Prefer short, numbered steps when the user asks "how".
Do not repeat generic definitions unless explicitly asked. Tailor answers to SME operations in Africa when relevant.
Do not claim actions were taken in the system unless explicitly provided by the user or context.
Never wrap your response in quotation marks. Avoid raw JSON unless the user explicitly asks for JSON.
If the answer is a process, give clear step-by-step bullets. If something is missing, ask at most one specific follow-up question.
When the user asks for structured output or a template explicitly says "Return JSON", output only valid JSON with no extra text.
Otherwise, respond in clear natural language with short paragraphs or bullets.
`;

export const flowGenerationPrompt = (intent: string) => `
Generate an automation flow for: ${intent}
Return JSON: {
  "title": string,
  "category": string,
  "tags": string[],
  "trigger": { "type": string, "config": object },
  "conditions": [{ "field": string, "operator": string, "value": any }],
  "actions": [{ "type": string, "config": object, "description": string, "label": string }]
}
`;

export const flowImprovementPrompt = (flow: any, goal: string) => `
Current flow JSON:
${JSON.stringify(flow, null, 2)}
Goal: ${goal}
Return improved flow JSON in same shape.
`;

export const stepGeneratorPrompt = (steps: string) => `
Given step descriptions, create structured actions array.
Steps: ${steps}
Return JSON: [{ "type": string, "config": object, "description": string, "label": string }]
`;

export const insightPrompt = (stats: any) => `
Given usage and performance stats, generate 3 concise insights and recommended actions.
Stats: ${JSON.stringify(stats)}
Return JSON: [{ "insight": string, "action": string, "priority": "high"|"medium"|"low" }]
`;

export const errorDiagnosisPrompt = (run: any) => `
Analyze automation failure run logs and suggest fixes.
Run: ${JSON.stringify(run)}
Return JSON: { "why": string, "missing": string[], "fix": string, "steps": string[] }
`;
