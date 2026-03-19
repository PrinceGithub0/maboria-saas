import "server-only";

import crypto from "crypto";
import { cookies } from "next/headers";
import { OrgSubscriptionStatus, Prisma, SubscriptionPlan } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  canManageSubscription,
  hasOrgPermission,
  normalizeOrgRole,
  type OrgPermission,
  type OrgRole,
} from "@/lib/org-permissions";
import { isPlatformRole } from "@/lib/global-role";
import { resolveAuthPlaneContextFromRequestContext } from "@/lib/admin/impersonation";
export {
  ORG_ROLE_VALUES,
  canActorChangeTargetRole,
  canAssignBillingAdmin,
  canManageSubscription,
  getHighestRole,
  hasOrgPermission,
  normalizeOrgRole,
} from "@/lib/org-permissions";
export type { OrgPermission, OrgRole } from "@/lib/org-permissions";

export type OrgContext = {
  orgId: string;
  ownerUserId: string;
  memberId: string;
  role: OrgRole;
  orgAccessStatus: "ACTIVE" | "SUSPENDED" | "DISABLED";
  orgSubscriptionStatus: OrgSubscriptionStatus | "NONE";
  orgPlan: SubscriptionPlan | null;
  apiAccessEnabled: boolean;
};

export const ACTIVE_ORG_COOKIE_NAME = "maboria_active_org";
const ACTIVE_GATE_ORG_SUBSCRIPTION_STATUSES = new Set<OrgSubscriptionStatus>(["ACTIVE"]);

function mapSubscriptionStatusToOrgStatus(status?: string | null): OrgSubscriptionStatus | "NONE" {
  const value = String(status || "").toUpperCase();
  if (value === "ACTIVE") return "ACTIVE";
  if (value === "PAST_DUE") return "PAST_DUE";
  if (value === "TRIALING") return "TRIALING";
  if (value === "CANCELED" || value === "INACTIVE" || value === "REVOKED") return "CANCELED";
  return "NONE";
}

export function normalizeMemberStatus(value?: string | null) {
  const status = String(value || "").trim().toLowerCase();
  if (status === "removed") return "removed";
  if (status === "invited") return "invited";
  return "active";
}

export function isOrgSubscriptionActive(status: OrgSubscriptionStatus | "NONE") {
  return status === "ACTIVE";
}

export function getSeatLimitForPlan(plan: SubscriptionPlan | null) {
  switch (plan) {
    case "STARTER":
      return 1;
    case "PRO":
      return 3;
    case "GROWTH":
      return 5;
    case "BUSINESS":
    case "PREMIUM":
      return 10;
    case "ENTERPRISE":
      return null;
    default:
      return 1;
  }
}

const ORG_ROLE_PRIORITY: Record<OrgRole, number> = {
  owner: 4,
  admin: 3,
  billing_admin: 2,
  member: 1,
};

function getCandidateHealthScore(input: {
  accessStatus?: string | null;
  subscriptionStatus?: OrgSubscriptionStatus | "NONE" | null;
}) {
  const accessScore = String(input.accessStatus || "").toUpperCase() === "ACTIVE" ? 2 : 0;
  const subscriptionScore = ACTIVE_GATE_ORG_SUBSCRIPTION_STATUSES.has(
    (input.subscriptionStatus || "NONE") as OrgSubscriptionStatus
  )
    ? 1
    : 0;
  return accessScore + subscriptionScore;
}

