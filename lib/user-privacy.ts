export const ACCOUNT_ERASURE_CONFIRMATION = "ERASE MY ACCOUNT";

type PrivacyExportMailbox = {
  id: string;
  provider: string;
  status: string;
  emailAddress: string;
  displayName: string | null;
  providerAccountId: string | null;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
};

type PrivacyExportEInvoicingConnection = {
  id: string;
  provider: string;
  country: string;
  status: string;
  sandbox: boolean;
  metadata: unknown;
  lastValidatedAt: Date | null;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
  credentialsEncrypted?: string | null;
};

type PrivacyExportInput = {
  exportedAt: string;
  user: Record<string, unknown>;
  memberships: Array<Record<string, unknown>>;
  businessProfile: Record<string, unknown> | null;
  subscriptions: Array<Record<string, unknown>>;
  merchantAccount: Record<string, unknown> | null;
  eInvoicingConnections: PrivacyExportEInvoicingConnection[];
  connectedMailboxes: PrivacyExportMailbox[];
  workspaceSummary: Record<string, unknown>;
  activityLogs: Array<Record<string, unknown>>;
  auditLogs: Array<Record<string, unknown>>;
  userActivityLogs: Array<Record<string, unknown>>;
  supportTickets: Array<Record<string, unknown>>;
};

export function buildErasedUserEmail(userId: string) {
  return `deleted+${String(userId).trim().toLowerCase()}@maboria.invalid`;
}

export function buildUserPrivacyExportFilename(input: {
  userId: string;
  email?: string | null;
  name?: string | null;
}) {
  const seed = String(input.email || input.name || "account-export")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return `${seed || "account-export"}-${input.userId}-privacy-export.json`;
}

export function buildUserPrivacyExportPayload(input: PrivacyExportInput) {
  return {
    exportedAt: input.exportedAt,
    user: input.user,
    memberships: input.memberships,
    businessProfile: input.businessProfile,
    subscriptions: input.subscriptions,
    merchantAccount: input.merchantAccount,
    eInvoicingConnections: input.eInvoicingConnections.map((connection) => ({
      id: connection.id,
      provider: connection.provider,
      country: connection.country,
      status: connection.status,
      sandbox: connection.sandbox,
      hasCredentials: Boolean(connection.credentialsEncrypted),
      metadata: connection.metadata,
      lastValidatedAt: connection.lastValidatedAt,
      lastError: connection.lastError,
      createdAt: connection.createdAt,
      updatedAt: connection.updatedAt,
    })),
    connectedMailboxes: input.connectedMailboxes.map((mailbox) => ({
      id: mailbox.id,
      provider: mailbox.provider,
      status: mailbox.status,
      emailAddress: mailbox.emailAddress,
      displayName: mailbox.displayName,
      providerAccountId: mailbox.providerAccountId,
      metadata: mailbox.metadata,
      createdAt: mailbox.createdAt,
      updatedAt: mailbox.updatedAt,
    })),
    workspaceSummary: input.workspaceSummary,
    activityLogs: input.activityLogs,
    auditLogs: input.auditLogs,
    userActivityLogs: input.userActivityLogs,
    supportTickets: input.supportTickets,
  };
}
