import crypto from "crypto";
import { Prisma, Role, SubscriptionStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hashPassword, verifyPassword } from "@/lib/auth";
import { sendPlatformMail, sendSecurityMail } from "@/lib/email";
import { hashPasswordResetToken } from "@/lib/password-reset";
import { canAssignBillingAdmin, countActiveOrgSeats, getSeatLimitForPlan, normalizeOrgRole } from "@/lib/org-auth";
import type {
  IdentityCreateMetadataResponse,
  IdentityCreateUserPayload,
  IdentityCreateUserResponse,
  IdentityAccessRole,
  IdentityAccessStatus,
  IdentityFilter,
  IdentityListItem,
  IdentityListResponse,
  IdentitySubscriptionState,
  IdentitySummary,
  IdentityUserDetailResponse,
} from "@/lib/admin/users-types";

const ROOT_SUPER_ADMIN_SETTING = "PLATFORM_ROOT_ADMIN_USER_ID";
const CREATE_SUPER_ADMIN_ACTION = "CREATE_SUPER_ADMIN";

const PLAN_SEAT_LIMITS: Record<string, number | null> = {
  STARTER: 1,
  PRO: 3,
  GROWTH: 8,
  BUSINESS: 15,
  PREMIUM: 15,
  ENTERPRISE: null,
};

type AdminContext = {
  actorId: string;
  rootSuperAdminId: string | null;
  actorRole: IdentityAccessRole;
};

type SelectedSubscription = {
  id: string;
  plan: string;
  status: SubscriptionStatus;
  renewalDate: Date;
  createdAt: Date;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
};

class HttpError extends Error {
  status: number;
  code: string;

  constructor(status: number, message: string, code = "SERVER_ERROR") {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function normalizeFilter(value?: string | null): IdentityFilter {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  if (normalized === "super_admins") return "super_admins";
  if (normalized === "admins") return "admins";
  if (normalized === "subscribers") return "subscribers";
  if (normalized === "no_plan") return "no_plan";
  if (normalized === "disabled") return "disabled";
  return "all";
}

function normalizeRole(value?: string | null): IdentityAccessRole | null {
  const normalized = String(value || "")
    .trim()
    .toUpperCase();
  if (normalized === "SUPER_ADMIN") return "SUPER_ADMIN";
  if (normalized === "OPS_ADMIN") return "OPS_ADMIN";
  if (normalized === "USER") return "USER";
  return null;
}

function normalizeStatus(value?: string | null): IdentityAccessStatus | null {
  const normalized = String(value || "")
    .trim()
    .toUpperCase();
  if (normalized === "ACTIVE") return "ACTIVE";
  if (normalized === "PENDING") return "PENDING";
  if (normalized === "DISABLED") return "DISABLED";
  if (normalized === "SUSPENDED") return "SUSPENDED";
  return null;
}

function parsePage(value?: string | null, fallback = 1) {
  const parsed = Number.parseInt(String(value || ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function parsePageSize(value?: string | null, fallback = 20) {
  const parsed = Number.parseInt(String(value || ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, 100);
}

type UsersListCursor = {
  createdAt: string;
  id: string;
};

function encodeUsersCursor(value: UsersListCursor) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function decodeUsersCursor(value?: string | null): UsersListCursor | null {
  const raw = String(value || "").trim();
  if (!raw) return null;

  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as UsersListCursor;
    if (!parsed?.id || !parsed?.createdAt) return null;
    const createdAt = new Date(parsed.createdAt);
    if (Number.isNaN(createdAt.getTime())) return null;
    return { id: String(parsed.id), createdAt: createdAt.toISOString() };
  } catch {
    return null;
  }
}

function resolveSubscriptionState(subscription: SelectedSubscription | null): IdentitySubscriptionState {
  if (!subscription) return "NONE";
  switch (subscription.status) {
    case "ACTIVE":
      return "ACTIVE";
    case "PAST_DUE":
      return "PAST_DUE";
    case "TRIALING":
      return "TRIAL";
    case "CANCELED":
      return "CANCELED";
    default:
      return "NONE";
  }
}

function pickPrimarySubscription(subscriptions: SelectedSubscription[]): SelectedSubscription | null {
  if (!subscriptions.length) return null;
  const rank: Record<string, number> = {
    ACTIVE: 0,
    TRIALING: 1,
    PAST_DUE: 2,
    CANCELED: 3,
    INACTIVE: 4,
    INCOMPLETE: 5,
    REVOKED: 6,
  };

  return subscriptions
    .slice()
    .sort((a, b) => {
      const rankDelta = (rank[a.status] ?? 99) - (rank[b.status] ?? 99);
      if (rankDelta !== 0) return rankDelta;
      return b.createdAt.getTime() - a.createdAt.getTime();
    })[0];
}

function resolveRole(userRole: Role | string, userId: string, rootSuperAdminId: string | null): IdentityAccessRole {
  const normalized = String(userRole || "").toUpperCase();
  if (normalized === "SUPER_ADMIN") return "SUPER_ADMIN";
  if (normalized !== "OPS_ADMIN") return "USER";
  if (rootSuperAdminId && userId === rootSuperAdminId) return "SUPER_ADMIN";
  return "OPS_ADMIN";
}

function resolveStatus(
  status: string | null | undefined,
  userRole: Role
): IdentityAccessStatus {
  if (userRole === "DISABLED") return "DISABLED";
  const normalized = String(status || "")
    .trim()
    .toUpperCase();
  if (normalized === "DISABLED" || normalized === "SUSPENDED" || normalized === "PENDING") {
    return normalized as IdentityAccessStatus;
  }
  return "ACTIVE";
}

function resolveAuthProvider(value: string | null | undefined): "PASSWORD" | "GOOGLE" | "SSO" {
  const normalized = String(value || "")
    .trim()
    .toUpperCase();
  if (normalized === "GOOGLE") return "GOOGLE";
  if (normalized === "SSO") return "SSO";
  return "PASSWORD";
}

function startOfCurrentMonthUtc() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
}

function buildIdentitySummary(params: {
  totalUsers: number;
  totalUsersDelta: number;
  adminCount: number;
  activeSubscribers: number;
  disabledAccounts: number;
  usersWithoutActivePlan: number;
}): IdentitySummary {
  return {
    totalUsers: params.totalUsers,
    totalUsersDelta: params.totalUsersDelta,
    adminCount: params.adminCount,
    activeSubscribers: params.activeSubscribers,
    disabledAccounts: params.disabledAccounts,
    usersWithoutActivePlan: params.usersWithoutActivePlan,
  };
}

let identitySummaryCache: { value: IdentitySummary; expiresAt: number } | null = null;

async function getIdentitySummaryCached() {
  const now = Date.now();
  if (identitySummaryCache && identitySummaryCache.expiresAt > now) {
    return identitySummaryCache.value;
  }

  const monthStart = startOfCurrentMonthUtc();
  const [totalUsers, adminCount, activeSubscribers, disabledAccounts, usersWithoutActivePlan, totalUsersDelta] =
    await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { role: { in: ["OPS_ADMIN"] as Role[] } } }),
      prisma.user.count({ where: { subscriptions: { some: { status: "ACTIVE" } } } }),
      prisma.user.count({
        where: {
          OR: [{ status: { in: ["DISABLED", "SUSPENDED"] } }, { role: "DISABLED" }],
        },
      }),
      prisma.user.count({ where: { subscriptions: { none: { status: "ACTIVE" } } } }),
      prisma.user.count({ where: { createdAt: { gte: monthStart } } }),
    ]);

