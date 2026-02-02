"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Alert } from "../ui/alert";
import { AnimatePresence, motion } from "framer-motion";
import { Info, MessageSquare, PencilLine, Plus, ThumbsDown, ThumbsUp, Trash2 } from "lucide-react";
import { useLanguage } from "../providers/language-provider";
import { formatDateDMY } from "@/lib/date";

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
  const { language } = useLanguage();
  const t = (en: string, fr: string) => (language === "fr" ? fr : en);
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
  const [historyOpen, setHistoryOpen] = useState(false);
  const [model, setModel] = useState("maboria-1");
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [modelTooltip, setModelTooltip] = useState<"maboria-1" | "maboria-2" | null>(null);
  const [autoScrollEnabled, setAutoScrollEnabled] = useState(true);
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const lastAssistantRef = useRef<HTMLDivElement>(null);
  const scrollAnchorRef = useRef<HTMLDivElement>(null);
  const modelMenuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const loadMessages = useCallback(async (conversationId: string) => {
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
  }, []);

  const uniqueById = useCallback((items: Conversation[]) => {
    const seen = new Set<string>();
    return items.filter((item) => {
      if (!item?.id) return false;
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
  }, []);

  const loadConversations = useCallback(async () => {
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
  }, [loadMessages, uniqueById]);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    if (!autoScrollEnabled) return;
    if (!loading && !streamingMessageId) return;
    const last = messages[messages.length - 1];
    if (last?.role === "assistant") {
      lastAssistantRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
      return;
    }
    if (loading && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages, loading, autoScrollEnabled, streamingMessageId]);

  useEffect(() => {
    setAutoScrollEnabled(false);
    if (listRef.current) {
      listRef.current.scrollTop = 0;
    }
  }, [activeConversationId]);

  useEffect(() => {
    let active = true;
    const saved = typeof window !== "undefined" ? window.localStorage.getItem("maboria_ai_history_open") : null;
    if (saved === "true") setHistoryOpen(true);
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

  useEffect(() => {
    const handler = (event: MouseEvent | TouchEvent) => {
      if (!modelMenuRef.current) return;
      if (!modelMenuRef.current.contains(event.target as Node)) {
        setModelMenuOpen(false);
        setModelTooltip(null);
      }
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("touchstart", handler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("touchstart", handler);
    };
  }, []);

  const toggleHistory = () => {
    setHistoryOpen((prev) => {
      const next = !prev;
      if (typeof window !== "undefined") {
        window.localStorage.setItem("maboria_ai_history_open", next ? "true" : "false");
      }
      return next;
    });
  };

  const resizeInput = () => {
    if (!inputRef.current) return;
    const el = inputRef.current;
    el.style.height = "auto";
    const maxHeight = 160;
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
    el.style.overflowY = el.scrollHeight > maxHeight ? "auto" : "hidden";
  };

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
            <li key={idx}>{typeof item === "string" || typeof item === "number" ? String(item) : JSON.stringify(item)}</li>
          ))}
        </ul>
      );
    }
    if (typeof value === "object") {
      return (
        <div className="mt-2 space-y-3">
          {Object.entries(value as Record<string, unknown>).map(([key, entry]) => (
            <div key={key}>
              <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">{formatLabel(key)}</p>
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
    return <p className="whitespace-pre-wrap leading-relaxed">{renderInline(content.replace(/^["\u201C]|["\u201D]$/g, ""))}</p>;
  };

  const formatTime = (value?: number) => {
    if (!value) return "";
    return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
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

  const withLegacyTitle = useCallback((items: Conversation[]) => {
    const legacyTitle = getLegacyTitle();
    return items.map((item) => (item.id === LEGACY_ID && legacyTitle ? { ...item, title: legacyTitle } : item));
  }, []);

  const dedupedConversations = useMemo(
    () => withLegacyTitle(uniqueById(conversations)),
    [conversations, uniqueById, withLegacyTitle]
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
    const next = created.id === LEGACY_ID ? { ...created, title: getLegacyTitle() || created.title } : created;
    setConversations((prev) => uniqueById([next, ...prev]));
    setActiveConversationId(created.id);
    setMessages([]);
  };

  const handleRename = async (conversationId: string, title: string) => {
    const nextTitle = toTitle(title);
    if (!nextTitle || nextTitle.length < 2) {
      setStatus(t("Chat title must be at least 2 characters.", "Le titre doit avoir au moins 2 caracteres."));
      setStatusVariant("error");
      return;
    }
    if (conversationId === LEGACY_ID) {
      setLegacyTitle(nextTitle);
      setConversations((prev) => prev.map((c) => (c.id === conversationId ? { ...c, title: nextTitle } : c)));
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
      setStatus(data?.error || t("Unable to rename chat right now.", "Impossible de renommer le chat."));
      setStatusVariant("error");
      return;
    }
    const data = await res.json().catch(() => ({}));
    const resolvedTitle = data?.item?.title ?? nextTitle;
    setConversations((prev) => prev.map((c) => (c.id === conversationId ? { ...c, title: resolvedTitle } : c)));
    setEditingId(null);
  };

  const handleDelete = async (conversationId: string) => {
    const confirmDelete = window.confirm(
      t("Delete this chat? This cannot be undone.", "Supprimer ce chat? Action irreversible.")
    );
    if (!confirmDelete) return;
    const res = await fetch(`/api/ai/conversations/${conversationId}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setStatus(data?.error || t("Unable to delete chat right now.", "Impossible de supprimer le chat."));
      setStatusVariant("error");
      return;
    }
    const nextList = conversations.filter((c) => c.id !== conversationId);
    setConversations(nextList);
    if (activeConversationId === conversationId) {
      setAutoScrollEnabled(false);
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
        const next = created.id === LEGACY_ID ? { ...created, title: getLegacyTitle() || created.title } : created;
        setConversations((prev) => uniqueById([next, ...prev]));
        setActiveConversationId(created.id);
        conversationId = created.id;
      } else {
        setStatus(
          t("Chat history is unavailable right now. Sending without history.", "Historique indisponible. Envoi sans historique.")
        );
        setStatusVariant("error");
      }
    }
    setAutoScrollEnabled(true);
    const message: Message = { id: makeMessageId(), role: "user", content: trimmed, ts: Date.now() };
    const assistantMessageId = makeMessageId();
    setMessages((prev) => [
      ...prev,
      message,
      { id: assistantMessageId, role: "assistant", content: "", ts: Date.now() },
    ]);
    setStreamingMessageId(assistantMessageId);
    setLoading(true);
    setStatus(null);
    try {
      const res = await fetch("/api/ai/assistant?stream=1", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
        body: JSON.stringify({
          mode: "assistant",
          prompt: trimmed,
          style,
          tone,
          conversationId,
        }),
      });
      const isStream = res.headers.get("content-type")?.includes("text/event-stream");
      if (!res.ok && !isStream) {
        const data = await res.json().catch(() => ({}));
        if (res.status === 401) {
          setStatus(t("Session expired. Please sign in again.", "Session expiree. Reconnectez-vous."));
          setStatusVariant("error");
        } else if (data.type === "upgrade_required") {
          setStatus(
            `${data.error || t("Upgrade required.", "Mise a niveau requise.")} ${t(
              "Required plan: Pro or higher.",
              "Plan requis: Pro ou plus."
            )}`
          );
          setStatusVariant("error");
        } else if (data.type === "limit_reached") {
          setStatus(
            `${data.error || t("AI limit reached.", "Limite IA atteinte.")} ${t(
              "Required plan: Pro or higher.",
              "Plan requis: Pro ou plus."
            )}`
          );
          setStatusVariant("error");
        } else {
          setStatus(data.error || t("Assistant is unavailable right now.", "Assistant indisponible."));
          setStatusVariant("error");
        }
        return;
      }

      if (isStream && res.body) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let fullText = "";
        let nextId = conversationId;
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split("\n\n");
          buffer = parts.pop() || "";
          for (const part of parts) {
            const line = part.trim();
            if (!line.startsWith("data:")) continue;
            const payload = JSON.parse(line.replace(/^data:\s*/, ""));
            if (payload?.token) {
              fullText += payload.token;
              setMessages((prev) =>
                prev.map((m) => (m.id === assistantMessageId ? { ...m, content: fullText, ts: Date.now() } : m))
              );
              if (autoScrollEnabled) {
                listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
              }
            }
            if (payload?.conversationId) {
              nextId = payload.conversationId;
            }
            if (payload?.error) {
              setStatus(payload.error);
              setStatusVariant("error");
            }
            if (payload?.done) {
              setStreamingMessageId(null);
            }
          }
        }
        setStreamingMessageId(null);
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
        resizeInput();
        return;
      }

      const data = await res.json().catch(() => ({}));
      const nextId = data.conversationId || conversationId;
      const answerText = data.answer || "...";
      const chunkSize = 16;
      let index = 0;
      const streamStep = () => {
        index = Math.min(answerText.length, index + chunkSize);
        const slice = answerText.slice(0, index);
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantMessageId ? { ...m, content: slice, ts: Date.now() } : m))
        );
        if (autoScrollEnabled) {
          listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
        }
        if (index < answerText.length) {
          requestAnimationFrame(streamStep);
        } else {
          setStreamingMessageId(null);
        }
      };
      requestAnimationFrame(streamStep);
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
      resizeInput();
    } catch (err: any) {
      setStatus(err?.message || t("Assistant is unavailable right now.", "Assistant indisponible."));
      setStatusVariant("error");
    } finally {
      setLoading(false);
    }
  };

  const sendFeedback = async (messageId: string, rating: "up" | "down") => {
    const message = messages.find((m) => m.id === messageId);
    if (!message || message.role !== "assistant") return;
    const previousScrollTop = listRef.current?.scrollTop ?? 0;
    const previousScrollHeight = listRef.current?.scrollHeight ?? 0;
    setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, feedback: rating } : m)));
    if (listRef.current) {
      const el = listRef.current;
      const nearBottom = previousScrollHeight - previousScrollTop - el.clientHeight < 80;
      if (nearBottom) {
        el.scrollTo({ top: el.scrollHeight });
      } else {
        el.scrollTop = previousScrollTop;
      }
    }
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

  const lastAssistantIndex = messages.reduce((acc, msg, idx) => (msg.role === "assistant" ? idx : acc), -1);
  const streamingMessage = streamingMessageId ? messages.find((m) => m.id === streamingMessageId) : null;
  const showTypingLine = loading && (!streamingMessageId || !(streamingMessage?.content || "").trim());

  const formatTitle = (value: string) => (value === "New chat" ? t("New chat", "Nouveau chat") : value);

  return (
    <div className={`grid h-full gap-6 ${historyOpen ? "lg:grid-cols-[220px_1fr]" : "lg:grid-cols-[1fr]"}`}>
      {historyOpen && <div className="fixed inset-0 z-40 bg-black/30 lg:hidden" onClick={toggleHistory} />}
      {historyOpen ? (
        <aside className="border-r border-border/40 pr-4 max-lg:fixed max-lg:inset-4 max-lg:z-50 max-lg:overflow-hidden max-lg:rounded-3xl max-lg:border max-lg:border-border/60 max-lg:bg-background max-lg:p-5 max-lg:shadow-[0_20px_60px_rgba(15,23,42,0.18)]">
          <div className="pb-4">
            <div>
              <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.32em] text-muted-foreground">
                <MessageSquare className="h-4 w-4 text-indigo-600" />
                {t("Conversations", "Conversations")}
              </div>
              <p className="mt-2 text-sm font-semibold text-foreground">
                {t("Executive history", "Historique exec")}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {t("Private, secure, and scoped to your workspace.", "Prive, securise, et limite a votre espace.")}
              </p>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="ghost"
                className="h-8 rounded-full border border-border/60 px-3 text-[11px] font-semibold text-foreground hover:bg-muted/30"
                onClick={handleNewChat}
              >
                <Plus className="mr-1 h-3 w-3" />
                {t("New chat", "Nouveau chat")}
              </Button>
              <button
                type="button"
                onClick={toggleHistory}
                className="h-8 rounded-full border border-border/60 px-3 text-[11px] font-semibold text-foreground hover:bg-muted/30"
                aria-label={t("Collapse history", "Reduire l'historique")}
              >
                {t("Hide", "Cacher")}
              </button>
            </div>
          </div>
          <div className="max-h-[calc(100vh-220px)] space-y-1 overflow-y-auto pr-1 max-lg:max-h-[calc(100vh-260px)]">
          {loadingConversations && <div className="px-2 py-2 text-xs text-muted-foreground">{t("Loading chats...", "Chargement des chats...")}</div>}
          {!loadingConversations && dedupedConversations.length === 0 && (
            <div className="px-2 py-2 text-xs text-muted-foreground">
              {t("Start a new chat to see history here.", "Demarrez un nouveau chat pour voir l'historique.")}
            </div>
          )}
          {dedupedConversations.map((conversation, idx) => {
            const isActive = conversation.id === activeConversationId;
            return (
              <div
                key={`${conversation.id}-${idx}`}
                className={`rounded-lg px-2 py-2 text-xs transition ${
                  isActive
                    ? "bg-muted/40 text-foreground"
                    : "text-foreground hover:bg-muted/30"
                }`}
              >
                {editingId === conversation.id ? (
                  <div className="space-y-2">
                    <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} className="h-8 text-xs" />
                    <div className="flex items-center gap-2">
                      <Button size="sm" className="h-7 rounded-full px-3 text-[11px]" onClick={() => handleRename(conversation.id, editTitle)}>
                        {t("Save", "Enregistrer")}
                      </Button>
                      <Button size="sm" variant="secondary" className="h-7 rounded-full px-3 text-[11px]" onClick={() => setEditingId(null)}>
                        {t("Cancel", "Annuler")}
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
                      <p className="text-sm font-semibold text-foreground">{formatTitle(conversation.title)}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {conversation.lastMessageAt
                          ? formatDateDMY(new Date(conversation.lastMessageAt))
                          : t("No messages yet", "Pas de messages")}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.preventDefault();
                          setEditingId(conversation.id);
                          setEditTitle(formatTitle(conversation.title));
                        }}
                        className="rounded-full p-1 text-muted-foreground hover:text-foreground"
                        aria-label={t("Rename chat", "Renommer le chat")}
                      >
                        <PencilLine className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.preventDefault();
                          handleDelete(conversation.id);
                        }}
                        className="rounded-full p-1 text-muted-foreground hover:text-foreground"
                        aria-label={t("Delete chat", "Supprimer le chat")}
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
        </aside>
      ) : (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleHistory}
            className="rounded-full border border-border/60 px-3 py-2 text-[11px] uppercase tracking-[0.2em] text-muted-foreground hover:text-foreground lg:hidden"
            aria-label={t("Show history", "Afficher l'historique")}
          >
            {t("History", "Historique")}
          </button>
          <button
            type="button"
            onClick={toggleHistory}
            className="rounded-full border border-border/60 px-3 py-2 text-[11px] uppercase tracking-[0.2em] text-muted-foreground hover:text-foreground max-lg:hidden"
            aria-label={t("Expand history", "Afficher l'historique")}
          >
            {t("History", "Historique")}
          </button>
        </div>
      )}

      <section className="flex min-h-[70vh] flex-col" ref={scrollAnchorRef}>
        {status && <Alert variant={statusVariant}>{status}</Alert>}
        <div
          ref={listRef}
          className="flex-1 space-y-6 overflow-y-auto px-1"
          onScroll={() => {
            const el = listRef.current;
            if (!el) return;
            const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
            setAutoScrollEnabled(nearBottom);
          }}
        >
          {loadingMessages && <div className="text-xs text-muted-foreground">{t("Loading messages...", "Chargement des messages...")}</div>}
          {messages.length === 0 && !loading && (
            <div className="flex h-full items-center justify-center">
              <div className="max-w-xl text-center">
                <p className="text-2xl font-semibold text-foreground">{t("Welcome to Maboria AI", "Bienvenue sur Maboria IA")}</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  {t(
                    "Ask about automations, invoices, revenue, or insights. We'll help you move faster with clear next steps.",
                    "Posez des questions sur automatisations, factures, revenus ou insights. Nous vous aidons a avancer."
                  )}
                </p>
                <div className="mt-4 flex flex-wrap justify-center gap-2 text-xs text-muted-foreground">
                  {[
                    t("Draft a follow-up workflow", "Generer un workflow de relance"),
                    t("Summarize weekly revenue", "Resumer les revenus de la semaine"),
                    t("Diagnose a failed run", "Diagnostiquer un echec"),
                  ].map((item) => (
                    <span key={item} className="rounded-full border border-border/60 px-3 py-1 text-indigo-700">
                      {item}
                    </span>
                  ))}
                </div>
              </div>
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
                  <div className={`max-w-[680px] ${m.role === "assistant" ? "" : "text-right"}`}>
                    <div
                      className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                        m.role === "assistant" ? "bg-transparent text-foreground" : "bg-muted/40 text-foreground"
                      }`}
                    >
                      {m.role === "assistant" ? renderAssistantContent(m.content) : <p className="whitespace-pre-wrap">{m.content}</p>}
                      {m.role === "assistant" && showTypingLine && streamingMessageId === m.id && !m.content && (
                        <span className="text-xs text-muted-foreground">{t("Maboria AI is typing...", "Maboria IA ecrit...")}</span>
                      )}
                      {m.role === "assistant" && streamingMessageId === m.id && (
                        <span className="ml-1 inline-block h-4 w-2 animate-pulse rounded-sm bg-indigo-400 align-middle" />
                      )}
                    </div>
                    {m.role === "assistant" && streamingMessageId !== m.id && (
                      <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                        <button
                          type="button"
                          onClick={() => sendFeedback(m.id, "up")}
                          disabled={m.feedback === "up"}
                          className={`inline-flex items-center gap-1 ${m.feedback === "up" ? "text-indigo-600" : "hover:text-foreground"}`}
                          aria-label={t("Helpful", "Utile")}
                        >
                          <ThumbsUp className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => sendFeedback(m.id, "down")}
                          disabled={m.feedback === "down"}
                          className={`inline-flex items-center gap-1 ${m.feedback === "down" ? "text-rose-600" : "hover:text-foreground"}`}
                          aria-label={t("Not helpful", "Pas utile")}
                        >
                          <ThumbsDown className="h-4 w-4" />
                        </button>
                        {m.feedback && <span>{t("Thanks for the feedback.", "Merci pour votre retour.")}</span>}
                      </div>
                    )}
                    {m.content?.trim().length > 0 && streamingMessageId !== m.id && (
                      <p className="mt-2 text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
                        {formatTime(m.ts)}
                      </p>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
        <div className="sticky bottom-0 mt-6 border-t border-border/40 bg-background/90 pb-6 pt-4 backdrop-blur">
          <div className="mx-auto flex max-w-[680px] flex-col gap-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <textarea
                id="assistant-input"
                ref={inputRef}
                rows={3}
                className="flex-1 resize-none rounded-2xl border border-border/60 bg-background px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-indigo-400"
                placeholder={t("Ask about automations, invoices, revenue, or insights...", "Demandez sur automatisations, factures, revenus ou insights...")}
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  resizeInput();
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
              />
              <Button className="w-full rounded-full sm:w-auto" onClick={send} loading={loading}>
                {t("Send", "Envoyer")}
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-5 text-[11px] text-muted-foreground">
              <div className="flex flex-wrap items-center gap-2">
                <span className="uppercase tracking-[0.2em]">{t("Model", "Modele")}</span>
                <div className="relative" ref={modelMenuRef}>
                  <button
                    type="button"
                    onClick={() => setModelMenuOpen((prev) => !prev)}
                    className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background px-3 py-1 text-[11px] font-semibold text-foreground"
                    aria-haspopup="listbox"
                    aria-expanded={modelMenuOpen}
                  >
                    {model === "maboria-2" ? t("Maboria 2", "Maboria 2") : t("Maboria 1", "Maboria 1")}
                    <span className="text-[10px] text-muted-foreground">▾</span>
                  </button>
                  {modelMenuOpen && (
                    <div
                      role="listbox"
                      className="absolute z-20 mt-2 w-48 rounded-xl border border-border/60 bg-background p-1 text-[11px] shadow-[0_8px_20px_rgba(15,23,42,0.12)]"
                    >
                      {[
                        {
                          value: "maboria-1",
                          label: t("Maboria 1", "Maboria 1"),
                          desc: t(
                            "Fast responses. Best for quick actions and simple questions.",
                            "Reponses rapides. Ideales pour actions rapides et questions simples."
                          ),
                        },
                        {
                          value: "maboria-2",
                          label: t("Maboria 2", "Maboria 2"),
                          desc: t(
                            "Deeper reasoning. Slower responses, more detailed analysis.",
                            "Raisonnement plus profond. Reponses plus lentes, analyse detaillee."
                          ),
                        },
                      ].map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          role="option"
                          aria-selected={model === option.value}
                          onMouseEnter={() => setModelTooltip(option.value as "maboria-1" | "maboria-2")}
                          onMouseLeave={() => setModelTooltip(null)}
                          onFocus={() => setModelTooltip(option.value as "maboria-1" | "maboria-2")}
                          onBlur={() => setModelTooltip(null)}
                          onPointerDown={() => setModelTooltip(option.value as "maboria-1" | "maboria-2")}
                          onTouchStart={() => setModelTooltip(option.value as "maboria-1" | "maboria-2")}
                          onTouchEnd={() => setModelTooltip(null)}
                          onClick={() => {
                            setModel(option.value);
                            setModelMenuOpen(false);
                            setModelTooltip(null);
                          }}
                          className={`relative flex w-full items-center justify-between rounded-lg px-3 py-2 text-left ${
                            model === option.value ? "bg-muted/60 text-foreground" : "hover:bg-muted/40"
                          }`}
                        >
                          <span className="font-medium text-foreground">{option.label}</span>
                          {modelTooltip === option.value && (
                            <span
                              role="tooltip"
                              className="absolute left-full top-1/2 ml-2 w-52 -translate-y-1/2 rounded-lg border border-border/60 bg-background px-2 py-1 text-[11px] text-muted-foreground shadow-[0_8px_18px_rgba(15,23,42,0.12)]"
                            >
                              {option.desc}
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="uppercase tracking-[0.2em]">{t("Style", "Style")}</span>
                <span
                  className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-border/60 text-muted-foreground"
                  title={t("Brief is concise. Detailed adds steps and examples.", "Bref est concis. Detaille ajoute etapes et exemples.")}
                >
                  <Info className="h-3 w-3" />
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => savePreferences({ style: "brief" })}
                  className={`h-7 rounded-full px-3 text-[11px] font-semibold ${
                    style === "brief" ? "border border-border/60 text-indigo-600" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {t("Brief", "Bref")}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => savePreferences({ style: "detailed" })}
                  className={`h-7 rounded-full px-3 text-[11px] font-semibold ${
                    style === "detailed" ? "border border-border/60 text-indigo-600" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {t("Detailed", "Detaille")}
                </Button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="uppercase tracking-[0.2em]">{t("Tone", "Ton")}</span>
                <span
                  className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-border/60 text-muted-foreground"
                  title={t("Balanced is neutral. Direct is crisp. Warm is friendly.", "Equilibre est neutre. Direct est precis. Chaleureux est amical.")}
                >
                  <Info className="h-3 w-3" />
                </span>
                <select
                  className="rounded-full border border-border/60 bg-background px-3 py-1 text-[11px] font-semibold text-foreground"
                  value={tone}
                  onChange={(e) => savePreferences({ tone: e.target.value as AiTone })}
                >
                  <option value="balanced">{t("Balanced", "Equilibre")}</option>
                  <option value="direct">{t("Direct", "Direct")}</option>
                  <option value="warm">{t("Warm", "Chaleureux")}</option>
                </select>
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">
              {t(
                "Responses are generated automatically. Verify important details before acting.",
                "Les reponses sont generees automatiquement. Verifiez les details avant d agir."
              )}
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
