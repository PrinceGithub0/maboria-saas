"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Card } from "../ui/card";
import { AnimatePresence, motion } from "framer-motion";
import { Skeleton } from "../ui/skeleton";

type Message = { role: "user" | "assistant"; content: string; ts?: number };

export function AssistantChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages, loading]);

  const send = async () => {
    if (!input) return;
    const message: Message = { role: "user", content: input, ts: Date.now() };
    setMessages((prev) => [...prev, message]);
    setLoading(true);
    setStatus(null);
    const res = await fetch("/api/ai/assistant", {
      method: "POST",
      body: JSON.stringify({ mode: "assistant", prompt: input }),
    });
    const data = await res.json();
    if (!res.ok) {
      if (data.type === "upgrade_required") {
        setStatus(`${data.error || "Upgrade required."} Required plan: Pro.`);
      } else if (data.type === "limit_reached") {
        setStatus(`${data.error || "AI limit reached."} Required plan: Pro.`);
      } else {
        setStatus(data.error || "Assistant is unavailable right now.");
      }
    } else {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.answer || "...", ts: Date.now() },
      ]);
    }
    setInput("");
    setLoading(false);
  };

  return (
    <Card title="AI Assistant">
      <div className="space-y-4">
        {status && <p className="text-sm text-foreground">{status}</p>}
        <div
          ref={listRef}
          className="max-h-96 space-y-2 overflow-y-auto rounded-xl border border-border bg-background p-4"
        >
          <AnimatePresence>
            {messages.map((m, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className={`flex ${m.role === "assistant" ? "justify-start" : "justify-end"}`}
              >
                <div
                  className={`max-w-md rounded-2xl px-3 py-2 text-sm shadow ${
                    m.role === "assistant"
                      ? "bg-muted text-foreground"
                      : "bg-indigo-600 text-white"
                  }`}
                >
                  <p>{m.content}</p>
                  <p className="mt-1 text-[10px] uppercase text-muted-foreground">
                    {m.ts ? new Date(m.ts).toLocaleTimeString() : ""}
                  </p>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
          {loading && <Skeleton className="h-6 w-24" />}
          {messages.length === 0 && (
            <p className="text-sm text-muted-foreground">Ask about automations, revenue, or invoices.</p>
          )}
        </div>
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
      </div>
    </Card>
  );
}
