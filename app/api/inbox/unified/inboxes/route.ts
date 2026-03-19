import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { withErrorHandling } from "@/lib/api-handler";
import { encryptInboxSecret } from "@/lib/crypto";
import { ensureDefaultUnifiedInboxes, requireUnifiedInboxAccess, writeUnifiedAuditEvent } from "@/lib/inbox/unified";
import { prisma } from "@/lib/prisma";

const emailCredentialsSchema = z.object({
  host: z.string().min(1),
  port: z.coerce.number().int().min(1).max(65535).default(587),
  secure: z.boolean().optional(),
  username: z.string().min(1),
  password: z.string().min(1),
  from: z.string().email().optional(),
});

const whatsappCredentialsSchema = z.object({
  accessToken: z.string().min(1),
  phoneNumberId: z.string().min(1),
  apiVersion: z.string().min(1).default("v19.0"),
  appSecret: z.string().min(1),
  verifyToken: z.string().min(1).optional(),
});

export const GET = withErrorHandling(async () => {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const context = await requireUnifiedInboxAccess(session.user.id);

  await ensureDefaultUnifiedInboxes(context.orgId);
  const inboxes = await prisma.unifiedInbox.findMany({
    where: { tenantId: context.orgId },
    orderBy: [{ type: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      type: true,
      name: true,
      status: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({ items: inboxes });
});

export const PUT = withErrorHandling(async (req: Request) => {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const context = await requireUnifiedInboxAccess(session.user.id);
  const body = await req.json().catch(() => ({}));

  const id = String(body?.id || "").trim();
  if (!id) return NextResponse.json({ error: "id is required." }, { status: 422 });

  const existing = await prisma.unifiedInbox.findFirst({
    where: { id, tenantId: context.orgId },
    select: { id: true, type: true },
  });
  if (!existing) return NextResponse.json({ error: "Inbox not found." }, { status: 404 });

  const nextName = body?.name ? String(body.name).trim() : undefined;
  const nextStatus = body?.status ? String(body.status).trim().toUpperCase() : undefined;
  const credentialsInput = body?.credentials && typeof body.credentials === "object" ? body.credentials : undefined;
  let credentialsEncrypted: string | undefined;
  if (credentialsInput) {
    if (existing.type === "EMAIL") {
      const parsed = emailCredentialsSchema.safeParse((credentialsInput as any).email);
      if (!parsed.success) {
        return NextResponse.json({ error: "Invalid email credentials." }, { status: 422 });
      }
      credentialsEncrypted = encryptInboxSecret(JSON.stringify({ email: parsed.data }));
    } else if (existing.type === "WHATSAPP") {
      const parsed = whatsappCredentialsSchema.safeParse((credentialsInput as any).whatsapp);
      if (!parsed.success) {
        return NextResponse.json({ error: "Invalid WhatsApp credentials." }, { status: 422 });
      }
      credentialsEncrypted = encryptInboxSecret(JSON.stringify({ whatsapp: parsed.data }));
    } else {
      return NextResponse.json({ error: "Unsupported inbox type." }, { status: 422 });
    }
  }

  const updated = await prisma.$transaction(async (tx) => {
    const record = await tx.unifiedInbox.update({
      where: { id: existing.id },
      data: {
        name: nextName || undefined,
        status:
          nextStatus === "ACTIVE" || nextStatus === "DISCONNECTED" || nextStatus === "ERROR" || nextStatus === "DISABLED"
            ? nextStatus
            : undefined,
        credentialsEncrypted,
      },
      select: {
        id: true,
        type: true,
        name: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    await writeUnifiedAuditEvent(tx, {
      tenantId: context.orgId,
      actorUserId: session.user.id,
      actionType: "inbox.updated",
      metadata: {
        inboxId: record.id,
        status: record.status,
      },
    });

    return record;
  });

  return NextResponse.json(updated);
});
