import "server-only";

import {
  Prisma,
  SupportDeliveryStatus,
  SupportMessageChannel,
  SupportSlaMetricStatus,
  SupportSenderType,
  SupportThreadPriority,
  SupportThreadStatus,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { resolveOrgContext } from "@/lib/org-auth";
import { extractTicketIdFromAddress, extractTicketIdFromSubject } from "@/lib/support/email-thread";
import { buildSubscriberSupportTicketWhereInput, getSubscriberSupportOpenMode } from "@/lib/support/subscriber-rules";
import { createAdminNotificationFromEvent } from "@/lib/admin/notifications";
import { emitSystemEvent } from "@/lib/system-events";
import { getActorSystemFlagRole } from "@/lib/system-flags";

type JsonAttachments = Prisma.InputJsonValue | undefined;

function createSupportAdminForbiddenError() {
  const error = new Error("Forbidden");
  (error as Error & { status?: number; code?: string }).status = 403;
  (error as Error & { status?: number; code?: string }).code = "FORBIDDEN";
  return error;
}

async function assertSupportAdminActor(userId: string) {
  const role = await getActorSystemFlagRole(userId);
  if (role !== "OPS_ADMIN" && role !== "SUPER_ADMIN") {
    throw createSupportAdminForbiddenError();
  }
}

const SLA_PRIORITY_POLICY_MINUTES = {
  LOW: { firstResponse: 24 * 60, nextResponse: 12 * 60, resolution: 72 * 60 },
  MEDIUM: { firstResponse: 8 * 60, nextResponse: 4 * 60, resolution: 24 * 60 },
  HIGH: { firstResponse: 2 * 60, nextResponse: 60, resolution: 12 * 60 },
  URGENT: { firstResponse: 60, nextResponse: 30, resolution: 4 * 60 },
} as const;

type SupportTimelineEventType =
  | "TICKET_CREATED"
  | "REPLY_SENT"
  | "NOTE_ADDED"
  | "ASSIGNEE_CHANGED"
  | "STATUS_CHANGED"
  | "PRIORITY_CHANGED"
  | "TICKET_ARCHIVED"
  | "TICKET_UNARCHIVED"
  | "SLA_PAUSED"
  | "SLA_RESUMED"
  | "SLA_BREACHED"
  | "SLA_MET";

export function normalizeSupportVersion(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.floor(value));
  }
  const normalized = String(value || "").trim();
  if (!normalized) return null;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, Math.floor(parsed));
}

export function normalizeSupportPriority(input?: string | null): SupportThreadPriority {
  const value = String(input || "").trim().toLowerCase();
  if (value === "low") return "LOW";
  if (value === "medium" || value === "normal") return "NORMAL";
  if (value === "high") return "HIGH";
  if (value === "urgent" || value === "critical") return "URGENT";
  return "NORMAL";
}

export function normalizeSupportStatus(input?: string | null): SupportThreadStatus {
  const value = String(input || "").trim().toUpperCase();
  if (value === "PENDING" || value === "IN_PROGRESS") return "PENDING";
  if (value === "CLOSED" || value === "RESOLVED") return "CLOSED";
  return "OPEN";
}

export function mapLegacyStatus(status: SupportThreadStatus) {
  if (status === "PENDING") return "IN_PROGRESS";
  if (status === "CLOSED") return "CLOSED";
  return "OPEN";
}

export function mapLegacyPriority(priority: SupportThreadPriority) {
  if (priority === "URGENT") return "critical";
  return priority.toLowerCase();
}

export function toApiSupportStatus(status: SupportThreadStatus) {
  if (status === "CLOSED") return "RESOLVED";
  return status;
}

export function toApiSupportPriority(priority: SupportThreadPriority) {
  if (priority === "NORMAL") return "MEDIUM";
  return priority;
}

function addMinutes(timestamp: Date, minutes: number) {
  return new Date(timestamp.getTime() + minutes * 60_000);
}

function getSlaPolicyMinutes(priority: SupportThreadPriority) {
  if (priority === "LOW") return SLA_PRIORITY_POLICY_MINUTES.LOW;
  if (priority === "HIGH") return SLA_PRIORITY_POLICY_MINUTES.HIGH;
  if (priority === "URGENT") return SLA_PRIORITY_POLICY_MINUTES.URGENT;
  return SLA_PRIORITY_POLICY_MINUTES.MEDIUM;
}

async function appendSupportTimelineEvent(
  tx: Prisma.TransactionClient,
  input: {
    ticketId: string;
    tenantId: string;
    actorAdminId?: string | null;
    eventType: SupportTimelineEventType;
    createdAt?: Date;
    metadata?: Prisma.InputJsonValue;
  }
) {
  await tx.supportThreadEvent.create({
    data: {
      ticketId: input.ticketId,
      tenantId: input.tenantId,
      actorAdminId: input.actorAdminId ?? null,
      eventType: input.eventType,
      metadata: input.metadata ?? undefined,
      createdAt: input.createdAt ?? new Date(),
    },
  });
}

async function initializeSupportSlaState(
  tx: Prisma.TransactionClient,
  input: {
    ticketId: string;
    tenantId: string;
    priority: SupportThreadPriority;
    createdAt: Date;
  }
) {
  const policy = getSlaPolicyMinutes(input.priority);
  await tx.supportThreadSlaState.create({
    data: {
      ticketId: input.ticketId,
      tenantId: input.tenantId,
      firstResponseDueAt: addMinutes(input.createdAt, policy.firstResponse),
      nextResponseDueAt: addMinutes(input.createdAt, policy.nextResponse),
      nextResponseBaselineCustomerMessageAt: input.createdAt,
      resolutionDueAt: addMinutes(input.createdAt, policy.resolution),
    },
  });
}

function getPauseDurationSeconds(from: Date, to: Date) {
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / 1000));
}

