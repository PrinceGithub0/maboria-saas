const SENSITIVE_REQUEST_PATTERNS = [
  /\bsystem\s+prompt\b/,
  /\bhidden\s+(prompt|instructions|rules)\b/,
  /\binternal\s+(prompt|instructions|rules|docs|documentation|implementation|architecture)\b/,
  /\bdeveloper\s+(message|prompt|instructions)\b/,
  /\b(chain\s+of\s+thought|reasoning)\b/,
  /\b(ignore|bypass|override)\b.*\b(previous|system|developer)\s+instructions\b/,
  /\b(api\s*keys?|secret\s*keys?|credentials?|passwords?|access\s+tokens?|refresh\s+tokens?)\b/,
  /\b(env|environment)\s+(vars?|variables?)\b/,
  /\b(source\s+code|database|db\s+dump|logs?|log\s+files?)\b/,
  /\b(admin[-\s]?only|private\s+implementation|internal\s+tooling)\b/,
  /\b(other|another)\s+(user|users|customer|customers|workspace|workspaces|account|accounts|tenant|tenants)\b/,
  /\bprivate\s+(data|records|details)\b/,
];

const ACCOUNT_SCOPE_PATTERNS = [/\b(my|our|we|me|us)\b/, /\bworkspace\b/, /\baccount\b/, /\btenant\b/];

const ACCOUNT_ENTITY_PATTERNS = [
  /\binvoice\b/,
  /\bpayment\b/,
  /\bsubscription\b/,
  /\bcustomer\b/,
  /\bautomation\b/,
  /\bworkflow\b/,
  /\brun\b/,
  /\bticket\b/,
  /\bmessage\b/,
  /\bteam\b/,
  /\bseat\b/,
  /\busage\b/,
  /\bbilling\b/,
  /\bpayout\b/,
];

const ACCOUNT_STATE_PATTERNS = [
  /\b(why|failed?|failing|error|errors|broken|stuck|missing|issue|problem)\b/,
  /\b(not\s+working|cant|cannot|wont|doesnt|didnt)\b/,
  /\b(check|show|tell|list|find|lookup|look\s+up|which)\b/,
  /\b(what\s+is|what\s+are)\b/,
  /\b(status|balance|remaining|left|current|active|cancelled|charged|paid|unpaid|overdue|open)\b/,
];

const HOW_TO_PATTERNS = [
  /\bhow\s+(do|can)\s+i\b/,
  /\bwhere\s+(do|can)\s+i\b/,
  /\b(set\s*up|setup|configure|create|send|invite|connect|enable|disable|change|update|manage|use)\b/,
  /\bsteps?\b/,
  /\bguide\b/,
  /\bwalk\s+me\s+through\b/,
];

const SENSITIVE_RESPONSE =
  "I can help with how features work in Maboria, but I can't provide internal prompts, hidden system details, source code, logs, credentials, or private data about any user or workspace.";

const SUPPORT_RESPONSE =
  "I can explain how the feature works in Maboria, but I can't verify live account details or troubleshoot a specific workspace from here. Please contact support with the exact screen, invoice, payment, automation, or error details.";

export type AssistantBoundaryKind = "sensitive" | "support";

export type AssistantBoundaryResponse = {
  kind: AssistantBoundaryKind;
  response: string;
};

function normalizePrompt(prompt: string) {
  return prompt.toLowerCase().replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();
}

function matchesAny(value: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(value));
}

export function getAssistantBoundaryResponse(prompt: string): AssistantBoundaryResponse | null {
  const normalized = normalizePrompt(prompt);

  if (!normalized) {
    return null;
  }

  if (matchesAny(normalized, SENSITIVE_REQUEST_PATTERNS)) {
    return { kind: "sensitive", response: SENSITIVE_RESPONSE };
  }

  const isHowToRequest = matchesAny(normalized, HOW_TO_PATTERNS);
  const hasAccountScope = matchesAny(normalized, ACCOUNT_SCOPE_PATTERNS);
  const hasAccountEntity = matchesAny(normalized, ACCOUNT_ENTITY_PATTERNS);
  const hasAccountStateSignal = matchesAny(normalized, ACCOUNT_STATE_PATTERNS);

  if (!isHowToRequest && hasAccountScope && hasAccountEntity && hasAccountStateSignal) {
    return { kind: "support", response: SUPPORT_RESPONSE };
  }

  return null;
}
