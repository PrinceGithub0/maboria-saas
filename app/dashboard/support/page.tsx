"use client";

import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { useLanguage } from "@/components/providers/language-provider";
import { useTheme } from "@/components/providers/theme-provider";
import { CheckCircle2, Headset, Mail, Paperclip, X } from "lucide-react";
import Link from "next/link";
import useSWR from "swr";
import { formatDistanceToNow } from "date-fns";
import Image from "next/image";

type Urgency = "low" | "normal" | "high" | "critical";
type Ticket = {
  id: string;
  title: string;
  status: string;
  createdAt: string;
  message?: string;
  metadata?: Record<string, unknown> | null;
};

const CATEGORY_OPTIONS = [
  { value: "billing-payments", label: "Billing & Payments", labelFr: "Facturation et paiements" },
  { value: "invoices", label: "Invoices", labelFr: "Factures" },
  { value: "subscriptions", label: "Subscriptions", labelFr: "Abonnements" },
  { value: "automation", label: "Automation", labelFr: "Automatisation" },
  { value: "ai-assistant", label: "AI Assistant", labelFr: "Assistant IA" },
  { value: "account-security", label: "Account & Security", labelFr: "Compte et securite" },
  { value: "payouts", label: "Payouts", labelFr: "Decaissements" },
  { value: "business-profile", label: "Business Profile", labelFr: "Profil entreprise" },
  { value: "technical-issue", label: "Technical Issue", labelFr: "Probleme technique" },
  { value: "other", label: "Other", labelFr: "Autre" },
];

const parseTicketTitle = (rawTitle: string) => {
  const title = String(rawTitle || "");
  const match = title.match(/^\[(.+?)\]\s*(.+)$/);
  if (match) {
    return { category: match[1], subject: match[2] };
  }
  return { category: "Other", subject: title };
};

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to fetch tickets");
  return res.json();
};