export async function resolveWorkspaceForSubscriber(userId: string) {
  const context = await resolveOrgContext(userId);
  if (context?.orgId) return context.orgId;
  const owned = await prisma.business.findFirst({
    where: { ownerId: userId },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  return owned?.id ?? null;
}

async function pauseSupportSlaForPending(
  tx: Prisma.TransactionClient,
  input: { ticketId: string; tenantId: string; actorUserId?: string | null; at: Date }
) {
  const sla = await tx.supportThreadSlaState.findUnique({
    where: { ticketId: input.ticketId },
  });
  if (!sla) return;

  const updateData: Prisma.SupportThreadSlaStateUpdateInput = {};
  const metricsPaused: string[] = [];

  if (sla.nextResponseStatus === "RUNNING") {
    updateData.nextResponseStatus = "PAUSED";
    updateData.nextResponsePausedAt = input.at;
    metricsPaused.push("nextResponse");
  }
  if (sla.resolutionStatus === "RUNNING") {
    updateData.resolutionStatus = "PAUSED";
    updateData.resolutionPausedAt = input.at;
    metricsPaused.push("resolution");
  }

  if (!Object.keys(updateData).length) return;
  await tx.supportThreadSlaState.update({
    where: { ticketId: input.ticketId },
    data: updateData,
  });
  await appendSupportTimelineEvent(tx, {
    ticketId: input.ticketId,
    tenantId: input.tenantId,
    actorAdminId: input.actorUserId ?? null,
    eventType: "SLA_PAUSED",
    createdAt: input.at,
    metadata: { metrics: metricsPaused },
  });
}

async function resumeSupportSlaForOpen(
  tx: Prisma.TransactionClient,
  input: { ticketId: string; tenantId: string; actorUserId?: string | null; at: Date }
) {
  const sla = await tx.supportThreadSlaState.findUnique({
    where: { ticketId: input.ticketId },
  });
  if (!sla) return;

  const updateData: Prisma.SupportThreadSlaStateUpdateInput = {};
  const metricsResumed: string[] = [];
  let pausedSecondsDelta = 0;

  if (sla.nextResponseStatus === "PAUSED" && sla.nextResponsePausedAt) {
    const deltaSeconds = getPauseDurationSeconds(sla.nextResponsePausedAt, input.at);
    pausedSecondsDelta += deltaSeconds;
    updateData.nextResponseStatus = "RUNNING";
    updateData.nextResponsePausedAt = null;
    if (sla.nextResponseDueAt) {
      updateData.nextResponseDueAt = new Date(sla.nextResponseDueAt.getTime() + deltaSeconds * 1000);
    }
    metricsResumed.push("nextResponse");
  }
  if (sla.resolutionStatus === "PAUSED" && sla.resolutionPausedAt) {
    const deltaSeconds = getPauseDurationSeconds(sla.resolutionPausedAt, input.at);
    pausedSecondsDelta += deltaSeconds;
    updateData.resolutionStatus = "RUNNING";
    updateData.resolutionPausedAt = null;
    if (sla.resolutionDueAt) {
      updateData.resolutionDueAt = new Date(sla.resolutionDueAt.getTime() + deltaSeconds * 1000);
    }
    metricsResumed.push("resolution");
  }

  if (!Object.keys(updateData).length) return;
  if (pausedSecondsDelta > 0) {
    updateData.totalPausedSeconds = { increment: pausedSecondsDelta };
  }
  await tx.supportThreadSlaState.update({
    where: { ticketId: input.ticketId },
    data: updateData,
  });
  await appendSupportTimelineEvent(tx, {
    ticketId: input.ticketId,
    tenantId: input.tenantId,
    actorAdminId: input.actorUserId ?? null,
    eventType: "SLA_RESUMED",
    createdAt: input.at,
    metadata: { metrics: metricsResumed },
  });
}

async function stopSupportSlaForResolved(
  tx: Prisma.TransactionClient,
  input: { ticketId: string; tenantId: string; actorUserId?: string | null; at: Date }
) {
  const sla = await tx.supportThreadSlaState.findUnique({
    where: { ticketId: input.ticketId },
  });
  if (!sla) return;

  const updateData: Prisma.SupportThreadSlaStateUpdateInput = {};
  const metricsMet: string[] = [];
  const metricsStopped: string[] = [];
  let pausedSecondsDelta = 0;

  if (sla.resolutionStatus !== "MET" && sla.resolutionStatus !== "BREACHED") {
    updateData.resolutionStatus = "MET";
    updateData.resolutionMetAt = input.at;
    metricsMet.push("resolution");
  }
  if (sla.firstResponseStatus === "RUNNING" || sla.firstResponseStatus === "PAUSED") {
    updateData.firstResponseStatus = "STOPPED";
    metricsStopped.push("firstResponse");
  }
  if (sla.nextResponseStatus === "RUNNING" || sla.nextResponseStatus === "PAUSED") {
    updateData.nextResponseStatus = "STOPPED";
    metricsStopped.push("nextResponse");
  }
  if (sla.nextResponsePausedAt) {
    pausedSecondsDelta += getPauseDurationSeconds(sla.nextResponsePausedAt, input.at);
    updateData.nextResponsePausedAt = null;
  }
  if (sla.resolutionPausedAt) {
    pausedSecondsDelta += getPauseDurationSeconds(sla.resolutionPausedAt, input.at);
    updateData.resolutionPausedAt = null;
  }
  if (pausedSecondsDelta > 0) {
    updateData.totalPausedSeconds = { increment: pausedSecondsDelta };
  }
  if (!Object.keys(updateData).length) return;

  await tx.supportThreadSlaState.update({
    where: { ticketId: input.ticketId },
    data: updateData,
  });
  if (metricsMet.length > 0) {
    await appendSupportTimelineEvent(tx, {
      ticketId: input.ticketId,
      tenantId: input.tenantId,
      actorAdminId: input.actorUserId ?? null,
      eventType: "SLA_MET",
      createdAt: input.at,
      metadata: { metrics: metricsMet },
    });
  }
  if (metricsStopped.length > 0) {
    await appendSupportTimelineEvent(tx, {
      ticketId: input.ticketId,
      tenantId: input.tenantId,
      actorAdminId: input.actorUserId ?? null,
      eventType: "SLA_PAUSED",
      createdAt: input.at,
      metadata: { reason: "resolved", metrics: metricsStopped },
    });
  }
}

async function restartSupportSlaForReopen(
  tx: Prisma.TransactionClient,
  input: {
    ticketId: string;
    tenantId: string;
    priority: SupportThreadPriority;
    at: Date;
    actorUserId?: string | null;
  }
) {
  const sla = await tx.supportThreadSlaState.findUnique({
    where: { ticketId: input.ticketId },
  });
  if (!sla) return;

  const policy = getSlaPolicyMinutes(input.priority);
  await tx.supportThreadSlaState.update({
    where: { ticketId: input.ticketId },
    data: {
      nextResponseBaselineCustomerMessageAt: input.at,
      nextResponseDueAt: addMinutes(input.at, policy.nextResponse),
      nextResponseMetAt: null,
      nextResponseBreachedAt: null,
      nextResponseStatus: "RUNNING",
      nextResponsePausedAt: null,
      resolutionDueAt: addMinutes(input.at, policy.resolution),
      resolutionMetAt: null,
      resolutionBreachedAt: null,
      resolutionStatus: "RUNNING",
      resolutionPausedAt: null,
    },
  });
  await appendSupportTimelineEvent(tx, {
    ticketId: input.ticketId,
    tenantId: input.tenantId,
    actorAdminId: input.actorUserId ?? null,
    eventType: "SLA_RESUMED",
    createdAt: input.at,
    metadata: { reason: "reopened", metrics: ["nextResponse", "resolution"] },
  });
}

async function appendSubscriberStatusChange(
  tx: Prisma.TransactionClient,
  input: {
    ticketId: string;
    tenantId: string;
    subscriberId: string;
    previousStatus: SupportThreadStatus;
    nextStatus: SupportThreadStatus;
    at: Date;
  }
) {
  await appendSupportTimelineEvent(tx, {
    ticketId: input.ticketId,
    tenantId: input.tenantId,
    actorAdminId: null,
    eventType: "STATUS_CHANGED",
    createdAt: input.at,
    metadata: {
      previousStatus: input.previousStatus,
      nextStatus: input.nextStatus,
      actorType: "SUBSCRIBER",
      subscriberId: input.subscriberId,
    },
  });
  await tx.auditLog.create({
    data: {
      userId: input.subscriberId,
      orgId: input.tenantId,
      action: "SUPPORT_STATUS_CHANGED",
      actionType: "SUPPORT_STATUS_CHANGED",
      metadata: {
        ticketId: input.ticketId,
        previousStatus: input.previousStatus,
        nextStatus: input.nextStatus,
        actorType: "SUBSCRIBER",
      },
    },
  });
}

async function markSupportSlaBreachesOnRead(
  tx: Prisma.TransactionClient,
  input: { ticketId: string; tenantId: string; assigneeAdminId?: string | null; at?: Date }
) {
  const now = input.at || new Date();
  const sla = await tx.supportThreadSlaState.findUnique({
    where: { ticketId: input.ticketId },
  });
  if (!sla) return null;

  const updateData: Prisma.SupportThreadSlaStateUpdateInput = {};
  const breachedMetrics: string[] = [];
  if (
    sla.firstResponseStatus === "RUNNING" &&
    !sla.firstResponseMetAt &&
    !sla.firstResponseBreachedAt &&
    sla.firstResponseDueAt &&
    now > sla.firstResponseDueAt
  ) {
    updateData.firstResponseStatus = "BREACHED";
    updateData.firstResponseBreachedAt = now;
    breachedMetrics.push("firstResponse");
  }
  if (
    sla.nextResponseStatus === "RUNNING" &&
    !sla.nextResponseMetAt &&
    !sla.nextResponseBreachedAt &&
    sla.nextResponseDueAt &&
    now > sla.nextResponseDueAt
  ) {
    updateData.nextResponseStatus = "BREACHED";
    updateData.nextResponseBreachedAt = now;
    breachedMetrics.push("nextResponse");
  }
  if (
    sla.resolutionStatus === "RUNNING" &&
    !sla.resolutionMetAt &&
    !sla.resolutionBreachedAt &&
    sla.resolutionDueAt &&
    now > sla.resolutionDueAt
  ) {
    updateData.resolutionStatus = "BREACHED";
    updateData.resolutionBreachedAt = now;
    breachedMetrics.push("resolution");
  }

  if (!Object.keys(updateData).length) return sla;
  const updated = await tx.supportThreadSlaState.update({
    where: { ticketId: input.ticketId },
    data: updateData,
  });
  await appendSupportTimelineEvent(tx, {
    ticketId: input.ticketId,
    tenantId: input.tenantId,
    eventType: "SLA_BREACHED",
    createdAt: now,
    metadata: { metrics: breachedMetrics },
  });
  await createAdminNotificationFromEvent(
    {
      eventType: "SLA_BREACH",
      tenantId: input.tenantId,
      entityId: input.ticketId,
      assigneeAdminId: input.assigneeAdminId ?? null,
      payload: {
        ticketId: input.ticketId,
        metrics: breachedMetrics,
        assigneeAdminId: input.assigneeAdminId ?? null,
      },
      occurredAt: now,
    },
    { tx }
  );
  return updated;
}

export async function createSupportThreadTicket(input: {
  subscriberId: string;
  workspaceId: string;
  subject: string;
  content: string;
  priority?: string | null;
  attachments?: JsonAttachments;
}) {
  const now = new Date();
  const priority = normalizeSupportPriority(input.priority);
  return prisma.$transaction(async (tx) => {
    const ticket = await tx.supportThreadTicket.create({
      data: {
        subscriberId: input.subscriberId,
        workspaceId: input.workspaceId,
        subject: input.subject,
        status: "OPEN",
        priority,
        lastActivityAt: now,
        adminUnreadCount: 1,
      },
    });

    const rootMessage = await tx.supportThreadMessage.create({
      data: {
        ticketId: ticket.id,
        senderType: "SUBSCRIBER",
        senderId: input.subscriberId,
        channel: "APP",
        content: input.content,
        attachments: input.attachments,
        deliveryStatus: "DELIVERED",
        createdAt: now,
      },
    });

    await initializeSupportSlaState(tx, {
      ticketId: ticket.id,
      tenantId: ticket.workspaceId,
      priority: ticket.priority,
      createdAt: now,
    });

    await appendSupportTimelineEvent(tx, {
      ticketId: ticket.id,
      tenantId: ticket.workspaceId,
      actorAdminId: input.subscriberId,
      eventType: "TICKET_CREATED",
      createdAt: now,
      metadata: {
        priority: ticket.priority,
      },
    });

    await tx.auditLog.create({
      data: {
        userId: input.subscriberId,
        orgId: input.workspaceId,
        action: "SUPPORT_TICKET_CREATED",
        actionType: "SUPPORT_TICKET_CREATED",
        metadata: {
          ticketId: ticket.id,
          priority,
        },
      },
    });

    await emitSystemEvent(
      {
        tenantId: ticket.workspaceId,
        userId: ticket.subscriberId,
        actorId: input.subscriberId,
        eventType: "ticket_created",
        severity: "INFO",
        source: "SUPPORT",
        entityType: "support_ticket",
        entityId: ticket.id,
        message: "Support ticket created.",
        metadata: {
          subject: ticket.subject,
          priority: ticket.priority,
        },
      },
      { tx }
    );

    return {
      ticket,
      rootMessageId: rootMessage.id,
    };
  });
}

export async function listSupportTicketsForSubscriber(
  subscriberId: string,
  options?: { take?: number }
) {
  const take =
    typeof options?.take === "number" && Number.isFinite(options.take)
      ? Math.max(1, Math.min(100, Math.floor(options.take)))
      : undefined;

  return prisma.supportThreadTicket.findMany({
    where: { subscriberId },
    ...(take ? { take } : {}),
    orderBy: { lastActivityAt: "desc" },
    include: {
      messages: {
        orderBy: { createdAt: "asc" },
      },
    },
  });
}

export async function listSupportTicketsForSubscriberPaged(input: {
  subscriberId: string;
  take?: number;
  cursor?: { lastActivityAt: Date; id: string } | null;
  status?: string | null;
  search?: string | null;
  sort?: string | null;
}) {
  const take =
    typeof input.take === "number" && Number.isFinite(input.take)
      ? Math.max(1, Math.min(100, Math.floor(input.take)))
      : 20;

  const sort = String(input.sort || "NEWEST").trim().toUpperCase();
  const newestFirst = sort !== "OLDEST";
  const where = buildSubscriberSupportTicketWhereInput({
    subscriberId: input.subscriberId,
    cursor: input.cursor,
    newestFirst,
    status: input.status,
    search: input.search,
  });

  const items = await prisma.supportThreadTicket.findMany({
    where,
    take: take + 1,
    orderBy: newestFirst ? [{ lastActivityAt: "desc" }, { id: "desc" }] : [{ lastActivityAt: "asc" }, { id: "asc" }],
    include: {
      messages: {
        orderBy: { createdAt: "asc" },
      },
    },
  });

  const hasMore = items.length > take;
  const slice = hasMore ? items.slice(0, take) : items;
  const lastItem = slice[slice.length - 1] ?? null;

  return {
    items: slice,
    nextCursor: hasMore && lastItem
      ? {
          lastActivityAt: lastItem.lastActivityAt,
          id: lastItem.id,
        }
      : null,
  };
}

export async function findSupportTicketForSubscriber(ticketId: string, subscriberId: string) {
  return prisma.supportThreadTicket.findFirst({
    where: {
      id: ticketId,
      subscriberId,
    },
    include: {
      messages: {
        orderBy: { createdAt: "asc" },
      },
      notes: {
        orderBy: { createdAt: "asc" },
      },
    },
  });
}

export async function listSupportTicketsForAdmin(input: {
  status?: string | null;
  priority?: string | null;
  assigned?: string | null;
  search?: string | null;
  adminUserId?: string | null;
  workspaceId?: string | null;
}) {
  if (input.adminUserId) {
    await assertSupportAdminActor(input.adminUserId);
  }
  const where: Prisma.SupportThreadTicketWhereInput = {};
  if (input.workspaceId) where.workspaceId = input.workspaceId;
  if (input.status && input.status.toUpperCase() !== "ALL") {
    where.status = normalizeSupportStatus(input.status);
  }
  if (input.priority && input.priority.toUpperCase() !== "ALL") {
    where.priority = normalizeSupportPriority(input.priority);
  }
  const assigned = String(input.assigned || "").trim().toLowerCase();
  if (assigned === "me" && input.adminUserId) where.assignedAdminId = input.adminUserId;
  if (assigned === "unassigned") where.assignedAdminId = null;

  const search = String(input.search || "").trim();
  if (search) {
    where.OR = [
      { subject: { contains: search, mode: "insensitive" } },
      { subscriber: { email: { contains: search, mode: "insensitive" } } },
      { subscriber: { name: { contains: search, mode: "insensitive" } } },
      {
        messages: {
          some: {
            content: { contains: search, mode: "insensitive" },
          },
        },
      },
    ];
  }

  return prisma.supportThreadTicket.findMany({
    where,
    orderBy: [{ adminUnreadCount: "desc" }, { lastActivityAt: "desc" }],
    include: {
      subscriber: { select: { id: true, name: true, email: true, publicId: true } },
      assignedAdmin: { select: { id: true, name: true, email: true } },
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });
}

export async function listSupportTicketsForAdminPaged(input: {
  status?: string | null;
  priority?: string | null;
  assigned?: string | null;
  search?: string | null;
  adminUserId?: string | null;
  workspaceId?: string | null;
  sort?: string | null;
  page?: number | null;
  pageSize?: number | null;
}) {
  if (input.adminUserId) {
    await assertSupportAdminActor(input.adminUserId);
  }
  const where: Prisma.SupportThreadTicketWhereInput = {};
  if (input.workspaceId) where.workspaceId = input.workspaceId;
  if (input.status && input.status.toUpperCase() !== "ALL") {
    where.status = normalizeSupportStatus(input.status);
  }
  if (input.priority && input.priority.toUpperCase() !== "ALL") {
    where.priority = normalizeSupportPriority(input.priority);
  }
  const assigned = String(input.assigned || "").trim().toLowerCase();
  if (assigned === "me" && input.adminUserId) where.assignedAdminId = input.adminUserId;
  if (assigned === "unassigned") where.assignedAdminId = null;
  if (assigned.startsWith("user:")) {
    const specificAssigneeId = assigned.replace("user:", "").trim();
    if (specificAssigneeId) where.assignedAdminId = specificAssigneeId;
  }

  const search = String(input.search || "").trim();
  if (search) {
    where.OR = [
      { subject: { contains: search, mode: "insensitive" } },
      { subscriber: { email: { contains: search, mode: "insensitive" } } },
      { subscriber: { name: { contains: search, mode: "insensitive" } } },
      {
        messages: {
          some: {
            content: { contains: search, mode: "insensitive" },
          },
        },
      },
    ];
  }

  const page = Math.max(1, Number(input.page || 1));
  const pageSize = Math.min(100, Math.max(1, Number(input.pageSize || 20)));
  const skip = (page - 1) * pageSize;
  const sort = String(input.sort || "NEWEST").trim().toUpperCase();
  const orderBy =
    sort === "OLDEST"
      ? [{ lastActivityAt: "asc" as const }]
      : [{ lastActivityAt: "desc" as const }];

  const [total, tickets] = await prisma.$transaction([
    prisma.supportThreadTicket.count({ where }),
    prisma.supportThreadTicket.findMany({
      where,
      skip,
      take: pageSize,
      orderBy,
      include: {
        subscriber: { select: { id: true, name: true, email: true, publicId: true } },
        assignedAdmin: { select: { id: true, name: true, email: true } },
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { content: true },
        },
      },
    }),
  ]);

  const totalPages = total === 0 ? 1 : Math.ceil(total / pageSize);

  return {
    items: tickets.map((ticket) => ({
      ...ticket,
      latestMessagePreview: String(ticket.messages[0]?.content || "").replace(/\s+/g, " ").trim(),
      version: ticket.version,
    })),
    pagination: {
      total,
      page,
      pageSize,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    },
  };
}

export async function getSupportTicketForAdmin(ticketId: string, workspaceId?: string | null, actorUserId?: string | null) {
  if (actorUserId) {
    await assertSupportAdminActor(actorUserId);
  }
  return prisma.$transaction(async (tx) => {
    const ticket = await tx.supportThreadTicket.findFirst({
      where: {
        id: ticketId,
        ...(workspaceId ? { workspaceId } : {}),
      },
      include: {
        subscriber: { select: { id: true, name: true, email: true, publicId: true, createdAt: true } },
        assignedAdmin: { select: { id: true, name: true, email: true } },
        messages: {
          orderBy: { createdAt: "asc" },
          include: {
            sender: {
              select: { id: true, name: true, email: true },
            },
          },
        },
        notes: {
          orderBy: { createdAt: "asc" },
          include: {
            admin: {
              select: { id: true, name: true, email: true },
            },
          },
        },
        events: {
          orderBy: { createdAt: "desc" },
          take: 20,
        },
        slaState: true,
      },
    });
    if (!ticket) return null;
    const latestSlaState = await markSupportSlaBreachesOnRead(tx, {
      ticketId: ticket.id,
      tenantId: ticket.workspaceId,
      assigneeAdminId: ticket.assignedAdminId,
    });
    return {
      ...ticket,
      slaState: latestSlaState || ticket.slaState,
    };
  });
}

export async function markSupportTicketReadByAdmin(input: {
  ticketId: string;
  actorUserId: string;
  workspaceId?: string | null;
}) {
  await assertSupportAdminActor(input.actorUserId);
  const ticket = await prisma.supportThreadTicket.findFirst({
    where: {
      id: input.ticketId,
      ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
    },
    select: { id: true, workspaceId: true, adminUnreadCount: true },
  });
  if (!ticket || ticket.adminUnreadCount <= 0) return null;

  return prisma.$transaction(async (tx) => {
    const updated = await tx.supportThreadTicket.update({
      where: { id: ticket.id },
      data: {
        adminUnreadCount: 0,
      },
    });
    await tx.auditLog.create({
      data: {
        userId: input.actorUserId,
        orgId: ticket.workspaceId,
        action: "SUPPORT_ADMIN_READ",
        actionType: "SUPPORT_ADMIN_READ",
        metadata: {
          ticketId: ticket.id,
        },
      },
    });
    return updated;
  });
}

export async function updateSupportTicket(input: {
  ticketId: string;
  actorUserId: string;
  workspaceId?: string | null;
  status?: string | null;
  priority?: string | null;
  assignedAdminId?: string | null;
}) {
  await assertSupportAdminActor(input.actorUserId);
  const data: Prisma.SupportThreadTicketUncheckedUpdateInput = {};
  if (typeof input.status === "string") data.status = normalizeSupportStatus(input.status);
  if (typeof input.priority === "string") data.priority = normalizeSupportPriority(input.priority);
  if (input.assignedAdminId !== undefined) data.assignedAdminId = input.assignedAdminId || null;
  if (!Object.keys(data).length) return null;

  const ticket = await prisma.supportThreadTicket.findFirst({
    where: {
      id: input.ticketId,
      ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
    },
    select: { id: true, workspaceId: true },
  });
  if (!ticket) return null;

  return prisma.$transaction(async (tx) => {
    const updated = await tx.supportThreadTicket.update({
      where: { id: ticket.id },
      data: {
        ...data,
        lastActivityAt: new Date(),
      },
    });

    await tx.auditLog.create({
      data: {
        userId: input.actorUserId,
        orgId: updated.workspaceId,
        action: "SUPPORT_TICKET_UPDATED",
        actionType: "SUPPORT_TICKET_UPDATED",
        metadata: {
          ticketId: updated.id,
          status: updated.status,
          priority: updated.priority,
          assignedAdminId: updated.assignedAdminId,
        },
      },
    });
    return updated;
  });
}

function isSlaEligibleForRecompute(status: SupportSlaMetricStatus) {
  return status === "RUNNING" || status === "PAUSED";
}

async function recomputeSupportSlaDueAtForPriority(
  tx: Prisma.TransactionClient,
  input: {
    ticketId: string;
    tenantId: string;
    priority: SupportThreadPriority;
  }
) {
  const sla = await tx.supportThreadSlaState.findUnique({
    where: { ticketId: input.ticketId },
  });
  if (!sla) return null;
  const policy = getSlaPolicyMinutes(input.priority);
  const baseline = sla.nextResponseBaselineCustomerMessageAt || new Date();
  const updateData: Prisma.SupportThreadSlaStateUpdateInput = {};
  if (isSlaEligibleForRecompute(sla.firstResponseStatus) && !sla.firstResponseMetAt && !sla.firstResponseBreachedAt) {
    updateData.firstResponseDueAt = addMinutes(baseline, policy.firstResponse);
  }
  if (isSlaEligibleForRecompute(sla.nextResponseStatus) && !sla.nextResponseMetAt && !sla.nextResponseBreachedAt) {
    updateData.nextResponseDueAt = addMinutes(baseline, policy.nextResponse);
  }
  if (isSlaEligibleForRecompute(sla.resolutionStatus) && !sla.resolutionMetAt && !sla.resolutionBreachedAt) {
    updateData.resolutionDueAt = addMinutes(baseline, policy.resolution);
  }
  if (!Object.keys(updateData).length) return sla;
  return tx.supportThreadSlaState.update({
    where: { ticketId: input.ticketId },
    data: updateData,
  });
}

export async function updateSupportTicketStatusForAdmin(input: {
  ticketId: string;
  actorUserId: string;
  status: string;
  expectedVersion: number;
  workspaceId?: string | null;
}) {
  await assertSupportAdminActor(input.actorUserId);
  const nextStatus = normalizeSupportStatus(input.status);
  return prisma.$transaction(async (tx) => {
    const ticket = await tx.supportThreadTicket.findFirst({
      where: {
        id: input.ticketId,
        ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
      },
      select: {
        id: true,
        workspaceId: true,
        status: true,
        priority: true,
        version: true,
      },
    });
    if (!ticket) return { ok: false as const, reason: "NOT_FOUND" as const };
    if (ticket.version !== input.expectedVersion) return { ok: false as const, reason: "CONFLICT" as const };

    const now = new Date();
    const updatedCount = await tx.supportThreadTicket.updateMany({
      where: { id: ticket.id, version: input.expectedVersion },
      data: {
        status: nextStatus,
        lastActivityAt: now,
        version: { increment: 1 },
      },
    });
    if (updatedCount.count === 0) return { ok: false as const, reason: "CONFLICT" as const };

    if (nextStatus === "PENDING") {
      await pauseSupportSlaForPending(tx, {
        ticketId: ticket.id,
        tenantId: ticket.workspaceId,
        actorUserId: input.actorUserId,
        at: now,
      });
    } else if (nextStatus === "OPEN") {
      if (ticket.status === "CLOSED") {
        await restartSupportSlaForReopen(tx, {
          ticketId: ticket.id,
          tenantId: ticket.workspaceId,
          priority: ticket.priority,
          actorUserId: input.actorUserId,
          at: now,
        });
      } else {
        await resumeSupportSlaForOpen(tx, {
          ticketId: ticket.id,
          tenantId: ticket.workspaceId,
          actorUserId: input.actorUserId,
          at: now,
        });
      }
    } else if (nextStatus === "CLOSED") {
      await stopSupportSlaForResolved(tx, {
        ticketId: ticket.id,
        tenantId: ticket.workspaceId,
        actorUserId: input.actorUserId,
        at: now,
      });
    }

    await appendSupportTimelineEvent(tx, {
      ticketId: ticket.id,
      tenantId: ticket.workspaceId,
      actorAdminId: input.actorUserId,
      eventType: "STATUS_CHANGED",
      createdAt: now,
      metadata: { previousStatus: ticket.status, nextStatus },
    });

    await tx.auditLog.create({
      data: {
        userId: input.actorUserId,
        orgId: ticket.workspaceId,
        action: "SUPPORT_STATUS_CHANGED",
        actionType: "SUPPORT_STATUS_CHANGED",
        metadata: {
          ticketId: ticket.id,
          previousStatus: ticket.status,
          nextStatus,
        },
      },
    });

    const updated = await tx.supportThreadTicket.findUnique({
      where: { id: ticket.id },
      include: {
        subscriber: { select: { id: true, name: true, email: true, publicId: true, createdAt: true } },
        assignedAdmin: { select: { id: true, name: true, email: true } },
        messages: {
          orderBy: { createdAt: "asc" },
          include: {
            sender: {
              select: { id: true, name: true, email: true },
            },
          },
        },
        notes: {
          orderBy: { createdAt: "asc" },
          include: {
            admin: {
              select: { id: true, name: true, email: true },
            },
          },
        },
        events: {
          orderBy: { createdAt: "desc" },
          take: 20,
        },
        slaState: true,
      },
    });
    return { ok: true as const, ticket: updated };
  });
}

export async function reopenSupportTicketForSubscriber(input: {
  ticketId: string;
  subscriberId: string;
  expectedVersion?: number | null;
  workspaceId?: string | null;
}) {
  return prisma.$transaction(async (tx) => {
    const ticket = await tx.supportThreadTicket.findFirst({
      where: {
        id: input.ticketId,
        subscriberId: input.subscriberId,
        ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
      },
      select: {
        id: true,
        workspaceId: true,
        status: true,
        version: true,
        priority: true,
      },
    });

    if (!ticket) return { ok: false as const, reason: "NOT_FOUND" as const };
    if (ticket.status !== "CLOSED") return { ok: false as const, reason: "NOT_CLOSED" as const };
    if (typeof input.expectedVersion === "number" && ticket.version !== input.expectedVersion) {
      return { ok: false as const, reason: "CONFLICT" as const };
    }

    const now = new Date();
    const updatedCount = await tx.supportThreadTicket.updateMany({
      where: {
        id: ticket.id,
        subscriberId: input.subscriberId,
        ...(typeof input.expectedVersion === "number" ? { version: input.expectedVersion } : { version: ticket.version }),
      },
      data: {
        status: "OPEN",
        lastActivityAt: now,
        version: { increment: 1 },
        subscriberUnreadCount: 0,
        adminUnreadCount: { increment: 1 },
      },
    });

    if (updatedCount.count === 0) return { ok: false as const, reason: "CONFLICT" as const };

    await restartSupportSlaForReopen(tx, {
      ticketId: ticket.id,
      tenantId: ticket.workspaceId,
      priority: ticket.priority,
      actorUserId: input.subscriberId,
      at: now,
    });
    await appendSubscriberStatusChange(tx, {
      ticketId: ticket.id,
      tenantId: ticket.workspaceId,
      subscriberId: input.subscriberId,
      previousStatus: ticket.status,
      nextStatus: "OPEN",
      at: now,
    });

    const updated = await tx.supportThreadTicket.findUnique({
      where: { id: ticket.id },
      include: {
        messages: {
          orderBy: { createdAt: "asc" },
        },
        notes: {
          orderBy: { createdAt: "asc" },
        },
      },
    });

    return { ok: true as const, ticket: updated };
  });
}

export async function updateSupportTicketPriorityForAdmin(input: {
  ticketId: string;
  actorUserId: string;
  priority: string;
  expectedVersion: number;
  workspaceId?: string | null;
}) {
  await assertSupportAdminActor(input.actorUserId);
  const nextPriority = normalizeSupportPriority(input.priority);
  return prisma.$transaction(async (tx) => {
    const ticket = await tx.supportThreadTicket.findFirst({
      where: {
        id: input.ticketId,
        ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
      },
      select: {
        id: true,
        workspaceId: true,
        priority: true,
        version: true,
      },
    });
    if (!ticket) return { ok: false as const, reason: "NOT_FOUND" as const };
    if (ticket.version !== input.expectedVersion) return { ok: false as const, reason: "CONFLICT" as const };

    const now = new Date();
    const updatedCount = await tx.supportThreadTicket.updateMany({
      where: { id: ticket.id, version: input.expectedVersion },
      data: {
        priority: nextPriority,
        lastActivityAt: now,
        version: { increment: 1 },
      },
    });
    if (updatedCount.count === 0) return { ok: false as const, reason: "CONFLICT" as const };

    await recomputeSupportSlaDueAtForPriority(tx, {
      ticketId: ticket.id,
      tenantId: ticket.workspaceId,
      priority: nextPriority,
    });

    await appendSupportTimelineEvent(tx, {
      ticketId: ticket.id,
      tenantId: ticket.workspaceId,
      actorAdminId: input.actorUserId,
      eventType: "PRIORITY_CHANGED",
      createdAt: now,
      metadata: { previousPriority: ticket.priority, nextPriority },
    });

    await tx.auditLog.create({
      data: {
        userId: input.actorUserId,
        orgId: ticket.workspaceId,
        action: "SUPPORT_PRIORITY_CHANGED",
        actionType: "SUPPORT_PRIORITY_CHANGED",
        metadata: {
          ticketId: ticket.id,
          previousPriority: ticket.priority,
          nextPriority,
        },
      },
    });

    const updated = await tx.supportThreadTicket.findUnique({
      where: { id: ticket.id },
      include: {
        subscriber: { select: { id: true, name: true, email: true, publicId: true, createdAt: true } },
        assignedAdmin: { select: { id: true, name: true, email: true } },
        messages: {
          orderBy: { createdAt: "asc" },
          include: {
            sender: {
              select: { id: true, name: true, email: true },
            },
          },
        },
        notes: {
          orderBy: { createdAt: "asc" },
          include: {
            admin: {
              select: { id: true, name: true, email: true },
            },
          },
        },
        events: {
          orderBy: { createdAt: "desc" },
          take: 20,
        },
        slaState: true,
      },
    });
    return { ok: true as const, ticket: updated };
  });
}

export async function assignSupportTicketForAdmin(input: {
  ticketId: string;
  actorUserId: string;
  assigneeId: string | null;
  expectedVersion?: number | null;
  workspaceId?: string | null;
}) {
  await assertSupportAdminActor(input.actorUserId);
  if (input.assigneeId) {
    const assignee = await prisma.user.findFirst({
      where: {
        id: input.assigneeId,
        status: "ACTIVE",
        role: {
          in: ["OPS_ADMIN"],
        },
      },
      select: { id: true },
    });
    if (!assignee) {
      return { ok: false as const, reason: "ASSIGNEE_NOT_FOUND" as const };
    }
  }

  return prisma.$transaction(async (tx) => {
    const ticket = await tx.supportThreadTicket.findFirst({
      where: {
        id: input.ticketId,
        ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
      },
      select: {
        id: true,
        workspaceId: true,
        assignedAdminId: true,
        version: true,
      },
    });

    if (!ticket) {
      return { ok: false as const, reason: "NOT_FOUND" as const };
    }

    if (typeof input.expectedVersion === "number" && ticket.version !== input.expectedVersion) {
      return { ok: false as const, reason: "CONFLICT" as const };
    }

    const now = new Date();
    const updatedCount = await tx.supportThreadTicket.updateMany({
      where: {
        id: ticket.id,
        ...(typeof input.expectedVersion === "number" ? { version: input.expectedVersion } : {}),
      },
      data: {
        assignedAdminId: input.assigneeId,
        lastActivityAt: now,
        version: { increment: 1 },
      },
    });

    if (updatedCount.count === 0) {
      return { ok: false as const, reason: "CONFLICT" as const };
    }

    const updated = await tx.supportThreadTicket.findUnique({
      where: { id: ticket.id },
      include: {
        subscriber: { select: { id: true, name: true, email: true, publicId: true } },
        assignedAdmin: { select: { id: true, name: true, email: true } },
      },
    });

    await tx.auditLog.create({
      data: {
        userId: input.actorUserId,
        orgId: ticket.workspaceId,
        action: "SUPPORT_TICKET_ASSIGNED",
        actionType: "SUPPORT_TICKET_ASSIGNED",
        metadata: {
          ticketId: ticket.id,
          previousAssigneeId: ticket.assignedAdminId,
          nextAssigneeId: input.assigneeId,
        },
      },
    });
    await appendSupportTimelineEvent(tx, {
      ticketId: ticket.id,
      tenantId: ticket.workspaceId,
      actorAdminId: input.actorUserId,
      eventType: "ASSIGNEE_CHANGED",
      createdAt: now,
      metadata: {
        previousAssigneeId: ticket.assignedAdminId,
        nextAssigneeId: input.assigneeId,
      },
    });
    if (input.assigneeId) {
      await createAdminNotificationFromEvent(
        {
          eventType: "SUPPORT_TICKET_ASSIGNED",
          tenantId: ticket.workspaceId,
          entityId: ticket.id,
          assigneeAdminId: input.assigneeId,
          payload: {
            ticketId: ticket.id,
            previousAssigneeId: ticket.assignedAdminId,
            nextAssigneeId: input.assigneeId,
          },
          occurredAt: now,
        },
        { tx }
      );
    }

    return {
      ok: true as const,
      ticket: updated
        ? {
            ...updated,
            version: updated.version,
          }
        : null,
    };
  });
}

export async function createAdminReplyForSupportTicket(input: {
  ticketId: string;
  actorUserId: string;
  message: string;
  attachments?: JsonAttachments;
  channel?: SupportMessageChannel;
  messageIdHeader?: string | null;
  inReplyToHeader?: string | null;
  referencesHeader?: string | null;
  deliveryStatus?: SupportDeliveryStatus;
  errorMessage?: string | null;
  expectedVersion?: number | null;
  reassignToAdminId?: string | null;
  workspaceId?: string | null;
}) {
  await assertSupportAdminActor(input.actorUserId);
  return prisma.$transaction(async (tx) => {
    const ticket = await tx.supportThreadTicket.findFirst({
      where: {
        id: input.ticketId,
        ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
      },
      select: {
        id: true,
        workspaceId: true,
        subscriberId: true,
        assignedAdminId: true,
        firstResponseAt: true,
        archived: true,
        version: true,
      },
    });

    if (!ticket) {
      return { ok: false as const, reason: "NOT_FOUND" as const };
    }
    if (ticket.archived) {
      return { ok: false as const, reason: "ARCHIVED" as const };
    }

    if (typeof input.expectedVersion === "number" && ticket.version !== input.expectedVersion) {
      return { ok: false as const, reason: "CONFLICT" as const };
    }

    const now = new Date();
    const nextAssignee =
      input.reassignToAdminId === undefined ? ticket.assignedAdminId : input.reassignToAdminId;

    const updatedCount = await tx.supportThreadTicket.updateMany({
      where: {
        id: ticket.id,
        ...(typeof input.expectedVersion === "number" ? { version: input.expectedVersion } : {}),
      },
      data: {
        assignedAdminId: nextAssignee,
        lastActivityAt: now,
        version: { increment: 1 },
        subscriberUnreadCount: { increment: 1 },
        adminUnreadCount: 0,
        ...(ticket.firstResponseAt ? {} : { firstResponseAt: now }),
      },
    });

    if (updatedCount.count === 0) {
      return { ok: false as const, reason: "CONFLICT" as const };
    }

    const created = await tx.supportThreadMessage.create({
      data: {
        ticketId: ticket.id,
        senderType: "ADMIN",
        senderId: input.actorUserId,
        channel: input.channel ?? "APP",
        content: input.message,
        attachments: input.attachments,
        messageIdHeader: input.messageIdHeader ?? null,
        inReplyToHeader: input.inReplyToHeader ?? null,
        referencesHeader: input.referencesHeader ?? null,
        deliveryStatus: input.deliveryStatus ?? "DELIVERED",
        errorMessage: input.errorMessage ?? null,
      },
      include: {
        sender: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    if (input.reassignToAdminId !== undefined && ticket.assignedAdminId !== nextAssignee) {
      await tx.auditLog.create({
        data: {
          userId: input.actorUserId,
          orgId: ticket.workspaceId,
          action: "SUPPORT_TICKET_ASSIGNED",
          actionType: "SUPPORT_TICKET_ASSIGNED",
          metadata: {
            ticketId: ticket.id,
            previousAssigneeId: ticket.assignedAdminId,
            nextAssigneeId: nextAssignee,
          },
        },
      });
      await appendSupportTimelineEvent(tx, {
        ticketId: ticket.id,
        tenantId: ticket.workspaceId,
        actorAdminId: input.actorUserId,
        eventType: "ASSIGNEE_CHANGED",
        createdAt: now,
        metadata: {
          previousAssigneeId: ticket.assignedAdminId,
          nextAssigneeId: nextAssignee,
        },
      });
      if (nextAssignee) {
        await createAdminNotificationFromEvent(
          {
            eventType: "SUPPORT_TICKET_ASSIGNED",
            tenantId: ticket.workspaceId,
            entityId: ticket.id,
            assigneeAdminId: nextAssignee,
            payload: {
              ticketId: ticket.id,
              previousAssigneeId: ticket.assignedAdminId,
              nextAssigneeId: nextAssignee,
            },
            occurredAt: now,
          },
          { tx }
        );
      }
    }

    await tx.auditLog.create({
      data: {
        userId: input.actorUserId,
        orgId: ticket.workspaceId,
        action: "SUPPORT_ADMIN_REPLY_SENT",
        actionType: "SUPPORT_ADMIN_REPLY_SENT",
        metadata: {
          ticketId: ticket.id,
          messageId: created.id,
          deliveryStatus: created.deliveryStatus,
        },
      },
    });
    await appendSupportTimelineEvent(tx, {
      ticketId: ticket.id,
      tenantId: ticket.workspaceId,
      actorAdminId: input.actorUserId,
      eventType: "REPLY_SENT",
      createdAt: now,
      metadata: {
        messageId: created.id,
        senderType: "ADMIN",
      },
    });
    await emitSystemEvent(
      {
        tenantId: ticket.workspaceId,
        userId: ticket.subscriberId,
        actorId: input.actorUserId,
        eventType: "ticket_replied",
        severity: "INFO",
        source: "SUPPORT",
        entityType: "support_ticket",
        entityId: ticket.id,
        message: "Support agent replied to ticket.",
        metadata: {
          messageId: created.id,
          senderType: "ADMIN",
        },
      },
      { tx }
    );

    const sla = await tx.supportThreadSlaState.findUnique({
      where: { ticketId: ticket.id },
    });
    if (sla) {
      const slaUpdate: Prisma.SupportThreadSlaStateUpdateInput = {};
      const metMetrics: string[] = [];
      if (sla.firstResponseStatus === "RUNNING" && !sla.firstResponseMetAt && !sla.firstResponseBreachedAt) {
        slaUpdate.firstResponseStatus = "MET";
        slaUpdate.firstResponseMetAt = now;
        metMetrics.push("firstResponse");
      }
      if (sla.nextResponseStatus === "RUNNING" && !sla.nextResponseMetAt && !sla.nextResponseBreachedAt) {
        slaUpdate.nextResponseStatus = "MET";
        slaUpdate.nextResponseMetAt = now;
        metMetrics.push("nextResponse");
      }
      if (Object.keys(slaUpdate).length > 0) {
        await tx.supportThreadSlaState.update({
          where: { ticketId: ticket.id },
          data: slaUpdate,
        });
        await appendSupportTimelineEvent(tx, {
          ticketId: ticket.id,
          tenantId: ticket.workspaceId,
          actorAdminId: input.actorUserId,
          eventType: "SLA_MET",
          createdAt: now,
          metadata: { metrics: metMetrics },
        });
      }
    }

    const updatedTicket = await tx.supportThreadTicket.findUnique({
      where: { id: ticket.id },
      include: {
        subscriber: { select: { id: true, name: true, email: true, publicId: true, createdAt: true } },
        assignedAdmin: { select: { id: true, name: true, email: true } },
      },
    });

    return {
      ok: true as const,
      message: created,
      ticket: updatedTicket
        ? {
            ...updatedTicket,
            version: updatedTicket.version,
          }
        : null,
    };
  });
}

export async function addSupportInternalNote(input: {
  ticketId: string;
  adminId: string;
  content: string;
  attachments?: JsonAttachments;
  expectedVersion?: number | null;
  workspaceId?: string | null;
}) {
  await assertSupportAdminActor(input.adminId);
  return prisma.$transaction(async (tx) => {
    const ticket = await tx.supportThreadTicket.findFirst({
      where: {
        id: input.ticketId,
        ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
      },
      select: { id: true, workspaceId: true, archived: true, version: true },
    });
    if (!ticket) return { ok: false as const, reason: "NOT_FOUND" as const };
    if (ticket.archived) return { ok: false as const, reason: "ARCHIVED" as const };
    if (typeof input.expectedVersion === "number" && ticket.version !== input.expectedVersion) {
      return { ok: false as const, reason: "CONFLICT" as const };
    }

    const now = new Date();
    const ticketUpdate = await tx.supportThreadTicket.updateMany({
      where: {
        id: ticket.id,
        ...(typeof input.expectedVersion === "number" ? { version: input.expectedVersion } : {}),
      },
      data: {
        lastActivityAt: now,
        version: { increment: 1 },
      },
    });
    if (ticketUpdate.count === 0) return { ok: false as const, reason: "CONFLICT" as const };

    const note = await tx.supportThreadInternalNote.create({
      data: {
        ticketId: ticket.id,
        tenantId: ticket.workspaceId,
        adminId: input.adminId,
        content: input.content,
        attachments: input.attachments,
        createdAt: now,
      },
      include: {
        admin: {
          select: { id: true, name: true, email: true },
        },
      },
    });
    await tx.auditLog.create({
      data: {
        userId: input.adminId,
        orgId: ticket.workspaceId,
        action: "SUPPORT_INTERNAL_NOTE_ADDED",
        actionType: "SUPPORT_INTERNAL_NOTE_ADDED",
        metadata: { ticketId: ticket.id, noteId: note.id },
      },
    });
    await appendSupportTimelineEvent(tx, {
      ticketId: ticket.id,
      tenantId: ticket.workspaceId,
      actorAdminId: input.adminId,
      eventType: "NOTE_ADDED",
      createdAt: now,
      metadata: { noteId: note.id },
    });
    const updatedTicket = await tx.supportThreadTicket.findUnique({
      where: { id: ticket.id },
      select: { id: true, version: true, updatedAt: true, lastActivityAt: true },
    });
    return { ok: true as const, note, ticket: updatedTicket };
  });
}

export async function createSupportMessage(input: {
  ticketId: string;
  senderType: SupportSenderType;
  senderId?: string | null;
  channel?: SupportMessageChannel;
  content: string;
  attachments?: JsonAttachments;
  messageIdHeader?: string | null;
  inReplyToHeader?: string | null;
  referencesHeader?: string | null;
  deliveryStatus?: SupportDeliveryStatus;
  errorMessage?: string | null;
  workspaceId?: string | null;
}) {
  const ticket = await prisma.supportThreadTicket.findFirst({
    where: {
      id: input.ticketId,
      ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
    },
    select: {
      id: true,
      subject: true,
      workspaceId: true,
      subscriberId: true,
      subscriber: {
        select: {
          name: true,
          email: true,
        },
      },
      assignedAdminId: true,
      firstResponseAt: true,
      priority: true,
      status: true,
    },
  });
  if (!ticket) return null;

  if (input.messageIdHeader) {
    const duplicate = await prisma.supportThreadMessage.findFirst({
      where: {
        ticketId: ticket.id,
        messageIdHeader: input.messageIdHeader,
      },
      select: { id: true },
    });
    if (duplicate) {
      return { duplicate: true as const, id: duplicate.id };
    }
  }

  return prisma.$transaction(async (tx) => {
    const created = await tx.supportThreadMessage.create({
      data: {
        ticketId: ticket.id,
        senderType: input.senderType,
        senderId: input.senderId ?? null,
        channel: input.channel ?? (input.senderType === "SYSTEM" ? "SYSTEM" : "APP"),
        content: input.content,
        attachments: input.attachments,
        messageIdHeader: input.messageIdHeader ?? null,
        inReplyToHeader: input.inReplyToHeader ?? null,
        referencesHeader: input.referencesHeader ?? null,
        deliveryStatus: input.deliveryStatus ?? "DELIVERED",
        errorMessage: input.errorMessage ?? null,
      },
    });

    const now = created.createdAt;
    await tx.supportThreadTicket.update({
      where: { id: ticket.id },
      data: {
        status: input.senderType === "SUBSCRIBER" ? "OPEN" : undefined,
        firstResponseAt:
          input.senderType === "ADMIN" && !ticket.firstResponseAt ? now : undefined,
        lastActivityAt: now,
        version: { increment: 1 },
        adminUnreadCount:
          input.senderType === "SUBSCRIBER" ? { increment: 1 } : 0,
        subscriberUnreadCount:
          input.senderType === "ADMIN" ? { increment: 1 } : 0,
      },
    });

    if (input.senderType === "SUBSCRIBER" && ticket.status !== "OPEN" && input.senderId) {
      await appendSubscriberStatusChange(tx, {
        ticketId: ticket.id,
        tenantId: ticket.workspaceId,
        subscriberId: input.senderId,
        previousStatus: ticket.status,
        nextStatus: "OPEN",
        at: now,
      });
    }

    await tx.auditLog.create({
      data: {
        userId: input.senderId ?? null,
        orgId: ticket.workspaceId,
        action: input.senderType === "ADMIN" ? "SUPPORT_ADMIN_REPLY_SENT" : "SUPPORT_SUBSCRIBER_REPLY_RECEIVED",
        actionType: input.senderType === "ADMIN" ? "SUPPORT_ADMIN_REPLY_SENT" : "SUPPORT_SUBSCRIBER_REPLY_RECEIVED",
        metadata: {
          ticketId: ticket.id,
          messageId: created.id,
          deliveryStatus: created.deliveryStatus,
        },
      },
    });
    await appendSupportTimelineEvent(tx, {
      ticketId: ticket.id,
      tenantId: ticket.workspaceId,
      actorAdminId: input.senderId ?? null,
      eventType: "REPLY_SENT",
      createdAt: now,
      metadata: {
        messageId: created.id,
        senderType: input.senderType,
        channel: input.channel ?? (input.senderType === "SYSTEM" ? "SYSTEM" : "APP"),
      },
    });

    if (input.senderType === "SUBSCRIBER") {
      const subscriberLabel =
        String(ticket.subscriber?.name || "").trim() ||
        String(ticket.subscriber?.email || "").trim() ||
        "Subscriber";
      const ticketSubject = String(ticket.subject || "").trim() || "support ticket";
      await createAdminNotificationFromEvent(
        {
          eventType: "SUPPORT_SUBSCRIBER_REPLY_RECEIVED",
          tenantId: ticket.workspaceId,
          entityId: ticket.id,
          assigneeAdminId: ticket.assignedAdminId ?? null,
          payload: {
            ticketId: ticket.id,
            ticketSubject,
            subscriberId: ticket.subscriberId,
            subscriberLabel,
            subscriberEmail: ticket.subscriber?.email ?? null,
            channel: input.channel ?? "APP",
          },
          occurredAt: now,
        },
        { tx }
      );
    }

    const sla = await tx.supportThreadSlaState.findUnique({
      where: { ticketId: ticket.id },
    });
    if (sla) {
      if (input.senderType === "SUBSCRIBER") {
        const openMode = getSubscriberSupportOpenMode(ticket.status);
        if (openMode === "RESTART") {
          await restartSupportSlaForReopen(tx, {
            ticketId: ticket.id,
            tenantId: ticket.workspaceId,
            priority: ticket.priority,
            actorUserId: input.senderId ?? null,
            at: now,
          });
        } else {
          if (openMode === "RESUME") {
            await resumeSupportSlaForOpen(tx, {
              ticketId: ticket.id,
              tenantId: ticket.workspaceId,
              actorUserId: input.senderId ?? null,
              at: now,
            });
          }
          const policy = getSlaPolicyMinutes(ticket.priority);
          const nextDueAt = addMinutes(now, policy.nextResponse);
          await tx.supportThreadSlaState.update({
            where: { ticketId: ticket.id },
            data: {
              nextResponseBaselineCustomerMessageAt: now,
              nextResponseDueAt: nextDueAt,
              nextResponseMetAt: null,
              nextResponseBreachedAt: null,
              nextResponseStatus: "RUNNING",
              nextResponsePausedAt: null,
            },
          });
        }
      } else if (input.senderType === "ADMIN") {
        const slaUpdate: Prisma.SupportThreadSlaStateUpdateInput = {};
        const metMetrics: string[] = [];
        if (sla.firstResponseStatus === "RUNNING" && !sla.firstResponseMetAt && !sla.firstResponseBreachedAt) {
          slaUpdate.firstResponseStatus = "MET";
          slaUpdate.firstResponseMetAt = now;
          metMetrics.push("firstResponse");
        }
        if (sla.nextResponseStatus === "RUNNING" && !sla.nextResponseMetAt && !sla.nextResponseBreachedAt) {
          slaUpdate.nextResponseStatus = "MET";
          slaUpdate.nextResponseMetAt = now;
          metMetrics.push("nextResponse");
        }
        if (Object.keys(slaUpdate).length > 0) {
          await tx.supportThreadSlaState.update({
            where: { ticketId: ticket.id },
            data: slaUpdate,
          });
          await appendSupportTimelineEvent(tx, {
            ticketId: ticket.id,
            tenantId: ticket.workspaceId,
            actorAdminId: input.senderId ?? null,
            eventType: "SLA_MET",
            createdAt: now,
            metadata: { metrics: metMetrics },
          });
        }
      }
    }

    return created;
  });
}

export async function updateSupportMessageDeliveryState(input: {
  messageId: string;
  deliveryStatus: SupportDeliveryStatus;
  errorMessage?: string | null;
  messageIdHeader?: string | null;
  inReplyToHeader?: string | null;
  referencesHeader?: string | null;
}) {
  return prisma.supportThreadMessage.update({
    where: { id: input.messageId },
    data: {
      deliveryStatus: input.deliveryStatus,
      errorMessage: input.errorMessage ?? null,
      ...(input.messageIdHeader !== undefined ? { messageIdHeader: input.messageIdHeader } : {}),
      ...(input.inReplyToHeader !== undefined ? { inReplyToHeader: input.inReplyToHeader } : {}),
      ...(input.referencesHeader !== undefined ? { referencesHeader: input.referencesHeader } : {}),
    },
  });
}

export async function updateSupportMessageAttachments(input: {
  messageId: string;
  attachments?: JsonAttachments;
}) {
  return prisma.supportThreadMessage.update({
    where: { id: input.messageId },
    data: {
      attachments: input.attachments,
    },
  });
}

export async function listSupportTicketTimeline(input: {
  ticketId: string;
  actorUserId?: string | null;
  workspaceId?: string | null;
  page?: number | null;
  pageSize?: number | null;
}) {
  if (input.actorUserId) {
    await assertSupportAdminActor(input.actorUserId);
  }
  const ticket = await prisma.supportThreadTicket.findFirst({
    where: {
      id: input.ticketId,
      ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
    },
    select: { id: true, workspaceId: true },
  });
  if (!ticket) return null;
  const page = Math.max(1, Number(input.page || 1));
  const pageSize = Math.min(100, Math.max(1, Number(input.pageSize || 20)));
  const skip = (page - 1) * pageSize;

  const [totalCount, items] = await prisma.$transaction([
    prisma.supportThreadEvent.count({
      where: {
        ticketId: ticket.id,
        tenantId: ticket.workspaceId,
      },
    }),
    prisma.supportThreadEvent.findMany({
      where: {
        ticketId: ticket.id,
        tenantId: ticket.workspaceId,
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
    }),
  ]);

  return {
    items,
    totalCount,
    page,
    pageSize,
  };
}

export async function resolveSupportTicketFromInbound(input: {
  subject?: string | null;
  to?: string[];
  ticketId?: string | null;
  inReplyTo?: string | null;
  references?: string[];
}) {
  const ticketIdFromAddress = (input.to || []).map((value) => extractTicketIdFromAddress(value)).find(Boolean) || null;
  const ticketIdFromSubject = extractTicketIdFromSubject(String(input.subject || ""));
  const directId = input.ticketId || ticketIdFromAddress || ticketIdFromSubject;
  if (directId) {
    const ticket = await prisma.supportThreadTicket.findUnique({
      where: { id: directId },
    });
    if (ticket) return ticket;
  }

  const headerCandidates = [input.inReplyTo, ...(input.references || [])]
    .map((value) => String(value || "").trim())
    .filter(Boolean);
  if (!headerCandidates.length) return null;

  const threaded = await prisma.supportThreadMessage.findFirst({
    where: {
      messageIdHeader: {
        in: headerCandidates,
      },
    },
    orderBy: { createdAt: "desc" },
    include: {
      ticket: true,
    },
  });

  return threaded?.ticket ?? null;
}
