import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getSeatLimitForPlan, hashInviteToken, safeTokenCompare } from "@/lib/org-auth";

function jsonError(status: number, error: string, extras?: Record<string, unknown>) {
  return NextResponse.json({ error, ...(extras || {}) }, { status });
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || !session.user.email) {
    return jsonError(401, "Unauthorized");
  }

  const body = await request.json().catch(() => ({}));
  const inviteToken =
    typeof body?.inviteToken === "string" && body.inviteToken.trim()
      ? body.inviteToken.trim()
      : "";
  if (!inviteToken) {
    return jsonError(400, "Invitation token is required.");
  }

  const now = new Date();
  const normalizedEmail = session.user.email.trim().toLowerCase();
  const inviteTokenHash = hashInviteToken(inviteToken);
  const invite = await prisma.businessInvite.findFirst({
    where: {
      email: normalizedEmail,
      status: "PENDING",
      AND: [
        { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
        { OR: [{ tokenHash: inviteTokenHash }, { token: inviteTokenHash }, { token: inviteToken }] },
      ],
    },
    orderBy: { createdAt: "desc" },
  });

  if (!invite) {
    return jsonError(404, "Invitation not found or expired.");
  }

  const storedHash = invite.tokenHash || invite.token || "";
  const hashMatches = safeTokenCompare(storedHash, inviteTokenHash);
  const legacyRawMatches = safeTokenCompare(invite.token || "", inviteToken);
  if (!hashMatches && !legacyRawMatches) {
    return jsonError(400, "Invitation token is invalid.");
  }

  try {
    await prisma.$transaction(
      async (tx) => {
        const currentInvite = await tx.businessInvite.findUnique({
          where: { id: invite.id },
        });
        if (!currentInvite || currentInvite.status !== "PENDING") {
          throw new Error("INVITE_NOT_FOUND");
        }
        if (currentInvite.expiresAt && currentInvite.expiresAt <= now) {
          throw new Error("INVITE_NOT_FOUND");
        }

        const business = await tx.business.findUnique({
          where: { id: currentInvite.businessId },
          select: {
            id: true,
            plan: true,
            orgSubscription: {
              select: { planId: true },
            },
          },
        });
        if (!business) {
          throw new Error("INVITE_NOT_FOUND");
        }

        const existingMember = await tx.businessMember.findUnique({
          where: {
            businessId_userId: {
              businessId: business.id,
              userId: session.user.id,
            },
          },
        });

        const planForSeats = business.orgSubscription?.planId ?? business.plan;
        const seatLimit = getSeatLimitForPlan(planForSeats);
        const seatsUsed = await tx.businessMember.count({
          where: { businessId: business.id, status: "active" },
        });
        if ((!existingMember || existingMember.status !== "active") && seatLimit !== null && seatsUsed >= seatLimit) {
          throw new Error("TEAM_SEAT_LIMIT_REACHED");
        }

        const normalizedInviteRole = String(currentInvite.role || "member").toLowerCase();
        const inviteRole =
          normalizedInviteRole === "admin"
            ? "admin"
            : normalizedInviteRole === "billing_admin"
              ? "billing_admin"
              : "member";

        if (!existingMember) {
          await tx.businessMember.create({
            data: {
              businessId: business.id,
              userId: session.user.id,
              role: inviteRole,
              status: "active",
              joinedAt: now,
              invitedBy: currentInvite.invitedByUserId || currentInvite.invitedById || null,
            },
          });
        } else if (existingMember.status !== "active") {
          await tx.businessMember.update({
            where: { id: existingMember.id },
            data: {
              role: inviteRole,
              status: "active",
              joinedAt: now,
              invitedBy: currentInvite.invitedByUserId || currentInvite.invitedById || null,
            },
          });
        }

        await tx.businessInvite.update({
          where: { id: currentInvite.id },
          data: {
            status: "ACCEPTED",
            acceptedAt: now,
            usedAt: now,
          },
        });

        await tx.activityLog.create({
          data: {
            userId: session.user.id,
            action: "TEAM_INVITE_ACCEPTED",
            resourceType: "business",
            resourceId: business.id,
            metadata: { inviteId: currentInvite.id },
          },
        });

        await tx.auditLog.create({
          data: {
            userId: session.user.id,
            orgId: business.id,
            action: "INVITE_ACCEPTED",
            actionType: "INVITE_ACCEPTED",
            metadata: {
              inviteId: currentInvite.id,
              email: normalizedEmail,
              role: inviteRole,
            },
          },
        });
      },
      { isolationLevel: "Serializable" }
    );

    return NextResponse.json({ accepted: true, redirectTo: "/dashboard" });
  } catch (error: any) {
    if (error?.message === "TEAM_SEAT_LIMIT_REACHED") {
      return jsonError(
        409,
        "This workspace has reached its team seat limit. Ask the owner to free a seat or upgrade the plan.",
        { code: "TEAM_SEAT_LIMIT_REACHED" }
      );
    }
    if (error?.message === "INVITE_NOT_FOUND") {
      return jsonError(404, "Invitation not found or expired.");
    }
    throw error;
  }
}
