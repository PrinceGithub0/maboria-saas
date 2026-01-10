"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Card } from "../ui/card";
import { Alert } from "../ui/alert";
import { AnimatePresence, motion } from "framer-motion";
import { Bot, MessageSquare, PencilLine, Plus, ThumbsDown, ThumbsUp, Trash2, User } from "lucide-react";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  ts?: number;
  feedback?: "up" | "down";
};

type AiStyle = "brief" | "detailed";
type AiTone = "balanced" | "direct" | "warm";

type Conversation = {
  id: string;
  title: string;
  lastMessageAt?: string | null;
  updatedAt?: string | null;
  createdAt?: string | null;
};

const LEGACY_ID = "legacy";
const LEGACY_TITLE_KEY = "maboria_ai_legacy_title";

export function AssistantChat() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [loadingConversations, setLoadingConversations] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [statusVariant, setStatusVariant] = useState<"info" | "success" | "error">("info");
  const [style, setStyle] = useState<AiStyle>("brief");
  const [tone, setTone] = useState<AiTone>("balanced");
  const [prefsReady, setPrefsReady] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const lastAssistantRef = useRef<HTMLDivElement>(null);
  const scrollAnchorRef = useRef<HTMLDivElement>(null);

  const loadMessages = async (conversationId: string) => {
    setLoadingMessages(true);
    try {
      const res = await fetch(`/api/ai/conversations/${conversationId}?limit=200`);
      if (!res.ok) return;
      const data = await res.json();
      const items = Array.isArray(data?.messages) ? data.messages : [];
      const mapped: Message[] = items.map((entry: any) => ({
        id: entry.id,
        role: entry.role === "assistant" ? "assistant" : "user",
        content: entry.content || "",
        ts: entry.createdAt ? new Date(entry.createdAt).getTime() : undefined,
      }));
      setMessages(mapped);
    } finally {
      setLoadingMessages(false);
    }
  };

  const loadConversations = async () => {
    setLoadingConversations(true);
    try {
      const res = await fetch("/api/ai/conversations");
      if (!res.ok) return;
      const data = await res.json();
      const items = Array.isArray(data?.items) ? data.items : [];
      const uniqueItems = uniqueById(items);
      setConversations(uniqueItems);
      if (uniqueItems.length > 0) {
        const first = uniqueItems[0];
        setActiveConversationId(first.id);
        await loadMessages(first.id);
      }
    } finally {
      setLoadingConversations(false);
    }
  };

  useEffect(() => {
    const load = async () => {
      await loadConversations();
    };
    load();
  }, []);

  useEffect(() => {
    const last = messages[messages.length - 1];
    if (last?.role === "assistant") {
      lastAssistantRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
      return;
    }
    if (loading && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages, loading]);

  useEffect(() => {
    scrollAnchorRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [activeConversationId]);

  useEffect(() => {
    let active = true;
    const loadPrefs = async () => {
      try {
        const res = await fetch("/api/ai/preferences");
        if (!res.ok) return;
        const data = await res.json();
        if (!active) return;
        if (data?.style) setStyle(data.style);
        if (data?.tone) setTone(data.tone);
      } finally {
        if (active) setPrefsReady(true);
      }
    };
    loadPrefs();
    return () => {
      active = false;
    };
  }, []);

  const savePreferences = async (next: { style?: AiStyle; tone?: AiTone }) => {
    const payload = { style: next.style ?? style, tone: next.tone ?? tone };
    setStyle(payload.style);
    setTone(payload.tone);
    if (!prefsReady) return;
    await fetch("/api/ai/preferences", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  };

  const makeMessageId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const toTitle = (value: string) => {
    const trimmed = value.trim().replace(/\s+/g, " ");
    return trimmed.length > 64 ? `${trimmed.slice(0, 61)}...` : trimmed;
  };

  const formatLabel = (key: string) =>
    key
      .replace(/_/g, " ")
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .trim();

  const renderInline = (text: string) => {
    const parts = text.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((part, idx) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return (
          <strong key={idx} className="font-semibold text-foreground">
            {part.slice(2, -2)}
          </strong>
        );
      }
      return <span key={idx}>{part}</span>;
    });
  };

  const extractJsonCandidate = (content: string) => {
    const trimmed = content.trim();
    const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)```$/i);
    if (fenceMatch?.[1]) return fenceMatch[1].trim();
    if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
      const inner = trimmed.slice(1, -1).trim();
      if (inner.startsWith("{") || inner.startsWith("[")) return inner;
    }
    return trimmed;
  };

  const renderValue = (value: unknown): React.ReactNode => {
    if (value == null) return null;
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      const text = String(value);
      return <span>{renderInline(text.replace(/^["\u201C]|["\u201D]$/g, ""))}</span>;
    }
    if (Array.isArray(value)) {
      return (
        <ul className="mt-2 list-disc space-y-1 pl-5">
          {value.map((item, idx) => (
            <li key={idx}>
              {typeof item === "string" || typeof item === "number"
                ? String(item)
                : JSON.stringify(item)}
            </li>
          ))}
        </ul>
      );
    }
    if (typeof value === "object") {
      return (
        <div className="mt-2 space-y-3">
          {Object.entries(value as Record<string, unknown>).map(([key, entry]) => (
            <div key={key}>
              <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
                {formatLabel(key)}
              </p>
              <div className="text-sm text-foreground">{renderValue(entry)}</div>
            </div>
          ))}
        </div>
      );
    }
    return null;
  };

  const renderAssistantContent = (content: string) => {
    const candidate = extractJsonCandidate(content);
    if (
      (candidate.startsWith("{") && candidate.endsWith("}")) ||
      (candidate.startsWith("[") && candidate.endsWith("]"))
    ) {
      try {
        const parsed = JSON.parse(candidate);
        return <div className="space-y-2">{renderValue(parsed)}</div>;
      } catch {
        return <p className="whitespace-pre-wrap leading-relaxed">{renderInline(content)}</p>;
      }
    }
    return (
      <p className="whitespace-pre-wrap leading-relaxed">
        {renderInline(content.replace(/^["\u201C]|["\u201D]$/g, ""))}
      </p>
    );
  };

  const formatTime = (value?: number) => {
    if (!value) return "";
    return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const uniqueById = (items: Conversation[]) => {
    const seen = new Set<string>();
    return items.filter((item) => {
      if (!item?.id) return false;
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
  };

  const getLegacyTitle = () => {
    if (typeof window === "undefined") return null;
    try {
      return window.localStorage.getItem(LEGACY_TITLE_KEY);
    } catch {
      return null;
    }
  };

  const setLegacyTitle = (value: string) => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(LEGACY_TITLE_KEY, value);
    } catch {
      // ignore
    }
  };

  const withLegacyTitle = (items: Conversation[]) => {
    const legacyTitle = getLegacyTitle();
    return items.map((item) =>
      item.id === LEGACY_ID && legacyTitle ? { ...item, title: legacyTitle } : item
    );
  };

  const dedupedConversations = useMemo(
    () => withLegacyTitle(uniqueById(conversations)),
    [conversations]
  );

  const createConversation = async () => {
    const res = await fetch("/api/ai/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    if (!res.ok) return null;
    const data = await res.json().catch(() => ({}));
    return data?.item as Conversation;
  };

  const handleNewChat = async () => {
    const created = await createConversation();
    if (!created) return;
    const next = created.id === LEGACY_ID
      ? { ...created, title: getLegacyTitle() || created.title }
      : created;
    setConversations((prev) => uniqueById([next, ...prev]));
    setActiveConversationId(created.id);
    setMessages([]);
  };

  const handleRename = async (conversationId: string, title: string) => {
    const nextTitle = toTitle(title);
    if (!nextTitle || nextTitle.length < 2) {
      setStatus("Chat title must be at least 2 characters.");
      setStatusVariant("error");
      return;
    }
    if (conversationId === LEGACY_ID) {
      setLegacyTitle(nextTitle);
      setConversations((prev) =>
        prev.map((c) => (c.id === conversationId ? { ...c, title: nextTitle } : c))
      );
      setEditingId(null);
      return;
    }
    const res = await fetch(`/api/ai/conversations/${conversationId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: nextTitle }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setStatus(data?.error || "Unable to rename chat right now.");
      setStatusVariant("error");
      return;
    }
    const data = await res.json().catch(() => ({}));
    const resolvedTitle = data?.item?.title ?? nextTitle;
    setConversations((prev) =>
      prev.map((c) => (c.id === conversationId ? { ...c, title: resolvedTitle } : c))
    );
    setEditingId(null);
  };

  const handleDelete = async (conversationId: string) => {
    const confirmDelete = window.confirm("Delete this chat? This cannot be undone.");
    if (!confirmDelete) return;
    const res = await fetch(`/api/ai/conversations/${conversationId}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setStatus(data?.error || "Unable to delete chat right now.");
      setStatusVariant("error");
      return;
    }
    const nextList = conversations.filter((c) => c.id !== conversationId);
    setConversations(nextList);
    if (activeConversationId === conversationId) {
      const next = nextList[0];
      if (next) {
        setActiveConversationId(next.id);
        await loadMessages(next.id);
      } else {
        await handleNewChat();
      }
    }
  };

  const send = async () => {
    const trimmed = input.trim();
    if (!trimmed || loading) return;
    let conversationId = activeConversationId;
    if (!conversationId) {
      const created = await createConversation();
      if (created) {
        const next = created.id === LEGACY_ID
          ? { ...created, title: getLegacyTitle() || created.title }
          : created;
        setConversations((prev) => uniqueById([next, ...prev]));
        setActiveConversationId(created.id);
        conversationId = created.id;
      } else {
        setStatus("Chat history is unavailable right now. Sending without history.");
        setStatusVariant("error");
      }
    }
    const message: Message = { id: makeMessageId(), role: "user", content: trimmed, ts: Date.now() };
    setMessages((prev) => [...prev, message]);
    setLoading(true);
    setStatus(null);
    try {
      const res = await fetch("/api/ai/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "assistant",
          prompt: trimmed,
          style,
          tone,
          conversationId,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 401) {
          setStatus("Session expired. Please sign in again.");
          setStatusVariant("error");
        } else if (data.type === "upgrade_required") {
          setStatus(`${data.error || "Upgrade required."} Required plan: Pro.`);
          setStatusVariant("error");
        } else if (data.type === "limit_reached") {
          setStatus(`${data.error || "AI limit reached."} Required plan: Pro.`);
          setStatusVariant("error");
        } else {
          setStatus(data.error || "Assistant is unavailable right now.");
          setStatusVariant("error");
        }
        return;
      }
      const nextId = data.conversationId || conversationId;
      setMessages((prev) => [
        ...prev,
        { id: makeMessageId(), role: "assistant", content: data.answer || "...", ts: Date.now() },
      ]);
      if (nextId) {
        setConversations((prev) => {
          const updated = prev.map((c) =>
            c.id === nextId
              ? {
                  ...c,
                  title: c.title === "New chat" ? toTitle(trimmed) : c.title,
                  lastMessageAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                }
              : c
          );
          const active = updated.find((c) => c.id === nextId);
          if (!active) return updated;
          return uniqueById([active, ...updated.filter((c) => c.id !== nextId)]);
        });
      }
      setInput("");
    } catch (err: any) {
      setStatus(err?.message || "Assistant is unavailable right now.");
      setStatusVariant("error");
    } finally {
      setLoading(false);
    }
  };

  const sendFeedback = async (messageId: string, rating: "up" | "down") => {
    const message = messages.find((m) => m.id === messageId);
    if (!message || message.role !== "assistant") return;
    setMessages((prev) =>
      prev.map((m) => (m.id === messageId ? { ...m, feedback: rating } : m))
    );
    await fetch("/api/ai/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rating,
        message: message.content,
        style,
        tone,
      }),
    });
  };

  const lastAssistantIndex = messages.reduce(
    (acc, msg, idx) => (msg.role === "assistant" ? idx : acc),
    -1
  );

  return (
    <Card
      title="AI Assistant"
      className="border-border/80 bg-card shadow-[0_28px_70px_rgba(15,23,42,0.2)] ring-1 ring-border/40"
    >
      <div className="space-y-4">
        <div className="grid gap-4 md:grid-cols-[260px_1fr]">
          <div className="rounded-3xl border border-border/80 bg-background p-4 shadow-[0_18px_40px_rgba(15,23,42,0.12)]">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-indigo-600 dark:text-indigo-300" />
                <div>
                  <p className="text-[10px] uppercase tracking-[0.28em] text-muted-foreground">Conversations</p>
                  <p className="text-sm font-semibold text-foreground">Maboria AI</p>
                </div>
              </div>
              <Button
                size="sm"
                variant="primary"
                className="h-8 rounded-full px-3 text-[11px] font-semibold"
                onClick={handleNewChat}
              >
                <Plus className="mr-1 h-3 w-3" />
                New
              </Button>
            </div>
            <div className="mt-3 max-h-[360px] space-y-2 overflow-y-auto pr-1">
              {loadingConversations && (
                <div className="rounded-xl border border-dashed border-border bg-background/60 p-3 text-xs text-muted-foreground">
                  Loading chats...
                </div>
              )}
              {!loadingConversations && dedupedConversations.length === 0 && (
                <div className="rounded-xl border border-dashed border-border bg-background/60 p-3 text-xs text-muted-foreground">
                  Start a new chat to see history here.
                </div>
              )}
              {dedupedConversations.map((conversation, idx) => {
                const isActive = conversation.id === activeConversationId;
                return (
                  <div
                    key={`${conversation.id}-${idx}`}
                    className={`rounded-2xl border px-3 py-2 text-xs transition ${
                      isActive
                        ? "border-indigo-500 bg-indigo-600 text-white shadow-[0_14px_28px_rgba(79,70,229,0.35)]"
                        : "border-border/60 bg-background text-foreground hover:border-indigo-200 hover:bg-indigo-50/40 dark:hover:border-indigo-400/40 dark:hover:bg-indigo-500/10"
                    }`}
                  >
                    {editingId === conversation.id ? (
                      <div className="space-y-2">
                        <Input
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          className="h-8 text-xs"
                        />
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            className="h-7 rounded-full px-3 text-[11px]"
                            onClick={() => handleRename(conversation.id, editTitle)}
                          >
                            Save
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            className="h-7 rounded-full px-3 text-[11px]"
                            onClick={() => setEditingId(null)}
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => {
                          setActiveConversationId(conversation.id);
                          loadMessages(conversation.id);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            setActiveConversationId(conversation.id);
                            loadMessages(conversation.id);
                          }
                        }}
                        className="flex w-full items-start justify-between gap-2 text-left"
                      >
                        <div className="space-y-1">
                          <p className={`text-sm font-semibold ${isActive ? "text-white" : "text-foreground"}`}>
                            {conversation.title}
                          </p>
                          <p className={`text-[11px] ${isActive ? "text-indigo-100" : "text-muted-foreground"}`}>
                            {conversation.lastMessageAt
                              ? new Date(conversation.lastMessageAt).toLocaleDateString()
                              : "No messages yet"}
                          </p>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={(event) => {
                              event.preventDefault();
                              setEditingId(conversation.id);
                              setEditTitle(conversation.title);
                            }}
                            className={`rounded-full border p-1 text-muted-foreground hover:text-foreground ${
                              isActive
                                ? "border-white/30 bg-white/10 text-white hover:text-white"
                                : "border-border bg-background"
                            }`}
                            aria-label="Rename chat"
                          >
                            <PencilLine className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            onClick={(event) => {
                              event.preventDefault();
                              handleDelete(conversation.id);
                            }}
                            className={`rounded-full border p-1 text-muted-foreground hover:text-foreground ${
                              isActive
                                ? "border-white/30 bg-white/10 text-white hover:text-white"
                                : "border-border bg-background"
                            }`}
                            aria-label="Delete chat"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="space-y-4" ref={scrollAnchorRef}>
        <div className="assistant-header rounded-3xl border border-slate-300 bg-white p-5 text-slate-900 shadow-[0_18px_40px_rgba(15,23,42,0.12)] dark:border-border/70 dark:bg-gradient-to-br dark:from-slate-950 dark:via-slate-950 dark:to-indigo-500/10 dark:text-foreground">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="assistant-muted text-[11px] uppercase tracking-[0.32em] text-slate-700 dark:text-muted-foreground">
                Private assistant
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="assistant-label text-sm font-semibold text-slate-900 dark:text-foreground">
                  Response style
                </span>
                <Button
                  size="sm"
                  variant={style === "brief" ? "primary" : "secondary"}
                  onClick={() => savePreferences({ style: "brief" })}
                  title="Brief - concise, executive summary"
                  className="assistant-control rounded-full px-4 text-xs font-semibold"
                >
                  Brief
                </Button>
                <Button
                  size="sm"
                  variant={style === "detailed" ? "primary" : "secondary"}
                  onClick={() => savePreferences({ style: "detailed" })}
                  title="Detailed - step-by-step guidance + example"
                  className="assistant-control rounded-full px-4 text-xs font-semibold"
                >
                  Detailed
                </Button>
                <span className="assistant-label ml-2 text-sm font-semibold text-slate-900 dark:text-foreground">
                  Response tone
                </span>
                <select
                  className="assistant-control assistant-select rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-900 dark:border-border dark:bg-background dark:text-foreground"
                  value={tone}
                  onChange={(e) => savePreferences({ tone: e.target.value as AiTone })}
                  title="Balanced - neutral, Direct - crisp, Warm - friendly"
                >
                  <option value="balanced">Balanced</option>
                  <option value="direct">Direct</option>
                  <option value="warm">Warm</option>
                </select>
              </div>
              <p className="assistant-muted mt-3 text-xs text-slate-800 dark:text-muted-foreground">
                <span className="assistant-label font-semibold text-slate-900 dark:text-foreground">Brief:</span> executive summary
                <span className="mx-2 font-semibold text-slate-900 dark:text-foreground" aria-hidden="true">
                  &bull;
                </span>
                <span className="assistant-label font-semibold text-slate-900 dark:text-foreground">Detailed:</span> step-by-step + example
                <span className="mx-2 font-semibold text-slate-900 dark:text-foreground" aria-hidden="true">
                  &bull;
                </span>
                <span className="assistant-label font-semibold text-slate-900 dark:text-foreground">Tone:</span> Balanced / Direct / Warm
              </p>
            </div>
            <div className="assistant-status inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-3 py-1 text-[11px] font-semibold text-slate-900 shadow-sm dark:border-border dark:bg-background dark:text-foreground">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              Online
            </div>
          </div>
        </div>
        {status && <Alert variant={statusVariant}>{status}</Alert>}
        <div
          ref={listRef}
          className="max-h-[480px] space-y-3 overflow-y-auto rounded-3xl border border-border/70 bg-background p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.65)]"
        >
          {loadingMessages && (
            <div className="rounded-xl border border-dashed border-border bg-background/60 px-4 py-3 text-xs text-muted-foreground">
              Loading messages...
            </div>
          )}
          <AnimatePresence>
            {messages.map((m, idx) => {
              const isLastAssistant = idx === lastAssistantIndex;
              return (
              <motion.div
                key={m.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className={`flex ${m.role === "assistant" ? "justify-start" : "justify-end"}`}
                ref={isLastAssistant ? lastAssistantRef : undefined}
              >
                <div className={`flex max-w-[78%] items-end gap-2 ${m.role === "assistant" ? "" : "flex-row-reverse"}`}>
                  <div
                    className={`flex h-9 w-9 items-center justify-center rounded-full border border-border ${
                      m.role === "assistant"
                        ? "bg-indigo-50 text-indigo-700"
                        : "bg-indigo-600 text-white shadow-[0_10px_24px_rgba(79,70,229,0.25)]"
                    }`}
                  >
                    {m.role === "assistant" ? <Bot className="h-4 w-4" /> : <User className="h-4 w-4" />}
                  </div>
                  <div
                    className={`rounded-2xl px-4 py-3 text-sm shadow-[0_12px_26px_rgba(15,23,42,0.1)] ${
                      m.role === "assistant"
                        ? "bg-card text-foreground border border-border/70"
                        : "bg-indigo-600 text-white shadow-[0_14px_28px_rgba(79,70,229,0.3)] shadow-indigo-600/30"
                    }`}
                  >
                    {m.role === "assistant" ? renderAssistantContent(m.content) : (
                      <p className="whitespace-pre-wrap leading-relaxed">{m.content}</p>
                    )}
                    {m.role === "assistant" && (
                      <div className="mt-3 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => sendFeedback(m.id, "up")}
                          disabled={m.feedback === "up"}
                          className={`inline-flex h-8 w-8 items-center justify-center rounded-full border text-xs ${
                            m.feedback === "up"
                              ? "border-emerald-500 text-emerald-600"
                              : "border-border text-muted-foreground hover:text-foreground"
                          }`}
                          aria-label="Helpful"
                        >
                          <ThumbsUp className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => sendFeedback(m.id, "down")}
                          disabled={m.feedback === "down"}
                          className={`inline-flex h-8 w-8 items-center justify-center rounded-full border text-xs ${
                            m.feedback === "down"
                              ? "border-rose-500 text-rose-600"
                              : "border-border text-muted-foreground hover:text-foreground"
                          }`}
                          aria-label="Not helpful"
                        >
                          <ThumbsDown className="h-4 w-4" />
                        </button>
                        {m.feedback && (
                          <span className="text-[11px] text-muted-foreground">Thanks for the feedback.</span>
                        )}
                      </div>
                    )}
                    <p className={`mt-2 text-[10px] uppercase tracking-[0.24em] ${m.role === "assistant" ? "text-muted-foreground" : "text-indigo-100"}`}>
                      {formatTime(m.ts)}
                    </p>
                  </div>
                </div>
              </motion.div>
            );
            })}
          </AnimatePresence>
          {loading && (
            <div className="flex items-center gap-2 rounded-full border border-border bg-background px-3 py-2 text-xs text-muted-foreground">
              <span className="flex h-2 w-2 animate-pulse rounded-full bg-indigo-500" />
              Maboria is typing...
            </div>
          )}
          {messages.length === 0 && !loading && (
            <div className="rounded-2xl border border-dashed border-border bg-background/60 px-4 py-6 text-center text-sm text-muted-foreground">
              Ask about automations, revenue, or invoices to get started.
            </div>
          )}
        </div>
        <div className="rounded-3xl border border-border/70 bg-background p-3 shadow-[0_12px_26px_rgba(15,23,42,0.1)]">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Input
              id="assistant-input"
              className="flex-1"
              placeholder="Ask the Maboria assistant..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") send();
              }}
            />
            <Button className="w-full sm:w-auto" onClick={send} loading={loading}>
              Send
            </Button>
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Responses are generated automatically. Verify important details before acting.
          </p>
        </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
