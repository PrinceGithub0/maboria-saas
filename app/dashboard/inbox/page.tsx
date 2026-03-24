"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import useSWR from "swr";
import {
  AlertCircle,
  CheckCheck,
  Clock3,
  Inbox,
  Mail,
  MessageSquareMore,
  Paperclip,
  RefreshCw,
  Search,
  Send,
  Sparkles,
  Tag,
  UserCircle2,
} from "lucide-react";
import { WhatsAppEmbeddedSignupCard } from "@/components/inbox/whatsapp-embedded-signup-card";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { TransientAlert } from "@/components/ui/transient-alert";
import { formatDateTimeDMY } from "@/lib/date";

type ConversationStatus = "OPEN" | "WAITING_ON_CUSTOMER" | "SNOOZED" | "RESOLVED";
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
  snoozedUntil: string | null;
  waitingSince: string | null;
  lastInboundAt: string | null;
  lastOutboundAt: string | null;
  resolvedAt: string | null;
  lastMessage: { id: string; direction: string; content: string; createdAt: string; deliveryStatus: string } | null;
};

type ConversationListPayload = { items: ConversationListItem[] };

type ConversationDetail = {
  id: string;
  status: ConversationStatus;
  unreadCount: number;
  snoozedUntil: string | null;
  waitingSince: string | null;
  lastInboundAt: string | null;
  lastOutboundAt: string | null;
  lastCustomerReplyAt: string | null;
  resolvedAt: string | null;
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
  OPEN: "Needs reply",
  WAITING_ON_CUSTOMER: "Waiting",
  SNOOZED: "Snoozed",
  RESOLVED: "Resolved",
};

