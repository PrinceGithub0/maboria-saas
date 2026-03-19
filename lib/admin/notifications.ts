import "server-only";

import {
  AdminNotificationDedupeStrategy,
  AdminNotificationRecipientStrategy,
  AdminNotificationSeverity,
  AdminNotificationStatus,
  AdminNotificationType,
  Prisma,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isEnabledAsync } from "@/lib/system-flags";

const ROOT_SUPER_ADMIN_SETTING = "PLATFORM_ROOT_ADMIN_USER_ID";

export type AdminNotificationEventInput = {
  eventType: string;
  tenantId?: string | null;
  entityId?: string | null;
  assigneeAdminId?: string | null;
  payload?: Record<string, unknown>;
  occurredAt?: Date;
};

type EventRule = {
  eventType: string;
  defaultSeverity: AdminNotificationSeverity;
  defaultType: AdminNotificationType;
  enabled: boolean;
  recipientStrategy: AdminNotificationRecipientStrategy;
  roleKey: string | null;
  dedupeStrategy: AdminNotificationDedupeStrategy;
  dedupeWindowSeconds: number;
  templateTitle: string;
  templateMessage: string;
  metadataTemplate: Prisma.JsonValue;
};

type DbClient = Prisma.TransactionClient | typeof prisma;
type EventScope = "GLOBAL" | "TENANT";

const DEFAULT_EVENT_RULES: Record<string, EventRule> = {
  AUTOMATION_RUN_FAILED: {
    eventType: "AUTOMATION_RUN_FAILED",
    defaultSeverity: "WARNING",
    defaultType: "AUTOMATION",
    enabled: true,
    recipientStrategy: "ALL_ADMINS",
    roleKey: null,
    dedupeStrategy: "BY_TENANT_AND_EVENT",
    dedupeWindowSeconds: 300,
    templateTitle: "Automation run failed",
    templateMessage: "Automation failure detected for {{tenantName}}.",
    metadataTemplate: {},
  },
  SUPPORT_TICKET_ASSIGNED: {
    eventType: "SUPPORT_TICKET_ASSIGNED",
    defaultSeverity: "INFO",
    defaultType: "SUPPORT",
    enabled: true,
    recipientStrategy: "ASSIGNEE_ONLY",
    roleKey: null,
    dedupeStrategy: "CUSTOM_KEY",
    dedupeWindowSeconds: 60,
    templateTitle: "Ticket assigned to you",
    templateMessage: "Ticket {{ticketId}} has been assigned to you.",
    metadataTemplate: {},
  },
  SUPPORT_SUBSCRIBER_REPLY_RECEIVED: {
    eventType: "SUPPORT_SUBSCRIBER_REPLY_RECEIVED",
    defaultSeverity: "INFO",
    defaultType: "SUPPORT",
    enabled: true,
    recipientStrategy: "ALL_ADMINS",
    roleKey: null,
    dedupeStrategy: "CUSTOM_KEY",
    dedupeWindowSeconds: 60,
    templateTitle: "{{subscriberLabel}} replied to support ticket",
    templateMessage: "New reply on {{ticketSubject}}.",
    metadataTemplate: {},
  },
  SLA_BREACH: {
    eventType: "SLA_BREACH",
    defaultSeverity: "WARNING",
    defaultType: "SLA",
    enabled: true,
    recipientStrategy: "ASSIGNEE_ONLY",
    roleKey: null,
    dedupeStrategy: "CUSTOM_KEY",
    dedupeWindowSeconds: 300,
    templateTitle: "SLA breach detected",
    templateMessage: "Ticket {{ticketId}} has breached SLA thresholds.",
    metadataTemplate: {},
  },
  SYSTEM_OUTAGE: {
    eventType: "SYSTEM_OUTAGE",
    defaultSeverity: "WARNING",
    defaultType: "SYSTEM",
    enabled: true,
    recipientStrategy: "ALL_ADMINS",
    roleKey: null,
    dedupeStrategy: "BY_EVENT",
    dedupeWindowSeconds: 300,
    templateTitle: "System incident detected",
    templateMessage: "{{summary}}",
    metadataTemplate: {},
  },
};

