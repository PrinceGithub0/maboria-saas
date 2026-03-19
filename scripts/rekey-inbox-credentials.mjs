import crypto from "crypto";
import nextEnv from "@next/env";
import { PrismaClient } from "@prisma/client";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const prisma = new PrismaClient();
const execute = process.argv.includes("--execute");

const LEGACY_PREFIX = "enc:v1:";
const INBOX_PREFIX = "enc:inbox:v1:";
const ALGO = "aes-256-gcm";

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env: ${name}`);
  return value;
}

function deriveKey(secret, salt) {
  return crypto.scryptSync(secret, salt, 32);
}

function decryptWithPrefix(value, prefix, encryptionKey) {
  if (!value.startsWith(prefix)) return null;
  const payload = value.slice(prefix.length);
  const [ivB64, tagB64, dataB64] = payload.split(":");
  if (!ivB64 || !tagB64 || !dataB64) throw new Error("Invalid encrypted payload");
  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const data = Buffer.from(dataB64, "base64");
  const decipher = crypto.createDecipheriv(ALGO, encryptionKey, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

function encryptWithPrefix(plaintext, prefix, encryptionKey) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, encryptionKey, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${prefix}${iv.toString("base64")}:${tag.toString("base64")}:${ciphertext.toString("base64")}`;
}

function decryptInboxPayload(value, inboxKey, legacyKey) {
  if (!value) return null;
  if (value.startsWith(INBOX_PREFIX)) return decryptWithPrefix(value, INBOX_PREFIX, inboxKey);
  if (value.startsWith(LEGACY_PREFIX) && legacyKey) return decryptWithPrefix(value, LEGACY_PREFIX, legacyKey);
  return value;
}

async function main() {
  const inboxKey = deriveKey(requireEnv("INBOX_ENCRYPTION_KEY"), "maboria:inbox:crypto:v1");
  const legacySecret = process.env.NEXTAUTH_SECRET || "";
  const legacyKey = legacySecret ? deriveKey(legacySecret, "maboria:crypto:v1") : null;

  const rows = await prisma.unifiedInbox.findMany({
    where: {
      credentialsEncrypted: {
        not: null,
      },
    },
    select: {
      id: true,
      credentialsEncrypted: true,
    },
  });

  let migrated = 0;
  let skipped = 0;

  for (const row of rows) {
    const decrypted = decryptInboxPayload(row.credentialsEncrypted, inboxKey, legacyKey);
    if (!decrypted) {
      skipped += 1;
      continue;
    }
    const reencrypted = encryptWithPrefix(decrypted, INBOX_PREFIX, inboxKey);
    if (execute) {
      await prisma.unifiedInbox.update({
        where: { id: row.id },
        data: {
          credentialsEncrypted: reencrypted,
        },
      });
    }
    migrated += 1;
  }

  console.log(
    JSON.stringify(
      {
        mode: execute ? "execute" : "dry-run",
        total: rows.length,
        migrated,
        skipped,
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error("Failed re-keying inbox credentials.", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
