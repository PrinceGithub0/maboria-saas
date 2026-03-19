import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  buildInviteToken,
  canAssignBillingAdmin,
  canActorChangeTargetRole,
  canManageSubscription,
  countActiveOrgSeats,
  getSeatLimitForPlan,
  hasOrgPermission,
  normalizeOrgRole,
  requireOrgPermission,
  writeOrgAuditLog,
} from "@/lib/org-auth";
import { sendPlatformMail } from "@/lib/email";
import { isPlatformRole } from "@/lib/global-role";
import { buildTeamActivityMessage, TEAM_ACTIVITY_ACTION_TYPES } from "@/lib/team-activity";
import { buildTeamInviteSubject, renderTeamInviteEmail } from "@/emails/templates/team-invite";

const inviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(["member", "admin", "billing_admin"]).default("member"),
});

const resendInviteSchema = z.object({
  action: z.literal("resend_invite"),
  inviteId: z.string().min(1),
});

const removeSchema = z.object({
  memberId: z.string().min(1),
});

const cancelInviteSchema = z.object({
  action: z.literal("cancel_invite"),
  inviteId: z.string().min(1),
});

const roleUpdateSchema = z.object({
  memberId: z.string().min(1),
  role: z.enum(["member", "admin", "billing_admin"]),
});

function toPlanLabel(plan?: string | null) {
  const normalized = String(plan || "STARTER").toUpperCase();
  if (normalized === "PRO") return "pro";
  if (normalized === "GROWTH") return "growth";
  if (normalized === "BUSINESS" || normalized === "PREMIUM") return "business";
  if (normalized === "ENTERPRISE") return "enterprise";
  return "starter";
}

function buildInviteLink(input: {
  token: string;
  email: string;
  mode?: "signup" | "login";
  workspaceName?: string | null;
  role?: "member" | "admin" | "billing_admin";
  inviter?: string | null;
}) {
  const baseUrl = process.env.APP_URL || process.env.NEXTAUTH_URL || "http://localhost:3000";
  const url = new URL((input.mode || "signup") === "login" ? "/login" : "/signup", baseUrl);
  url.searchParams.set("invite", input.token);
  url.searchParams.set("email", input.email);
  if (input.workspaceName) {
    url.searchParams.set("org", input.workspaceName);
  }
  if (input.role) {
    url.searchParams.set("role", input.role);
  }
  if (input.inviter) {
    url.searchParams.set("inviter", input.inviter);
  }
  return url.toString();
}

function jsonError(status: number, error: string, extras?: Record<string, unknown>) {
  return NextResponse.json({ error, ...(extras || {}) }, { status });
}

const MEMBER_ROLE_RANK: Record<string, number> = {
  owner: 4,
  admin: 3,
  billing_admin: 2,
  member: 1,
};

