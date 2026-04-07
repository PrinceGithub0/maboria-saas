export type AdminTenantAccessStatus = "ACTIVE" | "SUSPENDED" | "DISABLED";

export type AdminTenantSort = "created_desc" | "created_asc" | "activity_desc" | "activity_asc";

export type AdminTenantListItem = {
  id: string;
  name: string;
  status: AdminTenantAccessStatus;
  createdAt: string;
  lastActivityAt: string | null;
  plan: string | null;
  subscriptionStatus: string | null;
  owner: {
    id: string;
    name: string | null;
    email: string;
    publicId: string | null;
  };
  riskFlags: number;
};

export type AdminTenantListResponse = {
  actorRole?: "SUPER_ADMIN" | "OPS_ADMIN" | "USER";
  items: AdminTenantListItem[];
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
};

export type AdminTenantDetailResponse = {
  actorRole?: "SUPER_ADMIN" | "OPS_ADMIN" | "USER";
  tenant: {
    id: string;
    name: string;
    domain: string | null;
    status: AdminTenantAccessStatus;
    createdAt: string;
    suspendedAt: string | null;
    suspendedReason: string | null;
    lastActivityAt: string | null;
  };
  owner: {
    id: string;
    name: string | null;
    email: string;
    publicId: string | null;
  };
  subscription: {
    plan: string | null;
    status: string | null;
    billingInterval: string | null;
    provider: string | null;
    providerCustomerId: string | null;
    providerSubscriptionId: string | null;
    paidThroughAt: string | null;
    currentCycleStartAt: string | null;
    currentCycleEndAt: string | null;
    apiAccessEnabled: boolean;
  };
  overview: {
    stats: {
      users: number;
      customers: number;
      invoices: number;
      automations: number;
      conversations: number;
    };
    integrations: {
      paystackSubaccountCode: string | null;
      flutterwaveSubaccountId: string | null;
      payoutProvider: string | null;
      updatedAt: string | null;
    };
    riskSignals: {
      openHighPriorityTickets: number;
      webhookFailures7d: number;
    };
  };
  users: Array<{
    id: string;
    role: string;
    status: string;
    joinedAt: string | null;
    createdAt: string;
    user: {
      id: string;
      name: string | null;
      email: string;
      publicId: string | null;
      role: string;
    };
  }>;
  usage: {
    periodStart: string;
    periodEnd: string;
    counters: Array<{
      feature: string;
      quantity: number;
    }>;
    channelTotals: {
      billingPeriod: string;
      emailMessagesSent: number;
      whatsappMessagesSent: number;
      totalMessagesSent: number;
      updatedAt: string;
    } | null;
    messagingActivityUpdatedAt: string | null;
  };
  billing: {
    provider: string | null;
    providerCustomerId: string | null;
    providerSubscriptionId: string | null;
    billingInterval: string | null;
    paidThroughAt: string | null;
    currentCycleStartAt: string | null;
    currentCycleEndAt: string | null;
    apiAccessEnabled: boolean;
    paystackSubaccountCode: string | null;
    flutterwaveSubaccountId: string | null;
    lastSyncAt: string | null;
    webhookHealth: "healthy" | "degraded" | "unknown";
  };
  logs: Array<{
    id: string;
    source: "audit" | "system";
    action: string;
    actorUserId: string | null;
    createdAt: string;
    metadata: unknown;
  }>;
};
