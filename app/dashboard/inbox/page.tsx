"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import useSWR from "swr";
import { Inbox, Paperclip, RefreshCw, Search, Send, Sparkles, Tag, UserCircle2 } from "lucide-react";
import { WhatsAppEmbeddedSignupCard } from "@/components/inbox/whatsapp-embedded-signup-card";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { TransientAlert } from "@/components/ui/transient-alert";
import { formatDateTimeDMY } from "@/lib/date";

type ConversationStatus = "OPEN" | "PENDING" | "CLOSED";
type ConversationTab = "ALL" | ConversationStatus;
type AssigneeFilter = "all" | "mine" | "unassigned";

type Agent = {
  id: string;
  name: string | null;
  email: string;
  role: string;
};

type ConversationListItem = {
  id: string;
  status: ConversationStatus;
  inbox: { id: string; name: string; type: "EMAIL" | "WHATSAPP"; status: string };
  contact: { id: string; name: string; email: string; phone: string | null; status: string };
  assignedUser: { id: string; name: string | null; email: string } | null;
  tags: Array<{ id: string; label: string }>;
  unreadCount: number;
  lastMessageAt: string | null;
  lastMessage: { id: string; direction: string; content: string; createdAt: string; deliveryStatus: string } | null;
};

type ConversationListPayload = { items: ConversationListItem[] };

type ConversationDetail = {
  id: string;
  status: ConversationStatus;
  inbox: { id: string; name: string; type: "EMAIL" | "WHATSAPP"; status: string };
  contact: {
    id: string;
    name: string;
    email: string;
    phone: string | null;
    status: string;
    createdAt: string;
    updatedAt: string;
  };
  assignedUser: { id: string; name: string | null; email: string } | null;
  tags: Array<{ id: string; label: string }>;
  messages: Array<{
    id: string;
    direction: "INBOUND" | "OUTBOUND" | "INTERNAL" | "SYSTEM";
    channel: "EMAIL" | "WHATSAPP";
    senderIdentifier: string | null;
    content: string;
    attachments?: Array<{ name?: string; type?: string; size?: number; dataUrl?: string }>;
    deliveryStatus: string;
    createdAt: string;
  }>;
  notes: Array<{
    id: string;
    content: string;
    createdAt: string;
    author: { id: string; name: string | null; email: string };
  }>;
  canViewBillingInsights: boolean;
  customerInsights: {
    recentInvoices: Array<{ id: string; invoiceNumber: string; total: string; currency: string; status: string; generatedAt: string }>;
    recentPayments: Array<{ id: string; amount: string; currency: string; status: string; reference: string; createdAt: string }>;
    overdueInvoices: Array<{ id: string; invoiceNumber: string; total: string; currency: string; status: string; generatedAt: string }>;
  } | null;
};

type CannedReply = { id: string; title: string; content: string };
type InboxSetupItem = {
  id: string;
  name: string;
  type: "EMAIL" | "WHATSAPP";
  status: string;
  connection:
    | {
        mode: "oauth";
        connectedMailboxId: string;
        provider: "GMAIL" | "OUTLOOK";
        status: string;
        emailAddress: string;
        displayName: string | null;
        updatedAt: string;
      }
    | {
        mode: "smtp";
        host: string;
        username: string;
        from: string;
        configured: true;
      }
    | {
        mode: "whatsapp_api";
        configured: true;
        phoneNumberId: string;
        displayPhoneNumber?: string | null;
        verifiedName?: string | null;
        qualityRating?: string | null;
        apiVersion: string;
        hasVerifyToken: boolean;
        hasAppSecret: boolean;
      }
    | {
        mode: "none";
        configured: false;
      };
};

type InboxSetupPayload = {
  items: InboxSetupItem[];
  oauthProviders?: {
    gmail?: { configured: boolean };
    outlook?: { configured: boolean };
  };
};

const LEGACY_IMPORTED_EMAIL_DOMAINS = ["inbox.maboria.local", "placeholder.maboria.local"];

const fetcher = async (url: string) => {
  const response = await fetch(url);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error || "Request failed");
  return data;
};

const statusLabel: Record<ConversationStatus, string> = {
  OPEN: "Open",
  PENDING: "Pending",
  CLOSED: "Closed",
};

const statusPillClasses: Record<ConversationStatus, string> = {
  OPEN: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-400/10 dark:text-emerald-300 dark:border-emerald-400/30",
  PENDING: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-400/10 dark:text-amber-300 dark:border-amber-400/30",
  CLOSED: "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700",
};

const directionBubble = {
  INBOUND: "bg-white border border-slate-200 text-slate-900 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-100",
  OUTBOUND: "bg-indigo-600 text-white",
  INTERNAL: "bg-amber-50 border border-amber-200 text-amber-900 dark:bg-amber-400/10 dark:border-amber-400/30 dark:text-amber-200",
  SYSTEM: "bg-slate-100 border border-slate-200 text-slate-700 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200",
} as const;

