const fs = require("fs");
const p = "app/api/auth/register/route.ts";
let s = fs.readFileSync(p, "utf8");

s = s.replace(
  'import { generatePublicId } from "@/lib/public-id";\nimport { PASSWORD_MIN_LENGTH_ERROR } from "@/lib/password-policy";',
  'import { generatePublicId } from "@/lib/public-id";\nimport { PASSWORD_MIN_LENGTH_ERROR } from "@/lib/password-policy";\nimport { getSeatLimitForPlan, hashInviteToken, safeTokenCompare } from "@/lib/org-auth";'
);

s = s.replace(/async function acceptBusinessInvite\([\s\S]*?\n\}\n\n\/\/ Credentials signup endpoint: validates payload, hashes password, prevents duplicates, returns clear errors\./,
`async function acceptBusinessInvite({
  userId,
  email,
  inviteToken,
}: {
  userId: string;
  email: string;
  inviteToken?: string;
}) {
  const now = new Date();
  const normalizedEmail = email.trim().toLowerCase();
  const inviteTokenHash = inviteToken ? hashInviteToken(inviteToken) : null;

  const invite = await prisma.businessInvite.findFirst({
    where: {
      email: normalizedEmail,
      status: "PENDING",
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      ...(inviteToken
        ? {
            OR: [
              { tokenHash: inviteTokenHash ?? undefined },
              { token: inviteTokenHash ?? undefined },
              { token: inviteToken },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: "desc" },
  });

  if (!invite) return;

  if (inviteToken) {
    const storedHash = invite.tokenHash || invite.token || "";
    const hashMatches = inviteTokenHash ? safeTokenCompare(storedHash, inviteTokenHash) : false;
    const legacyRawMatches = safeTokenCompare(invite.token || "", inviteToken);
    if (!hashMatches && !legacyRawMatches) return;
  }

  try {
    await prisma.$transaction(
      async (tx) => {
        const currentInvite = await tx.businessInvite.findUnique({ where: { id: invite.id } });
        if (!currentInvite || currentInvite.status !== "PENDING") return;
        if (currentInvite.expiresAt && currentInvite.expiresAt <= now) return;

        const business = await tx.business.findUnique({
          where: { id: currentInvite.businessId },
          select: {
            id: true,
            ownerId: true,
            plan: true,
            orgSubscription: {
              select: { planId: true },
            },
          },
        });
        if (!business) return;

        const existingMember = await tx.businessMember.findUnique({
          where: { businessId_userId: { businessId: business.id, userId } },
        });

        const planForSeats = business.orgSubscription?.planId ?? business.plan;
        const seatLimit = getSeatLimitForPlan(planForSeats);
        const seatsUsed = await tx.businessMember.count({
          where: { businessId: business.id, status: "active" },
        });

        if ((!existingMember || existingMember.status !== "active") && seatLimit !== null && seatsUsed >= seatLimit) {
          throw new Error("TEAM_SEAT_LIMIT_REACHED");
        }

        const inviteRole = String(currentInvite.role || "member").toLowerCase() === "admin" ? "admin" : "member";

        if (!existingMember) {
          await tx.businessMember.create({
            data: {
              businessId: business.id,
              userId,
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
            userId,
            action: "TEAM_INVITE_ACCEPTED",
            resourceType: "business",
            resourceId: business.id,
            metadata: { inviteId: currentInvite.id },
          },
        });

        await tx.auditLog.create({
          data: {
            userId,
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
  } catch (error: any) {
    if (error?.message === "TEAM_SEAT_LIMIT_REACHED") {
      await prisma.activityLog.create({
        data: {
          userId,
          action: "TEAM_INVITE_ACCEPT_FAILED",
          metadata: { reason: "seat_limit_reached", email: normalizedEmail },
        },
      });
      return;
    }
    throw error;
  }
}

// Credentials signup endpoint: validates payload, hashes password, prevents duplicates, returns clear errors.`
);

fs.writeFileSync(p, s);
console.log("register route updated");
