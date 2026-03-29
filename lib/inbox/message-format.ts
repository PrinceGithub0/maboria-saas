export function sanitizeInboundEmailDisplayText(value: string) {
  return String(value || "")
    .replace(/<mailto:([^>]+)>/gi, "$1")
    .replace(/<((?:https?:\/\/|www\.)[^>]+)>/gi, "$1")
    .replace(/\s+\./g, ".")
    .replace(/\s+,/g, ",")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