const statusPillClasses: Record<ConversationStatus, string> = {
  OPEN: "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-400/30 dark:bg-rose-400/10 dark:text-rose-300",
  WAITING_ON_CUSTOMER: "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-400/30 dark:bg-sky-400/10 dark:text-sky-300",
  SNOOZED: "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-400/30 dark:bg-violet-400/10 dark:text-violet-300",
  RESOLVED: "border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200",
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

function getConversationInitials(contact: ConversationListItem["contact"] | ConversationDetail["contact"] | undefined) {
  const label = getConversationPrimaryLabel(contact).trim();
  if (!label) return "CU";
  const parts = label.split(/\s+/).filter(Boolean);
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("") || label.slice(0, 2).toUpperCase();
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

function getConversationStatusDetail(input: {
  status: ConversationStatus;
  snoozedUntil?: string | null;
  waitingSince?: string | null;
  resolvedAt?: string | null;
}) {
  if (input.status === "SNOOZED" && input.snoozedUntil) {
    return `Until ${formatDateTimeDMY(new Date(input.snoozedUntil))}`;
  }
  if (input.status === "WAITING_ON_CUSTOMER" && input.waitingSince) {
    return `Waiting since ${formatDateTimeDMY(new Date(input.waitingSince))}`;
  }
  if (input.status === "RESOLVED" && input.resolvedAt) {
    return `Resolved ${formatDateTimeDMY(new Date(input.resolvedAt))}`;
  }
  return null;
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
      waiting: conversations.filter((item) => item.status === "WAITING_ON_CUSTOMER").length,
      snoozed: conversations.filter((item) => item.status === "SNOOZED").length,
      resolved: conversations.filter((item) => item.status === "RESOLVED").length,
    }),
    [conversations]
  );

  const inboxStats = useMemo(
    () => [
      {
        label: "Needs reply",
        value: ticketCounts.open,
        tone: "text-rose-300",
        icon: AlertCircle,
      },
      {
        label: "Waiting",
        value: ticketCounts.waiting,
        tone: "text-sky-300",
        icon: Clock3,
      },
      {
        label: "Resolved",
        value: ticketCounts.resolved,
        tone: "text-emerald-300",
        icon: CheckCheck,
      },
      {
        label: "Live channels",
        value: `${Number(emailChannelConnected) + Number(whatsappChannelConnected)}/2`,
        tone: "text-violet-300",
        icon: MessageSquareMore,
      },
    ],
    [emailChannelConnected, ticketCounts.open, ticketCounts.resolved, ticketCounts.waiting, whatsappChannelConnected]
  );

  return (
    <div className="space-y-6">
      {flash ? (
        <TransientAlert variant={flash.kind} onDismiss={() => setFlash(null)}>
          {flash.message}
        </TransientAlert>
      ) : null}
      {listError && <Alert variant="error">{(listError as Error).message}</Alert>}
      {detailError && <Alert variant="error">{(detailError as Error).message}</Alert>}

      <section className="overflow-hidden rounded-[32px] border border-slate-200 bg-[radial-gradient(circle_at_top_left,rgba(99,102,241,0.16),transparent_34%),linear-gradient(135deg,#081124_0%,#0f172a_46%,#111827_100%)] text-white shadow-[0_24px_70px_rgba(15,23,42,0.24)] dark:border-slate-700 dark:bg-[radial-gradient(circle_at_top_left,rgba(129,140,248,0.18),transparent_36%),linear-gradient(135deg,#020617_0%,#0b1120_50%,#111827_100%)]">
        <div className="grid gap-6 p-6 xl:grid-cols-[1.25fr_0.95fr] xl:p-7">
          <div className="space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="max-w-2xl">
                <p className="text-[11px] uppercase tracking-[0.32em] text-slate-300">Unified inbox</p>
                <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-[2.2rem]">Customer conversations, built for follow-through.</h1>
                <p className="mt-3 max-w-xl text-sm leading-6 text-slate-300">
                  Keep email and WhatsApp in one lane, know what needs action now, and reply with billing context without leaving the thread.
                </p>
              </div>
              <Button
                variant="secondary"
                className="border-white/15 bg-white/10 text-white backdrop-blur hover:bg-white/16"
                onClick={() => Promise.all([mutateConversations(), mutateDetail(), mutateInboxes()])}
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                Refresh
              </Button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {inboxStats.map((stat) => (
                <div key={stat.label} className="rounded-2xl border border-white/10 bg-white/6 p-4 backdrop-blur">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[11px] uppercase tracking-[0.24em] text-slate-300">{stat.label}</p>
                    <stat.icon className={`h-4 w-4 ${stat.tone}`} />
                  </div>
                  <p className="mt-3 text-3xl font-semibold text-white">{stat.value}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[28px] border border-white/10 bg-white/6 p-5 backdrop-blur">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-[0.24em] text-slate-300">Channel control</p>
                <h2 className="mt-2 text-lg font-semibold text-white">Keep the live channels tight</h2>
              </div>
              <div className="rounded-full border border-white/10 bg-white/8 px-3 py-1 text-xs text-slate-200">
                {Number(emailChannelConnected) + Number(whatsappChannelConnected) === 2 ? "All live" : "Needs setup"}
              </div>
            </div>

            <div className="mt-5 space-y-3">
              <div className="rounded-2xl border border-white/10 bg-black/10 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/10 text-white">
                      <Mail className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-white">Email</p>
                      <p className="mt-1 text-xs leading-5 text-slate-300">
                        {emailChannelConnected && emailSetup?.connection.mode === "oauth"
                          ? `${emailSetup.connection.provider === "GMAIL" ? "Gmail" : "Outlook"} connected as ${emailSetup.connection.emailAddress}`
                          : emailChannelConnected && emailSetup?.connection.mode === "smtp"
                            ? `${emailSetup.connection.from} via ${emailSetup.connection.host}`
                            : emailHistoryOnly
                              ? "History stays visible, but replies are paused until reconnect."
                              : "Connect Gmail or Outlook to send live replies from the inbox."}
                      </p>
                    </div>
                  </div>
                  <span className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${setupBadgeClasses(emailSetupStatus)}`}>
                    {emailChannelConnected ? "Connected" : emailHistoryOnly ? "History only" : "Setup needed"}
                  </span>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => startMailboxConnect(gmailConnectHref, gmailOauthConfigured)}
                    disabled={!gmailOauthConfigured}
                    className={`inline-flex items-center justify-center rounded-full px-4 py-2 text-xs font-semibold transition ${
                      gmailOauthConfigured
                        ? "bg-white text-slate-950 hover:bg-slate-200"
                        : "cursor-not-allowed border border-white/10 bg-white/5 text-slate-500"
                    }`}
                  >
                    {emailSetup?.connection.mode === "oauth" && emailSetup.connection.provider === "GMAIL" ? "Reconnect Gmail" : "Connect Gmail"}
                  </button>
                  <button
                    type="button"
                    onClick={() => startMailboxConnect(outlookConnectHref, outlookOauthConfigured)}
                    disabled={!outlookOauthConfigured}
                    className={`inline-flex items-center justify-center rounded-full border px-4 py-2 text-xs font-semibold transition ${
                      outlookOauthConfigured
                        ? "border-white/15 bg-white/6 text-white hover:bg-white/10"
                        : "cursor-not-allowed border-white/10 bg-white/5 text-slate-500"
                    }`}
                  >
                    {emailSetup?.connection.mode === "oauth" && emailSetup.connection.provider === "OUTLOOK"
                      ? "Reconnect Outlook"
                      : "Connect Outlook"}
                  </button>
                </div>
                {!gmailOauthConfigured && !outlookOauthConfigured ? (
                  <p className="mt-3 text-[11px] text-slate-400">Provider OAuth is not configured on this deployment yet.</p>
                ) : null}
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/10 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#1d9b5f]/20 text-[#9bf0c6]">
                      <MessageSquareMore className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-white">WhatsApp</p>
                      <p className="mt-1 text-xs leading-5 text-slate-300">
                        {whatsappChannelConnected && whatsappSetup?.connection.mode === "whatsapp_api"
                          ? `${whatsappSetup.connection.displayPhoneNumber || "Business number connected"} - inbound and delivery updates are live.`
                          : whatsappHistoryOnly
                            ? "History stays searchable, but reconnect Meta before replying."
                            : "Use Meta embedded signup to bring a live business number into the inbox."}
                      </p>
                    </div>
                  </div>
                  <span className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${setupBadgeClasses(whatsappSetupStatus)}`}>
                    {whatsappChannelConnected ? "Connected" : whatsappHistoryOnly ? "History only" : "Setup needed"}
                  </span>
                </div>
                <div className="mt-4 rounded-2xl border border-white/10 bg-black/10 p-3">
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
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[320px_1fr_320px]">
        <section className="rounded-[28px] border border-slate-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(248,250,252,0.92))] p-4 shadow-[0_18px_40px_rgba(15,23,42,0.08)] dark:border-slate-700 dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.92),rgba(2,6,23,0.98))] dark:shadow-[0_18px_40px_rgba(2,6,23,0.42)]">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-[0.24em] text-slate-400 dark:text-slate-500">Queue</p>
                <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">Live conversation feed</p>
              </div>
              <div className="rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-xs font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-300">
                {ticketCounts.all} total
              </div>
            </div>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
              <Input
                className="rounded-2xl border-slate-200/80 bg-white/90 pl-9 dark:border-slate-700 dark:bg-slate-950/70"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search conversations"
              />
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3 xl:grid-cols-5">
              <button
                className={`rounded-full border px-2.5 py-2 ${status === "ALL" ? "border-indigo-300 bg-indigo-50 text-indigo-700 shadow-sm dark:border-indigo-400/40 dark:bg-indigo-400/10 dark:text-indigo-300" : "border-slate-200 bg-white/80 text-slate-600 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-300"}`}
                onClick={() => setStatus("ALL")}
              >
                All ({ticketCounts.all})
              </button>
              <button
                className={`rounded-full border px-2.5 py-2 ${status === "OPEN" ? "border-indigo-300 bg-indigo-50 text-indigo-700 shadow-sm dark:border-indigo-400/40 dark:bg-indigo-400/10 dark:text-indigo-300" : "border-slate-200 bg-white/80 text-slate-600 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-300"}`}
                onClick={() => setStatus("OPEN")}
              >
                Needs reply ({ticketCounts.open})
              </button>
              <button
                className={`rounded-full border px-2.5 py-2 ${status === "WAITING_ON_CUSTOMER" ? "border-indigo-300 bg-indigo-50 text-indigo-700 shadow-sm dark:border-indigo-400/40 dark:bg-indigo-400/10 dark:text-indigo-300" : "border-slate-200 bg-white/80 text-slate-600 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-300"}`}
                onClick={() => setStatus("WAITING_ON_CUSTOMER")}
              >
                Waiting ({ticketCounts.waiting})
              </button>
              <button
                className={`rounded-full border px-2.5 py-2 ${status === "SNOOZED" ? "border-indigo-300 bg-indigo-50 text-indigo-700 shadow-sm dark:border-indigo-400/40 dark:bg-indigo-400/10 dark:text-indigo-300" : "border-slate-200 bg-white/80 text-slate-600 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-300"}`}
                onClick={() => setStatus("SNOOZED")}
              >
                Snoozed ({ticketCounts.snoozed})
              </button>
              <button
                className={`rounded-full border px-2.5 py-2 ${status === "RESOLVED" ? "border-indigo-300 bg-indigo-50 text-indigo-700 shadow-sm dark:border-indigo-400/40 dark:bg-indigo-400/10 dark:text-indigo-300" : "border-slate-200 bg-white/80 text-slate-600 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-300"}`}
                onClick={() => setStatus("RESOLVED")}
              >
                Resolved ({ticketCounts.resolved})
              </button>
            </div>
            <select
              value={assignee}
              onChange={(event) => setAssignee(event.target.value as AssigneeFilter)}
            className="h-10 w-full rounded-2xl border border-slate-200 bg-white/90 px-3 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-950/70 dark:text-slate-100"
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
                    className={`w-full rounded-2xl border p-3 text-left transition ${
                      activeId === conversation.id
                        ? "border-indigo-300 bg-[linear-gradient(180deg,rgba(238,242,255,0.92),rgba(224,231,255,0.66))] shadow-[0_16px_28px_rgba(99,102,241,0.14)] dark:border-indigo-400/40 dark:bg-[linear-gradient(180deg,rgba(99,102,241,0.18),rgba(30,41,59,0.2))]"
                        : "border-slate-200 bg-white/80 hover:border-slate-300 hover:bg-white dark:border-slate-700 dark:bg-slate-950/45 dark:hover:bg-slate-950"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-900 text-xs font-semibold tracking-[0.16em] text-white dark:bg-slate-100 dark:text-slate-950">
                        {getConversationInitials(conversation.contact)}
                      </div>
                      <div className="min-w-0 flex-1">
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
                        <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-600 dark:text-slate-300">
                          {conversation.lastMessage?.content || "No messages yet."}
                        </p>
                        <div className="mt-3 flex items-center justify-between gap-3 text-[11px] text-slate-500 dark:text-slate-400">
                          <span className="flex flex-wrap items-center gap-1.5">
                            <span className="rounded-full border border-slate-200 bg-white/80 px-2 py-0.5 dark:border-slate-700 dark:bg-slate-900/80">
                              {conversation.inbox.type === "EMAIL" ? "Email" : "WhatsApp"}
                            </span>
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
                          <span className="font-medium text-slate-700 dark:text-slate-300">
                            {conversation.unreadCount > 0 ? `${conversation.unreadCount} unread` : "Seen"}
                          </span>
                        </div>
                        {getConversationStatusDetail(conversation) ? (
                          <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">{getConversationStatusDetail(conversation)}</p>
                        ) : null}
                        {conversation.assignedUser ? (
                          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                            Owner: {conversation.assignedUser.name || conversation.assignedUser.email}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </button>
                );
              })()
            ))}
          </div>
        </section>

        <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.92))] shadow-[0_20px_44px_rgba(15,23,42,0.08)] dark:border-slate-700 dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.92),rgba(2,6,23,0.98))] dark:shadow-[0_20px_44px_rgba(2,6,23,0.45)]">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-white/70 px-5 py-4 backdrop-blur dark:border-slate-700 dark:bg-slate-900/50">
            <div>
              <p className="text-[11px] uppercase tracking-[0.24em] text-slate-400 dark:text-slate-500">Active thread</p>
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
                {detail ? (
                  <span className={`rounded-full border px-2 py-0.5 ${statusPillClasses[detail.status]}`}>{statusLabel[detail.status]}</span>
                ) : null}
                {detail && getConversationStatusDetail(detail) ? <span>{getConversationStatusDetail(detail)}</span> : null}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={detail?.status || "OPEN"}
                onChange={(event) =>
                  handlePatchConversation(
                    event.target.value === "SNOOZED"
                      ? { status: "SNOOZED", snoozedUntil: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() }
                      : { status: event.target.value }
                  )
                }
                disabled={!detail || saving}
                className="h-9 rounded-full border border-slate-200 bg-white px-3 text-xs font-medium dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              >
                <option value="OPEN">Needs reply</option>
                <option value="WAITING_ON_CUSTOMER">Waiting on customer</option>
                <option value="SNOOZED">Snoozed</option>
                <option value="RESOLVED">Resolved</option>
              </select>
              <Button
                variant="secondary"
                size="sm"
                disabled={!detail || saving}
                onClick={() =>
                  handlePatchConversation(
                    detail?.status === "SNOOZED"
                      ? { status: "OPEN" }
                      : { status: "SNOOZED", snoozedUntil: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() }
                  )
                }
              >
                {detail?.status === "SNOOZED" ? "Resume" : "Snooze 1 day"}
              </Button>
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

          <div className="max-h-[460px] space-y-3 overflow-y-auto bg-[linear-gradient(180deg,rgba(248,250,252,0.9),rgba(241,245,249,0.78))] px-5 py-5 dark:bg-[linear-gradient(180deg,rgba(2,6,23,0.72),rgba(15,23,42,0.86))]">
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

          <div className="space-y-3 border-t border-slate-100 bg-white/70 px-5 py-4 backdrop-blur dark:border-slate-700 dark:bg-slate-900/55">
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

        <section className="rounded-[28px] border border-slate-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.94))] p-4 shadow-[0_18px_40px_rgba(15,23,42,0.08)] dark:border-slate-700 dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.94),rgba(2,6,23,0.98))] dark:shadow-[0_18px_40px_rgba(2,6,23,0.44)]">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-700 dark:bg-indigo-400/10 dark:text-indigo-300">
              <UserCircle2 className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-[0.22em] text-slate-400 dark:text-slate-500">Customer context</p>
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