  const value = buildIdentitySummary({
    totalUsers,
    totalUsersDelta,
    adminCount,
    activeSubscribers,
    disabledAccounts,
    usersWithoutActivePlan,
  });

  identitySummaryCache = {
    value,
    expiresAt: now + 30_000,
  };

  return value;
}

function resolveAuditActionLabel(input: {
  actionType?: string | null;
  action?: string | null;
  metadata?: Prisma.JsonValue | null;
}) {
  const metadata =
    input.metadata && typeof input.metadata === "object" && !Array.isArray(input.metadata)
      ? (input.metadata as Record<string, unknown>)
      : null;

  const candidates = [
    input.actionType,
    input.action,
    typeof metadata?.actionType === "string" ? metadata.actionType : null,
    typeof metadata?.action === "string" ? metadata.action : null,
  ];

  for (const candidate of candidates) {
    const normalized = String(candidate || "").trim();
    if (!normalized) continue;
    if (normalized.toUpperCase() === "UNKNOWN_ACTION") continue;
    return normalized;
  }

  return "AUDIT_EVENT";
}

const PLATFORM_ROLE_OPTIONS: IdentityAccessRole[] = ["USER", "OPS_ADMIN", "SUPER_ADMIN"];
const PLATFORM_STATUS_OPTIONS: IdentityAccessStatus[] = ["PENDING", "ACTIVE", "DISABLED", "SUSPENDED"];
function normalizeTenantRole(value?: string | null) {
  const normalized = String(value || "").trim().toLowerCase();
  if (
    normalized === "owner" ||
    normalized === "admin" ||
    normalized === "member" ||
    normalized === "billing_admin"
  ) {
    return normalized;
  }
  return null;
}

function normalizeIdentityEmail(value: string) {
  return value.trim().toLowerCase();
}

function generateTemporaryPassword(length = 18) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*";
  const bytes = crypto.randomBytes(length);
  let out = "";
  for (let i = 0; i < bytes.length; i += 1) {
    out += alphabet[bytes[i] % alphabet.length];
  }
  return out;
}

function hashAdminStepUpToken(rawToken: string) {
  const secret = process.env.RESET_TOKEN_SECRET || process.env.NEXTAUTH_SECRET || "";
  return crypto.createHash("sha256").update(`${rawToken}:${secret}`).digest("hex");
}

function buildSetupEmailHtml({
  setupUrl,
  recipientName,
}: {
  setupUrl: string;
  recipientName: string;
}) {
  return `
  <div style="font-family:Inter,Segoe UI,Arial,sans-serif;background:#f8fafc;padding:24px;color:#0f172a">
    <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:14px;padding:28px">
      <h1 style="margin:0 0 8px;font-size:22px;line-height:1.2;font-weight:600;color:#0f172a">Set up your Maboria account</h1>
      <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#334155">
        ${recipientName ? `Hi ${recipientName},` : "Hello,"} your platform account has been provisioned. Complete password setup to activate access.
      </p>
      <a href="${setupUrl}" style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:11px 16px;border-radius:10px">
        Set password
      </a>
      <p style="margin:16px 0 0;font-size:13px;line-height:1.6;color:#475569">This link is single-use and expires in 24 hours.</p>
    </div>
  </div>
  `.trim();
}

