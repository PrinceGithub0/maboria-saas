import "server-only";

import crypto from "crypto";
import fs from "fs/promises";
import path from "path";

export type StoredSupportAttachment = {
  id: string;
  filename: string;
  contentType?: string;
  sizeBytes: number;
  storageKey: string;
};

export type SupportAttachmentBufferInput = {
  filename: string;
  contentType?: string;
  sizeBytes: number;
  content: Buffer;
};

type ResendReceivedAttachment = {
  id: string;
  filename?: string | null;
  contentType?: string | null;
};

type ResendReceivedAttachmentApiResponse = {
  data?: Array<{
    id?: string;
    filename?: string | null;
    size?: number | null;
    content_type?: string | null;
    download_url?: string | null;
    expires_at?: string | null;
  }> | null;
  error?: string;
  message?: string;
};

const uploadRoot = path.join(process.cwd(), "uploads", "support-attachments");

const sanitizeFilename = (value: string) =>
  String(value || "attachment").replace(/[^a-zA-Z0-9._-]/g, "_");

function extensionFromAttachment(input: { filename: string; contentType?: string | null }) {
  const byFilename = path.extname(String(input.filename || "").trim());
  if (byFilename) return byFilename;
  const type = String(input.contentType || "").trim().toLowerCase();
  if (type === "image/jpeg") return ".jpg";
  if (type === "image/png") return ".png";
  if (type === "application/pdf") return ".pdf";
  return "";
}

export function readSupportAttachmentsFromMetadata(metadata: unknown): StoredSupportAttachment[] {
  if (!Array.isArray(metadata)) return [];
  return metadata
    .map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return null;
      const record = item as Record<string, unknown>;
      const id = String(record.id || "").trim();
      const filename = String(record.filename || "").trim();
      const storageKey = String(record.storageKey || "").trim();
      const contentType = String(record.contentType || "").trim() || undefined;
      const sizeBytes = Number(record.sizeBytes || 0);
      if (!id || !filename || !storageKey) return null;
      return {
        id,
        filename,
        contentType,
        sizeBytes: Number.isFinite(sizeBytes) ? Math.max(0, sizeBytes) : 0,
        storageKey,
      };
    })
    .filter(Boolean) as StoredSupportAttachment[];
}

export async function persistSupportAttachments(
  ticketId: string,
  files: SupportAttachmentBufferInput[]
): Promise<StoredSupportAttachment[]> {
  if (!Array.isArray(files) || files.length === 0) return [];
  const ticketDir = path.join(uploadRoot, ticketId);
  await fs.mkdir(ticketDir, { recursive: true });

  const stored: StoredSupportAttachment[] = [];
  for (const file of files) {
    const id = crypto.randomUUID();
    const extension = extensionFromAttachment(file);
    const safeName = sanitizeFilename(path.basename(file.filename, path.extname(file.filename)));
    const storedFileName = `${id}-${safeName}${extension}`;
    const absolutePath = path.join(ticketDir, storedFileName);
    await fs.writeFile(absolutePath, file.content);
    stored.push({
      id,
      filename: file.filename,
      contentType: file.contentType || undefined,
      sizeBytes: Number.isFinite(file.sizeBytes) ? Math.max(0, file.sizeBytes) : file.content.length,
      storageKey: path.join(ticketId, storedFileName).replace(/\\/g, "/"),
    });
  }

  return stored;
}

async function fetchResendReceivedAttachments(emailId: string) {
  const apiKey = String(process.env.RESEND_API_KEY || "").trim();
  if (!apiKey) {
    throw new Error("Missing Resend API key.");
  }

  const response = await fetch(
    `https://api.resend.com/emails/receiving/${encodeURIComponent(emailId)}/attachments`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
    }
  );
  const payload = (await response.json().catch(() => ({}))) as ResendReceivedAttachmentApiResponse;
  if (!response.ok) {
    const message =
      typeof payload?.message === "string"
        ? payload.message
        : typeof payload?.error === "string"
          ? payload.error
          : `Failed to retrieve support attachments (${response.status})`;
    throw new Error(message);
  }
  return Array.isArray(payload.data) ? payload.data : [];
}

export async function persistResendSupportAttachments(input: {
  ticketId: string;
  emailId: string;
  attachments: ResendReceivedAttachment[];
}): Promise<StoredSupportAttachment[]> {
  if (!Array.isArray(input.attachments) || input.attachments.length === 0) return [];

  const availableAttachments = await fetchResendReceivedAttachments(input.emailId);
  const availableById = new Map(
    availableAttachments
      .map((attachment) => [String(attachment.id || "").trim(), attachment] as const)
      .filter(([id]) => Boolean(id))
  );

  const hydrated: SupportAttachmentBufferInput[] = [];
  for (const attachment of input.attachments) {
    const attachmentId = String(attachment.id || "").trim();
    if (!attachmentId) continue;

    const detail = availableById.get(attachmentId);
    if (!detail?.download_url) {
      throw new Error("Support attachment download URL missing.");
    }
    const downloadResponse = await fetch(String(detail.download_url), { cache: "no-store" });
    if (!downloadResponse.ok) {
      throw new Error(`Failed to download support attachment (${downloadResponse.status})`);
    }
    const arrayBuffer = await downloadResponse.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    hydrated.push({
      filename: String(detail.filename || attachment.filename || "attachment"),
      contentType: detail.content_type || attachment.contentType || undefined,
      sizeBytes:
        typeof detail.size === "number" && Number.isFinite(detail.size) ? Math.max(0, detail.size) : buffer.length,
      content: buffer,
    });
  }

  return persistSupportAttachments(input.ticketId, hydrated);
}

export async function readStoredSupportAttachment(file: StoredSupportAttachment): Promise<Buffer> {
  const absolutePath = path.join(uploadRoot, file.storageKey);
  return fs.readFile(absolutePath);
}
