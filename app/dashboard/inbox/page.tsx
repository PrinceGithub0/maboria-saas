"use client";

import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Send, Phone, RefreshCw } from "lucide-react";
import { useLanguage } from "@/components/providers/language-provider";
import { formatDateTimeDMY } from "@/lib/date";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type Conversation = {
  id: string;
  customerPhone: string;
  status: string;
  lastMessageAt?: string | null;
  lastReadAt?: string | null;
  channel: string;
  lastMessage?: { content?: string | null };
};

type Message = {
  id: string;
  direction: "INBOUND" | "OUTBOUND";
  content: string;
  status: string;
  createdAt: string;
};

export default function InboxPage() {
  const { language } = useLanguage();
  const t = (en: string, fr: string) => (language === "fr" ? fr : en);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState<{ message: string; variant: "success" | "error" | "warning" | "info" } | null>(null);
  const [sending, setSending] = useState(false);

  const {
    data: conversations,
    error,
    isLoading,
    mutate,
  } = useSWR<Conversation[]>("/api/whatsapp/conversations", fetcher, {
    fallbackData: [],
    shouldRetryOnError: false,
  });

  const {
    data: thread,
    error: threadError,
    isLoading: threadLoading,
    mutate: mutateThread,
  } = useSWR(activeId ? `/api/whatsapp/conversations/${activeId}` : null, fetcher, {
    shouldRetryOnError: false,
  });

  useEffect(() => {
    if (!activeId && Array.isArray(conversations) && conversations.length > 0) {
      setActiveId(conversations[0].id);
    }
  }, [activeId, conversations]);

  const filtered = useMemo(() => {
    if (!Array.isArray(conversations)) return [];
    const q = query.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter((conv) => {
      const phone = conv.customerPhone.toLowerCase();
      const last = conv.lastMessage?.content?.toLowerCase() || "";
      return phone.includes(q) || last.includes(q);
    });
  }, [conversations, query]);

  const messages: Message[] = Array.isArray(thread?.messages) ? thread.messages : [];
  const selected = filtered.find((c) => c.id === activeId) || (Array.isArray(conversations) ? conversations.find((c) => c.id === activeId) : undefined);

  const formatTime = (value?: string | null) => {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return formatDateTimeDMY(date);
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
    try {
      const res = await fetch(`/api/whatsapp/conversations/${activeId}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus({ message: data?.error || t("Failed to send message.", "Echec de l envoi du message."), variant: "error" });
      } else if (data?.skipped) {
        setStatus({ message: t("WhatsApp sending is disabled.", "Envoi WhatsApp desactive."), variant: "warning" });
      } else {
        setStatus({ message: t("Message sent.", "Message envoye."), variant: "success" });
        setDraft("");
        await mutateThread();
        await mutate();
      }
    } catch (err: any) {
      setStatus({ message: err?.message || t("Failed to send message.", "Echec de l envoi du message."), variant: "error" });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-indigo-600 dark:text-indigo-300">
          {t("Inbox", "Boite de reception")}
        </p>
        <h1 className="text-3xl font-semibold text-foreground">
          {t("WhatsApp conversations", "Conversations WhatsApp")}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t(
            "Review customer messages, reply instantly, and keep a clean audit trail.",
            "Consultez les messages clients, repondez instantanement et gardez un suivi clair."
          )}
        </p>
      </div>

      {(error || threadError) && (
        <Alert variant="error">
          {error?.message || threadError?.message || t("Could not load WhatsApp inbox.", "Impossible de charger la boite WhatsApp.")}
        </Alert>
      )}

      {status && <Alert variant={status.variant}>{status.message}</Alert>}

      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <Card title={t("Conversations", "Conversations")}>
          <div className="space-y-3">
            <Input
              label={t("Search", "Recherche")}
              placeholder={t("Search by phone or message", "Rechercher par numero ou message")}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <div className="space-y-2">
              {isLoading ? (
                <div className="text-sm text-muted-foreground">{t("Loading conversations...", "Chargement des conversations...")}</div>
              ) : filtered.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border bg-muted/40 p-4 text-sm text-muted-foreground">
                  {t("No conversations yet.", "Aucune conversation pour le moment.")}
                </div>
              ) : (
                filtered.map((conv) => {
                  const unread =
                    conv.lastMessageAt &&
                    (!conv.lastReadAt ||
                      new Date(conv.lastMessageAt).getTime() > new Date(conv.lastReadAt).getTime());
                  const active = conv.id === activeId;
                  return (
                    <button
                      key={conv.id}
                      onClick={() => {
                        setActiveId(conv.id);
                        setStatus(null);
                      }}
                      className={`w-full rounded-xl border px-4 py-3 text-left transition ${
                        active
                          ? "border-indigo-500/50 bg-indigo-500/10"
                          : "border-border bg-card hover:border-indigo-500/30"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-semibold text-foreground">{conv.customerPhone}</p>
                          <p className="text-xs text-muted-foreground line-clamp-1">
                            {conv.lastMessage?.content || t("No messages yet", "Pas encore de messages")}
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <Badge>{conv.status}</Badge>
                          {unread ? <span className="h-2 w-2 rounded-full bg-indigo-500" /> : null}
                        </div>
                      </div>
                      <div className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground">
                        <Phone className="h-3 w-3" />
                        {t("Last message", "Dernier message")} {formatTime(conv.lastMessageAt)}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </Card>

        <Card
          title={
            selected
              ? t("Conversation with", "Conversation avec") + ` ${selected.customerPhone}`
              : t("Select a conversation", "Selectionner une conversation")
          }
          actions={
            selected ? (
              <div className="flex items-center gap-2">
                <Button variant="secondary" size="sm" onClick={markRead}>
                  {t("Mark read", "Marquer lu")}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => mutateThread()}>
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </div>
            ) : null
          }
        >
          {!selected ? (
            <div className="rounded-xl border border-dashed border-border bg-muted/40 p-6 text-sm text-muted-foreground">
              {t("Choose a conversation to view messages.", "Choisissez une conversation pour voir les messages.")}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="max-h-[520px] space-y-3 overflow-y-auto rounded-2xl border border-border bg-muted/40 p-4">
                {threadLoading ? (
                  <p className="text-sm text-muted-foreground">{t("Loading messages...", "Chargement des messages...")}</p>
                ) : messages.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("No messages yet.", "Pas encore de messages.")}</p>
                ) : (
                  messages.map((msg) => {
                    const outbound = msg.direction === "OUTBOUND";
                    return (
                      <div
                        key={msg.id}
                        className={`max-w-[80%] rounded-2xl border px-4 py-3 text-sm shadow-sm ${
                          outbound
                            ? "ml-auto border-indigo-500/40 bg-indigo-600 text-white"
                            : "mr-auto border-border bg-card text-foreground"
                        }`}
                      >
                        <p className="whitespace-pre-wrap">{msg.content}</p>
                        <div className={`mt-2 text-[11px] ${outbound ? "text-white/70" : "text-muted-foreground"}`}>
                          {msg.status.toLowerCase()} - {formatTime(msg.createdAt)}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              <div className="space-y-3">
                <Textarea
                  placeholder={t("Write a reply", "Ecrire une reponse")}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                />
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs text-muted-foreground">
                    {t("Replies are sent via WhatsApp Cloud API.", "Les reponses sont envoyees via WhatsApp Cloud API.")}
                  </div>
                  <Button onClick={sendReply} loading={sending} disabled={!draft.trim()}>
                    <Send className="h-4 w-4" />
                    {t("Send reply", "Envoyer")}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
