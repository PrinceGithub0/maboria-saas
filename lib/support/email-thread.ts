import "server-only";

export type SupportInboundAttachment = {
  filename: string;
  contentType?: string;
  sizeBytes?: number;
};

const TICKET_REF_PATTERNS = [
  /\[Ticket:([a-z0-9]+)\]/i,
  /\[TCK-([a-z0-9]+)\]/i,
  /\[Ref:\s*([A-Za-z0-9_-]+)\]/i,
  /Ref\s+([A-Za-z0-9_-]+)/i,
];
const TICKET_HASH_REF_PATTERNS = [
  /\[Ticket\s*#\s*([A-Za-z0-9_-]+)\]/i,
  /\[Ticket:([A-Za-z0-9_-]+)\]/i,
  /\[TCK-([A-Za-z0-9_-]+)\]/i,
  /\[Ref:\s*([A-Za-z0-9_-]+)\]/i,
];

export function extractTicketIdFromSubject(subject: string) {
  const value = String(subject || "");
  for (const pattern of [...TICKET_HASH_REF_PATTERNS, ...TICKET_REF_PATTERNS]) {
    const match = value.match(pattern);
    if (match?.[1]) return match[1];
  }
  return null;
}

export function formatTicketSubject(ticketId: string, title: string) {
  const normalizedId = String(ticketId || "").trim();
  const normalizedTitle = String(title || "").trim();
  return `Re: ${normalizedTitle} [Ref: ${normalizedId}]`;
}

export function extractTicketIdFromAddress(address: string) {
  const value = String(address || "");
  const match = value.match(/[A-Za-z0-9._%+-]+\+([A-Za-z0-9_-]+)@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
  return match?.[1] || null;
}

export function formatTicketReplyToAddress(ticketId: string) {
  const rawReplyBase =
    process.env.EMAIL_SUPPORT_REPLY_TO ||
    process.env.EMAIL_SUPPORT_INBOUND ||
    process.env.EMAIL_SUPPORT_FROM ||
    process.env.SUPPORT_EMAIL ||
    process.env.EMAIL_FROM ||
    "support@mail.maboria.com";
  const normalizedFrom = String(rawReplyBase || "support@mail.maboria.com").trim();
  const atIndex = normalizedFrom.lastIndexOf("@");
  if (atIndex <= 0) return `support+${ticketId}@maboria.com`;
  const local = normalizedFrom.slice(0, atIndex).split("+")[0] || "support";
  const domain = normalizedFrom.slice(atIndex + 1) || "maboria.com";
  return `${local}+${ticketId}@${domain}`;
}

export function stripHtmlToText(html: string) {
  return String(html || "")
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

export function formatInboundReplyBody(input: {
  from: string;
  text: string;
  attachments?: SupportInboundAttachment[];
}) {
  const lines: string[] = [];
  lines.push(`Support reply from: ${input.from || "support"}`);
  lines.push("");
  lines.push(input.text || "(empty message)");
  const attachments = input.attachments || [];
  if (attachments.length > 0) {
    lines.push("");
    lines.push("Attachments:");
    attachments.forEach((attachment) => {
      const sizeLabel =
        typeof attachment.sizeBytes === "number" && Number.isFinite(attachment.sizeBytes)
          ? ` (${Math.max(0, attachment.sizeBytes)} bytes)`
          : "";
      lines.push(`- ${attachment.filename}${sizeLabel}`);
    });
  }
  return lines.join("\n");
}
