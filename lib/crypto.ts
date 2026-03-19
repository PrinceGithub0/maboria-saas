import crypto from "crypto";
import { log } from "@/lib/logger";

const PREFIX = "enc:v1:";
const INBOX_PREFIX = "enc:inbox:v1:";
const ALGO = "aes-256-gcm";

function key() {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error("NEXTAUTH_SECRET is not set. Cannot decrypt secrets.");
  }
  // Derive a stable 32-byte key from NEXTAUTH_SECRET.
  return crypto.scryptSync(secret, "maboria:crypto:v1", 32);
}

function inboxKey() {
  const secret = process.env.INBOX_ENCRYPTION_KEY;
  if (!secret) {
    throw new Error("INBOX_ENCRYPTION_KEY is not set. Cannot decrypt inbox credentials.");
  }
  return crypto.scryptSync(secret, "maboria:inbox:crypto:v1", 32);
}

function encryptWithPrefix(plaintext: string, prefix: string, encryptionKey: Buffer) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, encryptionKey, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${prefix}${iv.toString("base64")}:${tag.toString("base64")}:${ciphertext.toString("base64")}`;
}

function decryptWithPrefix(value: string, prefix: string, encryptionKey: Buffer) {
  if (!value.startsWith(prefix)) return value;
  const payload = value.slice(prefix.length);
  const [ivB64, tagB64, dataB64] = payload.split(":");
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error("Invalid encrypted secret format");
  }
  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const data = Buffer.from(dataB64, "base64");
  const decipher = crypto.createDecipheriv(ALGO, encryptionKey, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(data), decipher.final()]);
  return plaintext.toString("utf8");
}

export function encryptSecret(plaintext: string) {
  return encryptWithPrefix(plaintext, PREFIX, key());
}

export function isEncryptedSecret(value: string) {
  return value.startsWith(PREFIX);
}

export function decryptSecret(value: string) {
  return decryptWithPrefix(value, PREFIX, key());
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

export function encryptInboxSecret(plaintext: string) {
  return encryptWithPrefix(plaintext, INBOX_PREFIX, inboxKey());
}

export function isEncryptedInboxSecret(value: string) {
  return value.startsWith(INBOX_PREFIX);
}

export function decryptInboxSecret(value: string) {
  return decryptWithPrefix(value, INBOX_PREFIX, inboxKey());
}

export function safeDecryptInboxSecret(value: string | null | undefined) {
  if (!value) return null;
  try {
    if (isEncryptedInboxSecret(value)) return decryptInboxSecret(value);
    if (isEncryptedSecret(value)) return decryptSecret(value);
    return value;
  } catch (error: any) {
    log("error", "Inbox secret decryption failed", { error: error?.message });
    return null;
  }
}
