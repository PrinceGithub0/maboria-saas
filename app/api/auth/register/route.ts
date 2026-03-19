import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth";
import { signupSchema } from "@/lib/validators";
import { assertRateLimit } from "@/lib/rate-limit";
import { withErrorHandling } from "@/lib/api-handler";
import { withRequestLogging } from "@/lib/request-logger";
import { generatePublicId } from "@/lib/public-id";
import { PASSWORD_MIN_LENGTH_ERROR } from "@/lib/password-policy";
import { ACTIVE_ORG_COOKIE_NAME, getSeatLimitForPlan, hashInviteToken, safeTokenCompare } from "@/lib/org-auth";
import { requireSystemFlag } from "@/lib/system-flags-guard";

async function resolvePendingBusinessInvite({
  email,
  inviteToken,
}: {
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
      AND: [
        { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
        ...(inviteToken
          ? [
              {
                OR: [
                  { tokenHash: inviteTokenHash ?? undefined },
                  { token: inviteTokenHash ?? undefined },
                  { token: inviteToken },
                ],
              },
            ]
          : []),
      ],
    },
    orderBy: { createdAt: "desc" },
  });

  if (!invite) return null;

  if (inviteToken) {
    const storedHash = invite.tokenHash || invite.token || "";
    const hashMatches = inviteTokenHash ? safeTokenCompare(storedHash, inviteTokenHash) : false;
    const legacyRawMatches = safeTokenCompare(invite.token || "", inviteToken);
    if (!hashMatches && !legacyRawMatches) {
      return null;
    }
  }

  return invite;
}

