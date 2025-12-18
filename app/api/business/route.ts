import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { businessSchema } from "@/lib/validators";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const businesses = await prisma.businessMember.findMany({
    where: { userId: session.user.id },
    include: { business: true },
  });

  return NextResponse.json(businesses.map((m) => m.business));
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const parsed = businessSchema.parse(body);
    const business = await prisma.business.create({
      data: {
        name: parsed.name,
        domain: parsed.domain,
        ownerId: session.user.id,
        members: { create: [{ userId: session.user.id, role: "owner" }] },
      },
    });
    return NextResponse.json(business, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
