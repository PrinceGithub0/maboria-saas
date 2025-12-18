export const systemPrompt = `
You are Maboria's automation AI. You build business automations, diagnose errors, improve flows, and produce actionable JSON.
Be concise, deterministic, and avoid hallucinations. When unsure, ask for specific missing fields.
Always return valid JSON when asked for structured output.
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
