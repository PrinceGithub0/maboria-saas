import "server-only";

import { prisma } from "@/lib/prisma";

export type SystemFlag =
  | "maintenance_mode"
  | "allow_signup"
  | "payments_enabled"
  | "automation_enabled"
  | "automation_replay_enabled"
  | "ai_enabled"
  | "support_enabled"
  | "admin_notifications_enabled"
  | "system_logs_enabled"
  | "impersonation_enabled"
  | "webhooks_ingest_enabled"
  | "exports_enabled";

export const ALL_SYSTEM_FLAGS: SystemFlag[] = [
  "maintenance_mode",
  "allow_signup",
  "payments_enabled",
  "automation_enabled",
  "automation_replay_enabled",
  "ai_enabled",
  "support_enabled",
  "admin_notifications_enabled",
  "system_logs_enabled",
  "impersonation_enabled",
  "webhooks_ingest_enabled",
  "exports_enabled",
];

export const DANGEROUS_SYSTEM_FLAGS = new Set<SystemFlag>([
  "maintenance_mode",
  "payments_enabled",
  "impersonation_enabled",
  "automation_replay_enabled",
]);

type SystemFlagRecord = Record<SystemFlag, boolean>;

const SYSTEM_FLAG_CACHE_TTL_MS = 30_000;
const ROOT_SUPER_ADMIN_SETTING = "PLATFORM_ROOT_ADMIN_USER_ID";

const FAIL_SAFE_DEFAULTS: SystemFlagRecord = {
  maintenance_mode: false,
  allow_signup: false,
  payments_enabled: false,
  automation_enabled: false,
  automation_replay_enabled: false,
  ai_enabled: false,
  support_enabled: false,
  admin_notifications_enabled: true,
  system_logs_enabled: true,
  impersonation_enabled: false,
  webhooks_ingest_enabled: true,
  exports_enabled: false,
};

type CacheState = {
  values: SystemFlagRecord;
  expiresAt: number;
  loading: Promise<SystemFlagRecord> | null;
  source: "default" | "db";
};

function toBoolean(value: unknown) {
  if (typeof value === "boolean") return value;
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes" || normalized === "on";
}

function cloneDefaults() {
  return { ...FAIL_SAFE_DEFAULTS };
}

const globalCache = globalThis as typeof globalThis & {
  __maboriaSystemFlagCache?: CacheState;
};

const cache: CacheState =
  globalCache.__maboriaSystemFlagCache ||
  (globalCache.__maboriaSystemFlagCache = {
    values: cloneDefaults(),
    expiresAt: 0,
    loading: null,
    source: "default",
  });

async function loadFlagsFromDb(): Promise<SystemFlagRecord> {
  const rows = await prisma.setting.findMany({
    where: {
      key: { in: ALL_SYSTEM_FLAGS },
    },
    select: {
      key: true,
      value: true,
    },
  });

  const next = cloneDefaults();
  for (const row of rows) {
    if (!ALL_SYSTEM_FLAGS.includes(row.key as SystemFlag)) continue;
    next[row.key as SystemFlag] = toBoolean(row.value);
  }
  return next;
}

async function fetchAndCache() {
  try {
    const nextValues = await loadFlagsFromDb();
    cache.values = nextValues;
    cache.expiresAt = Date.now() + SYSTEM_FLAG_CACHE_TTL_MS;
    cache.source = "db";
    return nextValues;
  } catch {
    cache.values = cloneDefaults();
    cache.expiresAt = Date.now() + SYSTEM_FLAG_CACHE_TTL_MS;
    cache.source = "default";
    return cache.values;
  }
}

async function ensureFreshFlags() {
  if (Date.now() < cache.expiresAt && cache.loading === null) {
    return cache.values;
  }
  if (!cache.loading) {
    cache.loading = fetchAndCache().finally(() => {
      cache.loading = null;
    });
  }
  return cache.loading;
}

export function isEnabled(flag: SystemFlag): boolean {
  if (Date.now() >= cache.expiresAt && !cache.loading) {
    void refreshFlags();
  }
  return cache.values[flag];
}

export async function isEnabledAsync(flag: SystemFlag): Promise<boolean> {
  const values = await ensureFreshFlags();
  return values[flag];
}

export function getAllFlags(): Record<SystemFlag, boolean> {
  if (Date.now() >= cache.expiresAt && !cache.loading) {
    void refreshFlags();
  }
  return { ...cache.values };
}

export async function getAllFlagsAsync() {
  const values = await ensureFreshFlags();
  return { ...values };
}

export async function refreshFlags(options?: { force?: boolean }): Promise<void> {
  if (options?.force) {
    cache.expiresAt = 0;
    cache.loading = null;
  }
  await ensureFreshFlags();
}

export function getSystemFlagDefaults() {
  return cloneDefaults();
}

