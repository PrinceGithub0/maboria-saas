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
import { useLanguage } from "@/components/providers/language-provider";

type FaqCategoryId =
  | "what"
  | "who"
  | "account"
  | "payments"
  | "invoices"
  | "ai"
  | "whatsapp"
  | "twofactor"
  | "security"
  | "support";

type FaqItem = {
  id: string;
  categoryId: FaqCategoryId;
  question: { en: string; fr: string };
  answer: { en: string; fr: string };
};

const iconByCategory: Record<FaqCategoryId, React.ComponentType<{ className?: string }>> = {
  what: Bot,
  who: UserPlus,
  account: ShieldCheck,
  payments: CreditCard,
  invoices: FileText,
  ai: Bot,
  whatsapp: MessageSquare,
  twofactor: Lock,
  security: ShieldCheck,
  support: LifeBuoy,
};

const categories: Array<{ id: FaqCategoryId; label: { en: string; fr: string } }> = [
  { id: "what", label: { en: "What Maboria Is", fr: "Qu est-ce que Maboria" } },
  { id: "who", label: { en: "Who It's For", fr: "Pour qui" } },
  { id: "account", label: { en: "Account & Workspace", fr: "Compte et espace" } },
  { id: "payments", label: { en: "Payments & Subscriptions", fr: "Paiements et abonnements" } },
  { id: "invoices", label: { en: "Invoices", fr: "Factures" } },
  { id: "ai", label: { en: "AI Assistant", fr: "Assistant IA" } },
  { id: "whatsapp", label: { en: "WhatsApp Automation", fr: "Automatisation WhatsApp" } },
  { id: "twofactor", label: { en: "Two-Factor Authentication", fr: "Authentification a deux facteurs" } },
  { id: "security", label: { en: "Security & Privacy", fr: "Securite et confidentialite" } },
  { id: "support", label: { en: "Support & Contact", fr: "Support et contact" } },
];

