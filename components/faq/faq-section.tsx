"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { useLanguage } from "@/components/providers/language-provider";

type FaqItem = {
  question: { en: string; fr: string };
  answer: { en: string; fr: string };
};

type FaqSection = {
  id: string;
  title: { en: string; fr: string };
  meta: { en: string; fr: string };
  items: FaqItem[];
};

const faqSections: FaqSection[] = [
  {
    id: "what",
    title: { en: "What Maboria Is", fr: "What Maboria Is" },
    meta: { en: "What Maboria does and who it's for", fr: "What Maboria does and who it's for" },
    items: [
      {
        question: { en: "What is Maboria?", fr: "What is Maboria?" },
        answer: {
          en: "Maboria is a revenue automation platform that helps businesses invoice customers, collect payments, send WhatsApp messages, automate follow-ups, generate receipts, and track operations from one dashboard.",
          fr: "Maboria is a revenue automation platform that helps businesses invoice customers, collect payments, send WhatsApp messages, automate follow-ups, generate receipts, and track operations from one dashboard.",
        },
      },
      {
        question: { en: "Who is Maboria for?", fr: "Who is Maboria for?" },
        answer: {
          en: "Maboria is for businesses that want predictable cash flow without manually chasing customers - founders, operators, and teams managing invoicing and collections.",
          fr: "Maboria is for businesses that want predictable cash flow without manually chasing customers - founders, operators, and teams managing invoicing and collections.",
        },
      },
    ],
  },
  {
    id: "payments",
    title: { en: "Payments & Trust", fr: "Payments & Trust" },
    meta: { en: "How money flows and who handles it", fr: "How money flows and who handles it" },
    items: [
      {
        question: { en: "Does Maboria hold customer money?", fr: "Does Maboria hold customer money?" },
        answer: {
          en: "No. Maboria does not hold funds. Payments are processed by Paystack or Flutterwave and are paid directly into your connected business account or sub-account.",
          fr: "No. Maboria does not hold funds. Payments are processed by Paystack or Flutterwave and are paid directly into your connected business account or sub-account.",
        },
      },
      {
        question: { en: "Is Maboria a wallet or payment processor?", fr: "Is Maboria a wallet or payment processor?" },
        answer: {
          en: "No. Maboria is not a wallet. It automates invoicing and operations. Payment processing and settlements are handled entirely by Paystack or Flutterwave.",
          fr: "No. Maboria is not a wallet. It automates invoicing and operations. Payment processing and settlements are handled entirely by Paystack or Flutterwave.",
        },
      },
      {
        question: { en: "What happens when a customer pays an invoice?", fr: "What happens when a customer pays an invoice?" },
        answer: {
          en: "Maboria detects the payment instantly, updates the invoice status, issues a receipt automatically (if enabled), and triggers any follow-ups or reports you've configured.",
          fr: "Maboria detects the payment instantly, updates the invoice status, issues a receipt automatically (if enabled), and triggers any follow-ups or reports you've configured.",
        },
      },
    ],
  },
  {
    id: "subaccounts",
    title: { en: "Sub-Accounts & Payouts", fr: "Sub-Accounts & Payouts" },
    meta: { en: "Where funds settle and why it matters", fr: "Where funds settle and why it matters" },
    items: [
      {
        question: { en: "What is a sub-account in Maboria?", fr: "What is a sub-account in Maboria?" },
        answer: {
          en: "A sub-account is a payout destination connected through Paystack or Flutterwave. When customers pay, money goes directly into that account. Maboria does not store or delay funds.",
          fr: "A sub-account is a payout destination connected through Paystack or Flutterwave. When customers pay, money goes directly into that account. Maboria does not store or delay funds.",
        },
      },
      {
        question: { en: "Can payments go straight to my bank account?", fr: "Can payments go straight to my bank account?" },
        answer: {
          en: "Yes. Payments are settled directly to your connected business account or sub-account via the payment provider.",
          fr: "Yes. Payments are settled directly to your connected business account or sub-account via the payment provider.",
        },
      },
    ],
  },
  {
    id: "whatsapp",
    title: { en: "WhatsApp Messaging", fr: "WhatsApp Messaging" },
    meta: { en: "Messaging inside Maboria and automation rules", fr: "Messaging inside Maboria and automation rules" },
    items: [
      {
        question: { en: "Can I send WhatsApp messages from Maboria?", fr: "Can I send WhatsApp messages from Maboria?" },
        answer: {
          en: "Yes. You can send WhatsApp messages directly to customers from Maboria.",
          fr: "Yes. You can send WhatsApp messages directly to customers from Maboria.",
        },
      },
      {
        question: { en: "Can WhatsApp messages be automated?", fr: "Can WhatsApp messages be automated?" },
        answer: {
          en: "Yes. You can automate WhatsApp reminders, payment confirmations, and follow-ups based on invoice status or payment events.",
          fr: "Yes. You can automate WhatsApp reminders, payment confirmations, and follow-ups based on invoice status or payment events.",
        },
      },
      {
        question: { en: "Does Maboria have built-in email messaging?", fr: "Does Maboria have built-in email messaging?" },
        answer: {
          en: "Maboria's built-in communication channel is WhatsApp. Email notifications can be automated through integrations or workflows, but WhatsApp is the native channel inside the app.",
          fr: "Maboria's built-in communication channel is WhatsApp. Email notifications can be automated through integrations or workflows, but WhatsApp is the native channel inside the app.",
        },
      },
    ],
  },
  {
    id: "automation",
    title: { en: "Automation", fr: "Automation" },
    meta: { en: "What runs automatically once configured", fr: "What runs automatically once configured" },
    items: [
      {
        question: { en: "What can I automate with Maboria?", fr: "What can I automate with Maboria?" },
        answer: {
          en: "You can automate invoice creation, payment receipts, WhatsApp reminders, overdue follow-ups, reports, and operational workflows.",
          fr: "You can automate invoice creation, payment receipts, WhatsApp reminders, overdue follow-ups, reports, and operational workflows.",
        },
      },
      {
        question: { en: "Do automations run automatically once set up?", fr: "Do automations run automatically once set up?" },
        answer: {
          en: "Yes. Once configured, automations run quietly in the background without manual action.",
          fr: "Yes. Once configured, automations run quietly in the background without manual action.",
        },
      },
    ],
  },
  {
    id: "ai",
    title: { en: "AI Assistance", fr: "AI Assistance" },
    meta: { en: "Where AI helps and where it doesn't", fr: "Where AI helps and where it doesn't" },
    items: [
      {
        question: { en: "What does AI do in Maboria?", fr: "What does AI do in Maboria?" },
        answer: {
          en: "AI helps improve message wording, summarize activity, assist with automation setup, and reduce repetitive manual work.",
          fr: "AI helps improve message wording, summarize activity, assist with automation setup, and reduce repetitive manual work.",
        },
      },
      {
        question: { en: "Does AI act on its own?", fr: "Does AI act on its own?" },
        answer: {
          en: "No. AI assists and suggests. Actions only run based on rules you configure.",
          fr: "No. AI assists and suggests. Actions only run based on rules you configure.",
        },
      },
    ],
  },
  {
    id: "teams",
    title: { en: "Teams, Logs & Reports", fr: "Teams, Logs & Reports" },
    meta: { en: "Visibility, logs, and reporting", fr: "Visibility, logs, and reporting" },
    items: [
      {
        question: { en: "Can my team use Maboria together?", fr: "Can my team use Maboria together?" },
        answer: {
          en: "Yes. You can add team members and control access based on roles.",
          fr: "Yes. You can add team members and control access based on roles.",
        },
      },
      {
        question: { en: "Does Maboria keep activity logs?", fr: "Does Maboria keep activity logs?" },
        answer: {
          en: "Yes. Invoice activity, payment events, and automation execution are logged for visibility and tracking.",
          fr: "Yes. Invoice activity, payment events, and automation execution are logged for visibility and tracking.",
        },
      },
      {
        question: { en: "Can I export reports?", fr: "Can I export reports?" },
        answer: {
          en: "Yes. You can download usage analytics and activity history as CSV files.",
          fr: "Yes. You can download usage analytics and activity history as CSV files.",
        },
      },
    ],
  },
  {
    id: "security",
    title: { en: "Security & Reliability", fr: "Security & Reliability" },
    meta: { en: "Reliability and governance for teams", fr: "Reliability and governance for teams" },
    items: [
      {
        question: { en: "Is Maboria suitable for serious businesses?", fr: "Is Maboria suitable for serious businesses?" },
        answer: {
          en: "Yes. Maboria includes role-based access, audit logs, and operational visibility designed for teams that need reliability and control.",
          fr: "Yes. Maboria includes role-based access, audit logs, and operational visibility designed for teams that need reliability and control.",
        },
      },
    ],
  },
  {
    id: "pricing",
    title: { en: "Pricing", fr: "Pricing" },
    meta: { en: "Plan limits and upgrade behavior", fr: "Plan limits and upgrade behavior" },
    items: [
      {
        question: { en: "What determines plan limits?", fr: "What determines plan limits?" },
        answer: {
          en: "Plans are based on invoice volume, WhatsApp message usage, AI usage, automations, and number of team members.",
          fr: "Plans are based on invoice volume, WhatsApp message usage, AI usage, automations, and number of team members.",
        },
      },
      {
        question: { en: "Can I upgrade later?", fr: "Can I upgrade later?" },
        answer: {
          en: "Yes. You can change plans as your business grows.",
          fr: "Yes. You can change plans as your business grows.",
        },
      },
    ],
  },
  {
    id: "support",
    title: { en: "Support", fr: "Support" },
    meta: { en: "How to reach the team", fr: "How to reach the team" },
    items: [
      {
        question: { en: "Which email should I contact?", fr: "Quelle adresse email dois-je contacter ?" },
        answer: {
          en: "Support -> support@mail.maboria.com (app help and issues). Billing -> billing@maboria.com (subscriptions and payments). General -> info@maboria.com.",
          fr: "Support -> support@mail.maboria.com (aide et problemes). Facturation -> billing@maboria.com (abonnements et paiements). General -> info@maboria.com.",
        },
      },
      {
        question: { en: "When will you reply?", fr: "Quand repondez-vous ?" },
        answer: {
          en: "Usually within 24 hours.",
          fr: "Generalement sous 24 heures.",
        },
      },
    ],
  },
];

