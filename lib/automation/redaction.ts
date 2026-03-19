const SENSITIVE_KEY_PATTERN =
  /(password|passcode|secret|token|api[_-]?key|authorization|cookie|session|private[_-]?key|access[_-]?key|cvv|iban|account[_-]?number|routing[_-]?number|tax[_-]?id|otp|ssn|card|pin|bearer)/i;
const EMAIL_KEY_PATTERN = /email/i;
const PHONE_KEY_PATTERN = /(phone|mobile|whatsapp)/i;

const MAX_STRING_LENGTH = 600;

const truncateString = (value: string) => {
  if (value.length <= MAX_STRING_LENGTH) return value;
  return `${value.slice(0, MAX_STRING_LENGTH)}...`;
};

const maskEmail = (value: string) => {
  const normalized = value.trim();
  const at = normalized.indexOf("@");
  if (at <= 1) return "***";
  const local = normalized.slice(0, at);
  const domain = normalized.slice(at + 1);
  if (!domain) return `${local[0]}***`;
  return `${local[0]}***@${domain}`;
};

const maskPhone = (value: string) => {
  const digits = value.replace(/\D+/g, "");
  if (digits.length <= 4) return "***";
  return `***${digits.slice(-4)}`;
};

const sanitizePrimitiveByKey = (key: string, value: unknown): unknown => {
  if (typeof value !== "string") return value;
  const normalized = truncateString(value);
  if (/^Bearer\s+/i.test(normalized)) return "Bearer [REDACTED]";
  if (normalized.split(".").length === 3 && normalized.length > 40) return "[REDACTED_TOKEN]";
  if (SENSITIVE_KEY_PATTERN.test(key)) return "[REDACTED]";
  if (EMAIL_KEY_PATTERN.test(key)) return maskEmail(normalized);
  if (PHONE_KEY_PATTERN.test(key)) return maskPhone(normalized);
  return normalized;
};

const sanitizeValue = (value: unknown, keyHint: string, seen: WeakSet<object>): unknown => {
  if (value === null || value === undefined) return value;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return sanitizePrimitiveByKey(keyHint, value);
  }

  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeValue(entry, keyHint, seen));
  }

  if (typeof value === "object") {
    if (seen.has(value as object)) return "[CIRCULAR]";
    seen.add(value as object);
    const output: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEY_PATTERN.test(key)) {
        output[key] = "[REDACTED]";
        continue;
      }
      output[key] = sanitizeValue(entry, key, seen);
    }
    return output;
  }

  return String(value);
};

export const sanitizeAutomationPayload = <T = unknown>(value: T): T =>
  sanitizeValue(value, "", new WeakSet<object>()) as T;
