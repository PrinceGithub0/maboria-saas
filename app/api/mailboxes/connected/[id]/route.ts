import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { withErrorHandling } from "@/lib/api-handler";
import { requireOrgPermission } from "@/lib/org-auth";
import { prisma } from "@/lib/prisma";
import { updateConnectedMailboxStatus } from "@/lib/mailboxes/service";
import { canAddWorkspaceConnections, mailboxStatusConsumesConnection } from "@/lib/workspace-connections";

type Params = { params: Promise<{ id: string }> };

export const GET = withErrorHandling(async (_req: Request, { params }: Params) => {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const access = await requireOrgPermission(session.user.id, {
    permission: "settings:business:read",
    requireActiveSubscription: true,
  });
  if (!access.ok) {
    return NextResponse.json({ error: access.message, code: access.code }, { status: access.status });
  }

  const { id } = await params;
  const item = await prisma.connectedMailbox.findFirst({
    where: {
      id,
      workspaceId: access.context.orgId,
    },
  });
  if (!item) {
    return NextResponse.json({ error: "Mailbox not found." }, { status: 404 });
  }

  return NextResponse.json({ item });
});

export const PATCH = withErrorHandling(async (req: Request, { params }: Params) => {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const access = await requireOrgPermission(session.user.id, {
    permission: "settings:business:write",
    requireActiveSubscription: true,
  });
  if (!access.ok) {
    return NextResponse.json({ error: access.message, code: access.code }, { status: access.status });
  }

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const status = String(body?.status || "").trim().toUpperCase();
  if (!["PENDING", "ACTIVE", "DISCONNECTED", "ERROR"].includes(status)) {
    return NextResponse.json({ error: "Valid mailbox status is required." }, { status: 422 });
  }

  const existing = await prisma.connectedMailbox.findFirst({
    where: {
      id,
      workspaceId: access.context.orgId,
    },
    select: {
      id: true,
      status: true,
    },
  });
  if (!existing) {
    return NextResponse.json({ error: "Mailbox not found." }, { status: 404 });
  }

  if (!mailboxStatusConsumesConnection(existing.status) && mailboxStatusConsumesConnection(status)) {
    const connectionCapacity = await canAddWorkspaceConnections({
      workspaceId: access.context.orgId,
      plan: access.context.orgPlan,
    });
    if (!connectionCapacity.ok) {
      return NextResponse.json(
        {
          error: "Workspace connection limit reached.",
          code: "CONNECTION_LIMIT_REACHED",
          connectionLimit: connectionCapacity.limit,
          connectionsUsed: connectionCapacity.used,
        },
        { status: 409 }
      );
    }
  }

  const updated = await updateConnectedMailboxStatus({
    mailboxId: id,
    workspaceId: access.context.orgId,
    status: status as "PENDING" | "ACTIVE" | "DISCONNECTED" | "ERROR",
    metadata: body?.metadata && typeof body.metadata === "object" ? body.metadata : undefined,
  });

  if (updated.count === 0) {
    return NextResponse.json({ error: "Mailbox not found." }, { status: 404 });
  }

  const item = await prisma.connectedMailbox.findFirst({
    where: {
      id,
      workspaceId: access.context.orgId,
    },
  });

  return NextResponse.json({ item });
});
