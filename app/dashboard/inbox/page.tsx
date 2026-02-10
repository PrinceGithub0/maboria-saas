
"use client";

import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import {
  CheckCircle2,
  MoreHorizontal,
  Paperclip,
  RefreshCw,
  Search,
  Send,
  Sparkles,
  UserPlus,
  X,
} from "lucide-react";
import { useLanguage } from "@/components/providers/language-provider";
import { formatDateTimeDMY } from "@/lib/date";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type Conversation = {
  id: string;
  customerPhone: string;
  customerName?: string | null;
  status: "OPEN" | "PENDING" | "DONE";
  assignedTo?: { id: string; name: string; email: string } | null;
  tags?: string[];
  internalNotes?: string | null;
  lastMessageAt?: string | null;
  lastReadAt?: string | null;
  lastCustomerActivityAt?: string | null;
  channel: string;
  lastMessage?: { content?: string | null };
  isTyping?: boolean | null;
  typingAt?: string | null;
};

type Message = {
  id: string;
  direction: "INBOUND" | "OUTBOUND";
  content: string;
  status: string;
  createdAt: string;
  attachments?: Array<{ name: string; type: string; size?: number; dataUrl?: string }> | null;
};

type Agent = { id: string; name: string; email: string };

type CannedReply = { id: string; title: string; content: string };

type UsageSummary = {
  plan: string;
  ai: { used: number; limit: number | null };
  whatsapp: { used: number; limit: number | null };
  savedReplies: { used: number; limit: number | null };
};

type ConversationNote = {
  id: string;
  content: string;
  createdAt: string;
  author?: { id: string; name: string | null; email: string };
};

type InboxStatus = { connected: boolean };

type InboxSettings = { autoCloseEnabled: boolean; autoCloseAfterHours: number };

type PendingMessage = {
  id: string;
  content: string;
  createdAt: string;
  status: "SENDING";
};

type SessionData = {
  user?: { id: string; name?: string | null; email?: string | null };
};

const statusOrder: Conversation["status"][] = ["OPEN", "PENDING", "DONE"];
const statusLabel: Record<Conversation["status"], string> = {
  OPEN: "Open",
  PENDING: "Pending",
  DONE: "Done",
};

const statusClasses: Record<Conversation["status"], string> = {
  OPEN: "bg-emerald-50 text-emerald-700 border-emerald-100",
  PENDING: "bg-amber-50 text-amber-700 border-amber-100",
  DONE: "bg-slate-100 text-slate-600 border-slate-200",
};

const deliveryLabel = (status?: string) => {
  if (!status) return "Sent";
  const key = status.toUpperCase();
  if (key === "READ") return "Read";
  if (key === "DELIVERED") return "Delivered";
  if (key === "FAILED") return "Failed";
  return "Sent";
};

const hashColor = (value: string) => {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) hash = value.charCodeAt(i) + ((hash << 5) - hash);
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue} 70% 92%)`;
};

const hashTextColor = (value: string) => {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) hash = value.charCodeAt(i) + ((hash << 5) - hash);
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue} 28% 28%)`;
};

const renderMentions = (text: string) => {
  const parts = text.split(/(@[\w.-]+)/g);
  return parts.map((part, idx) => {
    if (part.startsWith("@")) {
      return (
        <span key={`m-${idx}`} className="font-semibold text-indigo-600">
          {part}
        </span>
      );
    }
    return <span key={`t-${idx}`}>{part}</span>;
  });
};

