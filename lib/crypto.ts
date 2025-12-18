import crypto from "crypto";
import { env } from "@/lib/env";
import { log } from "@/lib/logger";

const PREFIX = "enc:v1:";
const ALGO = "aes-256-gcm";

function key() {
  // Derive a stable 32-byte key from NEXTAUTH_SECRET (already required in env.ts).
  return crypto.scryptSync(env.nextAuthSecret, "maboria:crypto:v1", 32);
}

export function encryptSecret(plaintext: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, key(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString("base64")}:${tag.toString("base64")}:${ciphertext.toString("base64")}`;
}

export function isEncryptedSecret(value: string) {
  return value.startsWith(PREFIX);
}

export function decryptSecret(value: string) {
  if (!isEncryptedSecret(value)) return value;
  const payload = value.slice(PREFIX.length);
  const [ivB64, tagB64, dataB64] = payload.split(":");
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error("Invalid encrypted secret format");
  }
  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const data = Buffer.from(dataB64, "base64");

  const decipher = crypto.createDecipheriv(ALGO, key(), iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(data), decipher.final()]);
  return plaintext.toString("utf8");
}

export function safeDecryptSecret(value: string | null | undefined) {
  if (!value) return null;
  try {
    return decryptSecret(value);
  } catch (error: any) {
    log("error", "Secret decryption failed", { error: error?.message });
    return null;
  }
}

