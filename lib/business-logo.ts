import fs from "fs/promises";
import { existsSync, readFileSync, readdirSync } from "fs";
import path from "path";
import { prisma } from "@/lib/prisma";

const BUSINESS_LOGO_DIR = path.join(process.cwd(), "uploads", "business-logos");

type BusinessLogoInfo = {
  buffer: Buffer;
  mime: string;
  ext: string;
};

function normalizeMimeToExtension(mime: string) {
  if (mime === "image/png") return ".png";
  if (mime === "image/jpeg") return ".jpg";
  if (mime === "image/svg+xml") return ".svg";
  return "";
}

function isUnknownBusinessLogoFieldError(error: unknown) {
  const message = String((error as any)?.message || "");
  return (
    String((error as any)?.name || "").includes("PrismaClientValidationError") &&
    (message.includes("logoData") || message.includes("logoMimeType") || message.includes("Unknown field"))
  );
}

function readLegacyBusinessLogoInfo(userId: string): BusinessLogoInfo | null {
  try {
    if (!existsSync(BUSINESS_LOGO_DIR)) return null;
    const files = readdirSync(BUSINESS_LOGO_DIR);
    const match = files.find((file) => file.startsWith(`${userId}.`));
    if (!match) return null;
    const ext = path.extname(match).toLowerCase();
    const filePath = path.join(BUSINESS_LOGO_DIR, match);
    const buffer = readFileSync(filePath);
    const mime =
      ext === ".png"
        ? "image/png"
        : ext === ".jpg" || ext === ".jpeg"
          ? "image/jpeg"
          : ext === ".svg"
            ? "image/svg+xml"
            : "application/octet-stream";
    return { buffer, mime, ext };
  } catch {
    return null;
  }
}

export async function readBusinessLogoInfo(userId: string): Promise<BusinessLogoInfo | null> {
  if (!userId) return null;
  let profile: { logoData: Uint8Array | Buffer | null; logoMimeType: string | null } | null = null;
  try {
    profile = await prisma.businessProfile.findUnique({
      where: { userId },
      select: { logoData: true, logoMimeType: true },
    });
  } catch (error) {
    if (!isUnknownBusinessLogoFieldError(error)) throw error;
    return readLegacyBusinessLogoInfo(userId);
  }

  if (profile?.logoData && profile.logoMimeType) {
    const buffer = Buffer.isBuffer(profile.logoData) ? profile.logoData : Buffer.from(profile.logoData);
    return {
      buffer,
      mime: profile.logoMimeType,
      ext: normalizeMimeToExtension(profile.logoMimeType),
    };
  }

  return readLegacyBusinessLogoInfo(userId);
}

export async function getBusinessLogoBuffer(userId: string) {
  const info = await readBusinessLogoInfo(userId);
  if (!info) return null;
  if (info.mime === "image/svg+xml") return null;
  return info.buffer;
}

export async function getBusinessLogoDataUrl(userId: string) {
  const info = await readBusinessLogoInfo(userId);
  if (!info) return null;
  return `data:${info.mime};base64,${info.buffer.toString("base64")}`;
}

export async function hasBusinessLogo(userId: string) {
  return Boolean(await readBusinessLogoInfo(userId));
}

export async function deleteLegacyBusinessLogoFiles(userId: string) {
  await fs.mkdir(BUSINESS_LOGO_DIR, { recursive: true });
  const existing = await fs.readdir(BUSINESS_LOGO_DIR).catch(() => []);
  await Promise.all(
    existing
      .filter((name) => name.startsWith(`${userId}.`))
      .map((name) => fs.unlink(path.join(BUSINESS_LOGO_DIR, name)).catch(() => undefined))
  );
}

export async function writeLegacyBusinessLogoFile(userId: string, mime: string, buffer: Buffer) {
  const extension = normalizeMimeToExtension(mime).replace(/^\./, "");
  if (!extension) {
    throw new Error("Unsupported logo mime type");
  }
  await fs.mkdir(BUSINESS_LOGO_DIR, { recursive: true });
  await deleteLegacyBusinessLogoFiles(userId);
  const filePath = path.join(BUSINESS_LOGO_DIR, `${userId}.${extension}`);
  await fs.writeFile(filePath, buffer);
  const stat = await fs.stat(filePath);
  return `/api/business-profile/logo?v=${stat.mtimeMs}`;
}

export function canFallbackBusinessLogoStorage(error: unknown) {
  return isUnknownBusinessLogoFieldError(error);
}