async function ensureRootSuperAdminId(tx: Prisma.TransactionClient) {
  const setting = await tx.setting.findUnique({
    where: { key: ROOT_SUPER_ADMIN_SETTING },
    select: { value: true },
  });

  const existing = setting?.value ? setting.value.trim() : "";
  if (existing) {
    const existingUser = await tx.user.findUnique({
      where: { id: existing },
      select: { id: true, role: true },
    });
    if (existingUser?.role === "OPS_ADMIN") {
      return existingUser.id;
    }
  }

  const firstAdmin = await tx.user.findFirst({
    where: { role: { in: ["OPS_ADMIN"] as Role[] } },
    select: { id: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });

  if (!firstAdmin) return null;

  await tx.setting.upsert({
    where: { key: ROOT_SUPER_ADMIN_SETTING },
    update: { value: firstAdmin.id },
    create: { key: ROOT_SUPER_ADMIN_SETTING, value: firstAdmin.id },
  });

  return firstAdmin.id;
}

async function resolveAdminContext(tx: Prisma.TransactionClient, actorId: string): Promise<AdminContext> {
  const actor = await tx.user.findUnique({
    where: { id: actorId },
    select: { id: true, role: true, status: true },
  });

  const actorStoredRole = String(actor?.role || "").toUpperCase();
  if (!actor || (actorStoredRole !== "OPS_ADMIN" && actorStoredRole !== "SUPER_ADMIN")) {
    throw new HttpError(403, "Forbidden");
  }
  if (resolveStatus(actor.status, actor.role) !== "ACTIVE") {
    throw new HttpError(403, "Admin account is not active.");
  }

  const rootSuperAdminId = await ensureRootSuperAdminId(tx);
  const actorRole = resolveRole(actor.role, actor.id, rootSuperAdminId);

  return {
    actorId: actor.id,
    rootSuperAdminId,
    actorRole,
  };
}

async function resolveSuperAdminContext(tx: Prisma.TransactionClient, actorId: string): Promise<AdminContext> {
  const context = await resolveAdminContext(tx, actorId);
  if (context.actorRole !== "SUPER_ADMIN") {
    throw new HttpError(403, "Only super admins can perform this action.");
  }
  return context;
}

function serializeUser(
  user: {
    id: string;
    name: string | null;
    email: string;
    publicId: string | null;
    role: Role;
    status: string | null;
    lastLoginAt: Date | null;
    createdAt: Date;
    authProvider: string | null;
    twoFactorEnabled: boolean;
    subscriptions: SelectedSubscription[];
    _count: { businesses: number };
  },
  rootSuperAdminId: string | null
): IdentityListItem {
  const primarySubscription = pickPrimarySubscription(user.subscriptions);
  return {
    id: user.id,
    fullName: user.name || "Unnamed user",
    email: user.email,
    userId: user.publicId,
    role: resolveRole(user.role, user.id, rootSuperAdminId),
    status: resolveStatus(user.status, user.role),
    subscriptionPlan: primarySubscription?.plan ?? null,
    subscriptionState: resolveSubscriptionState(primarySubscription),
    lastLoginAt: user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
    createdAt: user.createdAt.toISOString(),
    authProvider: resolveAuthProvider(user.authProvider),
    twoFactorEnabled: Boolean(user.twoFactorEnabled),
    tenantAssociationsCount: user._count.businesses,
    activeSubscriptionId: primarySubscription?.id ?? null,
  };
}

function buildListWhere(params: { query?: string | null; filter: IdentityFilter; rootSuperAdminId: string | null }) {
  const query = String(params.query || "").trim();
  const where: Prisma.UserWhereInput = {};
  const andClauses: Prisma.UserWhereInput[] = [];

  if (query) {
    andClauses.push({
      OR: [
        { email: { contains: query, mode: "insensitive" } },
        { name: { contains: query, mode: "insensitive" } },
        { publicId: { contains: query, mode: "insensitive" } },
        { id: { contains: query, mode: "insensitive" } },
      ],
    });
  }

  if (params.filter === "super_admins") {
    if (!params.rootSuperAdminId) {
      where.id = "__missing__";
    } else {
      where.id = params.rootSuperAdminId;
      where.role = { in: ["OPS_ADMIN"] as Role[] };
    }
    if (andClauses.length) where.AND = andClauses;
    return where;
  }

  if (params.filter === "admins") {
    where.role = { in: ["OPS_ADMIN"] as Role[] };
    if (params.rootSuperAdminId) {
      where.NOT = [{ id: params.rootSuperAdminId }];
    }
    if (andClauses.length) where.AND = andClauses;
    return where;
  }

  if (params.filter === "subscribers") {
    andClauses.push({
      subscriptions: {
        some: { status: "ACTIVE" },
      },
    });
    if (andClauses.length) where.AND = andClauses;
    return where;
  }

  if (params.filter === "no_plan") {
    andClauses.push({
      subscriptions: {
        none: { status: "ACTIVE" },
      },
    });
    if (andClauses.length) where.AND = andClauses;
    return where;
  }

  if (params.filter === "disabled") {
    andClauses.push({
      OR: [{ status: { in: ["DISABLED", "SUSPENDED"] } }, { role: "DISABLED" }],
    });
  }

  if (andClauses.length) where.AND = andClauses;
  return where;
}

export async function listAdminUsers(params: {
  actorId: string;
  query?: string | null;
  filter?: string | null;
  cursor?: string | null;
  cursorMode?: string | null;
  page?: string | null;
  pageSize?: string | null;
}): Promise<IdentityListResponse> {
  const page = parsePage(params.page, 1);
  const pageSize = parsePageSize(params.pageSize, 20);
  const cursorMode = String(params.cursorMode || "").trim() === "1";
  const decodedCursor = decodeUsersCursor(params.cursor);
  const filter = normalizeFilter(params.filter);

  const context = await prisma.$transaction(async (tx) => resolveAdminContext(tx, params.actorId));
  const rootSuperAdminId = context.rootSuperAdminId;
  const where = buildListWhere({ query: params.query, filter, rootSuperAdminId });
  const summary = await getIdentitySummaryCached();

  if (cursorMode) {
    const cursorWhere = decodedCursor
      ? {
          OR: [
            { createdAt: { lt: new Date(decodedCursor.createdAt) } },
            { createdAt: new Date(decodedCursor.createdAt), id: { lt: decodedCursor.id } },
          ],
        }
      : null;

    const rows = await prisma.user.findMany({
      where: cursorWhere ? { AND: [where, cursorWhere] } : where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: pageSize + 1,
      select: {
        id: true,
        name: true,
        email: true,
        publicId: true,
        role: true,
        status: true,
        lastLoginAt: true,
        createdAt: true,
        authProvider: true,
        twoFactorEnabled: true,
        subscriptions: {
          select: {
            id: true,
            plan: true,
            status: true,
            renewalDate: true,
            createdAt: true,
            currentPeriodStart: true,
            currentPeriodEnd: true,
          },
          orderBy: [{ createdAt: "desc" }],
          take: 1,
        },
        _count: {
          select: {
            businesses: true,
          },
        },
      },
    });

    const hasMore = rows.length > pageSize;
    const visibleRows = hasMore ? rows.slice(0, pageSize) : rows;
    const lastVisible = visibleRows[visibleRows.length - 1];
    const nextCursor =
      hasMore && lastVisible
        ? encodeUsersCursor({ id: lastVisible.id, createdAt: lastVisible.createdAt.toISOString() })
        : null;

    return {
      actor: {
        id: context.actorId,
        role: context.actorRole,
      },
      items: visibleRows.map((row) => serializeUser(row, rootSuperAdminId)),
      summary,
      pagination: {
        mode: "cursor",
        page,
        pageSize,
        totalItems: null,
        totalPages: null,
        hasMore,
        nextCursor,
      },
    };
  }

  const [totalItems, rows] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        name: true,
        email: true,
        publicId: true,
        role: true,
        status: true,
        lastLoginAt: true,
        createdAt: true,
        authProvider: true,
        twoFactorEnabled: true,
        subscriptions: {
          select: {
            id: true,
            plan: true,
            status: true,
            renewalDate: true,
            createdAt: true,
            currentPeriodStart: true,
            currentPeriodEnd: true,
          },
          orderBy: [{ createdAt: "desc" }],
          take: 1,
        },
        _count: {
          select: {
            businesses: true,
          },
        },
      },
    }),
  ]);

  return {
    actor: {
      id: context.actorId,
      role: context.actorRole,
    },
    items: rows.map((row) => serializeUser(row, rootSuperAdminId)),
    summary,
    pagination: {
      mode: "offset",
      page,
      pageSize,
      totalItems,
      totalPages: Math.max(1, Math.ceil(totalItems / pageSize)),
      hasMore: page * pageSize < totalItems,
      nextCursor: null,
    },
  };
}