function isLegacyImportedEmail(value: string | null | undefined) {
  const normalized = String(value || "").trim().toLowerCase();
  return LEGACY_IMPORTED_EMAIL_DOMAINS.some((domain) => normalized.endsWith(`@${domain}`));
}

function getConversationDisplayEmail(value: string | null | undefined) {
  return isLegacyImportedEmail(value) ? null : String(value || "").trim() || null;
}

function getConversationPrimaryLabel(contact: ConversationListItem["contact"] | ConversationDetail["contact"] | undefined) {
  if (!contact) return "Customer";
  return contact.name || contact.phone || getConversationDisplayEmail(contact.email) || "Customer";
}

function getConversationSecondaryLabel(contact: ConversationListItem["contact"] | ConversationDetail["contact"] | undefined) {
  if (!contact) return "";
  return contact.phone || getConversationDisplayEmail(contact.email) || "Imported legacy conversation";
}

function isEmailChannelConnected(setup: InboxSetupItem | null) {
  if (!setup || setup.type !== "EMAIL" || setup.status !== "ACTIVE") return false;
  if (setup.connection.mode === "oauth") {
    return setup.connection.status === "ACTIVE";
  }
  return setup.connection.mode === "smtp";
}

function isWhatsAppChannelConnected(setup: InboxSetupItem | null) {
  return Boolean(setup && setup.type === "WHATSAPP" && setup.status === "ACTIVE" && setup.connection.mode === "whatsapp_api");
}

function getChannelLabel(type: "EMAIL" | "WHATSAPP") {
  return type === "EMAIL" ? "Email" : "WhatsApp";
}

function setupBadgeClasses(status: "connected" | "history" | "setup") {
  if (status === "connected") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-300";
  }
  if (status === "history") {
    return "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-400/30 dark:bg-sky-400/10 dark:text-sky-300";
  }
  return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-300";
}