async function sendWorkspaceInviteEmail(input: {
  orgId: string;
  email: string;
  rawToken: string;
  role: "member" | "admin" | "billing_admin";
  inviterName?: string | null;
  inviterEmail?: string | null;
  mode?: "signup" | "login";
}) {
  const business = await prisma.business.findUnique({
    where: { id: input.orgId },
    select: { name: true },
  });

  const workspaceName = business?.name || "your organization";
  const acceptUrl = buildInviteLink({
    token: input.rawToken,
    email: input.email,
    mode: input.mode || "signup",
    workspaceName,
    role: input.role,
    inviter: input.inviterName || input.inviterEmail || null,
  });
  const message = renderTeamInviteEmail({
    workspaceName,
    recipientEmail: input.email,
    inviterName: input.inviterName,
    inviterEmail: input.inviterEmail,
    role: input.role,
    acceptUrl,
    mode: input.mode || "signup",
  });

  await sendPlatformMail({
    to: input.email,
    subject: buildTeamInviteSubject({
      workspaceName,
      recipientEmail: input.email,
      inviterName: input.inviterName,
      inviterEmail: input.inviterEmail,
      role: input.role,
      acceptUrl,
      mode: input.mode || "signup",
    }),
    html: message.html,
    text: message.text,
  });
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return jsonError(401, "Unauthorized");

  const access = await requireOrgPermission(session.user.id, {
    permission: "team:read",
    requireActiveSubscription: true,
  });
  if (!access.ok) return jsonError(access.status, access.message, { code: access.code });

  const { context } = access;
  const canViewTeamOperations = hasOrgPermission(context.role, "team:invite") || canManageSubscription(context.role);
  const seatLimit = getSeatLimitForPlan(context.orgPlan);
  const [members, pendingInvites, seatsUsed, auditLogs] = await Promise.all([
    prisma.businessMember.findMany({
      where: {
        businessId: context.orgId,
        status: "active",
      },
      include: {
        user: {
          select: { id: true, name: true, email: true, publicId: true, role: true },
        },
      },
      orderBy: [{ role: "asc" }, { createdAt: "asc" }],
    }),
    prisma.businessInvite.findMany({
      where: {
        businessId: context.orgId,
        status: "PENDING",
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    countActiveOrgSeats(context.orgId),
    prisma.auditLog.findMany({
      where: {
        orgId: context.orgId,
        actionType: {
          in: [...TEAM_ACTIVITY_ACTION_TYPES],
        },
      },
      orderBy: { createdAt: "desc" },
      take: 6,
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
      },
    }),
  ]);

  const targetUserIds = Array.from(
    new Set(auditLogs.map((entry) => entry.targetUserId).filter((value): value is string => Boolean(value)))
  );
  const targetUsers = targetUserIds.length
    ? await prisma.user.findMany({
        where: { id: { in: targetUserIds } },
        select: { id: true, name: true, email: true },
      })
    : [];
  const targetUserMap = new Map(targetUsers.map((user) => [user.id, user]));

  return NextResponse.json({
    members: members.slice().sort((a, b) => {
      const roleDelta =
        (MEMBER_ROLE_RANK[String(b.role || "").toLowerCase()] || 0) -
        (MEMBER_ROLE_RANK[String(a.role || "").toLowerCase()] || 0);
      if (roleDelta !== 0) return roleDelta;
      const aJoined = a.joinedAt?.getTime?.() || a.createdAt?.getTime?.() || 0;
      const bJoined = b.joinedAt?.getTime?.() || b.createdAt?.getTime?.() || 0;
      return aJoined - bJoined;
    }),
    pendingInvites: canViewTeamOperations
      ? pendingInvites.map((invite) => ({
          id: invite.id,
          email: invite.email,
          role: invite.role,
          createdAt: invite.createdAt,
          expiresAt: invite.expiresAt,
        }))
      : [],
    recentActivity: canViewTeamOperations
      ? auditLogs.map((entry) => {
          const metadata =
            entry.metadata && typeof entry.metadata === "object" && !Array.isArray(entry.metadata)
              ? (entry.metadata as Record<string, unknown>)
              : null;
          const targetUser = entry.targetUserId ? targetUserMap.get(entry.targetUserId) : null;
          return {
            id: entry.id,
            actionType: entry.actionType || entry.action,
            createdAt: entry.createdAt,
            actor: {
              id: entry.user?.id || null,
              name: entry.user?.name || null,
              email: entry.user?.email || null,
            },
            target: {
              id: targetUser?.id || null,
              name: targetUser?.name || null,
              email: targetUser?.email || null,
            },
            message: buildTeamActivityMessage({
              actionType: entry.actionType || entry.action,
              actorName: entry.user?.name,
              actorEmail: entry.user?.email,
              targetName: targetUser?.name || null,
              targetEmail: targetUser?.email || null,
              metadata,
            }),
          };
        })
      : [],
    seatLimit,
    seatsUsed,
    planLabel: toPlanLabel(context.orgPlan),
    currentRole: context.role,
    permissions: {
      canInvite: hasOrgPermission(context.role, "team:invite"),
      canRemoveMember: hasOrgPermission(context.role, "team:remove_member"),
      canPromoteMember: hasOrgPermission(context.role, "team:promote_member"),
      canDemoteAdmin: hasOrgPermission(context.role, "team:demote_admin"),
      canManageSubscription: hasOrgPermission(context.role, "subscription:manage"),
      canViewTeamOperations,
    },
  });
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return jsonError(401, "Unauthorized");

  const access = await requireOrgPermission(session.user.id, {
    permission: "team:invite",
    requireActiveSubscription: true,
  });
  if (!access.ok) return jsonError(access.status, access.message, { code: access.code });

  try {
    const parsed = inviteSchema.parse(await req.json());
    const normalizedEmail = parsed.email.trim().toLowerCase();
    const { context } = access;

    if (parsed.role === "billing_admin" && !canAssignBillingAdmin(context.role)) {
      return jsonError(403, "Only owners can assign Billing Admin.", { code: "FORBIDDEN" });
    }

    if (context.role === "admin" && parsed.role !== "member") {
      return jsonError(403, "Admins can invite members only.", { code: "FORBIDDEN" });
    }

    const seatLimit = getSeatLimitForPlan(context.orgPlan);
    const activeSeats = await countActiveOrgSeats(context.orgId);
    if (seatLimit !== null && activeSeats >= seatLimit) {
      return jsonError(409, "Team seat limit reached.", {
        code: "SEAT_LIMIT_REACHED",
        seatLimit,
        seatsUsed: activeSeats,
      });
    }

    const existingUser = await prisma.user.findUnique({ where: { email: normalizedEmail } });

    if (existingUser) {
      const existingIsPlatformRole = isPlatformRole(existingUser.role);
      if (existingIsPlatformRole) {
        return jsonError(403, "Platform roles cannot be attached to a tenant.", { code: "FORBIDDEN" });
      }

      const member = await prisma.businessMember.findUnique({
        where: {
          businessId_userId: {
            businessId: context.orgId,
            userId: existingUser.id,
          },
        },
      });

      if (member?.status === "active") {
        return NextResponse.json({ alreadyMember: true, member });
      }
    }

    const token = buildInviteToken();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const invite = await prisma.businessInvite.upsert({
      where: { businessId_email: { businessId: context.orgId, email: normalizedEmail } },
      update: {
        role: parsed.role,
        status: "PENDING",
        token: token.tokenHash,
        tokenHash: token.tokenHash,
        expiresAt,
        acceptedAt: null,
        usedAt: null,
        invitedById: session.user.id,
        invitedByUserId: session.user.id,
      },
      create: {
        businessId: context.orgId,
        email: normalizedEmail,
        role: parsed.role,
        status: "PENDING",
        token: token.tokenHash,
        tokenHash: token.tokenHash,
        expiresAt,
        invitedById: session.user.id,
        invitedByUserId: session.user.id,
      },
    });

    await sendWorkspaceInviteEmail({
      orgId: context.orgId,
      email: normalizedEmail,
      rawToken: token.rawToken,
      role: parsed.role,
      inviterName: session.user.name || null,
      inviterEmail: session.user.email || null,
      mode: "signup",
    });

    await writeOrgAuditLog({
      orgId: context.orgId,
      actorUserId: session.user.id,
      actionType: "INVITE_CREATED",
      metadata: {
        email: normalizedEmail,
        role: parsed.role,
        inviteId: invite.id,
      },
    });

    return NextResponse.json({ invited: true }, { status: 202 });
  } catch (error: any) {
    if (error?.name === "ZodError") {
      return jsonError(422, "Invalid request payload.");
    }
    return jsonError(400, error?.message || "Invite failed.");
  }
}

export async function PATCH(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return jsonError(401, "Unauthorized");

  const contextResult = await requireOrgPermission(session.user.id, {
    permission: "team:read",
    requireActiveSubscription: true,
  });
  if (!contextResult.ok) return jsonError(contextResult.status, contextResult.message, { code: contextResult.code });

  const { context } = contextResult;

  try {
    const body = await req.json();

    if (body?.action === "resend_invite") {
      if (!hasOrgPermission(context.role, "team:invite")) {
        return jsonError(403, "You do not have permission to resend invites.", { code: "FORBIDDEN" });
      }

      const parsed = resendInviteSchema.parse(body);
      const invite = await prisma.businessInvite.findFirst({
        where: {
          id: parsed.inviteId,
          businessId: context.orgId,
          status: "PENDING",
        },
      });

      if (!invite) return jsonError(404, "Pending invite not found.");

      const token = buildInviteToken();
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      await prisma.businessInvite.update({
        where: { id: invite.id },
        data: {
          token: token.tokenHash,
          tokenHash: token.tokenHash,
          expiresAt,
          invitedById: session.user.id,
          invitedByUserId: session.user.id,
        },
      });

      await sendWorkspaceInviteEmail({
        orgId: context.orgId,
        email: invite.email,
        rawToken: token.rawToken,
        role: normalizeOrgRole(invite.role) as "member" | "admin" | "billing_admin",
        inviterName: session.user.name || null,
        inviterEmail: session.user.email || null,
        mode: "signup",
      });

      await writeOrgAuditLog({
        orgId: context.orgId,
        actorUserId: session.user.id,
        actionType: "INVITE_CREATED",
        metadata: {
          email: invite.email,
          role: invite.role,
          inviteId: invite.id,
          resent: true,
        },
      });

      return NextResponse.json({ resent: true });
    }

    const parsed = roleUpdateSchema.parse(body);
    const targetMember = await prisma.businessMember.findFirst({
      where: {
        id: parsed.memberId,
        businessId: context.orgId,
        status: "active",
      },
      include: { user: { select: { id: true, name: true, email: true, publicId: true, role: true } } },
    });

    if (!targetMember) return jsonError(404, "Member not found.");

    const actorRole = context.role;
    const currentRole = normalizeOrgRole(targetMember.role);
    const nextRole = normalizeOrgRole(parsed.role);

    if (currentRole === nextRole) {
      return NextResponse.json({ member: targetMember });
    }

    if (nextRole === "billing_admin" && !canAssignBillingAdmin(actorRole)) {
      return jsonError(403, "Only owners can assign Billing Admin.", { code: "FORBIDDEN" });
    }

    if (!canActorChangeTargetRole(actorRole, currentRole, nextRole)) {
      return jsonError(403, "You do not have permission for this role change.", { code: "FORBIDDEN" });
    }

    const updated = await prisma.businessMember.update({
      where: { id: targetMember.id },
      data: { role: nextRole },
      include: { user: { select: { id: true, name: true, email: true, publicId: true, role: true } } },
    });

    const actionType =
      currentRole === "member" && nextRole === "admin"
        ? "MEMBER_PROMOTED_TO_ADMIN"
        : currentRole === "admin" && nextRole === "member"
          ? "ADMIN_DEMOTED_TO_MEMBER"
          : nextRole === "billing_admin"
            ? "MEMBER_PROMOTED_TO_BILLING_ADMIN"
            : currentRole === "billing_admin"
              ? "BILLING_ADMIN_CHANGED"
              : "MEMBER_ROLE_CHANGED";

    await writeOrgAuditLog({
      orgId: context.orgId,
      actorUserId: session.user.id,
      targetUserId: targetMember.userId,
      actionType,
      metadata: { fromRole: currentRole, toRole: nextRole },
    });

    return NextResponse.json({ member: updated });
  } catch (error: any) {
    if (error?.name === "ZodError") {
      return jsonError(422, "Invalid request payload.");
    }
    return jsonError(400, error?.message || "Update failed.");
  }
}

export async function DELETE(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return jsonError(401, "Unauthorized");

  try {
    const body = await req.json();

    if (body?.action === "cancel_invite") {
      const access = await requireOrgPermission(session.user.id, {
        permission: "team:invite",
        requireActiveSubscription: true,
      });
      if (!access.ok) return jsonError(access.status, access.message, { code: access.code });

      const { context } = access;
      const parsed = cancelInviteSchema.parse(body);
      const invite = await prisma.businessInvite.findFirst({
        where: {
          id: parsed.inviteId,
          businessId: context.orgId,
          status: "PENDING",
        },
      });
      if (!invite) return jsonError(404, "Pending invite not found.");

      await prisma.businessInvite.update({
        where: { id: invite.id },
        data: { status: "CANCELED" },
      });

      await writeOrgAuditLog({
        orgId: context.orgId,
        actorUserId: session.user.id,
        actionType: "INVITE_CANCELED",
        metadata: {
          email: invite.email,
          role: invite.role,
          inviteId: invite.id,
        },
      });

      return NextResponse.json({ ok: true });
    }

    const access = await requireOrgPermission(session.user.id, {
      permission: "team:remove_member",
      requireActiveSubscription: true,
    });
    if (!access.ok) return jsonError(access.status, access.message, { code: access.code });

    const parsed = removeSchema.parse(body);
    const { context } = access;

    const member = await prisma.businessMember.findFirst({
      where: {
        id: parsed.memberId,
        businessId: context.orgId,
      },
    });
    if (!member) return jsonError(404, "Member not found.");

    const targetRole = normalizeOrgRole(member.role);
    if (targetRole === "owner") {
      return jsonError(403, "Owner cannot be removed.", { code: "FORBIDDEN" });
    }

    if (context.role === "admin" && targetRole !== "member") {
      return jsonError(403, "Admins can remove members only.", { code: "FORBIDDEN" });
    }

    await prisma.businessMember.update({
      where: { id: member.id },
      data: {
        status: "removed",
      },
    });

    await writeOrgAuditLog({
      orgId: context.orgId,
      actorUserId: session.user.id,
      targetUserId: member.userId,
      actionType: "MEMBER_REMOVED",
      metadata: { role: targetRole },
    });

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    if (error?.name === "ZodError") {
      return jsonError(422, "Invalid request payload.");
    }
    return jsonError(400, error?.message || "Remove failed.");
  }
}