const faqs: FaqItem[] = [
  {
    id: "what-is",
    categoryId: "what",
    question: { en: "What is Maboria?", fr: "Qu est-ce que Maboria ?" },
    answer: {
      en: "Maboria is a web app for managing workflows, customers, invoices, payments, subscriptions, and notifications in one place. It's built for modern businesses. You use it from a dashboard after signing in.",
      fr: "Maboria est une application pour gerer workflows, clients, factures, paiements, abonnements et notifications au meme endroit. Elle est adaptee aux entreprises modernes. Vous l utilisez depuis un tableau de bord apres connexion.",
    },
  },
  {
    id: "who-for",
    categoryId: "who",
    question: { en: "Who is Maboria for?", fr: "Pour qui est Maboria ?" },
    answer: {
      en: "Maboria is for non-technical business owners and teams who want to automate repetitive tasks and keep billing and customer operations organized. It fits SMEs, startups, and growing companies that need clear visibility and control.",
      fr: "Maboria est pour les equipes non techniques qui veulent automatiser les taches repetitives et garder la facturation et les operations clients organisees. Cela convient aux PME, startups et entreprises en croissance.",
    },
  },
  {
    id: "setup",
    categoryId: "account",
    question: { en: "How do I set up my account and workspace?", fr: "Comment configurer mon compte et mon espace ?" },
    answer: {
      en: "Create an account with your email and password, then complete onboarding to add your business details and preferences. Your workspace keeps your invoices, payments, automations, and activity in one place. You can add team access when needed.",
      fr: "Creez un compte avec votre email et mot de passe, puis terminez l onboarding pour ajouter vos details. L espace regroupe factures, paiements, automatisations et activite. Vous pouvez inviter l equipe si besoin.",
    },
  },
  {
    id: "billing",
    categoryId: "payments",
    question: { en: "How do payments and subscriptions work?", fr: "Comment fonctionnent les paiements et abonnements ?" },
    answer: {
      en: "Maboria supports billing through configured payment providers and stores payment and subscription records in your account. You can see your subscription status and billing history in the dashboard. If a payment fails, the status is recorded so you can follow up.",
      fr: "Maboria gere la facturation via les prestataires configures et conserve les paiements et abonnements dans votre compte. Vous voyez le statut et l historique dans le tableau de bord. En cas d echec, le statut est conserve.",
    },
  },
  {
    id: "invoice-create",
    categoryId: "invoices",
    question: { en: "Can I create and track invoices?", fr: "Puis-je creer et suivre des factures ?" },
    answer: {
      en: "Yes. You can create invoices with line items, currency, totals, and status. All invoices are stored in your invoice history so you can review paid/unpaid states and timelines.",
      fr: "Oui. Vous pouvez creer des factures avec lignes, devise, totaux et statut. Toutes les factures restent dans l historique pour suivre les etats paye ou impaye.",
    },
  },
  {
    id: "ai",
    categoryId: "ai",
    question: { en: "What can the AI assistant do for me?", fr: "Que peut faire l assistant IA ?" },
    answer: {
      en: "The AI assistant helps you draft and improve automation workflows and can help explain issues when runs fail. It can also help with internal workflow ideas and operational questions. AI usage is tracked so you can monitor activity.",
      fr: "L assistant IA aide a creer et ameliorer les automatisations et a comprendre les echecs d execution. Il aide aussi pour des idees de workflows internes. L usage IA est suivi pour supervision.",
    },
  },
  {
    id: "whatsapp",
    categoryId: "whatsapp",
    question: { en: "How does WhatsApp automation work?", fr: "Comment fonctionne l automatisation WhatsApp ?" },
    answer: {
      en: "You can include WhatsApp notifications as part of automations to message customers or your team. Messages are triggered by your workflows and can be used for reminders and operational updates. Delivery depends on the WhatsApp messaging setup connected to your workspace.",
      fr: "Vous pouvez ajouter des notifications WhatsApp dans vos automatisations pour contacter clients ou equipe. Les messages sont declenches par vos workflows et servent aux rappels et mises a jour. La livraison depend de la configuration WhatsApp.",
    },
  },
  {
    id: "2fa",
    categoryId: "twofactor",
    question: { en: "Does Maboria support two-factor authentication (2FA)?", fr: "Maboria supporte-t-il la 2FA ?" },
    answer: {
      en: "Yes. You can enable an extra verification step for your account using one-time codes. If you lose access, you can use account recovery options such as password reset and backup codes (if enabled).",
      fr: "Oui. Vous pouvez activer une verification supplementaire avec des codes temporaires. En cas de perte d acces, vous pouvez utiliser la recuperation de compte comme la reinitialisation et les codes de secours (si actives).",
    },
  },
  {
    id: "security",
    categoryId: "security",
    question: { en: "How is my data protected?", fr: "Comment mes donnees sont-elles protegees ?" },
    answer: {
      en: "Your account is protected with authentication and role-based access controls, and sensitive areas are restricted to authorized users. Maboria stores your business data securely and logs key events for auditing. Only users you add to your workspace can access your business data.",
      fr: "Votre compte est protege par l authentification et des roles. Les zones sensibles sont limitees aux utilisateurs autorises. Maboria stocke vos donnees de facon securisee et journalise les evenements cle. Seuls les membres ajoutes a votre espace peuvent y acceder.",
    },
  },
  {
    id: "support",
    categoryId: "support",
    question: { en: "How do I get help if something isn't working?", fr: "Comment obtenir de l aide ?" },
    answer: {
      en: "Use the Support Center to review common questions and submit a support request. Share what you were trying to do and what you saw on screen so issues can be resolved quickly. You can also check the Status page to confirm system health.",
      fr: "Utilisez le centre de support pour consulter les questions courantes et envoyer une demande. Decrivez ce que vous faisiez et ce que vous voyiez a l ecran. Vous pouvez aussi verifier la page Statut.",
    },
  },
];

