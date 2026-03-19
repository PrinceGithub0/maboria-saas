export type IdentityAccessRole = "SUPER_ADMIN" | "OPS_ADMIN" | "USER";

export type IdentityAccessStatus = "ACTIVE" | "DISABLED" | "SUSPENDED" | "PENDING";

export type IdentitySubscriptionState =
  | "ACTIVE"
  | "PAST_DUE"
  | "CANCELED"
  | "TRIAL"
  | "NONE";

export type IdentityFilter =
  | "all"
  | "super_admins"
  | "admins"
  | "subscribers"
  | "no_plan"
  | "disabled";

export type IdentityListItem = {
  id: string;
  fullName: string;
  email: string;
  userId: string | null;
  role: IdentityAccessRole;
  status: IdentityAccessStatus;
  subscriptionPlan: string | null;
  subscriptionState: IdentitySubscriptionState;
  lastLoginAt: string | null;
  createdAt: string;
  authProvider: "PASSWORD" | "GOOGLE" | "SSO";
  twoFactorEnabled: boolean;
  tenantAssociationsCount: number;
  activeSubscriptionId: string | null;
};

export type IdentitySummary = {
  totalUsers: number;
  totalUsersDelta: number;
  adminCount: number;
  activeSubscribers: number;
  disabledAccounts: number;
  usersWithoutActivePlan: number;
};

export type IdentityListResponse = {
  actor: {
    id: string;
    role: IdentityAccessRole;
  };
  items: IdentityListItem[];
  summary: IdentitySummary;
  pagination: {
    mode: "offset" | "cursor";
    page: number;
    pageSize: number;
    totalItems: number | null;
    totalPages: number | null;
    hasMore: boolean;
    nextCursor: string | null;
  };
};

export type IdentityUserDetailResponse = {
  user: IdentityListItem & {
    isRootSuperAdmin: boolean;
  };
  subscription: {
    id: string | null;
    plan: string | null;
    state: IdentitySubscriptionState;
    startedAt: string | null;
    renewalDate: string | null;
    seatUsage: {
      used: number | null;
      limit: number | null;
    };
  };
  recentAuditEvents: Array<{
    id: string;
    actionType: string;
    createdAt: string;
    actorUserId: string | null;
    metadata: unknown;
  }>;
};

export type IdentityCreateMetadataResponse = {
  actor: {
    id: string;
    role: IdentityAccessRole;
  };
  tenants: Array<{
    id: string;
    name: string;
    accessStatus: string;
    subscriptionStatus: string | null;
    plan: string | null;
    seatLimit: number | null;
    seatsUsed: number;
  }>;
  roleOptions: IdentityAccessRole[];
  statusOptions: IdentityAccessStatus[];
  defaults: {
    status: "PENDING";
    sendSetupEmail: true;
  };
};

export type IdentityCreateUserPayload = {
  fullName: string;
  email: string;
  role: IdentityAccessRole;
  status: IdentityAccessStatus;
  sendSetupEmail: boolean;
  tenantId?: string | null;
  tenantRole?:
    | "OWNER"
    | "ADMIN"
    | "MEMBER"
    | "BILLING_ADMIN"
    | "owner"
    | "admin"
    | "member"
    | "billing_admin"
    | null;
};

export type IdentityCreateUserResponse = {
  success: true;
  userId: string;
  tempPassword?: string;
  setupEmailSent: boolean;
};
