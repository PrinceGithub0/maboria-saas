import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { withErrorHandling } from "@/lib/api-handler";
import { encryptInboxSecret } from "@/lib/crypto";
import { ensureDefaultUnifiedInboxes, writeUnifiedAuditEvent } from "@/lib/inbox/unified";
import { requireOrgPermission } from "@/lib/org-auth";
import { prisma } from "@/lib/prisma";
import {
  exchangeEmbeddedSignupCodeForToken,
  fetchEmbeddedSignupPhoneProfile,
  getWhatsAppEmbeddedSignupConfig,
} from "@/lib/whatsapp/embedded-signup";

const bodySchema = z.object({
  code: z.string().min(1),
  phoneNumberId: z.string().min(1),
  wabaId: z.string().min(1).optional(),
  businessId: z.string().min(1).optional(),
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
  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid embedded signup payload." }, { status: 422 });
  }

  const config = getWhatsAppEmbeddedSignupConfig();
  if (!config.enabled) {
    return NextResponse.json({ error: "Meta WhatsApp embedded signup is not configured." }, { status: 503 });
  }

  const { code, phoneNumberId, wabaId, businessId } = parsed.data;
  const token = await exchangeEmbeddedSignupCodeForToken(code);
  const phoneProfile = await fetchEmbeddedSignupPhoneProfile({
    accessToken: token.accessToken,
    phoneNumberId,
  });

  const { whatsapp } = await ensureDefaultUnifiedInboxes(access.context.orgId);
  const verifyToken = String(process.env.INBOX_INBOUND_TOKEN || "").trim();
  const appSecret = config.appSecret;

  const updatedInbox = await prisma.$transaction(async (tx) => {
    await tx.business.update({
      where: { id: access.context.orgId },
      data: {
        whatsappPhoneNumberId: phoneNumberId,
      },
    });

    const inbox = await tx.unifiedInbox.update({
      where: { id: whatsapp.id },
      data: {
        status: "ACTIVE",
        credentialsEncrypted: encryptInboxSecret(
          JSON.stringify({
            whatsapp: {
              accessToken: token.accessToken,
              phoneNumberId,
              apiVersion: config.graphApiVersion,
              appSecret,
              verifyToken,
              businessAccountId: wabaId || null,
              businessId: businessId || null,
              displayPhoneNumber: phoneProfile.displayPhoneNumber,
              verifiedName: phoneProfile.verifiedName,
              qualityRating: phoneProfile.qualityRating,
            },
          })
        ),
      },
      select: {
        id: true,
        status: true,
      },
    });

    await writeUnifiedAuditEvent(tx, {
      tenantId: access.context.orgId,
      actorUserId: session.user.id,
      actionType: "inbox.whatsapp_connected",
      metadata: {
        inboxId: whatsapp.id,
        phoneNumberId,
        wabaId: wabaId || null,
        businessId: businessId || null,
        displayPhoneNumber: phoneProfile.displayPhoneNumber,
        verifiedName: phoneProfile.verifiedName,
      },
    });

    return inbox;
  });

  return NextResponse.json({
    ok: true,
    inbox: updatedInbox,
    connection: {
      phoneNumberId,
      displayPhoneNumber: phoneProfile.displayPhoneNumber,
      verifiedName: phoneProfile.verifiedName,
      wabaId: wabaId || null,
      businessId: businessId || null,
    },
  });
});
