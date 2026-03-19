import { NextResponse } from "next/server";
import { resolveImpersonationFromCookie, toImpersonationHttpError } from "@/lib/admin/impersonation";
import { getActorSystemFlagRole } from "@/lib/system-flags";

const FORBIDDEN_PAYLOAD = {
  error: "Insufficient privileges",
  code: "FORBIDDEN",
} as const;

function normalizeRole(role?: string | null) {
  return String(role || "").trim().toUpperCase();
}

export function requirePlatformAdmin(user?: { id?: string | null; role?: string | null } | null) {
  if (!user?.id) {
    return NextResponse.json(FORBIDDEN_PAYLOAD, { status: 403 });
  }

  const role = normalizeRole(user.role);
  if (role === "OPS_ADMIN" || role === "SUPER_ADMIN") {
    return null;
  }

  return NextResponse.json(FORBIDDEN_PAYLOAD, { status: 403 });
}

export function requireSuperAdmin(user?: { id?: string | null; role?: string | null } | null) {
  if (!user?.id) {
    return NextResponse.json(FORBIDDEN_PAYLOAD, { status: 403 });
  }

  if (normalizeRole(user.role) === "SUPER_ADMIN") {
    return null;
  }

  return NextResponse.json(FORBIDDEN_PAYLOAD, { status: 403 });
}

export async function requireVerifiedPlatformAdminAccess(input: {
  actorUserId: string;
  cookieHeader?: string | null;
}) {
  const role = await getActorSystemFlagRole(input.actorUserId);
  if (role !== "OPS_ADMIN" && role !== "SUPER_ADMIN") {
    return {
      ok: false as const,
      response: NextResponse.json(FORBIDDEN_PAYLOAD, { status: 403 }),
    };
  }

  const impersonationBlocked = await requireNoImpersonationMode(input);
  if (impersonationBlocked) {
    return {
      ok: false as const,
      response: impersonationBlocked,
    };
  }

  return {
    ok: true as const,
    role,
  };
}

export async function requireNoImpersonationMode(input: {
  actorUserId: string;
  cookieHeader?: string | null;
}) {
  try {
    const active = await resolveImpersonationFromCookie({
      actorUserId: input.actorUserId,
      cookieHeader: input.cookieHeader,
      strictActor: true,
    });

    if (active) {
      return NextResponse.json(
        {
          error: "Admin control-plane is blocked while impersonating.",
          code: "FORBIDDEN_IMPERSONATION_MODE",
        },
        { status: 403 }
      );
    }

    return null;
  } catch (error) {
    const normalized = toImpersonationHttpError(error);
    return NextResponse.json(
      { error: normalized.message || "Insufficient privileges", code: normalized.code || "FORBIDDEN" },
      { status: normalized.status || 403 }
    );
  }
}
