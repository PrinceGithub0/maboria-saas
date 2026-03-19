import "server-only";

import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { logUserActivity } from "@/lib/user-activity";

const ROOT_SUPER_ADMIN_SETTING = "PLATFORM_ROOT_ADMIN_USER_ID";
export const IMPERSONATION_COOKIE_NAME = "maboria_impersonation_session";
export const IMPERSONATION_TTL_SECONDS = 15 * 60;

type PlatformRole = "SUPER_ADMIN" | "OPS_ADMIN" | "USER";

export type ResolvedAuthPlaneContext = {
  actorUserId: string;
  actorGlobalRole: PlatformRole;
  effectiveUserId: string;
  effectiveTenantId: string | null;
  effectiveGlobalRole: PlatformRole;
  isImpersonating: boolean;
  impersonationSessionId?: string;
  impersonationExpiresAt?: Date;
};

class ImpersonationError extends Error {
  status: number;
  code: string;

  constructor(status: number, message: string, code = "FORBIDDEN") {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function normalizeStoredRole(value?: string | null) {
  const normalized = String(value || "").trim().toUpperCase();
  if (normalized === "SUPER_ADMIN") return "SUPER_ADMIN";
  if (normalized === "OPS_ADMIN") return "OPS_ADMIN";
  return "USER";
}

function parseCookieValue(cookieHeader?: string | null, key?: string) {
  if (!cookieHeader || !key) return null;
  const parts = cookieHeader.split(";");
  for (const part of parts) {
    const [rawName, ...rawValue] = part.trim().split("=");
    if (rawName === key) {
      const value = rawValue.join("=") || "";
      try {
        return decodeURIComponent(value);
      } catch {
        // Ignore malformed cookie encoding instead of crashing admin routes.
        return value;
      }
    }
  }
  return null;
}

function isLikelyUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function resolveRootSuperAdminId() {
  const setting = await prisma.setting.findUnique({
    where: { key: ROOT_SUPER_ADMIN_SETTING },
    select: { value: true },
  });
  return setting?.value || null;
}

async function resolvePlatformRoleByUserId(userId: string): Promise<PlatformRole> {
  const [user, rootSuperAdminId] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    }),
    resolveRootSuperAdminId(),
  ]);

  const normalized = normalizeStoredRole(user?.role);
  if (normalized === "SUPER_ADMIN") return "SUPER_ADMIN";
  if (normalized === "OPS_ADMIN" && rootSuperAdminId && rootSuperAdminId === userId) {
    return "SUPER_ADMIN";
  }
  if (normalized === "OPS_ADMIN") return "OPS_ADMIN";
  return "USER";
}

async function resolveTargetRoleByUserId(userId: string, rootSuperAdminId: string | null): Promise<PlatformRole> {
  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });
  const normalized = normalizeStoredRole(target?.role);
  if (normalized === "SUPER_ADMIN") return "SUPER_ADMIN";
  if (normalized === "OPS_ADMIN" && rootSuperAdminId && rootSuperAdminId === userId) {
    return "SUPER_ADMIN";
  }
  if (normalized === "OPS_ADMIN") return "OPS_ADMIN";
  return "USER";
}

export function toImpersonationHttpError(error: unknown) {
  if (error instanceof ImpersonationError) return error;
  return new ImpersonationError(500, error instanceof Error ? error.message : "Server error", "SERVER_ERROR");
}

