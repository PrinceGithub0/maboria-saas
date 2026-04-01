import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireBillingAccess } from "@/lib/permissions";
import { getVisibleCustomerWhere } from "@/lib/customers";

type Params = { params: Promise<{ id: string; noteId: string }> };

async function resolveScopedNote(sessionUserId: string, customerId: string, noteId: string) {
  const billingAccess = await requireBillingAccess(sessionUserId);
  if (!billingAccess.ok) {
    return { error: NextResponse.json({ error: billingAccess.message }, { status: 403 }) };
  }

  const targetUserId = billingAccess.ownerUserId;
  const visibilityWhere = await getVisibleCustomerWhere(targetUserId);

  const customer = await prisma.customer.findFirst({
    where: { ...visibilityWhere, id: customerId, userId: targetUserId, deletedAt: null },
    select: { id: true },
  });

  if (!customer) {
    return { error: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  }

  const note = await prisma.customerNote.findFirst({
    where: {
      id: noteId,
      customerId: customer.id,
      userId: targetUserId,
    },
    include: {
      author: {
        select: { id: true, name: true, email: true },
      },
    },
  });

  if (!note) {
    return { error: NextResponse.json({ error: "Note not found." }, { status: 404 }) };
  }

  return { note };
}

export async function PATCH(request: Request, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, noteId } = await params;
  const scoped = await resolveScopedNote(session.user.id, id, noteId);
  if ("error" in scoped) return scoped.error;

  const body = await request.json().catch(() => ({}));
  const content = String(body?.content || "").trim();
  if (!content) {
    return NextResponse.json({ error: "Note content is required." }, { status: 422 });
  }

  const note = await prisma.customerNote.update({
    where: { id: scoped.note.id },
    data: { content, authorUserId: session.user.id },
    include: {
      author: {
        select: { id: true, name: true, email: true },
      },
    },
  });

  return NextResponse.json(note);
}

export async function DELETE(_request: Request, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, noteId } = await params;
  const scoped = await resolveScopedNote(session.user.id, id, noteId);
  if ("error" in scoped) return scoped.error;

  await prisma.customerNote.delete({
    where: { id: scoped.note.id },
  });

  return NextResponse.json({ ok: true });
}
