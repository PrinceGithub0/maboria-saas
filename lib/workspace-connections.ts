import "server-only";

import { Prisma, SubscriptionPlan } from "@prisma/client";
import { decryptInboxCredentials } from "@/lib/inbox/channels";
import { normalizePlanLimitKey, PLAN_LIMITS, UNLIMITED } from "@/lib/planLimits";
import { prisma } from "@/lib/prisma";

type DbClient = Prisma.TransactionClient | typeof prisma;

const MAILBOX_CONNECTION_STATUSES = ["PENDING", "ACTIVE", "ERROR"] as const;
const INBOX_CONNECTION_STATUSES = ["ACTIVE", "ERROR", "DISABLED"] as const;

export function getConnectionLimitForPlan(plan?: SubscriptionPlan | string | null) {
  const key = normalizePlanLimitKey(plan);
  if (!key) return PLAN_LIMITS.starter.connections;
  const limit = PLAN_LIMITS[key].connections;
  return limit === UNLIMITED ? null : limit;
}

export function mailboxStatusConsumesConnection(status?: string | null) {
  return MAILBOX_CONNECTION_STATUSES.includes(
    String(status || "").toUpperCase() as (typeof MAILBOX_CONNECTION_STATUSES)[number]
  );
}

export function inboxStatusConsumesConnection(status?: string | null) {
  return INBOX_CONNECTION_STATUSES.includes(
    String(status || "").toUpperCase() as (typeof INBOX_CONNECTION_STATUSES)[number]
  );
}

export function hasDirectEmailInboxConnection(
  credentialsEncrypted?: string | null,
  status?: string | null
) {
  if (!inboxStatusConsumesConnection(status)) return false;
  const credentials = decryptInboxCredentials(credentialsEncrypted);
  if (String(credentials.emailOAuth?.connectedMailboxId || "").trim()) return false;
  return Boolean(
    credentials.email?.host &&
      credentials.email?.username &&
      credentials.email?.password
  );
}

export function hasWhatsAppInboxConnection(
  credentialsEncrypted?: string | null,
  status?: string | null
) {
  if (!inboxStatusConsumesConnection(status)) return false;
  const credentials = decryptInboxCredentials(credentialsEncrypted);
  return Boolean(credentials.whatsapp?.accessToken && credentials.whatsapp?.phoneNumberId);
}

export async function getWorkspaceConnectionUsage(workspaceId: string, tx: DbClient = prisma) {
  const [connectedMailboxes, inboxes] = await Promise.all([
    tx.connectedMailbox.count({
      where: {
        workspaceId,
        status: { in: [...MAILBOX_CONNECTION_STATUSES] },
      },
    }),
    tx.unifiedInbox.findMany({
      where: { tenantId: workspaceId },
      select: {
        type: true,
        status: true,
        credentialsEncrypted: true,
      },
    }),
  ]);

  let directEmailInboxes = 0;
  let whatsappInboxes = 0;

  for (const inbox of inboxes) {
    if (inbox.type === "EMAIL" && hasDirectEmailInboxConnection(inbox.credentialsEncrypted, inbox.status)) {
      directEmailInboxes += 1;
      continue;
    }
    if (inbox.type === "WHATSAPP" && hasWhatsAppInboxConnection(inbox.credentialsEncrypted, inbox.status)) {
      whatsappInboxes += 1;
    }
  }

  return {
    used: connectedMailboxes + directEmailInboxes + whatsappInboxes,
    breakdown: {
      connectedMailboxes,
      directEmailInboxes,
      whatsappInboxes,
    },
  };
}

export async function canAddWorkspaceConnections(input: {
  workspaceId: string;
  plan?: SubscriptionPlan | string | null;
  additionalConnections?: number;
  tx?: DbClient;
}) {
  const additionalConnections = Math.max(1, Math.floor(input.additionalConnections ?? 1));
  const limit = getConnectionLimitForPlan(input.plan);
  const usage = await getWorkspaceConnectionUsage(input.workspaceId, input.tx ?? prisma);

  if (limit == null) {
    return {
      ok: true as const,
      limit,
      used: usage.used,
      remaining: null,
      breakdown: usage.breakdown,
    };
  }

  if (usage.used + additionalConnections > limit) {
    return {
      ok: false as const,
      limit,
      used: usage.used,
      remaining: Math.max(0, limit - usage.used),
      breakdown: usage.breakdown,
    };
  }

  return {
    ok: true as const,
    limit,
    used: usage.used,
    remaining: Math.max(0, limit - usage.used),
    breakdown: usage.breakdown,
  };
}