export async function getAdminUserDetail(userId: string): Promise<IdentityUserDetailResponse> {
  return prisma.$transaction(async (tx) => {
    const rootSuperAdminId = await ensureRootSuperAdminId(tx);
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        publicId: true,
        role: true,
        status: true,
        lastLoginAt: true,
        createdAt: true,
        authProvider: true,
        twoFactorEnabled: true,
        subscriptions: {
          select: {
            id: true,
            plan: true,
            status: true,
            renewalDate: true,
            createdAt: true,
            currentPeriodStart: true,
            currentPeriodEnd: true,
          },
          orderBy: [{ createdAt: "desc" }],
        },
        _count: {
          select: {
            businesses: true,
          },
        },
      },
    });

    if (!user) {
      throw new HttpError(404, "User not found.");
    }

    const primarySubscription = pickPrimarySubscription(user.subscriptions);
    const seatLimit =
      primarySubscription?.plan && PLAN_SEAT_LIMITS[primarySubscription.plan]
        ? PLAN_SEAT_LIMITS[primarySubscription.plan]
        : primarySubscription?.plan
          ? PLAN_SEAT_LIMITS[primarySubscription.plan] ?? null
          : null;

    const seatUsage = await tx.businessMember.count({
      where: { userId: user.id, status: "active" },
    });

    const recentAuditEvents = await tx.auditLog.findMany({
      where: {
        OR: [{ userId: user.id }, { targetUserId: user.id }],
      },
      orderBy: [{ createdAt: "desc" }],
      take: 12,
      select: {
        id: true,
        action: true,
        actionType: true,
        createdAt: true,
        userId: true,
        metadata: true,
      },
    });

    const normalized = serializeUser(user, rootSuperAdminId);

    return {
      user: {
        ...normalized,
        isRootSuperAdmin: Boolean(rootSuperAdminId && rootSuperAdminId === user.id),
      },
      subscription: {
        id: primarySubscription?.id ?? null,
        plan: primarySubscription?.plan ?? null,
        state: resolveSubscriptionState(primarySubscription),
        startedAt: primarySubscription?.currentPeriodStart?.toISOString() ?? null,
        renewalDate: primarySubscription?.renewalDate?.toISOString() ?? null,
        seatUsage: {
          used: seatUsage,
          limit: seatLimit ?? null,
        },
      },
      recentAuditEvents: recentAuditEvents.map((entry) => ({
        id: entry.id,
        actionType: resolveAuditActionLabel({
          actionType: entry.actionType,
          action: entry.action,
          metadata: entry.metadata,
        }),
        createdAt: entry.createdAt.toISOString(),
        actorUserId: entry.userId || null,
        metadata: entry.metadata,
      })),
    };
  });
}

async function writeAuditLog(
  tx: Prisma.TransactionClient,
  input: {
    actorId: string;
    targetUserId: string;
    actionType: string;
    metadata?: Prisma.InputJsonValue;
  }
) {
  await tx.auditLog.create({
    data: {
      userId: input.actorId,
      targetUserId: input.targetUserId,
      action: input.actionType,
      actionType: input.actionType,
      metadata: input.metadata,
    },
  });
}

async function invalidateUserSessions(tx: Prisma.TransactionClient, userId: string) {
  await tx.session.deleteMany({
    where: { userId },
  });
}

function storedRoleForStatus(params: {
  nextStatus: IdentityAccessStatus;
  resolvedRole: IdentityAccessRole;
}): Role {
  if (params.nextStatus === "DISABLED") return "DISABLED";
  if (params.resolvedRole === "USER") return "USER";
  return "OPS_ADMIN";
}

export async function updateAdminUserRole(input: {
  actorId: string;
  userId: string;
  nextRole: IdentityAccessRole;
}) {
  const updatedUserId = await prisma.$transaction(async (tx) => {
    const context = await resolveAdminContext(tx, input.actorId);
    if (context.actorRole !== "SUPER_ADMIN") {
      throw new HttpError(403, "Only SUPER_ADMIN can modify platform roles.", "FORBIDDEN_ROLE_ESCALATION");
    }
    const target = await tx.user.findUnique({
      where: { id: input.userId },
      select: { id: true, role: true, status: true },
    });

    if (!target) {
      throw new HttpError(404, "User not found.");
    }

    const targetRole = resolveRole(target.role, target.id, context.rootSuperAdminId);
    const targetStatus = resolveStatus(target.status, target.role);

    if (target.id === context.actorId) {
      throw new HttpError(403, "You cannot modify your own platform role.", "FORBIDDEN_ROLE_ESCALATION");
    }

    if (target.id === context.rootSuperAdminId && input.nextRole !== "SUPER_ADMIN") {
      throw new HttpError(409, "Cannot demote the last super admin.");
    }
    if (input.nextRole === "SUPER_ADMIN" && targetStatus !== "ACTIVE") {
      throw new HttpError(409, "Super admin must remain active.");
    }

    if (input.nextRole === "SUPER_ADMIN") {
      await tx.setting.upsert({
        where: { key: ROOT_SUPER_ADMIN_SETTING },
        update: { value: target.id },
        create: { key: ROOT_SUPER_ADMIN_SETTING, value: target.id },
      });
    }

    const nextStoredRole = storedRoleForStatus({
      nextStatus: targetStatus,
      resolvedRole: input.nextRole === "SUPER_ADMIN" ? "OPS_ADMIN" : input.nextRole,
    });

    await tx.user.update({
      where: { id: target.id },
      data: { role: nextStoredRole },
    });
    await invalidateUserSessions(tx, target.id);

    await writeAuditLog(tx, {
      actorId: context.actorId,
      targetUserId: target.id,
      actionType: "IDENTITY_ROLE_CHANGED",
      metadata: {
        previousRole: targetRole,
        nextRole: input.nextRole,
      },
    });
    return target.id;
  });
  return getAdminUserDetail(updatedUserId);
}