function normalizeEventType(value: string) {
  return String(value || "")
    .trim()
    .toUpperCase();
}

const PLATFORM_WIDE_COMPONENTS = new Set([
  "DATABASE",
  "AUTH",
  "PAYMENT_PROVIDER",
  "AUTOMATION_ENGINE",
  "QUEUE",
  "WORKER",
  "EMAIL_SYSTEM",
  "SECURITY",
]);

const INFO_EVENT_PATTERNS = [/SUPPORT_TICKET_ASSIGNED/, /TICKET_UPDATED/, /ADMIN_ACTIVITY/, /INVOICE_GENERATED/, /USER_UPDATED/];
const WARNING_EVENT_PATTERNS = [/AUTOMATION.*FAILED/, /WEBHOOK.*FAILED/, /PAYMENT.*FAILED/, /SLA_BREACH/];

function normalizeScope(scope: unknown, tenantId?: string | null): EventScope {
  const normalized = String(scope || "").trim().toUpperCase();
  if (normalized === "GLOBAL") return "GLOBAL";
  if (normalized === "TENANT") return "TENANT";
  return tenantId ? "TENANT" : "GLOBAL";
}

function getAffectedTenantsCount(payload: Record<string, unknown>) {
  const numeric = Number(payload.affectedTenantsCount);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.floor(numeric));
}

function getSystemComponent(payload: Record<string, unknown>) {
  return String(payload.systemComponent || payload.component || "")
    .trim()
    .toUpperCase();
}

function isPlatformWideFailure(input: {
  eventType: string;
  scope: EventScope;
  affectedTenantsCount: number;
  systemComponent: string;
  crossTenantBurstCritical: boolean;
}) {
  if (input.scope === "TENANT" && !input.crossTenantBurstCritical) return false;
  return (
    input.crossTenantBurstCritical ||
    input.scope === "GLOBAL" ||
    input.affectedTenantsCount > 5 ||
    PLATFORM_WIDE_COMPONENTS.has(input.systemComponent) ||
    input.eventType === "SYSTEM_OUTAGE"
  );
}

function classifySeverity(input: {
  eventType: string;
  scope: EventScope;
  affectedTenantsCount: number;
  systemComponent: string;
  defaultSeverity: AdminNotificationSeverity;
  crossTenantBurstCritical: boolean;
}) {
  if (
    isPlatformWideFailure({
      eventType: input.eventType,
      scope: input.scope,
      affectedTenantsCount: input.affectedTenantsCount,
      systemComponent: input.systemComponent,
      crossTenantBurstCritical: input.crossTenantBurstCritical,
    })
  ) {
    return "CRITICAL" as const;
  }

  if (INFO_EVENT_PATTERNS.some((pattern) => pattern.test(input.eventType))) {
    return "INFO" as const;
  }

  if (WARNING_EVENT_PATTERNS.some((pattern) => pattern.test(input.eventType)) || input.scope === "TENANT") {
    return "WARNING" as const;
  }

  return input.defaultSeverity === "CRITICAL" ? ("WARNING" as const) : input.defaultSeverity;
}

async function isCrossTenantFailureBurst(
  db: DbClient,
  input: { eventType: string; occurredAt: Date; scope: EventScope }
) {
  if (input.scope === "GLOBAL") return false;
  if (!/AUTOMATION.*FAILED|WEBHOOK.*FAILED|PAYMENT.*FAILED/.test(input.eventType)) return false;

  const windowStart = new Date(input.occurredAt.getTime() - 2 * 60 * 1000);
  const recent = await db.adminNotification.findMany({
    where: {
      sourceEventType: input.eventType,
      createdAt: { gte: windowStart, lte: input.occurredAt },
    },
    select: { tenantId: true },
    take: 100,
  });
  const distinctTenants = new Set(recent.map((row) => String(row.tenantId || "").trim()).filter(Boolean));
  return recent.length >= 10 && distinctTenants.size > 5;
}