export function FAQSection() {
  const { language } = useLanguage();
  const t = (en: string, fr: string) => (language === "fr" ? fr : en);
  const [query, setQuery] = useState("");
  const highlightMatch = (text: string, needle: string) => {
    const q = needle.trim();
    if (!q) return text;
    const lower = text.toLowerCase();
    const lowerNeedle = q.toLowerCase();
    const parts: Array<string | { match: string }> = [];
    let start = 0;
    let index = lower.indexOf(lowerNeedle);
    while (index !== -1) {
      if (index > start) parts.push(text.slice(start, index));
      parts.push({ match: text.slice(index, index + q.length) });
      start = index + q.length;
      index = lower.indexOf(lowerNeedle, start);
    }
    if (start < text.length) parts.push(text.slice(start));
    return parts.map((part, i) =>
      typeof part === "string" ? (
        <span key={`text-${i}`}>{part}</span>
      ) : (
        <span key={`match-${i}`} className="faq-highlight">
          {part.match}
        </span>
      )
    );
  };
  const filteredSections = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return faqSections;
    return faqSections
      .map((section) => {
        const items = section.items.filter((item) => {
          const question = item.question[language].toLowerCase();
          const answer = item.answer[language].toLowerCase();
          return question.includes(q) || answer.includes(q);
        });
        return { ...section, items };
      })
      .filter((section) => section.items.length > 0);
  }, [language, query]);

  return (
    <section className="faq-container">
      <div className="flex flex-col items-center gap-5">
        <div className="space-y-2 text-center">
          <p className="faq-section-title">{t("FAQ", "FAQ")}</p>
          <h1 className="faq-title">{t("Frequently Asked Questions", "Frequently Asked Questions")}</h1>
          <p className="faq-updated">
            {t(
              "Clear answers about payments, automation, WhatsApp messaging, AI assistance, and how Maboria works.",
              "Clear answers about payments, automation, WhatsApp messaging, AI assistance, and how Maboria works."
            )}
          </p>
        </div>

        <div className="relative w-full md:max-w-sm mx-auto">
          <Search className="absolute left-6 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("Search questions...", "Search questions...")}
            className="faq-search"
            aria-label={t("Search questions...", "Search questions...")}
            style={{ paddingLeft: "3.75rem", paddingRight: "1rem" }}
          />
        </div>
      </div>

      <div className="mt-10 space-y-10 text-left">
        {filteredSections.length === 0 ? (
          <div className="text-sm text-muted-foreground">
            {t("No matching questions yet.", "No matching questions yet.")}
          </div>
        ) : (
          filteredSections.map((section) => (
            <div key={section.id}>
              <p className="faq-section-title">{section.title[language]}</p>
              <p className="text-sm text-muted-foreground">{section.meta[language]}</p>
              <div className="mt-4 space-y-5">
                {section.items.map((item) => (
                  <div key={item.question.en} className="space-y-2">
                    <p className="faq-question">
                      {highlightMatch(item.question[language], query)}
                    </p>
                    <p className="faq-answer">
                      {highlightMatch(item.answer[language], query)}
                    </p>
                    <div className="faq-divider" />
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      <div className="mt-12 text-center">
        <p className="text-lg font-semibold text-foreground">
          {t("Still have questions?", "Still have questions?")}
        </p>
        <div className="mt-4 flex justify-center">
          <a
            href="/signup"
            className="rounded-full bg-indigo-600 px-6 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500"
          >
            {t("Get started", "Get started")}
          </a>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          {t("Last updated: Feb 2026", "Last updated: Feb 2026")}
        </p>
      </div>
    </section>
  );
}

