import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth";
import { signupSchema } from "@/lib/validators";
import { assertRateLimit } from "@/lib/rate-limit";
import { withErrorHandling } from "@/lib/api-handler";
import { withRequestLogging } from "@/lib/request-logger";
import { log } from "@/lib/logger";
import { generatePublicId } from "@/lib/public-id";

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
    const parsed = signupSchema.parse(body);

    assertRateLimit(`signup:${parsed.email}`);

    const email = parsed.email.toLowerCase().trim();
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
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