function templateValue(payload: Record<string, unknown>, key: string) {
  const normalized = key.trim();
  if (!normalized) return "";
  const direct = payload[normalized];
  if (direct !== undefined && direct !== null) return String(direct);

  const segments = normalized.split(".");
  let current: unknown = payload;
  for (const segment of segments) {
    if (!current || typeof current !== "object") return "";
    current = (current as Record<string, unknown>)[segment];
  }
  if (current === undefined || current === null) return "";
  return String(current);
}

function applyTemplate(template: string, payload: Record<string, unknown>) {
  return String(template || "").replace(/{{\s*([^}]+?)\s*}}/g, (_, key: string) => templateValue(payload, key));
}

function computeDedupeKey(input: {
  strategy: AdminNotificationDedupeStrategy;
  eventType: string;
  tenantId?: string | null;
  entityId?: string | null;
  payload: Record<string, unknown>;
}) {
  const tenantId = String(input.tenantId || "").trim();
  const eventType = normalizeEventType(input.eventType);
  if (input.strategy === "BY_EVENT") return eventType;
  if (input.strategy === "BY_TENANT") return tenantId || "global";
  if (input.strategy === "BY_TENANT_AND_EVENT") {
    return `${tenantId || "global"}:${eventType}`;
  }

  const payloadKey =
    String(input.payload.dedupeKey || "").trim() ||
    String(input.payload.ticketId || input.payload.runId || input.entityId || "").trim();
  if (payloadKey) {
    return `${tenantId || "global"}:${eventType}:${payloadKey}`;
  }
  return `${tenantId || "global"}:${eventType}`;
}

async function resolveRootSuperAdminId(db: DbClient) {
  const configured = await db.setting.findUnique({
    where: { key: ROOT_SUPER_ADMIN_SETTING },
    select: { value: true },
  });
  const settingId = String(configured?.value || "").trim();
  if (settingId) return settingId;

  const firstAdmin = await db.user.findFirst({
    where: { role: { in: ["OPS_ADMIN"] }, status: "ACTIVE" },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true },
  });
  return firstAdmin?.id || null;
}

async function resolveSuperAdminIds(db: DbClient) {
  const rootSuperAdminId = await resolveRootSuperAdminId(db);
  if (!rootSuperAdminId) return [];
  const root = await db.user.findFirst({
    where: { id: rootSuperAdminId, role: { in: ["OPS_ADMIN"] }, status: "ACTIVE" },
    select: { id: true },
  });
  return root ? [root.id] : [];
}

async function resolveRecipients(
  db: DbClient,
  input: {
    strategy: AdminNotificationRecipientStrategy;
    roleKey?: string | null;
    assigneeAdminId?: string | null;
    includeSuperAdmins?: boolean;
  }
) {
  const recipients = new Set<string>();

  if (input.strategy === "ALL_ADMINS") {
    const admins = await db.user.findMany({
      where: {
        role: { in: ["OPS_ADMIN"] },
        status: "ACTIVE",
      },
      select: { id: true },
    });
    for (const admin of admins) recipients.add(admin.id);
  } else if (input.strategy === "SUPER_ADMINS") {
    const superAdmins = await resolveSuperAdminIds(db);
    for (const adminId of superAdmins) recipients.add(adminId);
  } else if (input.strategy === "ASSIGNEE_ONLY") {
    const assignee = String(input.assigneeAdminId || "").trim();
    if (assignee) recipients.add(assignee);
  } else if (input.strategy === "ROLE") {
    const roleKey = String(input.roleKey || "").trim().toUpperCase();
    if (roleKey === "SUPER_ADMIN") {
      const superAdmins = await resolveSuperAdminIds(db);
      for (const adminId of superAdmins) recipients.add(adminId);
    } else if (roleKey === "OPS_ADMIN") {
      const admins = await db.user.findMany({
        where: { role: { in: ["OPS_ADMIN"] }, status: "ACTIVE" },
        select: { id: true },
      });
      for (const admin of admins) recipients.add(admin.id);
    }
  }

  if (input.includeSuperAdmins) {
    const superAdmins = await resolveSuperAdminIds(db);
    for (const adminId of superAdmins) recipients.add(adminId);
  }

  return Array.from(recipients);
}

