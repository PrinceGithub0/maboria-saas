import "server-only";

import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import { prisma } from "./prisma";

export const MAX_INVOICE_SUPPORTING_FILES = 5;
export const MAX_INVOICE_SUPPORTING_FILE_SIZE_BYTES = 5 * 1024 * 1024;
export const INVOICE_SUPPORTING_FILE_TYPES = [
  "image/jpeg",
  "image/png",
  "application/pdf",
] as const;

export type InvoiceSupportingFileContentType =
  (typeof INVOICE_SUPPORTING_FILE_TYPES)[number];

export type InvoiceSupportingFileInput = {
  filename: string;
  contentType: InvoiceSupportingFileContentType;
  base64: string;
  sizeBytes: number;
};

export type StoredInvoiceSupportingFile = {
  id: string;
  filename: string;
  contentType: InvoiceSupportingFileContentType;
  sizeBytes: number;
  storageKey: string;
};

const uploadRoot = path.join(process.cwd(), "uploads", "invoice-supporting-files");

const sanitizeFilename = (value: string) =>
  String(value || "attachment").replace(/[^a-zA-Z0-9._-]/g, "_");

const extensionByType: Record<InvoiceSupportingFileContentType, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "application/pdf": ".pdf",
};

export function readInvoiceSupportingFilesFromMetadata(
  metadata: unknown
): StoredInvoiceSupportingFile[] {
  const raw =
    metadata && typeof metadata === "object" && !Array.isArray(metadata)
      ? (metadata as Record<string, unknown>).supportingFiles
      : null;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return null;
      const record = item as Record<string, unknown>;
      const id = String(record.id || "").trim();
      const filename = String(record.filename || "").trim();
      const contentType = String(record.contentType || "").trim() as InvoiceSupportingFileContentType;
      const storageKey = String(record.storageKey || "").trim();
      const sizeBytes = Number(record.sizeBytes || 0);
      if (!id || !filename || !storageKey || !INVOICE_SUPPORTING_FILE_TYPES.includes(contentType)) {
        return null;
      }
      return {
        id,
        filename,
        contentType,
        storageKey,
        sizeBytes: Number.isFinite(sizeBytes) ? Math.max(0, sizeBytes) : 0,
      };
    })
    .filter(Boolean) as StoredInvoiceSupportingFile[];
}

export async function persistInvoiceSupportingFiles(
  invoiceId: string,
  files: InvoiceSupportingFileInput[]
): Promise<StoredInvoiceSupportingFile[]> {
  if (!Array.isArray(files) || files.length === 0) return [];
  const invoiceDir = path.join(uploadRoot, invoiceId);
  await fs.mkdir(invoiceDir, { recursive: true }).catch(() => undefined);

  const stored: StoredInvoiceSupportingFile[] = [];
  for (const file of files) {
    const id = crypto.randomUUID();
    const extension = extensionByType[file.contentType] || path.extname(file.filename) || "";
    const safeName = sanitizeFilename(path.basename(file.filename, path.extname(file.filename)));
    const storedFileName = `${id}-${safeName}${extension}`;
    const absolutePath = path.join(invoiceDir, storedFileName);
    const normalizedBase64 = String(file.base64 || "").includes(",")
      ? String(file.base64).split(",").pop() || ""
      : String(file.base64 || "");
    const buffer = Buffer.from(normalizedBase64, "base64");
    await prisma.invoiceSupportingFile.create({
      data: {
        id,
        invoiceId,
        filename: file.filename,
        contentType: file.contentType,
        sizeBytes: file.sizeBytes,
        storageKey: path.join(invoiceId, storedFileName).replace(/\\/g, "/"),
        content: buffer,
      },
    });
    await fs.writeFile(absolutePath, buffer).catch(() => undefined);
    stored.push({
      id,
      filename: file.filename,
      contentType: file.contentType,
      sizeBytes: file.sizeBytes,
      storageKey: path.join(invoiceId, storedFileName).replace(/\\/g, "/"),
    });
  }

  return stored;
}

export async function readStoredInvoiceSupportingFile(
  file: StoredInvoiceSupportingFile
): Promise<Buffer> {
  const persisted = await prisma.invoiceSupportingFile.findUnique({
    where: { id: file.id },
    select: { content: true },
  });
  if (persisted?.content) {
    return Buffer.from(persisted.content);
  }
  const absolutePath = path.join(uploadRoot, file.storageKey);
  return fs.readFile(absolutePath);
}