async function acceptBusinessInvite({
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
  const invite = await resolvePendingBusinessInvite({ email: normalizedEmail, inviteToken });

  if (!invite) {
    return { status: "not_found" as const };
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
    return { status: "accepted" as const };
  } catch (error: any) {
    if (error?.message === "TEAM_SEAT_LIMIT_REACHED") {
      await prisma.activityLog.create({
        data: {
          userId,
          action: "TEAM_INVITE_ACCEPT_FAILED",
          metadata: { reason: "seat_limit_reached", email: normalizedEmail },
        },
      });
      return { status: "seat_limit" as const };
    }
    throw error;
  }
}

// Credentials signup endpoint: validates payload, hashes password, prevents duplicates, returns clear errors.
export const POST = withRequestLogging(
  withErrorHandling(async (req: Request) => {
    const signupBlocked = await requireSystemFlag("allow_signup", "Signup is currently disabled.");
    if (signupBlocked) return signupBlocked;

    const body = await req.json();
    const parsedResult = signupSchema.safeParse(body);
    if (!parsedResult.success) {
      const passwordTooShort = parsedResult.error.issues.some((issue) => {
        const field = issue.path[0];
        return field === "password" && issue.message === PASSWORD_MIN_LENGTH_ERROR;
      });
      if (passwordTooShort) {
        return NextResponse.json({ error: PASSWORD_MIN_LENGTH_ERROR }, { status: 400 });
      }
      throw parsedResult.error;
    }
    const parsed = parsedResult.data;

    assertRateLimit(`signup:${parsed.email}`);

    const email = parsed.email.toLowerCase().trim();
    const pendingInvite = parsed.inviteToken
      ? await resolvePendingBusinessInvite({
          email,
          inviteToken: parsed.inviteToken,
        })
      : null;
    if (parsed.inviteToken && !pendingInvite) {
      return NextResponse.json(
        { error: "This invitation is invalid or has expired." },
        { status: 400 }
      );
    }

    if (pendingInvite) {
      const business = await prisma.business.findUnique({
        where: { id: pendingInvite.businessId },
        select: {
          id: true,
          plan: true,
          orgSubscription: {
            select: { planId: true },
          },
        },
      });
      if (!business) {
        return NextResponse.json(
          { error: "This invitation is no longer valid." },
          { status: 400 }
        );
      }
      const planForSeats = business.orgSubscription?.planId ?? business.plan;
      const seatLimit = getSeatLimitForPlan(planForSeats);
      if (seatLimit !== null) {
        const seatsUsed = await prisma.businessMember.count({
          where: { businessId: business.id, status: "active" },
        });
        if (seatsUsed >= seatLimit) {
          return NextResponse.json(
            {
              error: "This workspace has reached its team seat limit. Ask the owner to free a seat or upgrade the plan.",
              code: "TEAM_SEAT_LIMIT_REACHED",
            },
            { status: 409 }
          );
        }
      }
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      if (parsed.inviteToken) {
        return NextResponse.json(
          {
            error: "An account already exists for this invited email. Sign in instead to accept the workspace invitation.",
            signInRequired: true,
            redirectTo: "/login",
          },
          { status: 409 }
        );
      }
      const existingSub = await prisma.subscription.findFirst({
        where: { userId: existing.id },
        orderBy: { createdAt: "desc" },
      });
      if (existingSub && existingSub.status !== "ACTIVE") {
        return NextResponse.json(
          { error: "Account exists. Continue to checkout.", resumeCheckout: true },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: "Email already in use" }, { status: 409 });
    }

    const passwordHash = await hashPassword(parsed.password);
    let created: { id: string; publicId: string | null } | null = null;
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const publicId = generatePublicId();
      try {
        created = await prisma.user.create({
          data: {
            name: parsed.name,
            email,
            passwordHash,
            role: "USER",
            publicId,
            locale: parsed.locale || null,
            timeZone: parsed.timeZone || null,
          },
          select: { id: true, publicId: true },
        });
        break;
      } catch (error: any) {
        if (error?.code === "P2002") {
          const targets = Array.isArray(error?.meta?.target) ? error.meta.target : [];
          if (targets.includes("email")) {
            if (parsed.inviteToken) {
              return NextResponse.json(
                {
                  error: "An account already exists for this invited email. Sign in instead to accept the workspace invitation.",
                  signInRequired: true,
                  redirectTo: "/login",
                },
                { status: 409 }
              );
            }
            return NextResponse.json({ error: "Email already in use" }, { status: 409 });
          }
          if (targets.includes("publicId")) {
            continue;
          }
        }
        throw error;
      }
    }

    if (!created) {
      return NextResponse.json({ error: "Unable to create a unique user ID" }, { status: 500 });
    }

    const inviteAcceptance = await acceptBusinessInvite({
      userId: created.id,
      email,
      inviteToken: parsed.inviteToken,
    });

    if (pendingInvite) {
      if (inviteAcceptance?.status === "accepted") {
        const response = NextResponse.json(
          {
            success: true,
            userId: created.publicId,
            joinedWorkspace: true,
            redirectTo: "/dashboard",
          },
          { status: 201 }
        );
        response.cookies.set(ACTIVE_ORG_COOKIE_NAME, pendingInvite.businessId, {
          httpOnly: true,
          sameSite: "lax",
          secure: process.env.NODE_ENV === "production",
          path: "/",
          maxAge: 60 * 60 * 24 * 30,
        });
        return response;
      }

      if (inviteAcceptance?.status === "seat_limit") {
        return NextResponse.json(
          {
            error:
              "Your account was created, but the workspace reached its team seat limit before you could join. Ask the owner to free a seat, then sign in again.",
            accountCreated: true,
          },
          { status: 409 }
        );
      }

      return NextResponse.json(
        {
          error: "Your invitation expired before it could be accepted. Sign in and contact the workspace owner.",
          accountCreated: true,
        },
        { status: 409 }
      );
    }

    const intent = parsed.planIntent;
    const plan =
      intent === "starter"
        ? "STARTER"
        : intent === "pro"
          ? "PRO"
          : intent === "growth"
            ? "GROWTH"
            : "BUSINESS";
    const now = new Date();
    await prisma.subscription.create({
      data: {
        userId: created.id,
        plan,
        status: "INCOMPLETE",
        renewalDate: now,
        autoRenew: true,
        provider: null,
        currentPeriodStart: null,
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
        interval: "monthly",
        usagePeriod: "monthly",
      },
    });

    await prisma.activityLog.create({
      data: {
        userId: created.id,
        action: "PLAN_INTENT",
        metadata: { plan, autoRenew: true },
      },
    });

    return NextResponse.json(
      { success: true, userId: created.publicId, planIntent: intent },
      { status: 201 }
    );
  })
);