export async function startImpersonationSession(input: {
  actorUserId: string;
  targetUserId: string;
  tenantId: string;
  reason: string;
  confirmation: string;
  actorIp?: string | null;
  actorUserAgent?: string | null;
}) {
  const targetUserId = String(input.targetUserId || "").trim();
  const tenantId = String(input.tenantId || "").trim();
  const reason = String(input.reason || "").trim();
  const confirmation = String(input.confirmation || "");

  if (!targetUserId || !tenantId) {
    throw new ImpersonationError(422, "Target user and tenant are required.", "VALIDATION_ERROR");
  }
  if (confirmation !== "IMPERSONATE") {
    throw new ImpersonationError(400, "Confirmation text is invalid.", "BAD_REQUEST");
  }
  if (reason.length < 5) {
    throw new ImpersonationError(422, "Reason must be at least 5 characters.", "VALIDATION_ERROR");
  }
  if (targetUserId === input.actorUserId) {
    throw new ImpersonationError(403, "You cannot impersonate your own account.", "FORBIDDEN");
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + IMPERSONATION_TTL_SECONDS * 1000);

  const role = await resolvePlatformRoleByUserId(input.actorUserId);
  if (role === "USER") {
    throw new ImpersonationError(403, "Insufficient privileges", "FORBIDDEN");
  }

  const rootSuperAdminId = await resolveRootSuperAdminId();
  const targetRole = await resolveTargetRoleByUserId(targetUserId, rootSuperAdminId);

  if (role === "OPS_ADMIN" && targetRole !== "USER") {
    throw new ImpersonationError(403, "Admins can impersonate tenant users only.", "FORBIDDEN");
  }
  if (role === "SUPER_ADMIN" && targetRole === "SUPER_ADMIN") {
    throw new ImpersonationError(403, "Cannot impersonate another super admin.", "FORBIDDEN");
  }

  const [targetUser, tenant, membership] = await Promise.all([
    prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, email: true, name: true },
    }),
    prisma.business.findUnique({
      where: { id: tenantId },
      select: { id: true, name: true, accessStatus: true },
    }),
    prisma.businessMember.findFirst({
      where: {
        userId: targetUserId,
        businessId: tenantId,
        status: "active",
      },
      select: { id: true },
    }),
  ]);

  if (!targetUser) {
    throw new ImpersonationError(404, "Target user not found.", "NOT_FOUND");
  }
  if (!tenant) {
    throw new ImpersonationError(404, "Tenant not found.", "NOT_FOUND");
  }
  if (tenant.accessStatus !== "ACTIVE") {
    throw new ImpersonationError(409, "Tenant is not active for impersonation.", "VALIDATION_ERROR");
  }
  if (!membership) {
    throw new ImpersonationError(409, "Target user is not an active member of the selected tenant.", "VALIDATION_ERROR");
  }

  const created = await prisma.$transaction(async (tx) => {
    await tx.impersonationSession.updateMany({
      where: {
        actorUserId: input.actorUserId,
        revokedAt: null,
        expiresAt: { gt: now },
      },
      data: { revokedAt: now },
    });

    const session = await tx.impersonationSession.create({
      data: {
        actorUserId: input.actorUserId,
        targetUserId,
        tenantId,
        reason,
        expiresAt,
        actorIp: input.actorIp || null,
        actorUserAgent: input.actorUserAgent || null,
      },
    });

    await tx.auditLog.create({
      data: {
        userId: input.actorUserId,
        targetUserId,
        orgId: tenantId,
        action: "IMPERSONATION_STARTED",
        actionType: "IMPERSONATION_STARTED",
        metadata: {
          reason,
          expiresAt: expiresAt.toISOString(),
          actorIp: input.actorIp || null,
          actorUserAgent: input.actorUserAgent || null,
        },
      },
    });

    return session;
  });

  await logUserActivity({
    tenantId,
    userId: targetUserId,
    actorId: input.actorUserId,
    eventType: "impersonation_started",
    metadata: {
      impersonationSessionId: created.id,
      reason,
      expiresAt: created.expiresAt.toISOString(),
    },
  });

  return {
    sessionId: created.id,
    expiresAt: created.expiresAt.toISOString(),
    target: {
      id: targetUser.id,
      email: targetUser.email,
      name: targetUser.name,
      role: targetRole,
    },
    tenant: {
      id: tenant.id,
      name: tenant.name,
    },
  };
}

export async function resolveImpersonationFromCookie(input: {
  actorUserId: string;
  cookieHeader?: string | null;
  strictActor?: boolean;
}) {
  const sessionId = String(parseCookieValue(input.cookieHeader ?? null, IMPERSONATION_COOKIE_NAME) || "").trim();
  if (!sessionId) return null;
  if (!isLikelyUuid(sessionId)) return null;

  const session = await prisma.impersonationSession.findUnique({
    where: { id: sessionId },
    include: {
      tenant: {
        select: { id: true, name: true },
      },
      target: {
        select: { id: true, email: true, name: true },
      },
    },
  });

  if (!session) return null;

  if (session.actorUserId !== input.actorUserId) {
    if (input.strictActor) {
      throw new ImpersonationError(403, "Insufficient privileges", "FORBIDDEN");
    }
    return null;
  }

  if (session.revokedAt) return null;

  const now = new Date();
  if (session.expiresAt <= now) {
    await prisma.$transaction(async (tx) => {
      await tx.impersonationSession.updateMany({
        where: {
          id: session.id,
          revokedAt: null,
        },
        data: {
          revokedAt: now,
        },
      });
      await tx.auditLog.create({
        data: {
          userId: session.actorUserId,
          targetUserId: session.targetUserId,
          orgId: session.tenantId,
          action: "IMPERSONATION_EXPIRED",
          actionType: "IMPERSONATION_EXPIRED",
          metadata: {
            reason: session.reason,
            expiredAt: now.toISOString(),
          },
        },
      });
    });
    return null;
  }

  return {
    sessionId: session.id,
    actorUserId: session.actorUserId,
    targetUserId: session.targetUserId,
    tenantId: session.tenantId,
    reason: session.reason,
    expiresAt: session.expiresAt.toISOString(),
    targetEmail: session.target.email,
    targetName: session.target.name,
    tenantName: session.tenant.name,
  };
}

