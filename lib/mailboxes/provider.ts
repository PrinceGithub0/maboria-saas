import "server-only";

import { ConnectedMailboxProvider } from "@prisma/client";

export type ConnectedMailboxCapability = "oauth" | "smtp_send" | "imap_sync" | "graph_sync";

export type ConnectedMailboxProviderDefinition = {
  provider: ConnectedMailboxProvider;
  label: string;
  authMode: "oauth" | "credentials";
  capabilities: ConnectedMailboxCapability[];
};

const PROVIDERS: Record<ConnectedMailboxProvider, ConnectedMailboxProviderDefinition> = {
  GMAIL: {
    provider: "GMAIL",
    label: "Gmail",
    authMode: "oauth",
    capabilities: ["oauth", "graph_sync"],
  },
  OUTLOOK: {
    provider: "OUTLOOK",
    label: "Outlook / Microsoft 365",
    authMode: "oauth",
    capabilities: ["oauth", "graph_sync"],
  },
  IMAP: {
    provider: "IMAP",
    label: "IMAP mailbox",
    authMode: "credentials",
    capabilities: ["imap_sync"],
  },
  SMTP: {
    provider: "SMTP",
    label: "SMTP mailbox",
    authMode: "credentials",
    capabilities: ["smtp_send"],
  },
};

const PROVIDER_VALUES = Object.keys(PROVIDERS) as ConnectedMailboxProvider[];

export function listConnectedMailboxProviders() {
  return PROVIDER_VALUES.map((provider) => PROVIDERS[provider]);
}

export function isConnectedMailboxProvider(value: string): value is ConnectedMailboxProvider {
  return PROVIDER_VALUES.includes(value as ConnectedMailboxProvider);
}

export function getConnectedMailboxProvider(provider: ConnectedMailboxProvider) {
  return PROVIDERS[provider];
}