export async function updateAdminUserStatus(input: {
  actorId: string;
  userId: string;
  nextStatus: IdentityAccessStatus;
}) {
  const updatedUserId = await prisma.$transaction(async (tx) => {
    const context = await resolveAdminContext(tx, input.actorId);
    const target = await tx.user.findUnique({
      where: { id: input.userId },
      select: { id: true, role: true, status: true },
    });

    if (!target) {
      throw new HttpError(404, "User not found.");
    }

    const targetRole = resolveRole(target.role, target.id, context.rootSuperAdminId);
    const previousStatus = resolveStatus(target.status, target.role);

    if (target.id === context.actorId && input.nextStatus !== "ACTIVE") {
      throw new HttpError(409, "You cannot change your own account to a non-active status.");
    }
    if (targetRole === "SUPER_ADMIN" && input.nextStatus !== "ACTIVE") {
      throw new HttpError(409, "Cannot disable the last super admin.");
    }
    if (context.actorRole !== "SUPER_ADMIN" && targetRole !== "USER") {
      throw new HttpError(403, "Only super admins can change admin account status.");
    }

    const mappedRole = storedRoleForStatus({ nextStatus: input.nextStatus, resolvedRole: targetRole });

    await tx.user.update({
      where: { id: target.id },
      data: {
        status: input.nextStatus,
        role: mappedRole,
      },
    });
    await invalidateUserSessions(tx, target.id);

    await writeAuditLog(tx, {
      actorId: context.actorId,
      targetUserId: target.id,
      actionType: "IDENTITY_STATUS_CHANGED",
      metadata: {
        previousStatus,
        nextStatus: input.nextStatus,
      },
    });
    return target.id;
  });
  return getAdminUserDetail(updatedUserId);
}

export async function resetAdminUserPassword(input: {
  actorId: string;
  userId: string;
  password: string;
}) {
  if (!input.password || input.password.trim().length < 8) {
    throw new HttpError(422, "Temporary password must be at least 8 characters.");
  }

  return prisma.$transaction(async (tx) => {
    const context = await resolveAdminContext(tx, input.actorId);
    const target = await tx.user.findUnique({
      where: { id: input.userId },
      select: { id: true, role: true },
    });

    if (!target) {
      throw new HttpError(404, "User not found.");
    }

    const targetRole = resolveRole(target.role, target.id, context.rootSuperAdminId);
    if (context.actorRole !== "SUPER_ADMIN" && targetRole !== "USER") {
      throw new HttpError(403, "Only super admins can reset admin passwords.");
    }

    const passwordHash = await hashPassword(input.password.trim());
    await tx.user.update({
      where: { id: target.id },
      data: { passwordHash },
    });

    await writeAuditLog(tx, {
      actorId: context.actorId,
      targetUserId: target.id,
      actionType: "IDENTITY_PASSWORD_RESET",
    });

    return { success: true };
  });
}

export async function cancelAdminUserSubscription(input: { actorId: string; userId: string }) {
  return prisma.$transaction(async (tx) => {
    await resolveAdminContext(tx, input.actorId);
    const target = await tx.user.findUnique({
      where: { id: input.userId },
      select: { id: true },
    });
    if (!target) {
      throw new HttpError(404, "User not found.");
    }

    const now = new Date();
    const result = await tx.subscription.updateMany({
      where: {
        userId: target.id,
        status: { in: ["ACTIVE", "PAST_DUE", "TRIALING"] },
      },
      data: {
        status: "CANCELED",
        renewalDate: now,
        cancellationReason: "Admin cancellation from identity access page",
      },
    });

    await writeAuditLog(tx, {
      actorId: input.actorId,
      targetUserId: target.id,
      actionType: "IDENTITY_SUBSCRIPTION_CANCELED",
      metadata: {
        canceledCount: result.count,
      },
    });

    return { success: true, count: result.count };
  });
}

export async function getIdentityCreateMetadata(actorId: string): Promise<IdentityCreateMetadataResponse> {
  const context = await prisma.$transaction(async (tx) => resolveAdminContext(tx, actorId));
  const [businesses, seatUsage] = await Promise.all([
    prisma.business.findMany({
      orderBy: [{ createdAt: "desc" }],
      select: {
        id: true,
        name: true,
        accessStatus: true,
        plan: true,
        orgSubscription: {
          select: {
            status: true,
            planId: true,
          },
        },
      },
      take: 200,
    }),
    prisma.businessMember.groupBy({
      by: ["businessId"],
      where: { status: "active" },
      _count: { _all: true },
    }),
  ]);

  const seatsByBusinessId = new Map<string, number>(
    seatUsage.map((entry) => [entry.businessId, entry._count._all])
  );

  return {
    actor: {
      id: context.actorId,
      role: context.actorRole,
    },
    tenants: businesses.map((tenant) => {
      const plan = tenant.orgSubscription?.planId ?? tenant.plan ?? null;
      const seatLimit = getSeatLimitForPlan(plan);
      return {
        id: tenant.id,
        name: tenant.name,
        accessStatus: tenant.accessStatus,
        subscriptionStatus: tenant.orgSubscription?.status ?? null,
        plan,
        seatLimit,
        seatsUsed: seatsByBusinessId.get(tenant.id) ?? 0,
      };
    }),
    roleOptions: context.actorRole === "SUPER_ADMIN" ? PLATFORM_ROLE_OPTIONS : ["USER"],
    statusOptions: PLATFORM_STATUS_OPTIONS,
    defaults: {
      status: "PENDING",
      sendSetupEmail: true,
    },
  };
}

export async function checkIdentityEmailExists(actorId: string, rawEmail: string) {
  await prisma.$transaction(async (tx) => resolveAdminContext(tx, actorId));
  const email = normalizeIdentityEmail(rawEmail);
  if (!email) {
    return { exists: false };
  }
  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });
  return { exists: Boolean(existing) };
}

