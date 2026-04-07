import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { withErrorHandling } from "@/lib/api-handler";
import { requireOrgPermission } from "@/lib/org-auth";
import { getConnectedMailboxProvider, isConnectedMailboxProvider, listConnectedMailboxProviders } from "@/lib/mailboxes/provider";
import { createConnectedMailboxRecord, listConnectedMailboxes } from "@/lib/mailboxes/service";
import { canAddWorkspaceConnections } from "@/lib/workspace-connections";

export const GET = withErrorHandling(async () => {
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

  const items = await listConnectedMailboxes({
    workspaceId: access.context.orgId,
  });

  return NextResponse.json({
    items,
    providers: listConnectedMailboxProviders(),
  });
});

export const POST = withErrorHandling(async (req: Request) => {
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

  const body = await req.json().catch(() => ({}));
  const provider = String(body?.provider || "").trim().toUpperCase();
  const emailAddress = String(body?.emailAddress || "").trim().toLowerCase();
  const displayName = String(body?.displayName || "").trim();

  if (!isConnectedMailboxProvider(provider)) {
    return NextResponse.json({ error: "Unsupported mailbox provider." }, { status: 422 });
  }
  if (!emailAddress || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailAddress)) {
    return NextResponse.json({ error: "Valid emailAddress is required." }, { status: 422 });
  }

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

  try {
    const record = await createConnectedMailboxRecord({
      subscriberId: session.user.id,
      workspaceId: access.context.orgId,
      provider,
      emailAddress,
      displayName: displayName || null,
      metadata: {
        authMode: getConnectedMailboxProvider(provider).authMode,
        capabilities: getConnectedMailboxProvider(provider).capabilities,
      },
    });

    return NextResponse.json({ item: record }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "Mailbox already connected for this workspace." }, { status: 409 });
    }
    throw error;
  }
});