export async function getActorSystemFlagRole(userId: string): Promise<"SUPER_ADMIN" | "OPS_ADMIN" | "USER"> {
  const [user, rootSetting] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, status: true },
    }),
    prisma.setting.findUnique({
      where: { key: ROOT_SUPER_ADMIN_SETTING },
      select: { value: true },
    }),
  ]);

  if (!user || String(user.status || "").toUpperCase() !== "ACTIVE") return "USER";
  const role = String(user.role || "").toUpperCase();
  if (role === "SUPER_ADMIN") return "SUPER_ADMIN";
  if (role !== "OPS_ADMIN") return "USER";

  const rootId = String(rootSetting?.value || "").trim();
  return rootId && rootId === user.id ? "SUPER_ADMIN" : "OPS_ADMIN";
}

export async function setSystemFlag(input: {
  key: SystemFlag;
  value: boolean;
  actorUserId: string;
  actorIp?: string | null;
  actorUserAgent?: string | null;
}) {
  const actorRole = await getActorSystemFlagRole(input.actorUserId);
  if (actorRole !== "SUPER_ADMIN") {
    const error = new Error("Only super admins can modify this flag.");
    (error as any).status = 403;
    (error as any).code = "FORBIDDEN_FLAG_WRITE";
    throw error;
  }

  const existing = await prisma.setting.findUnique({
    where: { key: input.key },
    select: { value: true },
  });
  const oldValue = existing ? toBoolean(existing.value) : FAIL_SAFE_DEFAULTS[input.key];

  await prisma.$transaction(async (tx) => {
    await tx.setting.upsert({
      where: { key: input.key },
      update: { value: input.value ? "true" : "false" },
      create: { key: input.key, value: input.value ? "true" : "false" },
    });
    await tx.systemFlagAuditLog.create({
      data: {
        flagKey: input.key,
        oldValue,
        newValue: input.value,
        actorUserId: input.actorUserId,
        actorIp: input.actorIp || null,
        actorUserAgent: input.actorUserAgent || null,
      },
    });
    await tx.activityLog.create({
      data: {
        userId: input.actorUserId,
        action: "SYSTEM_FLAG_UPDATED",
        metadata: {
          flagKey: input.key,
          oldValue,
          newValue: input.value,
          actorIp: input.actorIp || null,
          actorUserAgent: input.actorUserAgent || null,
        },
      },
    });
  });

  await refreshFlags({ force: true });
  return {
    key: input.key,
    oldValue,
    newValue: input.value,
  };
}

export async function listSystemFlagsWithAuditMeta() {
  const values = await getAllFlagsAsync();
  const audits = await prisma.systemFlagAuditLog.findMany({
    where: { flagKey: { in: ALL_SYSTEM_FLAGS } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 200,
  });

  const latestByFlag = new Map<string, (typeof audits)[number]>();
  for (const row of audits) {
    if (!latestByFlag.has(row.flagKey)) latestByFlag.set(row.flagKey, row);
  }

  const actorIds = Array.from(
    new Set(
      Array.from(latestByFlag.values())
        .map((row) => row.actorUserId)
        .filter(Boolean)
    )
  );

  const actors = actorIds.length
    ? await prisma.user.findMany({
        where: { id: { in: actorIds } },
        select: { id: true, name: true, email: true },
      })
    : [];
  const actorMap = new Map(actors.map((actor) => [actor.id, actor]));

  return ALL_SYSTEM_FLAGS.map((key) => {
    const latest = latestByFlag.get(key);
    const actor = latest ? actorMap.get(latest.actorUserId) : null;
    return {
      key,
      value: values[key],
      dangerous: DANGEROUS_SYSTEM_FLAGS.has(key),
      lastModifiedAt: latest?.createdAt?.toISOString() || null,
      lastModifiedBy: actor
        ? {
            id: actor.id,
            name: actor.name,
            email: actor.email,
          }
        : null,
    };
  });
}

export async function listSystemFlagHistory(input?: { take?: number; flagKey?: SystemFlag | null }) {
  const take = Math.max(1, Math.min(100, Math.floor(input?.take || 50)));
  const rows = await prisma.systemFlagAuditLog.findMany({
    where: input?.flagKey ? { flagKey: input.flagKey } : undefined,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take,
  });
  const actorIds = Array.from(new Set(rows.map((row) => row.actorUserId)));
  const actors = actorIds.length
    ? await prisma.user.findMany({
        where: { id: { in: actorIds } },
        select: { id: true, name: true, email: true },
      })
    : [];
  const actorMap = new Map(actors.map((actor) => [actor.id, actor]));

  return rows.map((row) => ({
    id: row.id,
    flagKey: row.flagKey,
    oldValue: row.oldValue,
    newValue: row.newValue,
    actorUserId: row.actorUserId,
    actorName: actorMap.get(row.actorUserId)?.name || null,
    actorEmail: actorMap.get(row.actorUserId)?.email || null,
    actorIp: row.actorIp,
    actorUserAgent: row.actorUserAgent,
    createdAt: row.createdAt.toISOString(),
  }));
}

export async function assertSystemFlagEnabled(flag: SystemFlag, message?: string) {
  const enabled = await isEnabledAsync(flag);
  if (enabled) return;
  const error = new Error(message || "Feature is disabled by system flag.");
  (error as any).status = 503;
  (error as any).code = "SYSTEM_FLAG_DISABLED";
  (error as any).flag = flag;
  throw error;
}

if (process.env.NEXT_PHASE !== "phase-production-build") {
  void refreshFlags().catch(() => undefined);
}