export async function startSuperAdminStepUp(input: {
  actorId: string;
  password: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}) {
  const rawPassword = String(input.password || "").trim();
  if (!rawPassword) {
    throw new HttpError(422, "Password is required.", "VALIDATION_ERROR");
  }

  const stepUpToken = await prisma.$transaction(async (tx) => {
    const context = await resolveSuperAdminContext(tx, input.actorId);
    const actor = await tx.user.findUnique({
      where: { id: context.actorId },
      select: {
        id: true,
        passwordHash: true,
        status: true,
      },
    });

    if (!actor || String(actor.status).toUpperCase() !== "ACTIVE") {
      throw new HttpError(403, "Forbidden.", "FORBIDDEN");
    }

    const valid = await verifyPassword(rawPassword, actor.passwordHash);
    if (!valid) {
      throw new HttpError(403, "Step-up verification failed.", "STEP_UP_REQUIRED");
    }

    const rawToken = crypto.randomBytes(32).toString("base64url");
    await tx.adminStepUpToken.create({
      data: {
        actorUserId: context.actorId,
        actionHash: CREATE_SUPER_ADMIN_ACTION,
        tokenHash: hashAdminStepUpToken(rawToken),
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
        ipAddress: input.ipAddress || null,
        userAgent: input.userAgent || null,
      },
    });

    await tx.auditLog.create({
      data: {
        userId: context.actorId,
        action: "STEP_UP_VERIFIED",
        actionType: "STEP_UP_VERIFIED",
        metadata: {
          actionHash: CREATE_SUPER_ADMIN_ACTION,
          ipAddress: input.ipAddress || null,
          userAgent: input.userAgent || null,
        },
      },
    });

    return rawToken;
  });

  return {
    stepUpToken,
    expiresInSeconds: 300,
  };
}

async function validateSuperAdminStepUpToken(
  tx: Prisma.TransactionClient,
  input: { actorId: string; token: string }
) {
  const tokenHash = hashAdminStepUpToken(String(input.token || "").trim());
  const token = await tx.adminStepUpToken.findUnique({
    where: { tokenHash },
    select: {
      id: true,
      actorUserId: true,
      actionHash: true,
      expiresAt: true,
      usedAt: true,
    },
  });

  if (!token || token.actorUserId !== input.actorId || token.actionHash !== CREATE_SUPER_ADMIN_ACTION) {
    throw new HttpError(403, "Step-up verification is required.", "STEP_UP_REQUIRED");
  }

  if (token.usedAt || token.expiresAt <= new Date()) {
    throw new HttpError(403, "Step-up token is invalid or expired.", "STEP_UP_INVALID_OR_EXPIRED");
  }

  await tx.adminStepUpToken.update({
    where: { id: token.id },
    data: { usedAt: new Date() },
  });
}

