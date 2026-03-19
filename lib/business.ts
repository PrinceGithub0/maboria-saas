import "server-only";

import { prisma } from "@/lib/prisma";

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

export async function getOrCreateBusinessForUser(userId: string) {
  const activeSub = await prisma.subscription.findFirst({
    where: { userId, status: "ACTIVE" },
    orderBy: { createdAt: "desc" },
    select: { plan: true, createdAt: true },
  });
  const plan = activeSub?.plan ?? "STARTER";

  const existingMember = await prisma.businessMember.findFirst({
    where: { userId, status: "active" },
    include: { business: true },
  });
  if (existingMember) {
    if (existingMember.business.plan !== plan) {
      await prisma.business.update({
        where: { id: existingMember.business.id },
        data: { plan },
      });
      return { business: { ...existingMember.business, plan }, role: existingMember.role };
    }
    return { business: existingMember.business, role: existingMember.role };
  }

  const ownedBusiness = await prisma.business.findFirst({
    where: { ownerId: userId },
  });
  if (ownedBusiness) {
    if (ownedBusiness.plan !== plan) {
      await prisma.business.update({ where: { id: ownedBusiness.id }, data: { plan } });
    }
    const member = await prisma.businessMember.upsert({
      where: { businessId_userId: { businessId: ownedBusiness.id, userId } },
      create: { userId, businessId: ownedBusiness.id, role: "owner", status: "active", joinedAt: new Date() },
      update: { role: "owner", status: "active", joinedAt: new Date() },
    });
    return { business: { ...ownedBusiness, plan }, role: member.role };
  }

  const profile = await prisma.businessProfile.findUnique({ where: { userId } });
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true, email: true },
  });
  const anchor = activeSub?.createdAt ?? new Date();
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
      plan,
      billingCycleStartAt,
      usageResetAt,
      members: { create: [{ userId, role: "owner", status: "active", joinedAt: new Date() }] },
    },
  });
  return { business, role: "owner" };
}