export function FAQSection() {
  const { language } = useLanguage();
  const t = (en: string, fr: string) => (language === "fr" ? fr : en);
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<FaqCategoryId>("what");
  const [activeId, setActiveId] = useState<string>("what-is");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return faqs.filter((item) => {
      if (item.categoryId !== activeCategory) return false;
      if (!q) return true;
      const question = item.question[language].toLowerCase();
      const answer = item.answer[language].toLowerCase();
      return question.includes(q) || answer.includes(q);
    });
  }, [activeCategory, language, query]);

  const active = useMemo(() => {
    const inCategory = filtered.find((f) => f.id === activeId);
    return inCategory ?? filtered[0] ?? faqs.find((f) => f.categoryId === activeCategory) ?? faqs[0];
  }, [activeCategory, activeId, filtered]);

  const ActiveIcon = iconByCategory[active.categoryId];
  const activeCategoryLabel =
    categories.find((cat) => cat.id === active.categoryId)?.label[language] ?? "";

  return (
    <section className="relative overflow-hidden rounded-2xl border border-border bg-card/70 p-6">
      <div className="pointer-events-none absolute -top-24 left-1/2 h-64 w-[520px] -translate-x-1/2 rounded-full bg-indigo-500/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-28 right-0 h-72 w-72 rounded-full bg-emerald-500/10 blur-3xl" />

      <div className="relative">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-indigo-600 dark:text-indigo-300">
              {t("FAQ", "FAQ")}
            </p>
            <h2 className="mt-2 text-xl font-semibold text-foreground">
              {t("Quick answers", "Reponses rapides")}
            </h2>
            <p className="mt-1 max-w-xl text-sm text-muted-foreground">
              {t(
                "Clear explanations for common questions. Choose a topic, then pick a question.",
                "Des reponses claires pour les questions courantes. Choisissez un sujet, puis une question."
              )}
            </p>
          </div>

          <div className="relative w-full lg:max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("Search questions...", "Rechercher des questions...")}
              className="w-full rounded-xl border border-input bg-background px-9 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-400 focus:outline-none"
              aria-label={t("Search FAQ", "Rechercher dans la FAQ")}
            />
          </div>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-[240px_360px_1fr]">
          <div className="rounded-2xl border border-border bg-background/60 p-3">
            <p className="px-2 pb-2 text-xs font-semibold text-muted-foreground">
              {t("Topics", "Sujets")}
            </p>
            <div className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible">
              {categories.map((cat) => {
                const CatIcon = iconByCategory[cat.id];
                const selected = cat.id === activeCategory;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => {
                      setActiveCategory(cat.id);
                      setActiveId(faqs.find((f) => f.categoryId === cat.id)?.id ?? "");
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
                    <span className="whitespace-nowrap">{cat.label[language]}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-background/60">
            <div className="border-b border-border px-4 py-3">
              <p className="text-xs font-semibold text-muted-foreground">
                {t("Questions", "Questions")}
              </p>
            </div>
            <div className="max-h-[340px] overflow-auto p-2 lg:max-h-[520px]">
              {filtered.length === 0 ? (
                <div className="rounded-xl border border-border bg-background/70 p-4 text-sm text-muted-foreground">
                  {t(
                    "No matches in this topic. Try a different search.",
                    "Aucun resultat dans ce sujet. Essayez une autre recherche."
                  )}
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
                        <p className="text-sm font-semibold text-foreground">
                          {item.question[language]}
                        </p>
                        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                          {item.answer[language]}
                        </p>
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
                  <p className="text-xs font-semibold text-muted-foreground">{activeCategoryLabel}</p>
                  <h3 className="text-lg font-semibold text-foreground">
                    {active.question[language]}
                  </h3>
                </div>
              </div>
            </div>

            <div
              id={`faq-answer-${active.id}`}
              className="mt-4 rounded-xl border border-border bg-background/70 p-4 text-sm leading-relaxed text-muted-foreground transition"
            >
              {active.answer[language]}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