export async function resolveOrgContext(userId: string): Promise<OrgContext | null> {
  const authPlane = await resolveAuthPlaneContextFromRequestContext({
    actorUserId: userId,
  });
  const actorIsPlatform = isPlatformRole(authPlane.actorGlobalRole);
  const scopedUserId = authPlane.effectiveUserId;
  const scopedOrgId = authPlane.effectiveTenantId;
  let preferredOrgId: string | null = null;

  if (!scopedOrgId) {
    try {
      preferredOrgId = (await cookies()).get(ACTIVE_ORG_COOKIE_NAME)?.value || null;
    } catch {
      preferredOrgId = null;
    }
  }

  const members = await prisma.businessMember.findMany({
    where: { userId: scopedUserId, status: "active", ...(scopedOrgId ? { businessId: scopedOrgId } : {}) },
    include: {
      business: {
        select: {
          ownerId: true,
          plan: true,
          accessStatus: true,
          orgSubscription: {
            select: {
              status: true,
              planId: true,
              apiAccessEnabled: true,
            },
          },
        },
      },
    },
  });

  if (!members.length) {
    if (actorIsPlatform) {
      return null;
    }
    return null;
  }

  if (!members.length) return null;
  const ownerIdsNeedingFallback = Array.from(
    new Set(
      members
        .filter((member) => !member.business?.orgSubscription)
        .map((member) => member.business?.ownerId)
        .filter((value): value is string => Boolean(value))
    )
  );
  const fallbackOwnerSubscriptions = ownerIdsNeedingFallback.length
    ? await prisma.subscription.findMany({
        where: {
          userId: { in: ownerIdsNeedingFallback },
          status: { in: ["ACTIVE", "PAST_DUE", "TRIALING"] },
        },
        orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }, { id: "desc" }],
        select: { userId: true, status: true, plan: true, updatedAt: true, createdAt: true, id: true },
      })
    : [];
  const fallbackOwnerSubscriptionMap = new Map<
    string,
    { status: string; plan: SubscriptionPlan; updatedAt: Date; createdAt: Date; id: string }
  >();
  for (const subscription of fallbackOwnerSubscriptions) {
    if (!fallbackOwnerSubscriptionMap.has(subscription.userId)) {
      fallbackOwnerSubscriptionMap.set(subscription.userId, subscription);
    }
  }

  const candidates = members
    .filter((member) => Boolean(member.business))
    .map((member) => {
      const fallbackOwnerSubscription = member.business?.ownerId
        ? fallbackOwnerSubscriptionMap.get(member.business.ownerId) || null
        : null;
      const resolvedOrgSubscriptionStatus =
        member.business?.orgSubscription?.status ??
        mapSubscriptionStatusToOrgStatus(fallbackOwnerSubscription?.status);
      const resolvedOrgPlan =
        member.business?.orgSubscription?.planId ??
        fallbackOwnerSubscription?.plan ??
        member.business?.plan ??
        null;

      return {
        member,
        resolvedOrgSubscriptionStatus,
        resolvedOrgPlan,
      };
    });

  if (!candidates.length) return null;

  const sortedCandidates = candidates.slice().sort((left, right) => {
    const rightHealth = getCandidateHealthScore({
      accessStatus: right.member.business?.accessStatus,
      subscriptionStatus: right.resolvedOrgSubscriptionStatus,
    });
    const leftHealth = getCandidateHealthScore({
      accessStatus: left.member.business?.accessStatus,
      subscriptionStatus: left.resolvedOrgSubscriptionStatus,
    });
    if (rightHealth !== leftHealth) return rightHealth - leftHealth;

    const roleDelta =
      ORG_ROLE_PRIORITY[normalizeOrgRole(right.member.role)] - ORG_ROLE_PRIORITY[normalizeOrgRole(left.member.role)];
    if (roleDelta !== 0) return roleDelta;
    return left.member.createdAt.getTime() - right.member.createdAt.getTime();
  });

  const preferredCandidate =
    preferredOrgId
      ? sortedCandidates.find((candidate) => candidate.member.businessId === preferredOrgId) || null
      : null;
  const healthiestCandidate = sortedCandidates[0];
  const selected =
    preferredCandidate &&
    getCandidateHealthScore({
      accessStatus: preferredCandidate.member.business?.accessStatus,
      subscriptionStatus: preferredCandidate.resolvedOrgSubscriptionStatus,
    }) >=
      getCandidateHealthScore({
        accessStatus: healthiestCandidate.member.business?.accessStatus,
        subscriptionStatus: healthiestCandidate.resolvedOrgSubscriptionStatus,
      })
      ? preferredCandidate
      : healthiestCandidate;

  const member = selected.member;
  const resolvedOrgSubscriptionStatus = selected.resolvedOrgSubscriptionStatus;
  const resolvedOrgPlan = selected.resolvedOrgPlan;

  if (!member.business) return null;

  return {
    orgId: member.businessId,
    ownerUserId: member.business.ownerId,
    memberId: member.id,
    role: normalizeOrgRole(member.role),
    orgAccessStatus: member.business.accessStatus,
    orgSubscriptionStatus: resolvedOrgSubscriptionStatus,
    orgPlan: resolvedOrgPlan,
    apiAccessEnabled: Boolean(member.business.orgSubscription?.apiAccessEnabled),
  };
}

export async function requireOrgPermission(
  userId: string,
  options: {
    permission: OrgPermission;
    requireActiveSubscription?: boolean;
  }
) {
  const context = await resolveOrgContext(userId);
  if (!context) {
    return {
      ok: false as const,
      status: 403,
      code: "ORG_ACCESS_DENIED",
      message: "Organization access denied.",
    };
  }

  if (context.orgAccessStatus !== "ACTIVE") {
    return {
      ok: false as const,
      status: 403,
      code: "TENANT_SUSPENDED",
      message:
        context.orgAccessStatus === "DISABLED"
          ? "Organization access has been disabled."
          : "Organization access is suspended.",
      context,
    };
  }

  if (options.requireActiveSubscription && !isOrgSubscriptionActive(context.orgSubscriptionStatus)) {
    return {
      ok: false as const,
      status: 403,
      code: "SUBSCRIPTION_INACTIVE",
      message:
        canManageSubscription(context.role)
          ? "Organization subscription inactive. Please renew billing."
          : "Organization subscription inactive. Please contact the organization owner.",
      context,
    };
  }

  if (!hasOrgPermission(context.role, options.permission)) {
    return {
      ok: false as const,
      status: 403,
      code: "FORBIDDEN",
      message: "You do not have permission for this action.",
      context,
    };
  }

  return { ok: true as const, context };
}

export async function countActiveOrgSeats(orgId: string, tx: Prisma.TransactionClient | typeof prisma = prisma) {
  return tx.businessMember.count({
    where: {
      businessId: orgId,
      status: "active",
    },
  });
}

export function buildInviteToken() {
  const rawToken = crypto.randomBytes(32).toString("hex");
  return {
    rawToken,
    tokenHash: hashInviteToken(rawToken),
  };
}

export function hashInviteToken(token: string) {
  return crypto.createHash("sha256").update(token, "utf8").digest("hex");
}

export function safeTokenCompare(a: string, b: string) {
  const left = Buffer.from(a || "", "utf8");
  const right = Buffer.from(b || "", "utf8");
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

export async function writeOrgAuditLog(input: {
  orgId: string;
  actorUserId: string;
  actionType: string;
  targetUserId?: string | null;
  metadata?: Prisma.InputJsonValue;
}) {
  await prisma.auditLog.create({
    data: {
      userId: input.actorUserId,
      orgId: input.orgId,
      action: input.actionType,
      actionType: input.actionType,
      targetUserId: input.targetUserId ?? null,
      metadata: input.metadata ?? undefined,
    },
  });
}