export default function InboxPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<ConversationTab>("ALL");
  const [assignee, setAssignee] = useState<AssigneeFilter>("all");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messageDraft, setMessageDraft] = useState("");
  const [noteDraft, setNoteDraft] = useState("");
  const [tagDraft, setTagDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [saving, setSaving] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [attachments, setAttachments] = useState<Array<{ name: string; type: string; size?: number; dataUrl?: string }>>([]);
  const [flash, setFlash] = useState<{ kind: "success" | "error" | "warning"; message: string } | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState(() => new Date().toISOString());

  const params = new URLSearchParams();
  params.set("status", status);
  params.set("assignee", assignee);
  if (query.trim()) params.set("search", query.trim());
  const listUrl = `/api/inbox/unified/conversations?${params.toString()}`;

  const {
    data: conversationsPayload,
    error: listError,
    mutate: mutateConversations,
    isLoading: listLoading,
  } = useSWR<ConversationListPayload>(listUrl, fetcher, {
    revalidateOnFocus: false,
  });

  const conversations = useMemo(() => conversationsPayload?.items ?? [], [conversationsPayload?.items]);

  const {
    data: detail,
    error: detailError,
    mutate: mutateDetail,
    isLoading: detailLoading,
  } = useSWR<ConversationDetail>(activeId ? `/api/inbox/unified/conversations/${activeId}` : null, fetcher, {
    revalidateOnFocus: false,
  });

  const { data: agentsPayload } = useSWR<{ items: Agent[] }>("/api/inbox/unified/agents", fetcher, {
    revalidateOnFocus: false,
  });
  const agents = agentsPayload?.items ?? [];

  const { data: cannedRepliesPayload } = useSWR<{ items?: CannedReply[] } | CannedReply[]>(
    "/api/inbox/unified/canned-replies",
    fetcher,
    {
      revalidateOnFocus: false,
      shouldRetryOnError: false,
    }
  );
  const cannedReplies = Array.isArray(cannedRepliesPayload)
    ? cannedRepliesPayload
    : Array.isArray(cannedRepliesPayload?.items)
      ? cannedRepliesPayload.items
      : [];

  const { data: inboxSetupPayload, mutate: mutateInboxes } = useSWR<InboxSetupPayload>(
    "/api/inbox/unified/inboxes",
    fetcher,
    {
      revalidateOnFocus: false,
      shouldRetryOnError: false,
    }
  );
  const inboxSetupItems = inboxSetupPayload?.items ?? [];
  const emailSetup = inboxSetupItems.find((item) => item.type === "EMAIL") || null;
  const whatsappSetup = inboxSetupItems.find((item) => item.type === "WHATSAPP") || null;
  const gmailOauthConfigured = inboxSetupPayload?.oauthProviders?.gmail?.configured ?? false;
  const outlookOauthConfigured = inboxSetupPayload?.oauthProviders?.outlook?.configured ?? false;
  const emailChannelConnected = isEmailChannelConnected(emailSetup);
  const whatsappChannelConnected = isWhatsAppChannelConnected(whatsappSetup);
  const emailConversationCount = conversations.filter((item) => item.inbox.type === "EMAIL").length;
  const whatsappConversationCount = conversations.filter((item) => item.inbox.type === "WHATSAPP").length;
  const emailHistoryOnly = !emailChannelConnected && emailConversationCount > 0;
  const whatsappHistoryOnly = !whatsappChannelConnected && whatsappConversationCount > 0;
  const activeChannelConnected = detail ? (detail.inbox.type === "EMAIL" ? emailChannelConnected : whatsappChannelConnected) : false;
  const activeChannelLabel = detail ? getChannelLabel(detail.inbox.type) : "Channel";
  const emailSetupStatus = emailChannelConnected ? "connected" : emailHistoryOnly ? "history" : "setup";
  const whatsappSetupStatus = whatsappChannelConnected ? "connected" : whatsappHistoryOnly ? "history" : "setup";
  const activeReplyDisabledReason = !detail
    ? "Select a conversation to reply."
    : !activeChannelConnected
      ? `${activeChannelLabel} is not connected for this workspace. Historical messages stay visible, but reconnect the channel before replying.`
      : detail.inbox.type === "EMAIL" && !getConversationDisplayEmail(detail.contact.email)
        ? "This customer does not have an email address on file."
        : detail.inbox.type === "WHATSAPP" && !detail.contact.phone
          ? "This customer does not have a phone number on file for WhatsApp."
          : null;

  useEffect(() => {
    if (!activeId && conversations.length) {
      setActiveId(conversations[0].id);
    }
    if (activeId && conversations.length && !conversations.some((item) => item.id === activeId)) {
      setActiveId(conversations[0].id);
    }
  }, [activeId, conversations]);

  useEffect(() => {
    const mailboxConnected = searchParams.get("mailbox_connected");
    const mailboxError = searchParams.get("mailbox_error");
    if (mailboxConnected === "1") {
      setFlash({ kind: "success", message: "Email channel connected successfully." });
      return;
    }
    if (mailboxError) {
      const message =
        mailboxError === "mailbox_oauth_not_configured"
          ? "Mailbox OAuth is not configured on this deployment yet."
          : mailboxError === "oauth_state_invalid" || mailboxError === "oauth_state_missing"
            ? "Mailbox connection expired or was interrupted. Start the connection again."
            : mailboxError === "access_denied"
              ? "Mailbox connection was cancelled."
              : "Unable to connect the mailbox.";
      setFlash({ kind: "error", message });
    }
  }, [searchParams]);

  useEffect(() => {
    const timer = setInterval(async () => {
      try {
        const response = await fetch(`/api/inbox/unified/updates?since=${encodeURIComponent(lastSyncAt)}`);
        const data = await response.json().catch(() => ({}));
        if (response.ok && data?.now) {
          setLastSyncAt(String(data.now));
        } else {
          setLastSyncAt(new Date().toISOString());
        }
        mutateConversations();
        if (activeId) mutateDetail();
      } catch {
        // noop
      }
    }, 6000);
    return () => clearInterval(timer);
  }, [activeId, lastSyncAt, mutateConversations, mutateDetail]);

  const gmailConnectHref = "/api/mailboxes/connected/oauth/start?provider=GMAIL&bindUnifiedInbox=1&returnTo=/dashboard/inbox";
  const outlookConnectHref =
    "/api/mailboxes/connected/oauth/start?provider=OUTLOOK&bindUnifiedInbox=1&returnTo=/dashboard/inbox";

  const startMailboxConnect = (href: string, enabled: boolean) => {
    if (!enabled || typeof window === "undefined") return;
    window.location.assign(href);
  };

  const handlePatchConversation = async (payload: Record<string, unknown>) => {
    if (!activeId) return;
    setSaving(true);
    setFlash(null);
    try {
      const response = await fetch(`/api/inbox/unified/conversations/${activeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || "Unable to update conversation.");
      await Promise.all([mutateDetail(), mutateConversations()]);
      setFlash({ kind: "success", message: "Conversation updated." });
    } catch (error: any) {
      setFlash({ kind: "error", message: error?.message || "Unable to update conversation." });
    } finally {
      setSaving(false);
    }
  };

  const addNote = async () => {
    if (!activeId) return;
    const content = noteDraft.trim();
    if (!content) return;
    setFlash(null);
    try {
      const response = await fetch(`/api/inbox/unified/conversations/${activeId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || "Unable to add note.");
      setNoteDraft("");
      await mutateDetail();
    } catch (error: any) {
      setFlash({ kind: "error", message: error?.message || "Unable to add note." });
    }
  };

  const handleFileAttach = async (files: FileList | null) => {
    if (!files) return;
    const next: Array<{ name: string; type: string; size?: number; dataUrl?: string }> = [];
    for (const file of Array.from(files)) {
      const reader = new FileReader();
      const dataUrl = await new Promise<string | undefined>((resolve) => {
        reader.onload = () => resolve(reader.result?.toString());
        reader.onerror = () => resolve(undefined);
        reader.readAsDataURL(file);
      });
      next.push({ name: file.name, type: file.type, size: file.size, dataUrl });
    }
    setAttachments((prev) => [...prev, ...next]);
  };

  const sendMessage = async () => {
    if (!activeId) return;
    const content = messageDraft.trim();
    if (!content) return;
    setSending(true);
    setFlash(null);
    try {
      const response = await fetch(`/api/inbox/unified/conversations/${activeId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content,
          direction: "OUTBOUND",
          channel: detail?.inbox.type,
          attachments,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || "Unable to send message.");
      setMessageDraft("");
      setAttachments([]);
      await Promise.all([mutateDetail(), mutateConversations()]);
    } catch (error: any) {
      setFlash({ kind: "error", message: error?.message || "Unable to send message." });
    } finally {
      setSending(false);
    }
  };

  const applyAiReply = async () => {
    if (!detail) return;
    setAiLoading(true);
    setFlash(null);
    try {
      const contextWindow = detail.messages
        .slice(-8)
        .map((msg) => `${msg.direction}: ${msg.content}`)
        .join("\n");
      const response = await fetch("/api/ai/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "assistant",
          prompt: `Draft a concise support reply for this conversation.\n${contextWindow}`,
          style: "brief",
          tone: "direct",
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || "AI suggestion failed.");
      const suggestion = String(data?.answer || "").trim();
      if (!suggestion) throw new Error("AI returned an empty suggestion.");
      setMessageDraft(suggestion);
    } catch (error: any) {
      setFlash({ kind: "error", message: error?.message || "AI suggestion failed." });
    } finally {
      setAiLoading(false);
    }
  };

  const applyTags = async () => {
    const tags = tagDraft
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);
    await handlePatchConversation({ tags });
  };

  const ticketCounts = useMemo(
    () => ({
      all: conversations.length,
      open: conversations.filter((item) => item.status === "OPEN").length,
      pending: conversations.filter((item) => item.status === "PENDING").length,
      closed: conversations.filter((item) => item.status === "CLOSED").length,
    }),
    [conversations]
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.26em] text-slate-500 dark:text-slate-400">Unified inbox</p>
          <h1 className="text-3xl font-semibold text-slate-900 dark:text-slate-50">Customer conversations</h1>
          <p className="text-sm text-slate-600 dark:text-slate-300">Email + WhatsApp conversations in one workspace.</p>
        </div>
        <Button variant="secondary" onClick={() => Promise.all([mutateConversations(), mutateDetail(), mutateInboxes()])}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Refresh
        </Button>
      </div>

      {flash ? (
        <TransientAlert variant={flash.kind} onDismiss={() => setFlash(null)}>
          {flash.message}
        </TransientAlert>
      ) : null}
      {listError && <Alert variant="error">{(listError as Error).message}</Alert>}
      {detailError && <Alert variant="error">{(detailError as Error).message}</Alert>}
      <section className="rounded-3xl border border-slate-200 bg-[linear-gradient(135deg,rgba(248,250,252,1),rgba(255,255,255,1))] p-5 shadow-[0_8px_22px_rgba(15,23,42,0.04)] dark:border-slate-700 dark:bg-slate-900">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-slate-400 dark:text-slate-500">Channel setup</p>
            <h2 className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">Connect your business channels</h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              Email and WhatsApp connect separately. Old threads stay visible, but only connected channels can send live replies.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className={`rounded-full border px-3 py-1 text-xs font-medium ${setupBadgeClasses(emailSetupStatus)}`}>
              Email: {emailChannelConnected ? "Connected" : emailHistoryOnly ? "History only" : "Setup needed"}
            </span>
            <span className={`rounded-full border px-3 py-1 text-xs font-medium ${setupBadgeClasses(whatsappSetupStatus)}`}>
              WhatsApp: {whatsappChannelConnected ? "Connected" : whatsappHistoryOnly ? "History only" : "Setup needed"}
            </span>
          </div>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_8px_22px_rgba(15,23,42,0.06)] dark:border-slate-700 dark:bg-slate-900 dark:shadow-[0_18px_36px_rgba(2,6,23,0.4)]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">Email channel</p>
              <h2 className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">Gmail or Outlook connect</h2>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                Connect Gmail or Microsoft 365 once, then reply from the inbox without storing mailbox passwords.
              </p>
            </div>
            <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${setupBadgeClasses(emailSetupStatus)}`}>
              {emailChannelConnected ? "Connected" : emailHistoryOnly ? "History only" : "Setup needed"}
            </span>
          </div>
          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-4 text-sm dark:border-slate-700 dark:bg-slate-950/60">
            {emailChannelConnected && emailSetup?.connection.mode === "oauth" ? (
              <>
                <p className="font-medium text-slate-900 dark:text-slate-100">
                  {emailSetup.connection.provider === "GMAIL" ? "Gmail" : "Outlook / Microsoft 365"} connected
                </p>
                <p className="mt-1 text-slate-600 dark:text-slate-300">{emailSetup.connection.emailAddress}</p>
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Provider OAuth is active with encrypted token storage.</p>
              </>
            ) : emailChannelConnected && emailSetup?.connection.mode === "smtp" ? (
              <>
                <p className="font-medium text-slate-900 dark:text-slate-100">Custom SMTP configured</p>
                <p className="mt-1 text-slate-600 dark:text-slate-300">
                  {emailSetup.connection.from} via {emailSetup.connection.host}
                </p>
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">OAuth is still recommended for Gmail and Outlook mailboxes.</p>
              </>
            ) : emailHistoryOnly ? (
              <>
                <p className="font-medium text-slate-900 dark:text-slate-100">Email history is still visible</p>
                <p className="mt-1 text-slate-600 dark:text-slate-300">
                  Previous email threads remain searchable. Reconnect the mailbox before sending new replies.
                </p>
              </>
            ) : (
              <>
                <p className="font-medium text-slate-900 dark:text-slate-100">No email mailbox connected</p>
                <p className="mt-1 text-slate-600 dark:text-slate-300">Choose Gmail or Outlook below to start the one-click connect flow.</p>
              </>
            )}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => startMailboxConnect(gmailConnectHref, gmailOauthConfigured)}
              disabled={!gmailOauthConfigured}
              className={`inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-semibold transition ${
                gmailOauthConfigured
                  ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/20 hover:bg-indigo-500"
                  : "cursor-not-allowed border border-slate-200 bg-slate-100 text-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-500"
              }`}
            >
              {emailSetup?.connection.mode === "oauth" && emailSetup.connection.provider === "GMAIL" ? "Reconnect Gmail" : "Connect Gmail"}
            </button>
            <button
              type="button"
              onClick={() => startMailboxConnect(outlookConnectHref, outlookOauthConfigured)}
              disabled={!outlookOauthConfigured}
              className={`inline-flex items-center justify-center rounded-lg border px-4 py-2 text-sm font-semibold transition ${
                outlookOauthConfigured
                  ? "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:hover:bg-slate-900"
                  : "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-500"
              }`}
            >
              {emailSetup?.connection.mode === "oauth" && emailSetup.connection.provider === "OUTLOOK"
                ? "Reconnect Outlook"
                : "Connect Outlook"}
            </button>
          </div>
          {!gmailOauthConfigured && !outlookOauthConfigured ? (
            <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
              Gmail and Outlook connect are disabled because real provider client ID and secret values are not configured yet.
            </p>
          ) : null}
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_8px_22px_rgba(15,23,42,0.06)] dark:border-slate-700 dark:bg-slate-900 dark:shadow-[0_18px_36px_rgba(2,6,23,0.4)]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">WhatsApp channel</p>
              <h2 className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">Business API setup</h2>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                Connect a WhatsApp Business number through Meta embedded signup.
              </p>
            </div>
            <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${setupBadgeClasses(whatsappSetupStatus)}`}>
              {whatsappChannelConnected ? "Connected" : whatsappHistoryOnly ? "History only" : "Setup needed"}
            </span>
          </div>
          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-4 text-sm dark:border-slate-700 dark:bg-slate-950/60">
            {whatsappChannelConnected && whatsappSetup?.connection.mode === "whatsapp_api" ? (
              <>
                <p className="font-medium text-slate-900 dark:text-slate-100">Meta Business API configured</p>
                <p className="mt-1 text-slate-600 dark:text-slate-300">
                  {whatsappSetup.connection.displayPhoneNumber || "Business number connected"} · {whatsappSetup.connection.phoneNumberId}
                </p>
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Inbound webhooks and delivery updates are active.</p>
              </>
            ) : whatsappHistoryOnly ? (
              <>
                <p className="font-medium text-slate-900 dark:text-slate-100">WhatsApp history is still visible</p>
                <p className="mt-1 text-slate-600 dark:text-slate-300">
                  Imported or prior WhatsApp conversations remain searchable. Reconnect Meta before replying to them.
                </p>
              </>
            ) : (
              <>
                <p className="font-medium text-slate-900 dark:text-slate-100">No WhatsApp Business channel connected</p>
                <p className="mt-1 text-slate-600 dark:text-slate-300">Start Meta signup below to connect a live business number.</p>
              </>
            )}
          </div>
          <div className="mt-4">
            <WhatsAppEmbeddedSignupCard
              connection={
                whatsappSetup?.connection.mode === "whatsapp_api"
                  ? whatsappSetup.connection
                  : {
                      mode: "none",
                      configured: false,
                    }
              }
              onConnected={() => mutateInboxes()}
            />
          </div>
        </section>
      </div>

      <div className="grid gap-6 xl:grid-cols-[320px_1fr_320px]">
        <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-[0_8px_22px_rgba(15,23,42,0.06)] dark:border-slate-700 dark:bg-slate-900 dark:shadow-[0_18px_36px_rgba(2,6,23,0.4)]">
          <div className="space-y-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
              <Input className="pl-9" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search conversations" />
            </div>
            <div className="grid grid-cols-4 gap-2 text-xs">
              <button
                className={`rounded-lg border px-2 py-1.5 ${status === "ALL" ? "border-indigo-300 bg-indigo-50 text-indigo-700 dark:border-indigo-400/40 dark:bg-indigo-400/10 dark:text-indigo-300" : "border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300"}`}
                onClick={() => setStatus("ALL")}
              >
                All ({ticketCounts.all})
              </button>
              <button
                className={`rounded-lg border px-2 py-1.5 ${status === "OPEN" ? "border-indigo-300 bg-indigo-50 text-indigo-700 dark:border-indigo-400/40 dark:bg-indigo-400/10 dark:text-indigo-300" : "border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300"}`}
                onClick={() => setStatus("OPEN")}
              >
                Open ({ticketCounts.open})
              </button>
              <button
                className={`rounded-lg border px-2 py-1.5 ${status === "PENDING" ? "border-indigo-300 bg-indigo-50 text-indigo-700 dark:border-indigo-400/40 dark:bg-indigo-400/10 dark:text-indigo-300" : "border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300"}`}
                onClick={() => setStatus("PENDING")}
              >
                Pending ({ticketCounts.pending})
              </button>
              <button
                className={`rounded-lg border px-2 py-1.5 ${status === "CLOSED" ? "border-indigo-300 bg-indigo-50 text-indigo-700 dark:border-indigo-400/40 dark:bg-indigo-400/10 dark:text-indigo-300" : "border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300"}`}
                onClick={() => setStatus("CLOSED")}
              >
                Closed ({ticketCounts.closed})
              </button>
            </div>
            <select
              value={assignee}
              onChange={(event) => setAssignee(event.target.value as AssigneeFilter)}
              className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            >
              <option value="all">All assignments</option>
              <option value="mine">Assigned to me</option>
              <option value="unassigned">Unassigned</option>
            </select>
          </div>

          <div className="mt-4 space-y-2">
            {listLoading && <p className="rounded-xl border border-slate-200 px-3 py-4 text-sm text-slate-500">Loading conversations...</p>}
            {!listLoading && !conversations.length && (
              <div className="rounded-xl border border-dashed border-slate-300 px-3 py-4 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                No conversations found.
              </div>
            )}
            {conversations.map((conversation) => (
              (() => {
                const conversationChannelConnected =
                  conversation.inbox.type === "EMAIL" ? emailChannelConnected : whatsappChannelConnected;
                const importedLegacy = isLegacyImportedEmail(conversation.contact.email);

                return (
                  <button
                    key={conversation.id}
                    onClick={() => setActiveId(conversation.id)}
                    className={`w-full rounded-xl border p-3 text-left transition ${
                      activeId === conversation.id
                        ? "border-indigo-300 bg-indigo-50/40 dark:border-indigo-400/40 dark:bg-indigo-400/10"
                        : "border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-950"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                          {getConversationPrimaryLabel(conversation.contact)}
                        </p>
                        <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                          {getConversationSecondaryLabel(conversation.contact)}
                        </p>
                      </div>
                      <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] ${statusPillClasses[conversation.status]}`}>
                        {statusLabel[conversation.status]}
                      </span>
                    </div>
                    <p className="mt-2 line-clamp-2 text-xs text-slate-600 dark:text-slate-300">{conversation.lastMessage?.content || "No messages yet."}</p>
                    <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <span>{conversation.inbox.type === "EMAIL" ? "Email" : "WhatsApp"}</span>
                        {!conversationChannelConnected ? (
                          <span className="rounded-full border border-sky-200 bg-sky-50 px-1.5 py-0.5 text-[10px] font-medium text-sky-700 dark:border-sky-400/30 dark:bg-sky-400/10 dark:text-sky-300">
                            History only
                          </span>
                        ) : null}
                        {importedLegacy ? (
                          <span className="rounded-full border border-slate-200 bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                            Imported
                          </span>
                        ) : null}
                      </span>
                      <span>{conversation.unreadCount > 0 ? `${conversation.unreadCount} unread` : "No unread"}</span>
                    </div>
                  </button>
                );
              })()
            ))}
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white shadow-[0_8px_22px_rgba(15,23,42,0.06)] dark:border-slate-700 dark:bg-slate-900 dark:shadow-[0_18px_36px_rgba(2,6,23,0.4)]">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 dark:border-slate-700">
            <div>
              <p className="text-base font-semibold text-slate-900 dark:text-slate-100">
                {getConversationPrimaryLabel(detail?.contact)}
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <span>{getConversationSecondaryLabel(detail?.contact)}</span>
                {detail ? (
                  <span
                    className={`rounded-full border px-2 py-0.5 ${
                      activeChannelConnected
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-300"
                        : "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-400/30 dark:bg-sky-400/10 dark:text-sky-300"
                    }`}
                  >
                    {activeChannelConnected ? `${activeChannelLabel} live` : `${activeChannelLabel} history only`}
                  </span>
                ) : null}
                {detail && isLegacyImportedEmail(detail.contact.email) ? (
                  <span className="rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                    Imported legacy thread
                  </span>
                ) : null}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={detail?.status || "OPEN"}
                onChange={(event) => handlePatchConversation({ status: event.target.value })}
                disabled={!detail || saving}
                className="h-9 rounded-full border border-slate-200 bg-white px-3 text-xs font-medium dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              >
                <option value="OPEN">Open</option>
                <option value="PENDING">Pending</option>
                <option value="CLOSED">Closed</option>
              </select>
              <select
                value={detail?.assignedUser?.id || ""}
                onChange={(event) => handlePatchConversation({ assignedUserId: event.target.value || null })}
                disabled={!detail || saving}
                className="h-9 rounded-full border border-slate-200 bg-white px-3 text-xs font-medium dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              >
                <option value="">Unassigned</option>
                {agents.map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.name || agent.email}
                  </option>
                ))}
              </select>
            </div>
          </header>

          <div className="max-h-[460px] space-y-3 overflow-y-auto bg-slate-50 px-5 py-5 dark:bg-slate-950/70">
            {detailLoading && <p className="text-sm text-slate-500">Loading thread...</p>}
            {!detailLoading && detail && !detail.messages.length && (
              <p className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
                No messages yet.
              </p>
            )}
            {detail?.messages.map((message) => (
              <div key={message.id} className={`flex ${message.direction === "OUTBOUND" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[78%] rounded-2xl px-4 py-3 text-sm shadow-sm ${
                    directionBubble[message.direction] ?? directionBubble.SYSTEM
                  }`}
                >
                  <p className="whitespace-pre-wrap">{message.content}</p>
                  {Array.isArray(message.attachments) && message.attachments.length > 0 && (
                    <div className="mt-2 space-y-1 text-xs">
                      {message.attachments.map((attachment, index) => (
                        <p key={`${message.id}-${index}`}>Attachment: {attachment.name || "file"}</p>
                      ))}
                    </div>
                  )}
                  <div className="mt-2 text-[11px] opacity-75">
                    {formatDateTimeDMY(new Date(message.createdAt))} | {message.channel} | {message.deliveryStatus.toLowerCase()}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="space-y-3 border-t border-slate-100 px-5 py-4 dark:border-slate-700">
            {activeReplyDisabledReason ? <Alert variant="warning">{activeReplyDisabledReason}</Alert> : null}
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex h-9 items-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100">
                Replying on {detail ? getChannelLabel(detail.inbox.type) : "selected channel"}
              </div>
              <select
                onChange={(event) => {
                  const id = event.target.value;
                  if (!id) return;
                  const selected = cannedReplies.find((reply) => reply.id === id);
                  if (selected) setMessageDraft(selected.content);
                  event.currentTarget.value = "";
                }}
                className="h-9 min-w-[180px] rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                defaultValue=""
              >
                <option value="">Saved replies</option>
                {cannedReplies.map((reply) => (
                  <option key={reply.id} value={reply.id}>
                    {reply.title}
                  </option>
                ))}
              </select>
              <Button variant="secondary" size="sm" onClick={applyAiReply} disabled={!detail || aiLoading}>
                <Sparkles className="mr-2 h-4 w-4" />
                {aiLoading ? "Generating..." : "AI reply"}
              </Button>
              <label
                className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs ${
                  activeReplyDisabledReason
                    ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-500"
                    : "cursor-pointer border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-950"
                }`}
              >
                <Paperclip className="h-4 w-4" />
                Attach
                <input
                  type="file"
                  multiple
                  className="hidden"
                  disabled={Boolean(activeReplyDisabledReason)}
                  onChange={(event) => handleFileAttach(event.target.files)}
                />
              </label>
            </div>

            {attachments.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {attachments.map((attachment, index) => (
                  <span key={`${attachment.name}-${index}`} className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300">
                    {attachment.name}
                  </span>
                ))}
              </div>
            )}

            <div className="flex items-end gap-3">
              <Textarea
                className="min-h-[96px] flex-1"
                value={messageDraft}
                onChange={(event) => setMessageDraft(event.target.value)}
                disabled={Boolean(activeReplyDisabledReason)}
                placeholder={activeReplyDisabledReason || "Type your reply..."}
              />
              <Button onClick={sendMessage} disabled={!detail || sending || Boolean(activeReplyDisabledReason)}>
                <Send className="mr-2 h-4 w-4" />
                {sending ? "Sending..." : "Send"}
              </Button>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-[0_8px_22px_rgba(15,23,42,0.06)] dark:border-slate-700 dark:bg-slate-900 dark:shadow-[0_18px_36px_rgba(2,6,23,0.4)]">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700 dark:bg-indigo-400/10 dark:text-indigo-300">
              <UserCircle2 className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{getConversationPrimaryLabel(detail?.contact)}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">{getConversationSecondaryLabel(detail?.contact)}</p>
            </div>
          </div>

          <div className="mt-4 space-y-3 text-sm">
            <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">Tags</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {detail?.tags?.length ? (
                  detail.tags.map((tag) => (
                    <span key={tag.id} className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200">
                      <Tag className="h-3 w-3" />
                      {tag.label}
                    </span>
                  ))
                ) : (
                  <span className="text-xs text-slate-500 dark:text-slate-400">No tags</span>
                )}
              </div>
              <div className="mt-3 flex gap-2">
                <Input value={tagDraft} onChange={(event) => setTagDraft(event.target.value)} placeholder="tag1, tag2" />
                <Button size="sm" variant="secondary" onClick={applyTags} disabled={!detail || saving}>
                  Save
                </Button>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">Recent invoices</p>
              <div className="mt-2 space-y-2 text-xs dark:text-slate-200">
                {detail && !detail.canViewBillingInsights ? (
                  <p className="text-slate-500 dark:text-slate-400">Billing insights are limited to billing roles.</p>
                ) : detail?.customerInsights?.recentInvoices?.length ? (
                  detail.customerInsights.recentInvoices.map((invoice) => (
                    <div key={invoice.id} className="flex items-center justify-between gap-2">
                      <span className="truncate">{invoice.invoiceNumber}</span>
                      <span>{invoice.currency} {invoice.total}</span>
                    </div>
                  ))
                ) : (
                  <p className="text-slate-500 dark:text-slate-400">No invoices yet.</p>
                )}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">Recent payments</p>
              <div className="mt-2 space-y-2 text-xs dark:text-slate-200">
                {detail && !detail.canViewBillingInsights ? (
                  <p className="text-slate-500 dark:text-slate-400">Payment history is limited to billing roles.</p>
                ) : detail?.customerInsights?.recentPayments?.length ? (
                  detail.customerInsights.recentPayments.map((payment) => (
                    <div key={payment.id} className="flex items-center justify-between gap-2">
                      <span className="truncate">{payment.reference}</span>
                      <span>{payment.currency} {payment.amount}</span>
                    </div>
                  ))
                ) : (
                  <p className="text-slate-500 dark:text-slate-400">No payments yet.</p>
                )}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">Internal notes</p>
              <div className="mt-2 max-h-32 space-y-2 overflow-y-auto text-xs">
                {detail?.notes?.length ? (
                  detail.notes.map((note) => (
                    <div key={note.id} className="rounded-lg bg-slate-50 px-2 py-2 dark:bg-slate-950">
                      <p className="font-medium text-slate-700 dark:text-slate-200">{note.author.name || note.author.email}</p>
                      <p className="mt-1 text-slate-600 dark:text-slate-300">{note.content}</p>
                    </div>
                  ))
                ) : (
                  <p className="text-slate-500 dark:text-slate-400">No notes yet.</p>
                )}
              </div>
              <Textarea
                className="mt-3 min-h-[84px]"
                value={noteDraft}
                onChange={(event) => setNoteDraft(event.target.value)}
                placeholder="Add private note..."
              />
              <Button className="mt-2 w-full" variant="secondary" onClick={addNote} disabled={!detail}>
                <Inbox className="mr-2 h-4 w-4" />
                Save note
              </Button>
            </div>

            <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">Quick actions</p>
              <div className="mt-2 grid gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={!detail?.canViewBillingInsights || !detail?.customerInsights?.recentInvoices?.length}
                  onClick={() => {
                    const invoice = detail?.customerInsights?.recentInvoices?.[0];
                    if (!invoice) return;
                    setMessageDraft((prev) =>
                      `${prev ? `${prev}\n\n` : ""}Invoice ${invoice.invoiceNumber} is ready. Please review and complete payment.`
                    );
                  }}
                >
                  Send invoice link
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={!detail?.canViewBillingInsights || !detail?.contact?.id}
                  onClick={() => router.push(`/dashboard/invoices?customerId=${detail?.contact?.id}`)}
                >
                  Create invoice
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setNoteDraft("Follow up in 24 hours.")}>
                  Add follow-up note
                </Button>
              </div>
            </div>

            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-300">
              {!detail?.canViewBillingInsights
                ? "Billing follow-up insights are limited to billing roles."
                : detail?.customerInsights?.overdueInvoices?.length
                  ? `${detail.customerInsights.overdueInvoices.length} overdue invoice(s) need follow-up.`
                  : "No overdue invoices for this customer."}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
