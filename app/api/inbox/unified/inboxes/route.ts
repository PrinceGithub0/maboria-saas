import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { withErrorHandling } from "@/lib/api-handler";
import { encryptInboxSecret } from "@/lib/crypto";
import { decryptInboxCredentials } from "@/lib/inbox/channels";
import { ensureDefaultUnifiedInboxes, requireUnifiedInboxAccess, writeUnifiedAuditEvent } from "@/lib/inbox/unified";
import { getMailboxOauthProviderAvailability } from "@/lib/mailboxes/oauth";
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

function maskMiddle(value: string, options?: { keepStart?: number; keepEnd?: number }) {
  const normalized = String(value || "").trim();
  if (!normalized) return "";
  const keepStart = options?.keepStart ?? 3;
  const keepEnd = options?.keepEnd ?? 2;
  if (normalized.length <= keepStart + keepEnd) return normalized;
  return `${normalized.slice(0, keepStart)}${"*".repeat(Math.max(normalized.length - keepStart - keepEnd, 3))}${normalized.slice(-keepEnd)}`;
}

export const GET = withErrorHandling(async () => {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const context = await requireUnifiedInboxAccess(session.user.id);
  const oauthProviderAvailability = getMailboxOauthProviderAvailability();

  await ensureDefaultUnifiedInboxes(context.orgId);
  const inboxes = await prisma.unifiedInbox.findMany({
    where: { tenantId: context.orgId },
    orderBy: [{ type: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      type: true,
      name: true,
      status: true,
      credentialsEncrypted: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  const emailOauthMailboxIds = inboxes
    .map((inbox) => decryptInboxCredentials(inbox.credentialsEncrypted).emailOAuth?.connectedMailboxId || null)
    .filter((value): value is string => Boolean(value));

  const connectedMailboxes =
    emailOauthMailboxIds.length > 0
      ? await prisma.connectedMailbox.findMany({
          where: {
            id: { in: emailOauthMailboxIds },
            workspaceId: context.orgId,
          },
          select: {
            id: true,
            provider: true,
            status: true,
            emailAddress: true,
            displayName: true,
            updatedAt: true,
          },
        })
      : [];
  const mailboxById = new Map(connectedMailboxes.map((mailbox) => [mailbox.id, mailbox]));

  return NextResponse.json({
    oauthProviders: {
      gmail: { configured: oauthProviderAvailability.GMAIL },
      outlook: { configured: oauthProviderAvailability.OUTLOOK },
    },
    items: inboxes.map((inbox) => {
      const credentials = decryptInboxCredentials(inbox.credentialsEncrypted);
      const emailOauthMailboxId = credentials.emailOAuth?.connectedMailboxId || null;
      const emailMailbox = emailOauthMailboxId ? mailboxById.get(emailOauthMailboxId) || null : null;

      return {
        id: inbox.id,
        type: inbox.type,
        name: inbox.name,
        status: inbox.status,
        createdAt: inbox.createdAt,
        updatedAt: inbox.updatedAt,
        connection:
          inbox.type === "EMAIL"
            ? emailMailbox
              ? {
                  mode: "oauth",
                  connectedMailboxId: emailMailbox.id,
                  provider: emailMailbox.provider,
                  status: emailMailbox.status,
                  emailAddress: emailMailbox.emailAddress,
                  displayName: emailMailbox.displayName,
                  updatedAt: emailMailbox.updatedAt,
                }
              : credentials.email?.host && credentials.email?.username && credentials.email?.password
                ? {
                    mode: "smtp",
                    host: credentials.email.host,
                    username: credentials.email.username,
                    from: credentials.email.from || credentials.email.username,
                    configured: true,
                  }
                : {
                    mode: "none",
                    configured: false,
                  }
            : credentials.whatsapp?.phoneNumberId && credentials.whatsapp?.accessToken
              ? {
                  mode: "whatsapp_api",
                  configured: true,
                  phoneNumberId: maskMiddle(String(credentials.whatsapp?.phoneNumberId || ""), { keepStart: 4, keepEnd: 4 }),
                  displayPhoneNumber: credentials.whatsapp?.displayPhoneNumber || null,
                  verifiedName: credentials.whatsapp?.verifiedName || null,
                  qualityRating: credentials.whatsapp?.qualityRating || null,
                  apiVersion: credentials.whatsapp?.apiVersion || "v19.0",
                  hasVerifyToken: Boolean(credentials.whatsapp?.verifyToken),
                  hasAppSecret: Boolean(credentials.whatsapp?.appSecret),
                }
              : {
                  mode: "none",
                  configured: false,
                },
      };
    }),
  });
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