export async function createPlatformUser(input: {
  actorId: string;
  payload: IdentityCreateUserPayload & { confirmSuperAdminGrant?: boolean; stepUpToken?: string | null };
  ipAddress?: string | null;
  userAgent?: string | null;
}): Promise<IdentityCreateUserResponse> {
  const fullName = String(input.payload.fullName || "").trim();
  const email = normalizeIdentityEmail(input.payload.email || "");
  const normalizedRole = normalizeRole(input.payload.role);
  if (!normalizedRole) {
    throw new HttpError(422, "Invalid platform role.", "VALIDATION_ERROR");
  }
  const role = normalizedRole;
  const normalizedTenantRole = normalizeTenantRole(input.payload.tenantRole || null);
  const hasTenantId = Boolean(String(input.payload.tenantId || "").trim());
  const shouldAttachTenant = role === "USER" && hasTenantId;
  const requestedStatus = normalizeStatus(input.payload.status) || "PENDING";
  const sendSetupEmailNormalized = requestedStatus === "DISABLED" ? false : Boolean(input.payload.sendSetupEmail);

  if (fullName.length < 2) {
    throw new HttpError(422, "Full name is required.", "VALIDATION_ERROR");
  }
  if (!email || !email.includes("@")) {
    throw new HttpError(422, "Valid email is required.", "VALIDATION_ERROR");
  }
  if (role !== "USER" && (hasTenantId || normalizedTenantRole)) {
    throw new HttpError(400, "Platform admins cannot be attached to a tenant.", "VALIDATION_ERROR");
  }
  if (role === "SUPER_ADMIN" && !input.payload.confirmSuperAdminGrant) {
    throw new HttpError(422, "Super admin assignment requires explicit confirmation.", "VALIDATION_ERROR");
  }
  if (role === "USER" && hasTenantId && !normalizedTenantRole) {
    throw new HttpError(422, "Tenant role is required when attaching to a tenant.", "VALIDATION_ERROR");
  }
  if (role === "USER" && !hasTenantId && normalizedTenantRole) {
    throw new HttpError(422, "Tenant role requires a selected tenant workspace.", "VALIDATION_ERROR");
  }
  if (shouldAttachTenant && !normalizedTenantRole) {
    throw new HttpError(422, "Tenant role is required when attaching to a tenant.", "VALIDATION_ERROR");
  }

  const setupLinkTtlMs = 24 * 60 * 60 * 1000;
  const randomBootstrapPassword = generateTemporaryPassword(24);
  const bootstrapPasswordHash = await hashPassword(randomBootstrapPassword);

  let setupTokenRaw: string | null = null;
  let createdUserId = "";
  let generatedTempPassword: string | undefined;
  const superAdminAlertRecipients: string[] = [];

  const effectiveStatus: IdentityAccessStatus = sendSetupEmailNormalized
    ? "PENDING"
    : requestedStatus === "DISABLED" || requestedStatus === "SUSPENDED"
      ? requestedStatus
      : "ACTIVE";

  await prisma.$transaction(async (tx) => {
    const context = await resolveAdminContext(tx, input.actorId);
    const existing = await tx.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (existing) {
      throw new HttpError(409, "A user with this email already exists.", "EMAIL_ALREADY_EXISTS");
    }

    if (context.actorRole !== "SUPER_ADMIN" && role === "SUPER_ADMIN") {
      throw new HttpError(403, "Only super admins can create super admins.", "FORBIDDEN_ROLE_ESCALATION");
    }
    if (context.actorRole !== "SUPER_ADMIN" && role !== "USER") {
      throw new HttpError(403, "Insufficient privileges to create this role.", "FORBIDDEN_ROLE_ESCALATION");
    }

    if (role === "SUPER_ADMIN") {
      if (!input.payload.stepUpToken) {
        throw new HttpError(403, "Step-up verification is required.", "STEP_UP_REQUIRED");
      }
      await validateSuperAdminStepUpToken(tx, { actorId: context.actorId, token: input.payload.stepUpToken });
    }

    if (shouldAttachTenant) {
      const tenant = await tx.business.findUnique({
        where: { id: String(input.payload.tenantId) },
        select: {
          id: true,
          accessStatus: true,
          ownerId: true,
          plan: true,
          orgSubscription: {
            select: {
              status: true,
              planId: true,
            },
          },
        },
      });

      if (!tenant) throw new HttpError(404, "Selected tenant not found.", "VALIDATION_ERROR");
      if (tenant.accessStatus !== "ACTIVE") {
        throw new HttpError(409, "Selected tenant is not active.", "VALIDATION_ERROR");
      }
      if (tenant.orgSubscription?.status !== "ACTIVE") {
        throw new HttpError(409, "Selected tenant subscription is not active.", "VALIDATION_ERROR");
      }
      if (normalizedTenantRole === "owner") {
        throw new HttpError(409, "Ownership transfer is not supported.", "VALIDATION_ERROR");
      }

      if (normalizedTenantRole === "billing_admin") {
        const actorMembership = await tx.businessMember.findFirst({
          where: {
            businessId: tenant.id,
            userId: context.actorId,
            status: "active",
          },
          select: { role: true },
        });
        const actorOrgRole = normalizeOrgRole(actorMembership?.role || null);
        if (!canAssignBillingAdmin(actorOrgRole)) {
          throw new HttpError(403, "Only owners can assign Billing Admin.", "FORBIDDEN_ROLE_ESCALATION");
        }
      }

      const plan = tenant.orgSubscription?.planId ?? tenant.plan ?? null;
      const seatLimit = getSeatLimitForPlan(plan);
      const seatUsage = await countActiveOrgSeats(tenant.id, tx);
      if (seatLimit !== null && seatUsage >= seatLimit) {
        throw new HttpError(409, `Tenant seat limit reached (${seatUsage}/${seatLimit}).`, "VALIDATION_ERROR");
      }
    }

    const storedRole = storedRoleForStatus({
      nextStatus: effectiveStatus,
      resolvedRole: role,
    });

    const createdUser = await tx.user.create({
      data: {
        name: fullName,
        email,
        passwordHash: bootstrapPasswordHash,
        role: storedRole,
        status: effectiveStatus as any,
        isPlatformUser: true,
        twoFactorEnabled: false,
        requirePasswordReset: !sendSetupEmailNormalized,
        emailVerified: sendSetupEmailNormalized ? null : new Date(),
      },
      select: { id: true },
    });
    createdUserId = createdUser.id;

    if (role === "SUPER_ADMIN") {
      await tx.setting.upsert({
        where: { key: ROOT_SUPER_ADMIN_SETTING },
        update: { value: createdUser.id },
        create: { key: ROOT_SUPER_ADMIN_SETTING, value: createdUser.id },
      });
    }

    if (shouldAttachTenant && normalizedTenantRole) {
      await tx.businessMember.create({
        data: {
          businessId: String(input.payload.tenantId),
          userId: createdUser.id,
          role: normalizedTenantRole,
          status: "active",
          invitedBy: context.actorId,
          joinedAt: new Date(),
        },
      });

      await tx.auditLog.create({
        data: {
          userId: context.actorId,
          targetUserId: createdUser.id,
          orgId: String(input.payload.tenantId),
          action: "TENANT_ATTACHED",
          actionType: "TENANT_ATTACHED",
          metadata: {
            tenantRole: normalizedTenantRole,
            ipAddress: input.ipAddress || null,
            userAgent: input.userAgent || null,
          },
        },
      });
      await tx.auditLog.create({
        data: {
          userId: context.actorId,
          targetUserId: createdUser.id,
          orgId: String(input.payload.tenantId),
          action: "TENANT_ROLE_SET",
          actionType: "TENANT_ROLE_SET",
          metadata: {
            previousTenantRole: null,
            nextTenantRole: normalizedTenantRole,
            ipAddress: input.ipAddress || null,
            userAgent: input.userAgent || null,
          },
        },
      });
    }

    if (sendSetupEmailNormalized) {
      const rawToken = crypto.randomBytes(32).toString("base64url");
      const hashedToken = hashPasswordResetToken(rawToken);
      setupTokenRaw = rawToken;
      await tx.passwordResetToken.updateMany({
        where: { userId: createdUser.id, used: false },
        data: { used: true },
      });
      await tx.passwordResetToken.create({
        data: {
          userId: createdUser.id,
          token: hashedToken,
          expiresAt: new Date(Date.now() + setupLinkTtlMs),
          used: false,
        },
      });
    } else {
      generatedTempPassword = generateTemporaryPassword(16);
      await tx.user.update({
        where: { id: createdUser.id },
        data: {
          passwordHash: await hashPassword(generatedTempPassword),
          requirePasswordReset: true,
        },
      });
    }

    const baseMetadata = {
      ipAddress: input.ipAddress || null,
      userAgent: input.userAgent || null,
      role,
      status: effectiveStatus,
      sendSetupEmail: sendSetupEmailNormalized,
      tenantId: shouldAttachTenant ? String(input.payload.tenantId) : null,
      tenantRole: normalizedTenantRole ?? null,
    };

    await tx.auditLog.create({
      data: {
        userId: context.actorId,
        targetUserId: createdUser.id,
        orgId: shouldAttachTenant ? String(input.payload.tenantId) : null,
        action: "USER_CREATED",
        actionType: "USER_CREATED",
        metadata: baseMetadata,
      },
    });
    await tx.auditLog.create({
      data: {
        userId: context.actorId,
        targetUserId: createdUser.id,
        action: "GLOBAL_ROLE_CHANGED",
        actionType: "GLOBAL_ROLE_CHANGED",
        metadata: {
          previousRole: null,
          nextRole: role,
          ipAddress: input.ipAddress || null,
        },
      },
    });
    await tx.auditLog.create({
      data: {
        userId: context.actorId,
        targetUserId: createdUser.id,
        action: "ACCOUNT_STATUS_CHANGED",
        actionType: "ACCOUNT_STATUS_CHANGED",
        metadata: {
          previousStatus: null,
          nextStatus: effectiveStatus,
          ipAddress: input.ipAddress || null,
        },
      },
    });

    if (role === "SUPER_ADMIN") {
      await tx.auditLog.create({
        data: {
          userId: context.actorId,
          targetUserId: createdUser.id,
          action: "SUPER_ADMIN_GRANTED",
          actionType: "SUPER_ADMIN_GRANTED",
          metadata: {
            ipAddress: input.ipAddress || null,
            userAgent: input.userAgent || null,
          },
        },
      });

      const superAdmins = await tx.user.findMany({
        where: {
          role: { in: ["OPS_ADMIN"] as Role[] },
          status: "ACTIVE",
        },
        select: {
          id: true,
          email: true,
        },
      });
      for (const admin of superAdmins) {
        if (admin.id === createdUser.id) continue;
        superAdminAlertRecipients.push(admin.email);
      }
    }

    await tx.auditLog.create({
      data: {
        userId: context.actorId,
        targetUserId: createdUser.id,
        action: sendSetupEmailNormalized ? "PASSWORD_SETUP_SENT" : "TEMP_PASSWORD_GENERATED",
        actionType: sendSetupEmailNormalized ? "PASSWORD_SETUP_SENT" : "TEMP_PASSWORD_GENERATED",
        metadata: {
          ipAddress: input.ipAddress || null,
          userAgent: input.userAgent || null,
          expiresInHours: sendSetupEmailNormalized ? 24 : null,
        },
      },
    });
    if (sendSetupEmailNormalized) {
      await tx.auditLog.create({
        data: {
          userId: context.actorId,
          targetUserId: createdUser.id,
          action: "USER_INVITED",
          actionType: "USER_INVITED",
          metadata: {
            ipAddress: input.ipAddress || null,
            userAgent: input.userAgent || null,
            expiresInHours: 24,
          },
        },
      });
    }
  });

  let setupEmailSent = false;
  if (sendSetupEmailNormalized && createdUserId && setupTokenRaw) {
    const baseUrl = process.env.APP_URL || process.env.NEXTAUTH_URL || "http://localhost:3000";
    const setupUrl = `${baseUrl}/reset-password?token=${encodeURIComponent(setupTokenRaw)}`;
    try {
      await sendPlatformMail({
        to: email,
        subject: "Set up your Maboria account",
        html: buildSetupEmailHtml({ setupUrl, recipientName: fullName }),
      });
      setupEmailSent = true;
    } catch {
      setupEmailSent = false;
    }
  }

  if (role === "SUPER_ADMIN" && superAdminAlertRecipients.length > 0) {
    const deduped = Array.from(new Set(superAdminAlertRecipients));
    await Promise.allSettled(
      deduped.map((recipient) =>
        sendSecurityMail({
          to: recipient,
          subject: "Super admin role granted",
          html: `<p>A new super admin account was provisioned: <strong>${email}</strong>.</p>`,
        })
      )
    );
  }

  return {
    success: true,
    userId: createdUserId,
    tempPassword: sendSetupEmailNormalized ? undefined : generatedTempPassword,
    setupEmailSent,
  };
}

