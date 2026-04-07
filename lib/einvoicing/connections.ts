import "server-only";

import { encryptSecret, safeDecryptSecret } from "@/lib/crypto";
import { prisma } from "@/lib/prisma";
import { getEInvoiceProviderDefinition } from "@/lib/einvoicing/provider-registry";
import { resolveEInvoiceProvider } from "@/lib/einvoicing/resolve-provider";
import type {
  EInvoiceConnectionConfig,
  EInvoiceConnectionStatus,
  EInvoiceProviderContext,
  EInvoiceProviderKey,
} from "@/lib/einvoicing/types";

type RawEInvoiceConnection = {
  id: string;
  userId: string;
  provider: string;
  country: string;
  status: string;
  sandbox: boolean;
  credentialsEncrypted: string | null;
  metadata: unknown;
  lastValidatedAt: Date | null;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type SanitizedEInvoiceConnection = {
  id: string;
  provider: EInvoiceProviderKey;
  country: string;
  status: EInvoiceConnectionStatus;
  sandbox: boolean;
  hasCredentials: boolean;
  credentialKeys: string[];
  metadata: Record<string, unknown> | null;
  lastValidatedAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
};

type UpsertEInvoiceConnectionInput = {
  userId: string;
  provider: EInvoiceProviderKey;
  country: string;
  sandbox?: boolean;
  status?: EInvoiceConnectionStatus;
  credentials?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
  lastValidatedAt?: Date | null;
  lastError?: string | null;
};

const VALID_CONNECTION_STATUSES = new Set<EInvoiceConnectionStatus>(["ACTIVE", "DISABLED", "ERROR"]);

function getConnectionDelegate() {
  const delegate = (prisma as any).eInvoicingConnection;
  if (!delegate) {
    throw new Error("EInvoicingConnection model not available. Run `npx prisma generate` and restart.");
  }
  return delegate;
}

function normalizeProvider(value?: string | null): EInvoiceProviderKey | null {
  const normalized = String(value || "").trim().toUpperCase();
  return getEInvoiceProviderDefinition(normalized)?.key || null;
}

function normalizeCountry(value?: string | null) {
  return String(value || "").trim().toUpperCase();
}

function normalizeStatus(value?: string | null): EInvoiceConnectionStatus {
  const normalized = String(value || "").trim().toUpperCase() as EInvoiceConnectionStatus;
  return VALID_CONNECTION_STATUSES.has(normalized) ? normalized : "ACTIVE";
}

function toObjectOrNull(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? ({ ...(value as Record<string, unknown>) } as Record<string, unknown>)
    : null;
}

export function encryptEInvoiceCredentials(credentials: Record<string, unknown>) {
  return encryptSecret(JSON.stringify(credentials));
}

export function decryptEInvoiceCredentials(value: string | null | undefined) {
  if (!value) return null;
  const decrypted = safeDecryptSecret(value);
  if (!decrypted) return null;
  try {
    const parsed = JSON.parse(decrypted);
    return toObjectOrNull(parsed);
  } catch {
    return null;
  }
}

export function sanitizeEInvoiceConnection(record: RawEInvoiceConnection): SanitizedEInvoiceConnection {
  const credentials = decryptEInvoiceCredentials(record.credentialsEncrypted);
  const provider = normalizeProvider(record.provider);
  if (!provider) {
    throw new Error(`Unsupported e-invoicing provider stored in database: ${record.provider}`);
  }

  return {
    id: record.id,
    provider,
    country: normalizeCountry(record.country),
    status: normalizeStatus(record.status),
    sandbox: Boolean(record.sandbox),
    hasCredentials: Boolean(credentials && Object.keys(credentials).length > 0),
    credentialKeys: credentials ? Object.keys(credentials).sort() : [],
    metadata: toObjectOrNull(record.metadata),
    lastValidatedAt: record.lastValidatedAt?.toISOString() ?? null,
    lastError: record.lastError ?? null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export function toConnectionConfig(record: SanitizedEInvoiceConnection | null | undefined): EInvoiceConnectionConfig | null {
  if (!record) return null;
  return {
    id: record.id,
    provider: record.provider,
    country: record.country,
    status: record.status,
    sandbox: record.sandbox,
    hasCredentials: record.hasCredentials,
    metadata: record.metadata,
    lastValidatedAt: record.lastValidatedAt,
    lastError: record.lastError,
  };
}

export function toPrivateConnectionConfig(record: RawEInvoiceConnection | null | undefined): EInvoiceConnectionConfig | null {
  if (!record) return null;
  const provider = normalizeProvider(record.provider);
  if (!provider) return null;
  return {
    id: record.id,
    provider,
    country: normalizeCountry(record.country),
    status: normalizeStatus(record.status),
    sandbox: Boolean(record.sandbox),
    hasCredentials: Boolean(record.credentialsEncrypted && decryptEInvoiceCredentials(record.credentialsEncrypted)),
    credentials: decryptEInvoiceCredentials(record.credentialsEncrypted),
    metadata: toObjectOrNull(record.metadata),
    lastValidatedAt: record.lastValidatedAt?.toISOString() ?? null,
    lastError: record.lastError ?? null,
  };
}

export async function listEInvoiceConnectionsForUser(userId: string) {
  const delegate = getConnectionDelegate();
  const records = (await delegate.findMany({
    where: { userId },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
  })) as RawEInvoiceConnection[];
  return records.map(sanitizeEInvoiceConnection);
}

export async function getEInvoiceConnectionForUser(input: {
  userId: string;
  provider: EInvoiceProviderKey;
}) {
  const delegate = getConnectionDelegate();
  const record = (await delegate.findUnique({
    where: {
      userId_provider: {
        userId: input.userId,
        provider: input.provider,
      },
    },
  })) as RawEInvoiceConnection | null;
  return record ? sanitizeEInvoiceConnection(record) : null;
}

export async function resolveEInvoiceConnectionForUser(input: {
  userId: string;
  context: EInvoiceProviderContext;
}) {
  const provider = resolveEInvoiceProvider(input.context);
  if (!provider) return null;
  return getEInvoiceConnectionForUser({ userId: input.userId, provider: provider.key });
}

export async function resolvePrivateEInvoiceConnectionForUser(input: {
  userId: string;
  context: EInvoiceProviderContext;
}) {
  const provider = resolveEInvoiceProvider(input.context);
  if (!provider) return null;
  const delegate = getConnectionDelegate();
  const record = (await delegate.findUnique({
    where: {
      userId_provider: {
        userId: input.userId,
        provider: provider.key,
      },
    },
  })) as RawEInvoiceConnection | null;
  return toPrivateConnectionConfig(record);
}

export async function upsertEInvoiceConnection(input: UpsertEInvoiceConnectionInput) {
  const delegate = getConnectionDelegate();
  const country = normalizeCountry(input.country);
  const status = normalizeStatus(input.status);
  const metadata = toObjectOrNull(input.metadata);
  const encryptedCredentials =
    input.credentials === undefined
      ? undefined
      : input.credentials === null
        ? null
        : encryptEInvoiceCredentials(input.credentials);

  const record = (await delegate.upsert({
    where: {
      userId_provider: {
        userId: input.userId,
        provider: input.provider,
      },
    },
    create: {
      userId: input.userId,
      provider: input.provider,
      country,
      status,
      sandbox: input.sandbox ?? true,
      credentialsEncrypted: encryptedCredentials ?? null,
      metadata,
      lastValidatedAt: input.lastValidatedAt ?? null,
      lastError: input.lastError ?? null,
    },
    update: {
      country,
      status,
      sandbox: input.sandbox ?? true,
      ...(encryptedCredentials !== undefined ? { credentialsEncrypted: encryptedCredentials } : {}),
      ...(input.metadata !== undefined ? { metadata } : {}),
      ...(input.lastValidatedAt !== undefined ? { lastValidatedAt: input.lastValidatedAt } : {}),
      ...(input.lastError !== undefined ? { lastError: input.lastError } : {}),
    },
  })) as RawEInvoiceConnection;

  return sanitizeEInvoiceConnection(record);
}

export async function deleteEInvoiceConnection(input: {
  userId: string;
  provider: EInvoiceProviderKey;
}) {
  const delegate = getConnectionDelegate();
  const existing = (await delegate.findUnique({
    where: {
      userId_provider: {
        userId: input.userId,
        provider: input.provider,
      },
    },
  })) as RawEInvoiceConnection | null;
  if (!existing) return null;
  const deleted = (await delegate.delete({
    where: {
      userId_provider: {
        userId: input.userId,
        provider: input.provider,
      },
    },
  })) as RawEInvoiceConnection;
  return sanitizeEInvoiceConnection(deleted);
}
