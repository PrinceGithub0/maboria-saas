import "server-only";

import crypto from "crypto";
import { OrgSubscriptionStatus, Prisma, SubscriptionPlan } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getOrCreateBusinessForUser } from "@/lib/business";
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

export async function resolveOrgContext(userId: string): Promise<OrgContext | null> {
  const authPlane = await resolveAuthPlaneContextFromRequestContext({
    actorUserId: userId,
  });
  const actorIsPlatform = isPlatformRole(authPlane.actorGlobalRole);
  const scopedUserId = authPlane.effectiveUserId;
  const scopedOrgId = authPlane.effectiveTenantId;

  let members = await prisma.businessMember.findMany({
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

    await getOrCreateBusinessForUser(scopedUserId);
    members = await prisma.businessMember.findMany({
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
  }

  if (!members.length) return null;

  // Deterministic org selection: prefer highest role (owner > admin > member),
  // then the oldest membership for stability.
  const member = members
    .slice()
    .sort((a, b) => {
      const roleDelta =
        ORG_ROLE_PRIORITY[normalizeOrgRole(b.role)] - ORG_ROLE_PRIORITY[normalizeOrgRole(a.role)];
      if (roleDelta !== 0) return roleDelta;
      return a.createdAt.getTime() - b.createdAt.getTime();
    })[0];

  if (!member.business) return null;

  return {
    orgId: member.businessId,
    ownerUserId: member.business.ownerId,
    memberId: member.id,
    role: normalizeOrgRole(member.role),
    orgAccessStatus: member.business.accessStatus,
    orgSubscriptionStatus: member.business.orgSubscription?.status ?? "NONE",
    orgPlan: member.business.orgSubscription?.planId ?? member.business.plan ?? null,
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
