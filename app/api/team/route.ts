import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { enforceEntitlement, getTeamSeatUsageThisMonth } from "@/lib/entitlements";
import { sendTemplateEmail } from "@/lib/email";
import crypto from "crypto";

function addUtcMonths(date: Date, months: number) {
  return new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth() + months,
      date.getUTCDate(),
      date.getUTCHours(),
      date.getUTCMinutes(),
      date.getUTCSeconds()
    )
  );
}

const inviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(["member", "admin"]).default("member"),
});

const removeSchema = z.object({
  memberId: z.string().min(1),
});

async function getOrCreateBusiness(userId: string) {
  const existingMember = await prisma.businessMember.findFirst({
    where: { userId },
    include: { business: true },
  });
  if (existingMember) {
    return { business: existingMember.business, role: existingMember.role };
  }

  const ownedBusiness = await prisma.business.findFirst({
    where: { ownerId: userId },
  });
  if (ownedBusiness) {
    const member = await prisma.businessMember.create({
      data: { userId, businessId: ownedBusiness.id, role: "owner" },
    });
    return { business: ownedBusiness, role: member.role };
  }

  const profile = await prisma.businessProfile.findUnique({ where: { userId } });
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true, email: true },
  });
  const sub = await prisma.subscription.findFirst({
    where: { userId, status: "ACTIVE" },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  const anchor = sub?.createdAt ?? new Date();
  const billingCycleStartAt = new Date(
    Date.UTC(
      anchor.getUTCFullYear(),
      anchor.getUTCMonth(),
      anchor.getUTCDate(),
      anchor.getUTCHours(),
      anchor.getUTCMinutes(),
      anchor.getUTCSeconds()
    )
  );
  const usageResetAt = addUtcMonths(billingCycleStartAt, 1);
  const name = profile?.businessName || user?.name || "Maboria Workspace";
  const domain = user?.email?.split("@")[1] ?? null;
  const business = await prisma.business.create({
    data: {
      name,
      domain,
      ownerId: userId,
      billingCycleStartAt,
      usageResetAt,
      members: { create: [{ userId, role: "owner" }] },
    },
  });
  return { business, role: "owner" };
}

async function requireTeamAccess(userId: string) {
  const entitlement = await enforceEntitlement(userId, {
    feature: "dashboard",
    requiredPlan: "starter",
    allowTrial: false,
  });
  if (!entitlement.ok) {
    return {
      ok: false as const,
      response: NextResponse.json(
        {
          error: entitlement.reason,
          type: entitlement.type,
          requiredPlan: entitlement.requiredPlan || "starter",
        },
        { status: 403 }
      ),
    };
  }
  return { ok: true as const };
}

function isAdminRole(role?: string | null) {
  return role === "owner" || role === "admin";
}

async function resolveSeatLimit(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
  if (user?.role === "ADMIN") return { seatLimit: null as number | null, planLabel: "enterprise" };

  const sub = await prisma.subscription.findFirst({
    where: { userId, status: { in: ["ACTIVE"] } },
    orderBy: { createdAt: "desc" },
  });
  switch (sub?.plan) {
    case "STARTER":
      return { seatLimit: 1, planLabel: "starter" };
    case "PRO":
      return { seatLimit: 3, planLabel: "pro" };
    case "BUSINESS":
      return { seatLimit: 10, planLabel: "business" };
    case "PREMIUM":
      return { seatLimit: 10, planLabel: "business" };
    case "ENTERPRISE":
      return { seatLimit: null, planLabel: "enterprise" };
    case "GROWTH":
    default:
      return { seatLimit: 5, planLabel: "growth" };
  }
}

function buildInviteLink(token: string, email: string) {
  const baseUrl =
    process.env.APP_URL || process.env.NEXTAUTH_URL || "http://localhost:3000";
  const url = new URL("/signup", baseUrl);
  url.searchParams.set("invite", token);
  url.searchParams.set("email", email);
  return url.toString();
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const access = await requireTeamAccess(session.user.id);
  if (!access.ok) return access.response;

  const { seatLimit, planLabel } = await resolveSeatLimit(session.user.id);
  const { business } = await getOrCreateBusiness(session.user.id);
  const members = await prisma.businessMember.findMany({
    where: { businessId: business.id },
    include: {
      user: { select: { id: true, name: true, email: true, publicId: true, role: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({ business, members, seatLimit, planLabel });
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const access = await requireTeamAccess(session.user.id);
  if (!access.ok) return access.response;

  const { business, role } = await getOrCreateBusiness(session.user.id);
  if (!isAdminRole(role)) {
    return NextResponse.json({ error: "Only owners can add team members." }, { status: 403 });
  }

  try {
    const body = await req.json();
    const parsed = inviteSchema.parse(body);
    const normalizedEmail = parsed.email.toLowerCase().trim();
    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    const { seatLimit } = await resolveSeatLimit(session.user.id);
    const memberCount = await prisma.businessMember.count({ where: { businessId: business.id } });
    const pendingInvites = await prisma.businessInvite.count({
      where: { businessId: business.id, status: "PENDING" },
    });
    const seatUsage = await getTeamSeatUsageThisMonth(session.user.id);
    const seatsUsed = Math.max(seatUsage, memberCount + pendingInvites);
    if (seatLimit !== null && seatsUsed >= seatLimit) {
      const requiredPlan =
        seatLimit === 1 ? "pro" : seatLimit === 3 ? "growth" : seatLimit === 5 ? "business" : "enterprise";
      return NextResponse.json(
        {
          error: "Team limit reached.",
          type: "limit_reached",
          requiredPlan,
        },
        { status: 403 }
      );
    }

    if (!user) {
      const token = crypto.randomUUID().replace(/-/g, "");
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const existingInvite = await prisma.businessInvite.findFirst({
        where: { businessId: business.id, email: normalizedEmail },
      });
      const shouldCountSeat = seatLimit !== null && (!existingInvite || existingInvite.status !== "PENDING");
      const invite = await prisma.businessInvite.upsert({
        where: { businessId_email: { businessId: business.id, email: normalizedEmail } },
        update: { token, role: parsed.role, status: "PENDING", expiresAt, invitedById: session.user.id },
        create: {
          businessId: business.id,
          email: normalizedEmail,
          role: parsed.role,
          token,
          status: "PENDING",
          expiresAt,
          invitedById: session.user.id,
        },
      });
      if (shouldCountSeat) {
        await prisma.usageRecord.create({
          data: { userId: business.ownerId, category: "team_seat", amount: 1, period: "monthly" },
        });
      }
      const inviteLink = buildInviteLink(invite.token, normalizedEmail);
      await sendTemplateEmail(
        normalizedEmail,
        "You are invited to Maboria",
        `<p>You have been invited to join <strong>${business.name}</strong> on Maboria.</p>
         <p><a href="${inviteLink}">Accept invitation</a></p>
         <p>If you do not have an account yet, the link will guide you to sign up.</p>`
      );
      await prisma.activityLog.create({
        data: {
          userId: session.user.id,
          action: "TEAM_INVITE_SENT",
          resourceType: "business",
          resourceId: business.id,
          metadata: { email: normalizedEmail, role: parsed.role },
        },
      });
      return NextResponse.json({ invited: true }, { status: 202 });
    }

    const existing = await prisma.businessMember.findFirst({
      where: { businessId: business.id, userId: user.id },
      include: { user: true },
    });
    if (existing) {
      return NextResponse.json({ member: existing, alreadyMember: true });
    }

    if (seatLimit !== null && seatsUsed >= seatLimit) {
      const requiredPlan =
        seatLimit === 1 ? "pro" : seatLimit === 3 ? "growth" : seatLimit === 5 ? "business" : "enterprise";
      return NextResponse.json(
        { error: "Team limit reached.", type: "limit_reached", requiredPlan },
        { status: 403 }
      );
    }

    const member = await prisma.businessMember.create({
      data: {
        userId: user.id,
        businessId: business.id,
        role: parsed.role,
      },
      include: { user: true },
    });
    if (seatLimit !== null) {
      await prisma.usageRecord.create({
        data: { userId: business.ownerId, category: "team_seat", amount: 1, period: "monthly" },
      });
    }
    return NextResponse.json({ member }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}

export async function DELETE(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const access = await requireTeamAccess(session.user.id);
  if (!access.ok) return access.response;

  const { business, role } = await getOrCreateBusiness(session.user.id);
  if (!isAdminRole(role)) {
    return NextResponse.json({ error: "Only owners can remove team members." }, { status: 403 });
  }

  try {
    const body = await req.json();
    const parsed = removeSchema.parse(body);
    const member = await prisma.businessMember.findFirst({
      where: { id: parsed.memberId, businessId: business.id },
    });
    if (!member) {
      return NextResponse.json({ error: "Member not found." }, { status: 404 });
    }
    if (member.userId === business.ownerId) {
      return NextResponse.json({ error: "Owner cannot be removed." }, { status: 400 });
    }

    await prisma.businessMember.delete({ where: { id: member.id } });
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