function parseMetadataTemplate(value: Prisma.JsonValue) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

const SENSITIVE_METADATA_KEY_PATTERNS = [
  /token/i,
  /secret/i,
  /password/i,
  /authorization/i,
  /cookie/i,
  /api[_-]?key/i,
  /credential/i,
  /private[_-]?key/i,
];

function shouldRedactMetadataKey(key: string) {
  return SENSITIVE_METADATA_KEY_PATTERNS.some((pattern) => pattern.test(key));
}

export function sanitizeAdminNotificationMetadata<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeAdminNotificationMetadata(entry)) as T;
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  const input = value as Record<string, unknown>;
  const output: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(input)) {
    if (shouldRedactMetadataKey(key)) {
      output[key] = "[REDACTED]";
      continue;
    }
    output[key] = sanitizeAdminNotificationMetadata(entry);
  }
  return output as T;
}

async function resolveRule(db: DbClient, eventType: string): Promise<EventRule | null> {
  const normalized = normalizeEventType(eventType);
  if (!normalized) return null;

  const dbRule = await db.adminNotificationRule.findUnique({
    where: { eventType: normalized },
  });
  if (dbRule) {
    return {
      eventType: dbRule.eventType,
      defaultSeverity: dbRule.defaultSeverity,
      defaultType: dbRule.defaultType,
      enabled: dbRule.enabled,
      recipientStrategy: dbRule.recipientStrategy,
      roleKey: dbRule.roleKey,
      dedupeStrategy: dbRule.dedupeStrategy,
      dedupeWindowSeconds: dbRule.dedupeWindowSeconds,
      templateTitle: dbRule.templateTitle,
      templateMessage: dbRule.templateMessage,
      metadataTemplate: dbRule.metadataTemplate,
    };
  }
  return DEFAULT_EVENT_RULES[normalized] || null;
}

async function createNotificationRows(
  db: DbClient,
  input: {
    recipients: string[];
    rule: EventRule;
    severity: AdminNotificationSeverity;
    tenantId?: string | null;
    sourceEventId?: string | null;
    dedupeKey: string;
    title: string;
    message: string;
    metadata: Record<string, unknown>;
    occurredAt: Date;
  }
) {
  if (!input.recipients.length) {
    return { created: 0, updated: 0 };
  }

  let created = 0;
  let updated = 0;
  const windowStart = new Date(input.occurredAt.getTime() - input.rule.dedupeWindowSeconds * 1000);

  for (const recipientAdminId of input.recipients) {
    const existing = await db.adminNotification.findFirst({
      where: {
        recipientAdminId,
        dedupeKey: input.dedupeKey,
        lastSeenAt: {
          gte: windowStart,
        },
      },
      orderBy: { lastSeenAt: "desc" },
      select: { id: true, status: true },
    });

    if (existing) {
      await db.adminNotification.update({
        where: { id: existing.id },
        data: {
          occurrences: { increment: 1 },
          lastSeenAt: input.occurredAt,
          title: input.title,
          message: input.message,
          metadata: input.metadata as Prisma.InputJsonValue,
          ...(existing.status === "RESOLVED" ? {} : {}),
        },
      });
      updated += 1;
      continue;
    }

    await db.adminNotification.create({
      data: {
        tenantId: input.tenantId || null,
        recipientAdminId,
        title: input.title,
        message: input.message,
        type: input.rule.defaultType,
        severity: input.severity,
        sourceEventType: input.rule.eventType,
        sourceEventId: input.sourceEventId || null,
        dedupeKey: input.dedupeKey,
        occurrences: 1,
        firstSeenAt: input.occurredAt,
        lastSeenAt: input.occurredAt,
        status: "UNREAD",
        metadata: input.metadata as Prisma.InputJsonValue,
      },
    });
    created += 1;
  }

  return { created, updated };
}

