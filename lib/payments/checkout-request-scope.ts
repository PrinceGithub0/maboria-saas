export type CheckoutRequestScopeInput = {
  sessionUserId: string;
  requestedUserId?: string | null;
  access: {
    ok: boolean;
    code?: string | null;
    context?: {
      ownerUserId?: string | null;
      orgId?: string | null;
    } | null;
    message?: string;
    status?: number;
  };
};

export type CheckoutRequestScopeResult =
  | {
      ok: true;
      userId: string;
      orgId: string | null;
    }
  | {
      ok: false;
      status: number;
      code: string;
      message: string;
    };

function normalizeId(value: string | null | undefined) {
  const trimmed = String(value || "").trim();
  return trimmed || null;
}

export function resolveCheckoutRequestScope(
  input: CheckoutRequestScopeInput
): CheckoutRequestScopeResult {
  let scopedUserId = input.sessionUserId;
  let scopedOrgId: string | null = null;

  if (input.access.ok) {
    scopedUserId = normalizeId(input.access.context?.ownerUserId) || input.sessionUserId;
    scopedOrgId = normalizeId(input.access.context?.orgId);
  } else if (input.access.code !== "ORG_ACCESS_DENIED") {
    return {
      ok: false,
      status: Number(input.access.status || 403),
      code: String(input.access.code || "FORBIDDEN"),
      message: String(input.access.message || "Forbidden"),
    };
  }

  const requestedUserId = normalizeId(input.requestedUserId);
  if (requestedUserId && requestedUserId !== scopedUserId) {
    return {
      ok: false,
      status: 403,
      code: "FORBIDDEN",
      message: "Forbidden",
    };
  }

  return {
    ok: true,
    userId: scopedUserId,
    orgId: scopedOrgId,
  };
}