export default function DashboardSupportPage() {
  const { language } = useLanguage();
  const { resolvedTheme } = useTheme();
  const t = (en: string, fr: string) => (language === "fr" ? fr : en);
  const forceLight = resolvedTheme === "light";
  const [form, setForm] = useState({
    category: CATEGORY_OPTIONS[0].value,
    urgency: "normal" as Urgency,
    subject: "",
    message: "",
  });
  const [status, setStatus] = useState<{ message: string; variant: "info" | "success" | "warning" | "error" } | null>(null);
  const [sending, setSending] = useState(false);
  const [errors, setErrors] = useState<{ subject?: string; message?: string }>({});
  const [attachment, setAttachment] = useState<File | null>(null);
  const [attachmentPreview, setAttachmentPreview] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const {
    data: tickets,
    mutate: refreshTickets,
    isLoading: loadingTickets,
  } = useSWR<Ticket[]>("/api/support", fetcher, { shouldRetryOnError: false });

  useEffect(() => {
    if (!attachment || attachment.type === "application/pdf") {
      setAttachmentPreview(null);
      return;
    }
    const nextPreview = URL.createObjectURL(attachment);
    setAttachmentPreview(nextPreview);
    return () => URL.revokeObjectURL(nextPreview);
  }, [attachment]);

  const avgResponseTime = useMemo(() => {
    if (!tickets || tickets.length === 0) return "2-4 hours";
    return tickets.length > 8 ? "2-4 hours" : "4-8 hours";
  }, [tickets]);

  const urgencyClassMap: Record<Urgency, string> = {
    low: "border-[#CBD5E1] bg-white text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200",
    normal:
      "border-blue-200 bg-blue-50 text-blue-700 font-bold dark:border-blue-500/40 dark:bg-blue-500/10 dark:text-blue-300",
    high: "border-orange-200 bg-orange-50 text-orange-700 font-bold dark:border-orange-500/40 dark:bg-orange-500/10 dark:text-orange-300",
    critical: "border-red-200 bg-red-50 text-red-700 font-bold dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300",
  };

  const handleFileSelect = (file: File | null) => {
    if (!file) {
      setUploadError(null);
      return;
    }
    const validTypes = ["image/jpeg", "image/png", "application/pdf"];
    if (!validTypes.includes(file.type)) {
      setAttachment(null);
      setUploadError(t("Only JPG, PNG, or PDF files are supported.", "Seuls les fichiers JPG, PNG, ou PDF sont acceptes."));
      setStatus({
        message: t("Only JPG, PNG, or PDF files are supported.", "Seuls les fichiers JPG, PNG, ou PDF sont acceptes."),
        variant: "warning",
      });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setAttachment(null);
      setUploadError(t("File size must be 5MB or less.", "La taille du fichier doit etre de 5 Mo maximum."));
      setStatus({
        message: t("File too large. Maximum allowed is 5MB.", "Fichier trop volumineux. Le maximum autorise est de 5 Mo."),
        variant: "warning",
      });
      return;
    }
    setUploadError(null);
    setStatus(null);
    setAttachment(file);
  };

  const formatFileSize = (size: number) => {
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  };

  const submit = async () => {
    setStatus(null);
    if (sending) return;
    if (uploadError) {
      setStatus({ message: uploadError, variant: "warning" });
      return;
    }
    const subject = form.subject.trim();
    const message = form.message.trim();
    const nextErrors: { subject?: string; message?: string } = {};
    if (subject.length < 5) nextErrors.subject = t("Subject must be at least 5 characters.", "Le sujet doit comporter au moins 5 caracteres.");
    if (message.length < 10) nextErrors.message = t("Message must be at least 10 characters.", "Le message doit comporter au moins 10 caracteres.");
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      setStatus({ message: t("Please fix the highlighted fields.", "Corrigez les champs en surbrillance."), variant: "warning" });
      return;
    }
    setErrors({});
    setSending(true);
    try {
      const categoryEntry = CATEGORY_OPTIONS.find((item) => item.value === form.category) || CATEGORY_OPTIONS[CATEGORY_OPTIONS.length - 1];
      const categoryLabel = t(categoryEntry.label, categoryEntry.labelFr);
      const res = await fetch("/api/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: `[${categoryLabel}] ${subject}`,
          message,
          priority: form.urgency === "critical" ? "high" : form.urgency,
          attachments: attachment ? [attachment.name] : undefined,
        }),
      });
      const data = await res.json();
      if (res.status === 401) {
        setStatus({ message: t("Please sign in to submit a support ticket.", "Connectez-vous pour soumettre un ticket."), variant: "error" });
      } else if (!res.ok) {
        setStatus({
          message: data.error || t(`Could not submit ticket (status ${res.status}).`, `Impossible de soumettre le ticket (statut ${res.status}).`),
          variant: "error",
        });
      } else {
        if (data.emailError) {
          setStatus({
            message: t(
              `Ticket submitted, but email could not be sent: ${data.emailError}`,
              `Ticket envoye, mais l'email n'a pas pu etre envoye: ${data.emailError}`
            ),
            variant: "error",
          });
        } else {
          setStatus({
            message: t(
              "Ticket submitted successfully. You can track updates in Recent tickets.",
              "Ticket envoye avec succes. Suivez les mises a jour dans les tickets recents."
            ),
            variant: "success",
          });
        }
        setForm((prev) => ({ ...prev, category: CATEGORY_OPTIONS[0].value, subject: "", message: "" }));
        setAttachment(null);
        setErrors({});
        refreshTickets();
      }
    } catch (err: any) {
      setStatus({
        message: t(
          `Could not submit ticket. ${err?.message || "Please try again."}`,
          `Impossible de soumettre le ticket. ${err?.message || "Veuillez reessayer."}`
        ),
        variant: "error",
      });
    } finally {
      setSending(false);
    }
  };

  const recentTickets = Array.isArray(tickets)
    ? [...tickets]
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 3)
    : [];

  const getTicketStatusPill = (ticketStatus: string) => {
    const normalized = String(ticketStatus || "").toUpperCase();
    if (normalized === "RESOLVED") {
      return {
        label: t("Resolved", "Resolue"),
        className:
          "bg-green-100 text-green-700 border-green-200 font-bold dark:bg-green-500/10 dark:text-green-300 dark:border-green-500/40",
      };
    }
    if (normalized === "CLOSED") {
      return {
        label: t("Closed", "Ferme"),
        className:
          "bg-slate-100 text-slate-700 border-slate-300 font-bold dark:bg-slate-600/20 dark:text-slate-200 dark:border-slate-500/40",
      };
    }
    if (normalized === "IN_PROGRESS" || normalized === "PENDING") {
      return {
        label: t("Pending", "En attente"),
        className:
          "bg-amber-100 text-amber-700 border-amber-200 font-bold dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/40",
      };
    }
    return {
      label: t("Open", "Ouvert"),
      className:
        "bg-orange-100 text-orange-700 border-orange-200 font-bold dark:bg-orange-500/10 dark:text-orange-300 dark:border-orange-500/40",
    };
  };

  return (
    <div
      className="mx-auto w-full max-w-[1150px] space-y-8 bg-[#F9FAFB] p-1 dark:bg-[#0F172A] max-md:space-y-6"
      style={forceLight ? { backgroundColor: "#F8FAFC" } : undefined}
    >
      <section
        className="rounded-[20px] border border-slate-200/80 bg-white px-8 py-7 shadow-[0_12px_34px_rgba(15,23,42,0.08)] transition-all duration-200 hover:-translate-y-[1px] hover:shadow-[0_18px_40px_rgba(15,23,42,0.1)] dark:border-[#334155] dark:bg-[#1E293B] max-md:px-5 max-md:py-6"
        style={
          forceLight
            ? {
                background: "linear-gradient(to right, #F1F5F9, #FFFFFF)",
                borderColor: "#E5E7EB",
                boxShadow: "0 6px 18px rgba(0,0,0,0.04)",
              }
            : undefined
        }
      >
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="max-w-3xl space-y-2">
            <p className="text-xs uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
              {t("Support", "Support")}
            </p>
            <div className="support-title-wrapper flex items-center gap-3">
              <div className="support-avatar inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-border bg-card text-foreground">
                <Headset className="h-6 w-6" strokeWidth={1.9} aria-hidden="true" />
              </div>
              <h1
                className="text-[34px] font-bold leading-tight text-slate-900 dark:text-[#E2E8F0] max-md:text-[30px]"
                style={forceLight ? { color: "#0F172A" } : undefined}
              >
                {t("Contact Support", "Contact Support")}
              </h1>
            </div>
            <p
              className="text-sm leading-relaxed text-slate-600 dark:text-slate-300"
              style={forceLight ? { color: "#475569" } : undefined}
            >
              {t(
                "Send a ticket directly from your dashboard. Our team typically responds within 24 hours.",
                "Envoyez un ticket directement depuis votre tableau de bord. Notre equipe repond generalement sous 24 heures."
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-300 ${
                forceLight ? "!border-emerald-200 !bg-emerald-50 !text-emerald-700" : ""
              }`}
            >
              {t(`Current avg response time: ${avgResponseTime}`, `Temps moyen actuel : ${avgResponseTime}`)}
            </span>
            <span
              className={`rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600 dark:border-[#334155] dark:bg-slate-800/70 dark:text-slate-300 ${
                forceLight ? "!border-slate-200 !bg-slate-50 !text-slate-600" : ""
              }`}
            >
              {t("Priority support available", "Support prioritaire disponible")}
            </span>
          </div>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-12">
        <div className="order-2 space-y-6 lg:order-1 lg:col-span-5">
          <Card
            className={`rounded-[18px] border-slate-200/80 bg-white p-7 shadow-[0_12px_30px_rgba(15,23,42,0.06)] transition-all duration-200 hover:-translate-y-[1px] hover:shadow-[0_18px_36px_rgba(15,23,42,0.08)] dark:border-[#334155] dark:bg-[#1E293B] max-md:p-5 ${
              forceLight ? "!rounded-2xl !border-[#E5E7EB] !bg-white !p-6 !shadow-[0_8px_24px_rgba(15,23,42,0.06)]" : ""
            }`}
          >
            <h2
              className="text-lg font-semibold text-slate-900 dark:text-[#E2E8F0]"
              style={forceLight ? { color: "#0F172A" } : undefined}
            >
            {t("Support Overview", "Support Overview")}
            </h2>
            <div className="mt-6 space-y-6">
              <div
                className={`rounded-2xl border border-slate-200 bg-slate-50/70 p-4 dark:border-[#334155] dark:bg-slate-800/60 ${
                  forceLight ? "!border-slate-200 !bg-slate-50/70" : ""
                }`}
              >
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">{t("Channels", "Canaux")}</p>
                <div className="mt-3 flex items-start gap-3">
                  <span
                    className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 dark:border-[#334155] dark:bg-slate-900 dark:text-slate-300 ${
                      forceLight ? "!border-slate-200 !bg-white !text-slate-700" : ""
                    }`}
                  >
                    <Mail className="h-[18px] w-[18px]" strokeWidth={1.8} />
                  </span>
                  <div>
                    <p
                      className="text-sm font-semibold text-slate-900 dark:text-[#E2E8F0]"
                      style={forceLight ? { color: "#0F172A" } : undefined}
                    >
                      {t("Email-first support", "Support prioritaire par email")}
                    </p>
                    <p
                      className="text-sm text-slate-600 dark:text-slate-300"
                      style={forceLight ? { color: "#475569" } : undefined}
                    >
                      {t("We reply from info@maboria.com", "Nous repondons depuis info@maboria.com")}
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
                  {t("What to include", "A inclure")}
                </p>
                <ul className="mt-3 space-y-3">
                  {[
                    t("What you were trying to do", "Ce que vous tentiez de faire"),
                    t("Exact error message", "Le message d erreur exact"),
                    t("Steps taken and expected outcome", "Etapes suivies et resultat attendu"),
                    t("Screenshots or attachments (if available)", "Captures d ecran ou pieces jointes (si disponibles)"),
                  ].map((item) => (
                    <li
                      key={item}
                      className="flex items-start gap-2.5 text-sm text-slate-700 dark:text-slate-200"
                      style={forceLight ? { color: "#475569" } : undefined}
                    >
                      <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[#16A34A]" strokeWidth={1.9} />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </Card>

          <Card
            className={`rounded-[18px] border-slate-200/80 bg-white p-7 shadow-[0_12px_30px_rgba(15,23,42,0.06)] transition-all duration-200 hover:-translate-y-[1px] hover:shadow-[0_18px_36px_rgba(15,23,42,0.08)] dark:border-[#334155] dark:bg-[#1E293B] max-md:p-5 ${
              forceLight ? "!rounded-2xl !border-[#E5E7EB] !bg-white !p-6 !shadow-[0_8px_24px_rgba(15,23,42,0.06)]" : ""
            }`}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2
                className="text-lg font-semibold text-slate-900 dark:text-[#E2E8F0]"
                style={forceLight ? { color: "#0F172A" } : undefined}
              >
                {t("Recent tickets", "Tickets recents")}
              </h2>
              <Link href="/dashboard/support/tickets" className="text-sm font-semibold text-[#2563EB] hover:underline dark:text-[#3B82F6]">
                {t("View all tickets", "Voir tous les tickets")}
              </Link>
            </div>
            <div className="space-y-3">
              {loadingTickets ? (
                <p className="text-sm text-slate-500 dark:text-slate-300">{t("Loading tickets...", "Chargement des tickets...")}</p>
              ) : recentTickets.length === 0 ? (
                <div
                  className={`rounded-xl border border-slate-200 bg-white px-4 py-6 text-center dark:border-[#334155] dark:bg-slate-800/40 ${
                    forceLight ? "!border-[#E5E7EB] !bg-white" : ""
                  }`}
                >
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {t("No support tickets yet", "Aucun ticket support pour le moment")}
                  </p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-300">
                    {t(
                      "When you submit a support request, it will appear here.",
                      "Quand vous soumettez une demande de support, elle apparait ici."
                    )}
                  </p>
                  <Link
                    href="/dashboard/support#submit-ticket"
                    className="mt-3 inline-flex rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-[#334155] dark:text-slate-200 dark:hover:bg-slate-700/40"
                  >
                    {t("Create a Support Ticket", "Creer un ticket support")}
                  </Link>
                </div>
              ) : (
                recentTickets.map((ticket) => {
                  const statusPill = getTicketStatusPill(ticket.status);
                  const { category, subject } = parseTicketTitle(ticket.title);
                  return (
                    <Link
                      key={ticket.id}
                      href={`/dashboard/support/tickets/${ticket.id}`}
                      className={`block rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3 transition-colors hover:bg-slate-100/80 dark:border-[#334155] dark:bg-slate-800/50 dark:hover:bg-slate-800/80 ${
                        forceLight ? "!border-[#E5E7EB] !bg-white hover:!bg-slate-50" : ""
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
                            {category}
                          </p>
                          <p
                            className="truncate text-sm font-semibold text-slate-900 dark:text-[#E2E8F0]"
                            style={forceLight ? { color: "#0F172A" } : undefined}
                          >
                            {subject}
                          </p>
                          <p
                            className="mt-1 text-xs text-slate-500 dark:text-slate-400"
                            style={forceLight ? { color: "#475569" } : undefined}
                          >
                            {formatDistanceToNow(new Date(ticket.createdAt), { addSuffix: true })}
                          </p>
                        </div>
                        <span className={`inline-flex shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-bold ${statusPill.className}`}>
                          {statusPill.label}
                        </span>
                      </div>
                    </Link>
                  );
                })
              )}
            </div>
          </Card>
        </div>

        <Card
          id="submit-ticket"
          className={`order-1 rounded-[18px] border-slate-200/80 bg-white p-7 shadow-[0_12px_30px_rgba(15,23,42,0.08)] transition-all duration-200 hover:-translate-y-[1px] hover:shadow-[0_18px_38px_rgba(15,23,42,0.1)] dark:border-[#334155] dark:bg-[#1E293B] max-md:p-5 lg:order-2 lg:col-span-7 ${
            forceLight ? "!rounded-2xl !border-[#E5E7EB] !bg-white !p-6 !shadow-[0_8px_24px_rgba(15,23,42,0.06)]" : ""
          }`}
        >
          <h2
            className="text-lg font-semibold text-slate-900 dark:text-[#E2E8F0]"
            style={forceLight ? { color: "#0F172A" } : undefined}
          >
            {t("Submit a Ticket", "Soumettre un ticket")}
          </h2>
          {status && (
            <div className="mt-4">
              <Alert variant={status.variant}>{status.message}</Alert>
            </div>
          )}
          <div className="mt-5 space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-sm text-foreground">
                <span>{t("Category", "Categorie")}</span>
                <select
                  value={form.category}
                  onChange={(e) => setForm((prev) => ({ ...prev, category: e.target.value }))}
                  style={forceLight ? { colorScheme: "light" } : undefined}
                  className={`rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm text-slate-900 transition-colors hover:border-slate-300 focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-100 dark:border-[#334155] dark:bg-slate-900 dark:text-slate-100 dark:hover:border-slate-600 dark:focus:border-blue-400 dark:focus:ring-blue-500/25 ${
                    forceLight
                      ? "!border-[#CBD5E1] !bg-white !text-[#0F172A] hover:!border-slate-400 focus:!border-[#2563EB] focus:!ring-[3px] focus:!ring-[rgba(37,99,235,0.15)]"
                      : ""
                  }`}
                >
                  {CATEGORY_OPTIONS.map((option) => (
                    <option
                      key={option.value}
                      value={option.value}
                      style={forceLight ? { backgroundColor: "#FFFFFF", color: "#0F172A" } : undefined}
                    >
                      {t(option.label, option.labelFr)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-sm text-foreground">
                <span>{t("Urgency", "Urgence")}</span>
                <select
                  value={form.urgency}
                  onChange={(e) => setForm((prev) => ({ ...prev, urgency: e.target.value as Urgency }))}
                  style={
                    forceLight
                      ? {
                          colorScheme: "light",
                          backgroundColor: form.urgency === "low" ? "#FFFFFF" : undefined,
                          color: form.urgency === "low" ? "#0F172A" : undefined,
                        }
                      : undefined
                  }
                  className={`rounded-xl border px-3.5 py-3 text-sm font-bold transition-colors focus:outline-none focus:ring-4 focus:ring-blue-100 dark:focus:ring-blue-500/25 ${urgencyClassMap[form.urgency]} ${
                    forceLight
                      ? "hover:!border-slate-400 focus:!border-[#2563EB] focus:!ring-[3px] focus:!ring-[rgba(37,99,235,0.15)]"
                      : ""
                  }`}
                >
                  <option value="low" style={forceLight ? { backgroundColor: "#FFFFFF", color: "#0F172A" } : undefined}>{t("Low", "Faible")}</option>
                  <option value="normal" style={forceLight ? { backgroundColor: "#FFFFFF", color: "#0F172A" } : undefined}>{t("Normal", "Normal")}</option>
                  <option value="high" style={forceLight ? { backgroundColor: "#FFFFFF", color: "#0F172A" } : undefined}>{t("High", "Elevee")}</option>
                  <option value="critical" style={forceLight ? { backgroundColor: "#FFFFFF", color: "#0F172A" } : undefined}>{t("Critical", "Critique")}</option>
                </select>
              </label>
            </div>

            <Input
              label={t("Subject", "Sujet")}
              placeholder={t("Billing, automation, AI...", "Facturation, automatisation, IA...")}
              value={form.subject}
              onChange={(e) => {
                setForm((f) => ({ ...f, subject: e.target.value }));
                if (errors.subject) setErrors((prev) => ({ ...prev, subject: undefined }));
              }}
              minLength={5}
              required
              error={errors.subject}
              className={`rounded-xl border-slate-200 px-3.5 py-3 text-sm transition-colors hover:border-slate-300 focus:border-blue-500 focus:ring-4 focus:ring-blue-100 dark:border-[#334155] dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-400 dark:hover:border-slate-600 dark:focus:border-blue-400 dark:focus:ring-blue-500/25 ${
                forceLight
                  ? "!border-[#CBD5E1] !bg-white !text-[#0F172A] placeholder:!text-slate-600 placeholder:opacity-100 hover:!border-slate-400 focus:!border-[#2563EB] focus:!ring-[3px] focus:!ring-[rgba(37,99,235,0.15)]"
                  : ""
              }`}
            />
            <Textarea
              label={t("Description", "Description")}
              placeholder={t("Describe the issue", "Decrivez le probleme")}
              value={form.message}
              onChange={(e) => {
                setForm((f) => ({ ...f, message: e.target.value }));
                if (errors.message) setErrors((prev) => ({ ...prev, message: undefined }));
              }}
              minLength={10}
              required
              error={errors.message}
              rows={8}
              className={`min-h-[180px] rounded-xl border-slate-200 px-3.5 py-3 text-sm transition-colors hover:border-slate-300 focus:border-blue-500 focus:ring-4 focus:ring-blue-100 dark:border-[#334155] dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-400 dark:hover:border-slate-600 dark:focus:border-blue-400 dark:focus:ring-blue-500/25 ${
                forceLight
                  ? "!border-[#CBD5E1] !bg-white !text-[#0F172A] placeholder:!text-slate-600 placeholder:opacity-100 hover:!border-slate-400 focus:!border-[#2563EB] focus:!ring-[3px] focus:!ring-[rgba(37,99,235,0.15)]"
                  : ""
              }`}
            />

            <div className="space-y-3">
              <p className="text-sm font-medium text-slate-900 dark:text-[#E2E8F0]">{t("Attach File", "Joindre un fichier")}</p>
              <label
                className={`group relative flex w-full cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed px-4 text-center transition-colors ${
                  attachment ? "min-h-[102px]" : "min-h-[120px]"
                } ${
                  dragging
                    ? "border-blue-400 bg-blue-50/80 dark:border-blue-400 dark:bg-slate-700/50"
                    : "border-slate-300 bg-slate-50/70 hover:border-slate-400 dark:border-[#334155] dark:bg-slate-800/35 dark:hover:border-slate-400"
                } ${forceLight ? "!border-[#CBD5E1] !bg-slate-50/70 hover:!border-slate-400" : ""}`}
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(event) => {
                  event.preventDefault();
                  setDragging(false);
                  handleFileSelect(event.dataTransfer.files?.[0] ?? null);
                }}
              >
                <Paperclip className="h-5 w-5 text-slate-500 dark:text-slate-300" />
                <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                  {t("Drag & drop files here", "Glissez-deposez vos fichiers ici")}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {t("or click to upload", "ou cliquez pour televerser")}
                </p>
                <span className="pointer-events-none absolute bottom-3 right-3 text-[11px] text-slate-500 dark:text-slate-400">
                  {t("JPG, PNG, PDF - Max 5MB", "JPG, PNG, PDF - Max 5 Mo")}
                </span>
                <input
                  type="file"
                  accept=".jpg,.jpeg,.png,.pdf"
                  className="hidden"
                  onChange={(event) => handleFileSelect(event.target.files?.[0] ?? null)}
                />
              </label>
              {uploadError ? (
                <p className="text-xs text-rose-600 dark:text-rose-300">{uploadError}</p>
              ) : null}
              {attachment && (
                <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 dark:border-[#334155] dark:bg-slate-800/35 max-md:flex-col max-md:items-start">
                  <div className="flex min-w-0 items-center gap-3">
                    {attachmentPreview ? (
                      <Image
                        src={attachmentPreview}
                        alt="attachment preview"
                        width={36}
                        height={36}
                        unoptimized
                        className="h-9 w-9 rounded-md object-cover"
                      />
                    ) : (
                      <div className="flex h-9 w-9 items-center justify-center rounded-md bg-slate-100 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                        PDF
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-700 dark:text-slate-200">{attachment.name}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{formatFileSize(attachment.size)}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setAttachment(null);
                      setUploadError(null);
                    }}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                    aria-label="Remove attachment"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-6">
              <Button
                onClick={submit}
                loading={sending}
                className={`w-full rounded-[14px] bg-gradient-to-r from-[#2563EB] to-[#1D4ED8] px-6 py-3 text-sm font-semibold text-white shadow-[0_12px_28px_rgba(37,99,235,0.35)] transition-all hover:-translate-y-[1px] hover:brightness-105 focus:ring-4 focus:ring-blue-100 dark:focus:ring-blue-500/25 sm:w-auto sm:min-w-[260px] ${
                  forceLight
                    ? "rounded-xl bg-[linear-gradient(135deg,#2563EB,#1D4ED8)] shadow-[0_4px_14px_rgba(37,99,235,0.35)] duration-200 hover:shadow-[0_6px_18px_rgba(37,99,235,0.45)] focus:!ring-[3px] focus:!ring-[rgba(37,99,235,0.15)]"
                    : ""
                }`}
              >
                {t("Submit support ticket", "Soumettre le ticket support")}
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