export async function createAdminNotificationFromEvent(
  event: AdminNotificationEventInput,
  options?: { tx?: DbClient }
) {
  const enabled = await isEnabledAsync("admin_notifications_enabled");
  if (!enabled) {
    return { created: 0, updated: 0, skipped: true, disabled: true };
  }

  const run = async (db: DbClient) => {
    const eventType = normalizeEventType(event.eventType);
    if (!eventType) return { created: 0, updated: 0, skipped: true };

    const rule = await resolveRule(db, eventType);
    if (!rule || !rule.enabled) return { created: 0, updated: 0, skipped: true };

    const occurredAt = event.occurredAt || new Date();
    const payload = {
      ...(event.payload || {}),
      eventType,
      tenantId: event.tenantId || null,
      entityId: event.entityId || null,
      assigneeAdminId: event.assigneeAdminId || null,
    } as Record<string, unknown>;

    if (event.tenantId) {
      const tenant = await db.business.findUnique({
        where: { id: event.tenantId },
        select: { id: true, name: true },
      });
      if (tenant) {
        payload.tenantName = tenant.name;
      }
    }

    const metadata = {
      ...parseMetadataTemplate(rule.metadataTemplate),
      ...payload,
    };
    const scope = normalizeScope(payload.scope, event.tenantId);
    const affectedTenantsCount = getAffectedTenantsCount(payload);
    const systemComponent = getSystemComponent(payload);
    const crossTenantBurstCritical = await isCrossTenantFailureBurst(db, {
      eventType,
      occurredAt,
      scope,
    });
    const severity = classifySeverity({
      eventType,
      scope,
      affectedTenantsCount,
      systemComponent,
      defaultSeverity: rule.defaultSeverity,
      crossTenantBurstCritical,
    });

    const dedupeKey = computeDedupeKey({
      strategy: rule.dedupeStrategy,
      eventType,
      tenantId: event.tenantId,
      entityId: event.entityId,
      payload,
    });

    const recipients = await resolveRecipients(db, {
      strategy: rule.recipientStrategy,
      roleKey: rule.roleKey,
      assigneeAdminId: event.assigneeAdminId,
      includeSuperAdmins: eventType === "SLA_BREACH",
    });

    const result = await createNotificationRows(db, {
      recipients,
      rule,
      severity,
      tenantId: event.tenantId,
      sourceEventId: event.entityId,
      dedupeKey,
      title: applyTemplate(rule.templateTitle, payload),
      message: applyTemplate(rule.templateMessage, payload),
      metadata,
      occurredAt,
    });

    if (eventType === "SYSTEM_OUTAGE") {
      if (severity !== "CRITICAL") {
        return { ...result, skipped: false };
      }
      const summary = String(payload.summary || payload.message || "").trim();
      const title = String(payload.title || "System incident detected");
      await db.adminIncident.create({
        data: {
          title,
          summary: summary || null,
          severity,
          status: "ACTIVE",
          startedAt: occurredAt,
          createdByAdminId: String(payload.actorAdminId || payload.createdByAdminId || "").trim() || null,
        },
      });
    }

    return { ...result, skipped: false };
  };

  if (options?.tx) {
    return run(options.tx);
  }
  return prisma.$transaction((tx) => run(tx));
}

