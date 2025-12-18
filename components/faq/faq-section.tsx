"use client";

import { useMemo, useState } from "react";
import clsx from "clsx";
import {
  Bot,
  CreditCard,
  FileText,
  LifeBuoy,
  Lock,
  MessageSquare,
  Search,
  ShieldCheck,
  UserPlus,
} from "lucide-react";

type FaqCategory =
  | "What Maboria Is"
  | "Who It's For"
  | "Account & Workspace"
  | "Payments & Subscriptions"
  | "Invoices"
  | "AI Assistant"
  | "WhatsApp Automation"
  | "Two-Factor Authentication"
  | "Security & Privacy"
  | "Support & Contact";

type FaqItem = {
  id: string;
  category: FaqCategory;
  question: string;
  answer: string;
};

const iconByCategory: Record<FaqCategory, React.ComponentType<{ className?: string }>> = {
  "What Maboria Is": Bot,
  "Who It's For": UserPlus,
  "Account & Workspace": ShieldCheck,
  "Payments & Subscriptions": CreditCard,
  Invoices: FileText,
  "AI Assistant": Bot,
  "WhatsApp Automation": MessageSquare,
  "Two-Factor Authentication": Lock,
  "Security & Privacy": ShieldCheck,
  "Support & Contact": LifeBuoy,
};

const faqs: FaqItem[] = [
  {
    id: "what-is",
    category: "What Maboria Is",
    question: "What is Maboria?",
    answer:
      "Maboria is a web app for managing workflows, customers, invoices, payments, subscriptions, and notifications in one place. It's built for African businesses, starting with Nigeria. You use it from a dashboard after signing in.",
  },
  {
    id: "who-for",
    category: "Who It's For",
    question: "Who is Maboria for?",
    answer:
      "Maboria is for non-technical business owners and teams who want to automate repetitive tasks and keep billing and customer operations organized. It fits SMEs, startups, and growing companies that need clear visibility and control.",
  },
  {
    id: "setup",
    category: "Account & Workspace",
    question: "How do I set up my account and workspace?",
    answer:
      "Create an account with your email and password, then complete onboarding to add your business details and preferences. Your workspace keeps your invoices, payments, automations, and activity in one place. You can add team access when needed.",
  },
  {
    id: "billing",
    category: "Payments & Subscriptions",
    question: "How do payments and subscriptions work?",
    answer:
      "Maboria supports billing through configured payment providers and stores payment and subscription records in your account. You can see your subscription status and billing history in the dashboard. If a payment fails, the status is recorded so you can follow up.",
  },
  {
    id: "invoice-create",
    category: "Invoices",
    question: "Can I create and track invoices?",
    answer:
      "Yes. You can create invoices with line items, currency, totals, and status. All invoices are stored in your invoice history so you can review paid/unpaid states and timelines.",
  },
  {
    id: "ai",
    category: "AI Assistant",
    question: "What can the AI assistant do for me?",
    answer:
      "The AI assistant helps you draft and improve automation workflows and can help explain issues when runs fail. It can also help with internal workflow ideas and operational questions. AI usage is tracked so you can monitor activity.",
  },
  {
    id: "whatsapp",
    category: "WhatsApp Automation",
    question: "How does WhatsApp automation work?",
    answer:
      "You can include WhatsApp notifications as part of automations to message customers or your team. Messages are triggered by your workflows and can be used for reminders and operational updates. Delivery depends on the WhatsApp messaging setup connected to your workspace.",
  },
  {
    id: "2fa",
    category: "Two-Factor Authentication",
    question: "Does Maboria support two-factor authentication (2FA)?",
    answer:
      "Yes. You can enable an extra verification step for your account using one-time codes. If you lose access, you can use account recovery options such as password reset and backup codes (if enabled).",
  },
  {
    id: "security",
    category: "Security & Privacy",
    question: "How is my data protected?",
    answer:
      "Your account is protected with authentication and role-based access controls, and sensitive areas are restricted to authorized users. Maboria stores your business data securely and logs key events for auditing. Only users you add to your workspace can access your business data.",
  },
  {
    id: "support",
    category: "Support & Contact",
    question: "How do I get help if something isn't working?",
    answer:
      "Use the Support Center to review common questions and submit a support request. Share what you were trying to do and what you saw on screen so issues can be resolved quickly. You can also check the Status page to confirm system health.",
  },
];

