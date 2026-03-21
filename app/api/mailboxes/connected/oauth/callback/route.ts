import crypto from "crypto";
import { getServerSession } from "next-auth";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { encryptInboxSecret } from "@/lib/crypto";
import { writeUnifiedAuditEvent } from "@/lib/inbox/unified";
import { getConnectedMailboxProvider } from "@/lib/mailboxes/provider";
import {
  decodeMailboxOauthFlowState,
  exchangeMailboxOauthCode,
  fetchMailboxOauthIdentity,
  getMailboxOauthCookieName,
  isOauthMailboxProvider,
  sanitizeMailboxReturnTo,
} from "@/lib/mailboxes/oauth";
import { requireOrgPermission } from "@/lib/org-auth";
import { prisma } from "@/lib/prisma";

function appBaseUrl(req: Request) {
  return process.env.APP_URL || process.env.NEXTAUTH_URL || new URL(req.url).origin;
}

function callbackUrl(req: Request) {
  return `${appBaseUrl(req)}/api/mailboxes/connected/oauth/callback`;
}

function safeEqual(leftValue: string, rightValue: string) {
  const left = Buffer.from(leftValue, "utf8");
  const right = Buffer.from(rightValue, "utf8");
  if (!left.length || left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function buildAppRedirect(req: Request, returnTo: string, params?: Record<string, string>) {
  const url = new URL(sanitizeMailboxReturnTo(returnTo), appBaseUrl(req));
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value) {
      url.searchParams.set(key, value);
    }
  });
  return url;
}

function parseMetadata(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {} as Record<string, unknown>;
  }
  return value as Record<string, unknown>;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const cookieStore = await cookies();
  const flowCookie = cookieStore.get(getMailboxOauthCookieName())?.value || null;
  const flowState = decodeMailboxOauthFlowState(flowCookie);
  const returnTo = sanitizeMailboxReturnTo(flowState?.returnTo || url.searchParams.get("returnTo"));

  const redirect = (params?: Record<string, string>) => {
    const response = NextResponse.redirect(buildAppRedirect(req, returnTo, params));
    response.cookies.delete(getMailboxOauthCookieName());
    return response;
  };

  if (!flowState || !isOauthMailboxProvider(flowState.provider)) {
    return redirect({ mailbox_error: "oauth_state_missing" });
  }

  if (Date.now() - Number(flowState.createdAt || 0) > 10 * 60 * 1000) {
    return redirect({ mailbox_error: "oauth_state_expired" });
  }

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return redirect({ mailbox_error: "unauthorized" });
  }

  const access = await requireOrgPermission(session.user.id, {
    permission: "settings:business:write",
    requireActiveSubscription: true,
  });
  if (!access.ok) {
    return redirect({ mailbox_error: access.code || "forbidden" });
  }

  if (flowState.subscriberId !== session.user.id || flowState.workspaceId !== access.context.orgId) {
    return redirect({ mailbox_error: "oauth_state_mismatch" });
  }

  const providerError = String(url.searchParams.get("error") || "").trim();
  if (providerError) {
    return redirect({ mailbox_error: providerError });
  }

  const state = String(url.searchParams.get("state") || "").trim();
  if (!state || !safeEqual(flowState.state, state)) {
    return redirect({ mailbox_error: "oauth_state_invalid" });
  }

  const code = String(url.searchParams.get("code") || "").trim();
  if (!code) {
    return redirect({ mailbox_error: "oauth_code_missing" });
  }

  try {
    const tokenSet = await exchangeMailboxOauthCode({
      provider: flowState.provider,
      code,
      codeVerifier: flowState.codeVerifier,
      callbackUrl: callbackUrl(req),
    });

    const identity = await fetchMailboxOauthIdentity({
      provider: flowState.provider,
      accessToken: tokenSet.accessToken,
    });

    const providerDefinition = getConnectedMailboxProvider(flowState.provider);
    const existing = await prisma.connectedMailbox.findFirst({
      where: {
        workspaceId: access.context.orgId,
        OR: [
          ...(identity.providerAccountId ? [{ providerAccountId: identity.providerAccountId }] : []),
          { emailAddress: identity.emailAddress },
        ],
      },
      select: {
        id: true,
        metadata: true,
      },
    });

    await prisma.$transaction(async (tx) => {
      const baseMetadata = existing ? parseMetadata(existing.metadata) : {};
      const nextMetadata = {
        ...baseMetadata,
        authMode: providerDefinition.authMode,
        capabilities: providerDefinition.capabilities,
        scope: tokenSet.scope,
        tokenType: tokenSet.tokenType,
        expiresAt: tokenSet.expiresAt,
        connectedAt: new Date().toISOString(),
      };

      const mailbox = existing
        ? await tx.connectedMailbox.update({
            where: { id: existing.id },
            data: {
              subscriberId: session.user.id,
              provider: flowState.provider,
              status: "ACTIVE",
              emailAddress: identity.emailAddress,
              displayName: identity.displayName,
              providerAccountId: identity.providerAccountId,
              accessTokenEncrypted: encryptInboxSecret(tokenSet.accessToken),
              refreshTokenEncrypted: tokenSet.refreshToken
                ? encryptInboxSecret(tokenSet.refreshToken)
                : null,
              metadata: nextMetadata,
            },
          })
        : await tx.connectedMailbox.create({
            data: {
              subscriberId: session.user.id,
              workspaceId: access.context.orgId,
              provider: flowState.provider,
              status: "ACTIVE",
              emailAddress: identity.emailAddress,
              displayName: identity.displayName,
              providerAccountId: identity.providerAccountId,
              accessTokenEncrypted: encryptInboxSecret(tokenSet.accessToken),
              refreshTokenEncrypted: tokenSet.refreshToken
                ? encryptInboxSecret(tokenSet.refreshToken)
                : null,
              metadata: nextMetadata,
            },
          });

      if (flowState.bindUnifiedInbox) {
        const emailInbox = await tx.unifiedInbox.upsert({
          where: {
            tenantId_type: {
              tenantId: access.context.orgId,
              type: "EMAIL",
            },
          },
          update: {},
          create: {
            tenantId: access.context.orgId,
            type: "EMAIL",
            name: "Email Inbox",
            status: "DISCONNECTED",
          },
        });

        await tx.unifiedInbox.update({
          where: { id: emailInbox.id },
          data: {
            status: "ACTIVE",
            credentialsEncrypted: encryptInboxSecret(
              JSON.stringify({
                emailOAuth: {
                  connectedMailboxId: mailbox.id,
                },
              })
            ),
          },
        });

        await writeUnifiedAuditEvent(tx, {
          tenantId: access.context.orgId,
          actorUserId: session.user.id,
          actionType: "inbox.email_connected",
          metadata: {
            inboxId: emailInbox.id,
            connectedMailboxId: mailbox.id,
            provider: flowState.provider,
          },
        });
      }

    });

    return redirect({
      mailbox_connected: "1",
      mailbox_provider: flowState.provider.toLowerCase(),
    });
  } catch (error: any) {
    return redirect({
      mailbox_error: String(error?.code || "mailbox_oauth_callback_failed"),
    });
  }
}