export function buildAdminNotificationWhere(input: {
  recipientAdminId: string;
  status?: AdminNotificationStatus | null;
  severity?: AdminNotificationSeverity | null;
  type?: AdminNotificationType | null;
  q?: string | null;
  timeFrom?: Date | null;
  timeTo?: Date | null;
  mineOnly?: boolean;
}) {
  const where: Prisma.AdminNotificationWhereInput = {
    recipientAdminId: input.recipientAdminId,
  };

  if (input.status) where.status = input.status;
  if (input.severity) where.severity = input.severity;
  if (input.type) where.type = input.type;
  if (input.timeFrom || input.timeTo) {
    where.createdAt = {};
    if (input.timeFrom) where.createdAt.gte = input.timeFrom;
    if (input.timeTo) where.createdAt.lte = input.timeTo;
  }

  const q = String(input.q || "").trim();
  if (q) {
    where.OR = [
      { title: { contains: q, mode: "insensitive" } },
      { message: { contains: q, mode: "insensitive" } },
    ];
  }

  if (input.mineOnly) {
    where.AND = [
      {
        OR: [
          { recipientAdminId: input.recipientAdminId },
          { metadata: { path: ["assigneeAdminId"], equals: input.recipientAdminId } },
        ],
      },
    ];
  }

  return where;
}

export async function getAdminUnreadCount(recipientAdminId: string) {
  return prisma.adminNotification.count({
    where: {
      recipientAdminId,
      status: "UNREAD",
    },
  });
}

export async function isSuperAdminActor(actorUserId: string) {
  const rootId = await resolveRootSuperAdminId(prisma);
  return Boolean(rootId && rootId === actorUserId);
}

export async function appendAdminNotificationAudit(input: {
  notificationId: string;
  actorAdminId: string;
  action: string;
  fromStatus?: AdminNotificationStatus | null;
  toStatus?: AdminNotificationStatus | null;
  details?: Record<string, unknown> | null;
  tx?: DbClient;
}) {
  const db = input.tx ?? prisma;
  await db.adminNotificationAudit.create({
    data: {
      notificationId: input.notificationId,
      actorAdminId: input.actorAdminId,
      action: input.action,
      fromStatus: input.fromStatus ?? null,
      toStatus: input.toStatus ?? null,
      details: (input.details || {}) as Prisma.InputJsonValue,
    },
  });
}

export async function upsertDefaultAdminNotificationRules() {
  const entries = Object.values(DEFAULT_EVENT_RULES);
  for (const entry of entries) {
    await prisma.adminNotificationRule.upsert({
      where: { eventType: entry.eventType },
      update: {
        defaultSeverity: entry.defaultSeverity,
        defaultType: entry.defaultType,
        enabled: entry.enabled,
        recipientStrategy: entry.recipientStrategy,
        roleKey: entry.roleKey,
        dedupeStrategy: entry.dedupeStrategy,
        dedupeWindowSeconds: entry.dedupeWindowSeconds,
        templateTitle: entry.templateTitle,
        templateMessage: entry.templateMessage,
        metadataTemplate: entry.metadataTemplate as Prisma.InputJsonValue,
      },
      create: {
        eventType: entry.eventType,
        defaultSeverity: entry.defaultSeverity,
        defaultType: entry.defaultType,
        enabled: entry.enabled,
        recipientStrategy: entry.recipientStrategy,
        roleKey: entry.roleKey,
        dedupeStrategy: entry.dedupeStrategy,
        dedupeWindowSeconds: entry.dedupeWindowSeconds,
        templateTitle: entry.templateTitle,
        templateMessage: entry.templateMessage,
        metadataTemplate: entry.metadataTemplate as Prisma.InputJsonValue,
      },
    });
  }
}

export async function resolveActiveIncident() {
  return prisma.adminIncident.findFirst({
    where: { status: "ACTIVE", severity: "CRITICAL" },
    orderBy: [{ startedAt: "desc" }, { createdAt: "desc" }],
    include: {
      createdByAdmin: {
        select: { id: true, name: true, email: true },
      },
    },
  });
}
