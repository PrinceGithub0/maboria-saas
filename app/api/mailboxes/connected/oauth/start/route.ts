import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { requireOrgPermission } from "@/lib/org-auth";
import {
  buildMailboxOauthAuthorizeUrl,
  createMailboxOauthFlowState,
  encodeMailboxOauthFlowState,
  getMailboxOauthCookieMaxAgeSeconds,
  getMailboxOauthCookieName,
  isOauthMailboxProvider,
  sanitizeMailboxReturnTo,
} from "@/lib/mailboxes/oauth";

function appBaseUrl(req: Request) {
  return process.env.APP_URL || process.env.NEXTAUTH_URL || new URL(req.url).origin;
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

export async function GET(req: Request) {
  const url = new URL(req.url);
  const returnTo = sanitizeMailboxReturnTo(url.searchParams.get("returnTo"));
  const provider = String(url.searchParams.get("provider") || "").trim().toUpperCase();
  const bindUnifiedInbox = url.searchParams.get("bindUnifiedInbox") === "1";

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.redirect(
      buildAppRedirect(req, returnTo, {
        mailbox_error: "unauthorized",
      })
    );
  }

  const access = await requireOrgPermission(session.user.id, {
    permission: "settings:business:write",
    requireActiveSubscription: true,
  });
  if (!access.ok) {
    return NextResponse.redirect(
      buildAppRedirect(req, returnTo, {
        mailbox_error: access.code || "forbidden",
      })
    );
  }

  if (!isOauthMailboxProvider(provider)) {
    return NextResponse.redirect(
      buildAppRedirect(req, returnTo, {
        mailbox_error: "invalid_provider",
      })
    );
  }

  try {
    const callbackUrl = `${appBaseUrl(req)}/api/mailboxes/connected/oauth/callback`;
    const flowState = createMailboxOauthFlowState({
      provider,
      subscriberId: session.user.id,
      workspaceId: access.context.orgId,
      returnTo,
      bindUnifiedInbox,
    });

    const response = NextResponse.redirect(
      buildMailboxOauthAuthorizeUrl({
        provider,
        callbackUrl,
        flowState,
      })
    );

    response.cookies.set({
      name: getMailboxOauthCookieName(),
      value: encodeMailboxOauthFlowState(flowState),
      httpOnly: true,
      sameSite: "lax",
      secure: callbackUrl.startsWith("https://"),
      maxAge: getMailboxOauthCookieMaxAgeSeconds(),
      path: "/",
    });

    return response;
  } catch (error: any) {
    return NextResponse.redirect(
      buildAppRedirect(req, returnTo, {
        mailbox_error: String(error?.code || "mailbox_oauth_start_failed"),
      })
    );
  }
}