const categories: FaqCategory[] = [
  "What Maboria Is",
  "Who It's For",
  "Account & Workspace",
  "Payments & Subscriptions",
  "Invoices",
  "AI Assistant",
  "WhatsApp Automation",
  "Two-Factor Authentication",
  "Security & Privacy",
  "Support & Contact",
];

export function FAQSection() {
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<FaqCategory>("What Maboria Is");
  const [activeId, setActiveId] = useState<string>("what-is");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return faqs.filter((item) => {
      if (item.category !== activeCategory) return false;
      if (!q) return true;
      return item.question.toLowerCase().includes(q) || item.answer.toLowerCase().includes(q);
    });
  }, [activeCategory, query]);

  const active = useMemo(() => {
    const inCategory = filtered.find((f) => f.id === activeId);
    return inCategory ?? filtered[0] ?? faqs.find((f) => f.category === activeCategory) ?? faqs[0];
  }, [activeCategory, activeId, filtered]);

  const ActiveIcon = iconByCategory[active.category];

  return (
    <section className="relative overflow-hidden rounded-2xl border border-border bg-card/70 p-6">
      <div className="pointer-events-none absolute -top-24 left-1/2 h-64 w-[520px] -translate-x-1/2 rounded-full bg-indigo-500/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-28 right-0 h-72 w-72 rounded-full bg-emerald-500/10 blur-3xl" />

      <div className="relative">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-indigo-600 dark:text-indigo-300">FAQ</p>
            <h2 className="mt-2 text-xl font-semibold text-foreground">Quick answers</h2>
            <p className="mt-1 max-w-xl text-sm text-muted-foreground">
              Clear explanations for common questions. Choose a topic, then pick a question.
            </p>
          </div>

          <div className="relative w-full lg:max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search questions..."
              className="w-full rounded-xl border border-input bg-background px-9 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-400 focus:outline-none"
              aria-label="Search FAQ"
            />
          </div>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-[240px_360px_1fr]">
          <div className="rounded-2xl border border-border bg-background/60 p-3">
            <p className="px-2 pb-2 text-xs font-semibold text-muted-foreground">Topics</p>
            <div className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible">
              {categories.map((cat) => {
                const CatIcon = iconByCategory[cat];
                const selected = cat === activeCategory;
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => {
                      setActiveCategory(cat);
                      setActiveId(faqs.find((f) => f.category === cat)?.id ?? "");
                    }}
                    className={clsx(
                      "group flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-left text-sm transition focus:outline-none focus:ring-2 focus:ring-indigo-500/40",
                      selected
                        ? "bg-indigo-500/10 text-foreground ring-1 ring-indigo-500/30"
                        : "text-muted-foreground hover:bg-muted/60"
                    )}
                    aria-current={selected ? "page" : undefined}
                  >
                    <CatIcon
                      className={clsx(
                        "h-4 w-4",
                        selected ? "text-indigo-600 dark:text-indigo-300" : "text-muted-foreground"
                      )}
                    />
                    <span className="whitespace-nowrap">{cat}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-background/60">
            <div className="border-b border-border px-4 py-3">
              <p className="text-xs font-semibold text-muted-foreground">Questions</p>
            </div>
            <div className="max-h-[340px] overflow-auto p-2 lg:max-h-[520px]">
              {filtered.length === 0 ? (
                <div className="rounded-xl border border-border bg-background/70 p-4 text-sm text-muted-foreground">
                  No matches in this topic. Try a different search.
                </div>
              ) : (
                <div className="space-y-2">
                  {filtered.map((item) => {
                    const selected = item.id === active.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setActiveId(item.id)}
                        className={clsx(
                          "w-full rounded-xl border px-3 py-3 text-left transition focus:outline-none focus:ring-2 focus:ring-indigo-500/40",
                          selected ? "border-indigo-500/40 bg-indigo-500/10" : "border-border bg-background/60 hover:bg-muted/50"
                        )}
                        aria-expanded={selected}
                        aria-controls={`faq-answer-${item.id}`}
                      >
                        <p className="text-sm font-semibold text-foreground">{item.question}</p>
                        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{item.answer}</p>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-background/60 p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-indigo-500/10 text-indigo-600 ring-1 ring-indigo-500/20 dark:text-indigo-300">
                  <ActiveIcon className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-muted-foreground">{active.category}</p>
                  <h3 className="text-lg font-semibold text-foreground">{active.question}</h3>
                </div>
              </div>
            </div>

            <div
              id={`faq-answer-${active.id}`}
              className="mt-4 rounded-xl border border-border bg-background/70 p-4 text-sm leading-relaxed text-muted-foreground transition"
            >
              {active.answer}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