export async function resolveImpersonationFromRequestContext(actorUserId: string) {
  try {
    const cookieStore = await cookies();
    const sessionId = cookieStore.get(IMPERSONATION_COOKIE_NAME)?.value;
    if (!sessionId) return null;
    return resolveImpersonationFromCookie({
      actorUserId,
      cookieHeader: `${IMPERSONATION_COOKIE_NAME}=${encodeURIComponent(sessionId)}`,
      strictActor: true,
    });
  } catch {
    return null;
  }
}

export async function resolveAuthPlaneContextFromCookie(input: {
  actorUserId: string;
  cookieHeader?: string | null;
  strictActor?: boolean;
}): Promise<ResolvedAuthPlaneContext> {
  const actorGlobalRole = await resolvePlatformRoleByUserId(input.actorUserId);
  const active = await resolveImpersonationFromCookie({
    actorUserId: input.actorUserId,
    cookieHeader: input.cookieHeader || null,
    strictActor: input.strictActor ?? true,
  });

  if (!active) {
    return {
      actorUserId: input.actorUserId,
      actorGlobalRole,
      effectiveUserId: input.actorUserId,
      effectiveTenantId: null,
      effectiveGlobalRole: actorGlobalRole,
      isImpersonating: false,
    };
  }

  return {
    actorUserId: input.actorUserId,
    actorGlobalRole,
    effectiveUserId: active.targetUserId,
    effectiveTenantId: active.tenantId,
    effectiveGlobalRole: "USER",
    isImpersonating: true,
    impersonationSessionId: active.sessionId,
    impersonationExpiresAt: new Date(active.expiresAt),
  };
}

export async function resolveAuthPlaneContextFromRequestContext(input: {
  actorUserId: string;
}): Promise<ResolvedAuthPlaneContext> {
  try {
    const cookieStore = await cookies();
    const sessionId = cookieStore.get(IMPERSONATION_COOKIE_NAME)?.value;
    const cookieHeader = sessionId ? `${IMPERSONATION_COOKIE_NAME}=${encodeURIComponent(sessionId)}` : null;
    return resolveAuthPlaneContextFromCookie({
      actorUserId: input.actorUserId,
      cookieHeader,
      strictActor: true,
    });
  } catch {
    const actorGlobalRole = await resolvePlatformRoleByUserId(input.actorUserId);
    return {
      actorUserId: input.actorUserId,
      actorGlobalRole,
      effectiveUserId: input.actorUserId,
      effectiveTenantId: null,
      effectiveGlobalRole: actorGlobalRole,
      isImpersonating: false,
    };
  }
}

export async function stopImpersonationSession(input: {
  actorUserId: string;
  cookieHeader?: string | null;
  actorIp?: string | null;
  actorUserAgent?: string | null;
}) {
  const role = await resolvePlatformRoleByUserId(input.actorUserId);
  if (role === "USER") {
    throw new ImpersonationError(403, "Insufficient privileges", "FORBIDDEN");
  }

  const activeSession = await resolveImpersonationFromCookie({
    actorUserId: input.actorUserId,
    cookieHeader: input.cookieHeader || null,
    strictActor: true,
  });

  if (!activeSession) {
    return { stopped: false };
  }

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.impersonationSession.update({
      where: { id: activeSession.sessionId },
      data: { revokedAt: now },
    });
    await tx.auditLog.create({
      data: {
        userId: input.actorUserId,
        targetUserId: activeSession.targetUserId,
        orgId: activeSession.tenantId,
        action: "IMPERSONATION_STOPPED",
        actionType: "IMPERSONATION_STOPPED",
        metadata: {
          reason: activeSession.reason,
          actorIp: input.actorIp || null,
          actorUserAgent: input.actorUserAgent || null,
        },
      },
    });
  });

  await logUserActivity({
    tenantId: activeSession.tenantId,
    userId: activeSession.targetUserId,
    actorId: input.actorUserId,
    eventType: "impersonation_ended",
    metadata: {
      impersonationSessionId: activeSession.sessionId,
      reason: activeSession.reason,
    },
  });

  return { stopped: true };
}

export async function hasActiveImpersonationForActor(input: {
  actorUserId: string;
  cookieHeader?: string | null;
}) {
  const session = await resolveImpersonationFromCookie({
    actorUserId: input.actorUserId,
    cookieHeader: input.cookieHeader,
    strictActor: true,
  });
  return Boolean(session);
}
