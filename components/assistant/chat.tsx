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
    const res = await fetch("/api/ai/assistant", {
      method: "POST",
      body: JSON.stringify({ mode: "assistant", prompt: input }),
    });
    const data = await res.json();
    setMessages((prev) => [
      ...prev,
      { role: "assistant", content: data.answer || "...", ts: Date.now() },
    ]);
    setInput("");
    setLoading(false);
  };

  return (
    <Card title="AI Assistant">
      <div className="space-y-4">
        <div
          ref={listRef}
          className="max-h-96 overflow-y-auto rounded-xl border border-slate-800 bg-slate-950 p-4 space-y-2"
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
                      ? "bg-slate-900 text-slate-100"
                      : "bg-indigo-600 text-white"
                  }`}
                >
                  <p>{m.content}</p>
                  <p className="mt-1 text-[10px] uppercase text-slate-400">
                    {new Date(m.ts || Date.now()).toLocaleTimeString()}
                  </p>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
          {loading && <Skeleton className="h-6 w-24" />}
          {messages.length === 0 && (
            <p className="text-sm text-slate-500">Ask about automations, revenue, or invoices.</p>
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
