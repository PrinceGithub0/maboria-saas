import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { businessSchema } from "@/lib/validators";

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

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const businesses = await prisma.businessMember.findMany({
    where: { userId: session.user.id, status: "active" },
    include: { business: true },
  });

  return NextResponse.json(businesses.map((m) => m.business));
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const parsedResult = businessSchema.safeParse(body);
    if (!parsedResult.success) {
      const issue = parsedResult.error.issues[0];
      if (issue?.path?.includes("name")) {
        return NextResponse.json({ error: "Business name too short" }, { status: 400 });
      }
      return NextResponse.json({ error: "Invalid business data" }, { status: 400 });
    }
    const parsed = parsedResult.data;
    const sub = await prisma.subscription.findFirst({
      where: { userId: session.user.id, status: "ACTIVE" },
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
    const business = await prisma.business.create({
      data: {
        name: parsed.name,
        domain: parsed.domain,
        ownerId: session.user.id,
        billingCycleStartAt,
        usageResetAt,
        members: { create: [{ userId: session.user.id, role: "owner" }] },
      },
    });
    return NextResponse.json(business, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Could not create business." }, { status: 400 });
  }
}
