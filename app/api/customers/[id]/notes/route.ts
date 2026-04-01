import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireBillingAccess } from "@/lib/permissions";
import { getVisibleCustomerWhere } from "@/lib/customers";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const billingAccess = await requireBillingAccess(session.user.id);
  if (!billingAccess.ok) {
    return NextResponse.json({ error: billingAccess.message }, { status: 403 });
  }

  const { id } = await params;
  const targetUserId = billingAccess.ownerUserId;
  const visibilityWhere = await getVisibleCustomerWhere(targetUserId);

  const customer = await prisma.customer.findFirst({
    where: { ...visibilityWhere, id, userId: targetUserId, deletedAt: null },
    select: { id: true },
  });

  if (!customer) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const notes = await prisma.customerNote.findMany({
    where: {
      customerId: customer.id,
      userId: targetUserId,
    },
    orderBy: { createdAt: "desc" },
    include: {
      author: {
        select: { id: true, name: true, email: true },
      },
    },
  });

  return NextResponse.json({ items: notes });
}

export async function POST(request: Request, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const billingAccess = await requireBillingAccess(session.user.id);
  if (!billingAccess.ok) {
    return NextResponse.json({ error: billingAccess.message }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const content = String(body?.content || "").trim();
  if (!content) {
    return NextResponse.json({ error: "Note content is required." }, { status: 422 });
  }

  const { id } = await params;
  const targetUserId = billingAccess.ownerUserId;
  const visibilityWhere = await getVisibleCustomerWhere(targetUserId);

  const customer = await prisma.customer.findFirst({
    where: { ...visibilityWhere, id, userId: targetUserId, deletedAt: null },
    select: { id: true },
  });

  if (!customer) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const note = await prisma.customerNote.create({
    data: {
      userId: targetUserId,
      customerId: customer.id,
      authorUserId: session.user.id,
      content,
    },
    include: {
      author: {
        select: { id: true, name: true, email: true },
      },
    },
  });

  return NextResponse.json(note, { status: 201 });
}