export default function InboxPage() {
  const { language } = useLanguage();
  const t = (en: string, fr: string) => (language === "fr" ? fr : en);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<Conversation["status"] | "ALL">("ALL");
  const [filterAssigned, setFilterAssigned] = useState<"ALL" | "MINE" | "UNASSIGNED">("ALL");
  const [filterAgentId, setFilterAgentId] = useState<string>("ALL");
  const [draft, setDraft] = useState("");
  const [noteDraft, setNoteDraft] = useState("");
  const [status, setStatus] = useState<{ message: string; variant: "success" | "error" | "warning" | "info" } | null>(null);
  const [sending, setSending] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [attachments, setAttachments] = useState<Array<{ name: string; type: string; size?: number; dataUrl?: string }>>([]);
  const [aiDrafting, setAiDrafting] = useState(false);
  const [showReplies, setShowReplies] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showQuickInsert, setShowQuickInsert] = useState(false);
  const [pendingMessages, setPendingMessages] = useState<PendingMessage[]>([]);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [autoCloseEnabled, setAutoCloseEnabled] = useState(true);
  const [autoCloseAfterHours, setAutoCloseAfterHours] = useState(48);
  const [showMentions, setShowMentions] = useState(false);

  const { data: conversations, error, mutate } = useSWR<Conversation[]>(
    "/api/whatsapp/conversations",
    fetcher,
    {
      fallbackData: [],
      shouldRetryOnError: false,
    }
  );

  const {
    data: thread,
    error: threadError,
    isLoading: threadLoading,
    mutate: mutateThread,
  } = useSWR(activeId ? `/api/whatsapp/conversations/${activeId}` : null, fetcher, {
    shouldRetryOnError: false,
  });

  const { data: notes, mutate: mutateNotes } = useSWR<ConversationNote[]>(
    activeId ? `/api/whatsapp/conversations/${activeId}/notes` : null,
    fetcher,
    { shouldRetryOnError: false }
  );

  const { data: agents } = useSWR<Agent[]>("/api/whatsapp/agents", fetcher, {
    fallbackData: [],
    shouldRetryOnError: false,
  });

  const { data: cannedReplies, mutate: mutateReplies } = useSWR<CannedReply[]>("/api/whatsapp/canned-replies", fetcher, {
    fallbackData: [],
    shouldRetryOnError: false,
  });

  const { data: usage } = useSWR<UsageSummary>("/api/whatsapp/usage", fetcher, {
    shouldRetryOnError: false,
  });

  const { data: inboxStatus } = useSWR<InboxStatus>("/api/whatsapp/status", fetcher, {
    shouldRetryOnError: false,
  });

  const { data: inboxSettings } = useSWR<InboxSettings>("/api/whatsapp/settings", fetcher, {
    shouldRetryOnError: false,
  });

  const { data: session } = useSWR<SessionData>("/api/auth/session", fetcher, {
    shouldRetryOnError: false,
  });

  useEffect(() => {
    if (!activeId && Array.isArray(conversations) && conversations.length > 0) {
      setActiveId(conversations[0].id);
    }
  }, [activeId, conversations]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        const el = document.getElementById("inbox-search");
        if (el instanceof HTMLInputElement) el.focus();
      }
      if ((event.metaKey || event.ctrlKey) && event.key === "/") {
        event.preventDefault();
        setShowShortcuts(true);
      }
      if (event.key === "Escape") {
        setShowShortcuts(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    if (!inboxSettings) return;
    setAutoCloseEnabled(Boolean(inboxSettings.autoCloseEnabled));
    setAutoCloseAfterHours(inboxSettings.autoCloseAfterHours ?? 48);
  }, [inboxSettings]);

  useEffect(() => {
    const match = noteDraft.match(/@([\w.-]{0,20})$/);
    setShowMentions(Boolean(match));
  }, [noteDraft]);

  const filtered = useMemo(() => {
    if (!Array.isArray(conversations)) return [];
    const q = query.trim().toLowerCase();
    let list = conversations;
    if (filterStatus !== "ALL") list = list.filter((c) => c.status === filterStatus);
    if (filterAssigned === "MINE" && session?.user?.id) {
      list = list.filter((c) => c.assignedTo?.id === session.user?.id);
    }
    if (filterAssigned === "UNASSIGNED") list = list.filter((c) => !c.assignedTo);
    if (filterAgentId !== "ALL") list = list.filter((c) => c.assignedTo?.id === filterAgentId);
    if (!q) return list;
    return list.filter((conv) => {
      const phone = conv.customerPhone.toLowerCase();
      const name = conv.customerName?.toLowerCase() || "";
      const last = conv.lastMessage?.content?.toLowerCase() || "";
      return phone.includes(q) || last.includes(q) || name.includes(q);
    });
  }, [conversations, query, filterStatus, filterAssigned, filterAgentId, session?.user?.id]);

  const messages = useMemo<Message[]>(() => {
    return Array.isArray(thread?.messages) ? thread.messages : [];
  }, [thread?.messages]);
  const selected = filtered.find((c) => c.id === activeId) || (Array.isArray(conversations) ? conversations.find((c) => c.id === activeId) : undefined);

  const formatTime = (value?: string | null) => {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return formatDateTimeDMY(date);
  };

  const isTyping = selected?.isTyping && selected?.typingAt && Date.now() - new Date(selected.typingAt).getTime() < 30000;

  const updateConversation = async (payload: Record<string, any>) => {
    if (!activeId) return;
    const res = await fetch(`/api/whatsapp/conversations/${activeId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      await mutate();
      await mutateThread();
    }
  };

  const markRead = async () => {
    if (!activeId) return;
    await fetch(`/api/whatsapp/conversations/${activeId}/read`, { method: "POST" });
    mutate();
  };

  const sendReply = async () => {
    if (!activeId) return;
    const message = draft.trim();
    if (!message) return;
    setSending(true);
    setStatus(null);
    const tempId = `temp-${Date.now()}`;
    setPendingMessages((prev) => [...prev, { id: tempId, content: message, createdAt: new Date().toISOString(), status: "SENDING" }]);
    try {
      const res = await fetch(`/api/whatsapp/conversations/${activeId}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, attachments }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus({ message: data?.error || t("Failed to send message.", "Echec de l envoi du message."), variant: "error" });
      } else if (data?.skipped) {
        setStatus({ message: t("WhatsApp sending is disabled.", "Envoi WhatsApp desactive."), variant: "warning" });
      } else {
        setStatus({ message: t("Message sent.", "Message envoye."), variant: "success" });
        setDraft("");
        setAttachments([]);
        await mutateThread();
        await mutate();
      }
    } catch (err: any) {
      setStatus({ message: err?.message || t("Failed to send message.", "Echec de l envoi du message."), variant: "error" });
    } finally {
      setPendingMessages((prev) => prev.filter((msg) => msg.id !== tempId));
      setSending(false);
    }
  };

  const retryMessage = async (messageId: string) => {
    if (!activeId) return;
    setStatus(null);
    const res = await fetch(`/api/whatsapp/messages/${messageId}/retry`, { method: "POST" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setStatus({ message: data?.error || "Retry failed", variant: "error" });
      return;
    }
    setStatus({ message: "Message resent.", variant: "success" });
    await mutateThread();
  };

  const seedTestMessage = async () => {
    setSeeding(true);
    setStatus(null);
    try {
      const res = await fetch("/api/whatsapp/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: t("Test message from WhatsApp customer.", "Message test d'un client WhatsApp."),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatus({ message: data?.error || t("Unable to seed test message.", "Impossible de creer un message test."), variant: "error" });
        return;
      }
      if (data?.conversationId) {
        setActiveId(data.conversationId);
      }
      await mutate();
      await mutateThread();
      setStatus({ message: t("Test message added.", "Message test ajoute."), variant: "success" });
    } finally {
      setSeeding(false);
    }
  };

  const handleAttachment = async (files: FileList | null) => {
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

  const handleSaveReply = async (title: string, content: string) => {
    const res = await fetch("/api/whatsapp/canned-replies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, content }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setStatus({ message: data?.error || t("Unable to save reply.", "Impossible d'enregistrer la reponse."), variant: "error" });
      return;
    }
    await mutateReplies();
    setStatus({ message: t("Saved reply added.", "Reponse enregistree."), variant: "success" });
  };

  const handleNoteAdd = async () => {
    if (!activeId || !noteDraft.trim()) return;
    const res = await fetch(`/api/whatsapp/conversations/${activeId}/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: noteDraft.trim() }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setStatus({ message: data?.error || "Unable to add note", variant: "error" });
      return;
    }
    setNoteDraft("");
    await mutateNotes();
  };

  const aiUsage = usage?.ai ?? { used: 0, limit: null };
  const replyUsage = usage?.savedReplies ?? { used: 0, limit: null };
  const aiLimitReached = aiUsage.limit !== null && aiUsage.used >= (aiUsage.limit ?? 0);
  const replyLimitReached = replyUsage.limit !== null && replyUsage.used >= (replyUsage.limit ?? 0);

  const renderUsageBar = (label: string, used: number, limit: number | null) => {
    const pct = limit ? Math.min(100, Math.round((used / limit) * 100)) : 0;
    return (
      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>{label}</span>
          <span>{limit ? `${used}/${limit}` : `${used}`}</span>
        </div>
        <div className="h-1.5 rounded-full bg-slate-100">
          <div className="h-1.5 rounded-full bg-indigo-500" style={{ width: limit ? `${pct}%` : "40%" }} />
        </div>
      </div>
    );
  };

  const combinedMessages = useMemo(() => {
    const pending = pendingMessages.map((msg) => ({
      id: msg.id,
      direction: "OUTBOUND" as const,
      content: msg.content,
      status: msg.status,
      createdAt: msg.createdAt,
    }));
    return [...messages, ...pending].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }, [messages, pendingMessages]);

  const groupedMessages = combinedMessages.map((msg, index) => {
    const prev = combinedMessages[index - 1];
    const sameDirection = prev && prev.direction === msg.direction;
    const gap = prev ? Math.abs(new Date(msg.createdAt).getTime() - new Date(prev.createdAt).getTime()) : Infinity;
    const grouped = sameDirection && gap < 3 * 60 * 1000;
    return { ...msg, grouped };
  });

  const mentionMatch = noteDraft.match(/@([\w.-]{0,20})$/);
  const mentionQuery = mentionMatch?.[1]?.toLowerCase() || "";
  const mentionCandidates = useMemo(() => {
    if (!mentionMatch) return [];
    return (agents || []).filter((agent) => {
      const name = agent.name?.toLowerCase() || "";
      const email = agent.email.toLowerCase();
      return name.includes(mentionQuery) || email.includes(mentionQuery);
    });
  }, [agents, mentionMatch, mentionQuery]);

  const applyMention = (value: string) => {
    setNoteDraft((prev) => prev.replace(/@[\w.-]{0,20}$/, `@${value} `));
    setShowMentions(false);
  };

  const saveSettings = async () => {
    setSettingsSaving(true);
    try {
      await fetch("/api/whatsapp/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          autoCloseEnabled,
          autoCloseAfterHours,
        }),
      });
    } finally {
      setSettingsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.28em] text-slate-400">Inbox</p>
          <h1 className="text-3xl font-semibold text-slate-900">Conversations</h1>
          <p className="text-sm text-slate-500">
            WhatsApp-first inbox for customer conversations, payments, and follow-ups.
          </p>
          <p className="text-xs text-slate-400">Assign, respond, and keep every thread accountable.</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center rounded-full border border-emerald-700 bg-emerald-700 px-3 py-1 text-xs font-semibold text-white">
            WhatsApp connected
          </span>
          <Button variant="secondary" size="sm" onClick={() => mutate()}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        </div>
      </div>

      {!inboxStatus?.connected && (
        <Alert variant="warning">WhatsApp connection is offline. Messages will queue until it reconnects.</Alert>
      )}

      {(error || threadError) && (
        <Alert variant="error">{t("We could not load WhatsApp conversations.", "Impossible de charger les conversations.")}</Alert>
      )}

      {status && <Alert variant={status.variant}>{status.message}</Alert>}

      <div className="grid gap-6 lg:grid-cols-[320px_1fr_320px]">
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_12px_30px_rgba(15,23,42,0.05)]">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.32em] text-slate-400">Conversations</p>
              <p className="text-sm text-slate-500">Inbox focused on WhatsApp messaging.</p>
            </div>
            <Button variant="ghost" size="sm" onClick={seedTestMessage} disabled={seeding}>
              {seeding ? "Creating" : "Create test message"}
            </Button>
          </div>

          <div className="mt-4 space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                id="inbox-search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("Search by phone or message", "Rechercher par telephone ou message")}
                className="pl-9"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {(["ALL", ...statusOrder] as Array<Conversation["status"] | "ALL">).map((item) => (
                <button
                  key={item}
                  onClick={() => setFilterStatus(item)}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                    filterStatus === item ? "border-indigo-500 text-indigo-700" : "border-slate-200 text-slate-500"
                  }`}
                >
                  {item === "ALL" ? "All" : statusLabel[item]}
                </button>
              ))}
              <button
                onClick={() => setFilterAssigned(filterAssigned === "MINE" ? "ALL" : "MINE")}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                  filterAssigned === "MINE" ? "border-indigo-500 text-indigo-700" : "border-slate-200 text-slate-500"
                }`}
              >
                Assigned to me
              </button>
              <button
                onClick={() => setFilterAssigned(filterAssigned === "UNASSIGNED" ? "ALL" : "UNASSIGNED")}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                  filterAssigned === "UNASSIGNED" ? "border-indigo-500 text-indigo-700" : "border-slate-200 text-slate-500"
                }`}
              >
                Unassigned
              </button>
              <select
                value={filterAgentId}
                onChange={(e) => setFilterAgentId(e.target.value)}
                className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600"
              >
                <option value="ALL">All agents</option>
                {agents?.map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-5 max-h-[520px] space-y-3 overflow-y-auto pr-1">
            {filtered.map((conv) => {
              const isActive = conv.id === activeId;
              const lastText = conv.lastMessage?.content || t("No messages yet", "Aucun message");
              const isUnread = conv.lastMessageAt && (!conv.lastReadAt || new Date(conv.lastMessageAt) > new Date(conv.lastReadAt));
              const initials = (conv.customerName || conv.customerPhone).slice(0, 2).toUpperCase();
              return (
                <button
                  key={conv.id}
                  onClick={() => {
                    setActiveId(conv.id);
                    markRead();
                  }}
                  className={`w-full rounded-2xl border p-3 text-left transition ${
                    isActive ? "border-indigo-400 bg-indigo-50" : "border-slate-200 bg-white hover:border-slate-300"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <div
                        className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-semibold"
                        style={{ backgroundColor: hashColor(conv.customerPhone), color: hashTextColor(conv.customerPhone) }}
                      >
                        {initials}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{conv.customerName || conv.customerPhone}</p>
                        <p className="text-xs text-slate-500 line-clamp-1">{lastText}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-slate-400">{formatTime(conv.lastMessageAt)}</p>
                      {isUnread && <span className="mt-1 inline-flex h-2 w-2 rounded-full bg-emerald-500" />}
                    </div>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-xs text-slate-400">
                    <span className={`rounded-full border px-2 py-0.5 ${statusClasses[conv.status]}`}>{statusLabel[conv.status]}</span>
                    <span>{conv.assignedTo ? conv.assignedTo.name : "Unassigned"}</span>
                  </div>
                </button>
              );
            })}
            {filtered.length === 0 && (
              <div className="rounded-2xl border border-dashed border-slate-200 p-4 text-center text-sm text-slate-500">
                No conversations match this filter.
              </div>
            )}
          </div>

          {usage && (
            <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Usage</p>
              <div className="mt-3 space-y-3">
                {renderUsageBar("AI replies", aiUsage.used, aiUsage.limit)}
                {renderUsageBar("WhatsApp", usage?.whatsapp?.used ?? 0, usage?.whatsapp?.limit ?? null)}
                {renderUsageBar("Saved replies", replyUsage.used, replyUsage.limit)}
              </div>
            </div>
          )}
        </div>

        <div className="flex h-full flex-col rounded-3xl border border-slate-200 bg-white shadow-[0_12px_30px_rgba(15,23,42,0.05)]">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-sm font-semibold text-slate-600">
                {selected?.customerName ? selected.customerName.slice(0, 2).toUpperCase() : selected?.customerPhone?.slice(-2)}
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900">{selected?.customerName || selected?.customerPhone || "WhatsApp customer"}</p>
                <p className="text-xs text-slate-500">{selected?.customerPhone}</p>
                {selected?.lastCustomerActivityAt && (
                  <p className="text-xs text-slate-400">Last customer activity: {formatTime(selected.lastCustomerActivityAt)}</p>
                )}
                {isTyping && <p className="text-xs text-emerald-600">Typing…</p>}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={selected?.status || "OPEN"}
                onChange={(e) => updateConversation({ status: e.target.value })}
                className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700"
              >
                {statusOrder.map((item) => (
                  <option key={item} value={item}>
                    {statusLabel[item]}
                  </option>
                ))}
              </select>
              <select
                value={selected?.assignedTo?.id || ""}
                onChange={(e) => updateConversation({ assignedToId: e.target.value || null })}
                className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700"
              >
                <option value="">Unassigned</option>
                {agents?.map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.name}
                  </option>
                ))}
              </select>
              <Button variant="secondary" size="sm" onClick={markRead}>
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Mark as done
              </Button>
              <Button variant="ghost" size="sm" className="h-9 w-9 p-0" onClick={() => mutateThread()}>
                <RefreshCw className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" className="h-9 w-9 p-0">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto bg-slate-50 px-6 py-6">
            {threadLoading && <p className="text-sm text-slate-400">Loading messages…</p>}
            {!threadLoading && groupedMessages.length === 0 && (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
                No messages yet. Send the first response to start the conversation.
              </div>
            )}
            {groupedMessages.map((msg) => (
              <div
                key={msg.id}
                className={`group flex ${msg.direction === "OUTBOUND" ? "justify-end" : "justify-start"} ${
                  msg.grouped ? "mt-1" : "mt-4"
                }`}
              >
                <div
                  className={`max-w-[72%] rounded-2xl px-4 py-3 text-sm shadow-sm ${
                    msg.direction === "OUTBOUND" ? "bg-emerald-50 text-slate-900" : "bg-white text-slate-900"
                  }`}
                >
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                  <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400">
                    <span className="opacity-0 transition group-hover:opacity-100">{formatTime(msg.createdAt)}</span>
                    <span className="flex items-center gap-2">
                      {msg.direction === "OUTBOUND" && <span>{deliveryLabel(msg.status)}</span>}
                      {msg.status === "FAILED" && (
                        <button className="text-xs text-rose-500" onClick={() => retryMessage(msg.id)}>
                          Retry
                        </button>
                      )}
                      {msg.status === "SENDING" && <span className="text-xs text-slate-400">Sending…</span>}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="border-t border-slate-100 px-6 py-4">
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="secondary" size="sm" onClick={() => setShowReplies((prev) => !prev)}>
                Saved replies
              </Button>
              <Button variant="secondary" size="sm" disabled={aiLimitReached || aiDrafting} onClick={() => setAiDrafting(true)}>
                <Sparkles className="mr-2 h-4 w-4" />
                AI reply
              </Button>
              <label className="inline-flex items-center gap-2 text-xs text-slate-500">
                <Paperclip className="h-4 w-4" />
                Attach
                <input type="file" multiple className="hidden" onChange={(e) => handleAttachment(e.target.files)} />
              </label>
            </div>

            {showReplies && (
              <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Saved replies</p>
                <div className="mt-3 grid gap-2">
                  {cannedReplies?.map((reply) => (
                    <button
                      key={reply.id}
                      onClick={() => {
                        setDraft(reply.content);
                        setShowQuickInsert(false);
                      }}
                      className="rounded-lg border border-slate-200 px-3 py-2 text-left text-sm hover:border-indigo-300"
                    >
                      <p className="font-medium text-slate-800">{reply.title}</p>
                      <p className="text-xs text-slate-500 line-clamp-1">{reply.content}</p>
                    </button>
                  ))}
                  {!cannedReplies?.length && (
                    <p className="text-sm text-slate-500">No saved replies yet.</p>
                  )}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Input placeholder="Title" className="max-w-[200px]" id="replyTitle" disabled={replyLimitReached} />
                  <Input placeholder="Saved reply" className="flex-1" id="replyContent" disabled={replyLimitReached} />
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={replyLimitReached}
                    onClick={() => {
                      const titleInput = document.getElementById("replyTitle") as HTMLInputElement | null;
                      const contentInput = document.getElementById("replyContent") as HTMLInputElement | null;
                      if (!titleInput?.value || !contentInput?.value) return;
                      handleSaveReply(titleInput.value, contentInput.value);
                      titleInput.value = "";
                      contentInput.value = "";
                    }}
                  >
                    Save
                  </Button>
                  {replyLimitReached && <span className="text-xs text-amber-600">Upgrade for more saved replies.</span>}
                </div>
              </div>
            )}

            {attachments.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {attachments.map((file, index) => (
                  <span key={`${file.name}-${index}`} className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-600">
                    {file.name}
                  </span>
                ))}
              </div>
            )}

            <div className="mt-4 flex flex-wrap items-end gap-3">
              <div className="relative flex-1">
                <Textarea
                  value={draft}
                  onChange={(e) => {
                    setDraft(e.target.value);
                    if (e.target.value.endsWith("/")) setShowQuickInsert(true);
                  }}
                  placeholder={t("Type a message…", "Ecrire un message…")}
                  className="min-h-[88px]"
                  onKeyDown={(e) => {
                    if (e.key === "/") setShowQuickInsert(true);
                  }}
                />
                {showQuickInsert && cannedReplies?.length ? (
                  <div className="absolute bottom-full left-0 mb-2 w-full rounded-2xl border border-slate-200 bg-white p-3 shadow-lg">
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Quick replies</p>
                    <div className="mt-2 grid gap-2">
                      {cannedReplies?.map((reply) => (
                        <button
                          key={reply.id}
                          onClick={() => {
                            setDraft((prev) => prev.replace(/\/$/, reply.content));
                            setShowQuickInsert(false);
                          }}
                          className="rounded-lg border border-slate-200 px-3 py-2 text-left text-sm hover:border-indigo-300"
                        >
                          <p className="font-medium text-slate-800">{reply.title}</p>
                          <p className="text-xs text-slate-500 line-clamp-1">{reply.content}</p>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
              <Button onClick={sendReply} disabled={sending} className="h-12 px-6">
                <Send className="mr-2 h-4 w-4" />
                {sending ? "Sending…" : "Send"}
              </Button>
            </div>
          </div>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_12px_30px_rgba(15,23,42,0.05)]">
          <div className="flex items-center justify-between">
            <p className="text-xs uppercase tracking-[0.32em] text-slate-400">Customer</p>
            <span className="inline-flex items-center rounded-full border border-blue-700 bg-blue-700 px-3 py-1 text-xs font-semibold text-white">
              Profile
            </span>
          </div>
          <div className="mt-4 space-y-3">
            <Input
              value={selected?.customerName || ""}
              onChange={(e) => updateConversation({ customerName: e.target.value })}
              placeholder="Customer name"
            />
            <Input value={selected?.customerPhone || ""} disabled />
            <Input
              value={selected?.tags?.join(", ") || ""}
              onChange={(e) => updateConversation({ tags: e.target.value.split(",").map((tag) => tag.trim()).filter(Boolean) })}
              placeholder="Tags (comma separated)"
            />
          </div>

          <div className="mt-5">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Internal notes</p>
            <div className="mt-3 space-y-3">
              {notes?.map((note) => (
                <div key={note.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span>{note.author?.name || note.author?.email || "User"}</span>
                    <span>{formatTime(note.createdAt)}</span>
                  </div>
                  <p className="mt-2">{renderMentions(note.content)}</p>
                </div>
              ))}
              {!notes?.length && (
                <div className="rounded-2xl border border-dashed border-slate-200 p-3 text-sm text-slate-500">
                  No internal notes yet.
                </div>
              )}
            </div>
            <div className="mt-3 space-y-2">
              <div className="relative">
                <Textarea
                  value={noteDraft}
                  onChange={(e) => setNoteDraft(e.target.value)}
                  placeholder="Add a private note… (use @name)"
                  className="min-h-[90px]"
                />
                {showMentions && mentionCandidates.length > 0 && (
                  <div className="absolute left-0 top-full z-10 mt-2 w-full rounded-2xl border border-slate-200 bg-white p-2 shadow-lg">
                    {mentionCandidates.slice(0, 5).map((agent) => (
                      <button
                        key={agent.id}
                        onClick={() => applyMention(agent.name || agent.email)}
                        className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm hover:bg-slate-50"
                      >
                        <span className="font-medium text-slate-800">{agent.name || agent.email}</span>
                        <span className="text-xs text-slate-400">{agent.email}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <Button variant="secondary" size="sm" onClick={handleNoteAdd}>
                <UserPlus className="mr-2 h-4 w-4" />
                Add note
              </Button>
            </div>
          </div>

          <div className="mt-6 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Related</p>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
              <p className="font-medium text-slate-800">Invoices</p>
              <p className="text-xs text-slate-500">{thread?.invoice ? `Invoice ${thread.invoice.number}` : "No linked invoices"}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
              <p className="font-medium text-slate-800">Payments</p>
              <p className="text-xs text-slate-500">{thread?.payment ? `Payment ${thread.payment.reference}` : "No linked payments"}</p>
            </div>
          </div>

          <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Lifecycle</p>
            <div className="mt-3 space-y-3 text-sm text-slate-600">
              <label className="flex items-center justify-between gap-3">
                <span>Auto-close inactive conversations</span>
                <input
                  type="checkbox"
                  checked={autoCloseEnabled}
                  onChange={(e) => setAutoCloseEnabled(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                />
              </label>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500">After</span>
                <Input
                  type="number"
                  min={1}
                  max={720}
                  value={autoCloseAfterHours}
                  onChange={(e) => setAutoCloseAfterHours(Number(e.target.value || 0))}
                  className="w-20"
                />
                <span className="text-xs text-slate-500">hours</span>
                <Button variant="secondary" size="sm" onClick={saveSettings} disabled={settingsSaving}>
                  {settingsSaving ? "Saving..." : "Save"}
                </Button>
              </div>
              <p className="text-xs text-slate-400">Reopens automatically on new customer message.</p>
            </div>
          </div>
        </div>
      </div>

      {showShortcuts && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-900">Keyboard shortcuts</p>
              <button onClick={() => setShowShortcuts(false)}>
                <X className="h-4 w-4 text-slate-500" />
              </button>
            </div>
            <div className="mt-4 space-y-3 text-sm text-slate-600">
              <div className="flex items-center justify-between">
                <span>Search conversations</span>
                <span className="rounded bg-slate-100 px-2 py-1 text-xs">Ctrl / ? + K</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Open shortcuts</span>
                <span className="rounded bg-slate-100 px-2 py-1 text-xs">Ctrl / ? + /</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Send message</span>
                <span className="rounded bg-slate-100 px-2 py-1 text-xs">Enter</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

