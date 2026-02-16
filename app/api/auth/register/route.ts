import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth";
import { signupSchema } from "@/lib/validators";
import { assertRateLimit } from "@/lib/rate-limit";
import { withErrorHandling } from "@/lib/api-handler";
import { withRequestLogging } from "@/lib/request-logger";
import { generatePublicId } from "@/lib/public-id";
import { PASSWORD_MIN_LENGTH_ERROR } from "@/lib/password-policy";

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
  const invite = await prisma.businessInvite.findFirst({
    where: {
      email,
      status: "PENDING",
      ...(inviteToken ? { token: inviteToken } : {}),
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    orderBy: { createdAt: "desc" },
  });
  if (!invite) return;

  const existingMember = await prisma.businessMember.findFirst({
    where: { businessId: invite.businessId, userId },
  });
  if (!existingMember) {
    await prisma.businessMember.create({
      data: {
        businessId: invite.businessId,
        userId,
        role: invite.role || "member",
      },
    });
  }
  await prisma.businessInvite.update({
    where: { id: invite.id },
    data: { status: "ACCEPTED", acceptedAt: now },
  });
  await prisma.activityLog.create({
    data: {
      userId,
      action: "TEAM_INVITE_ACCEPTED",
      resourceType: "business",
      resourceId: invite.businessId,
      metadata: { inviteId: invite.id },
    },
  });
}

// Credentials signup endpoint: validates payload, hashes password, prevents duplicates, returns clear errors.
export const POST = withRequestLogging(
  withErrorHandling(async (req: Request) => {
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
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
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

    await acceptBusinessInvite({
      userId: created.id,
      email,
      inviteToken: parsed.inviteToken,
    });

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