export async function resendPlatformUserSetupEmail(input: {
  actorId: string;
  userId: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}) {
  let rawToken = "";
  let recipientEmail = "";
  let recipientName = "";
  await prisma.$transaction(async (tx) => {
    const context = await resolveAdminContext(tx, input.actorId);
    const target = await tx.user.findUnique({
      where: { id: input.userId },
      select: { id: true, email: true, name: true, status: true, role: true },
    });
    if (!target) {
      throw new HttpError(404, "User not found.", "VALIDATION_ERROR");
    }
    if (String(target.status).toUpperCase() !== "PENDING") {
      throw new HttpError(409, "Setup email can be resent for pending users only.", "VALIDATION_ERROR");
    }

    const targetRole = resolveRole(target.role, target.id, context.rootSuperAdminId);
    if (context.actorRole !== "SUPER_ADMIN" && targetRole !== "USER") {
      throw new HttpError(403, "Only super admins can resend setup for admin users.", "FORBIDDEN_ROLE_ESCALATION");
    }

    rawToken = crypto.randomBytes(32).toString("base64url");
    const hashedToken = hashPasswordResetToken(rawToken);
    await tx.passwordResetToken.updateMany({
      where: { userId: target.id, used: false },
      data: { used: true },
    });
    await tx.passwordResetToken.create({
      data: {
        userId: target.id,
        token: hashedToken,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        used: false,
      },
    });
    await tx.auditLog.create({
      data: {
        userId: context.actorId,
        targetUserId: target.id,
        action: "PASSWORD_SETUP_SENT",
        actionType: "PASSWORD_SETUP_SENT",
        metadata: {
          resent: true,
          ipAddress: input.ipAddress || null,
          userAgent: input.userAgent || null,
        },
      },
    });
    recipientEmail = target.email;
    recipientName = target.name || "";
  });

  const baseUrl = process.env.APP_URL || process.env.NEXTAUTH_URL || "http://localhost:3000";
  const setupUrl = `${baseUrl}/reset-password?token=${encodeURIComponent(rawToken)}`;
  await sendPlatformMail({
    to: recipientEmail,
    subject: "Set up your Maboria account",
    html: buildSetupEmailHtml({ setupUrl, recipientName }),
  });

  return { success: true };
}

export async function bulkAdminUserAction(input: {
  actorId: string;
  userIds: string[];
  action: "disable" | "change_role" | "delete";
  nextRole?: IdentityAccessRole;
}) {
  const uniqueUserIds = Array.from(new Set(input.userIds.filter(Boolean)));
  if (!uniqueUserIds.length) {
    throw new HttpError(422, "Select at least one user.");
  }

  if (input.action === "change_role" && !input.nextRole) {
    throw new HttpError(422, "Role is required for bulk role updates.");
  }

  let changed = 0;
  let skipped = 0;
  const errors: Array<{ userId: string; reason: string }> = [];

  for (const userId of uniqueUserIds) {
    try {
      if (input.action === "change_role" && input.nextRole) {
        await updateAdminUserRole({ actorId: input.actorId, userId, nextRole: input.nextRole });
      } else {
        await updateAdminUserStatus({
          actorId: input.actorId,
          userId,
          nextStatus: "DISABLED",
        });
      }
      changed += 1;
    } catch (error) {
      skipped += 1;
      errors.push({
        userId,
        reason: error instanceof Error ? error.message : "Action failed.",
      });
    }
  }

  return {
    changed,
    skipped,
    errors,
  };
}

export function normalizeIdentityFilter(value?: string | null) {
  return normalizeFilter(value);
}

export function normalizeIdentityRole(value?: string | null) {
  return normalizeRole(value);
}

export function normalizeIdentityStatus(value?: string | null) {
  return normalizeStatus(value);
}

export function toHttpError(error: unknown) {
  if (error instanceof HttpError) return error;
  return new HttpError(500, error instanceof Error ? error.message : "Server error", "SERVER_ERROR");
}
