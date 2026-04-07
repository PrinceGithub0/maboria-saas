"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { TransientAlert } from "@/components/ui/transient-alert";
import { useLanguage } from "@/components/providers/language-provider";
import { useTheme } from "@/components/providers/theme-provider";
import { supportEmail, supportMailto } from "@/lib/support/contact";
import {
  getSupportCategoryLabel,
  getSupportDateLocale,
  localizeSupportCategory,
  localizeSupportServerMessage,
  SUPPORT_CATEGORY_OPTIONS,
} from "@/lib/support/localization";
import {
  getSubscriberSupportLastActivityAt,
  sortSubscriberSupportTicketsByRecentActivity,
} from "@/lib/support/subscriber-display";
import { CheckCircle2, Mail, Paperclip, X } from "lucide-react";
import Link from "next/link";
import useSWR from "swr";
import { formatDistanceToNow } from "date-fns";
import Image from "next/image";

type Urgency = "low" | "medium" | "high" | "urgent";
type SupportAttachmentPayload = {
  filename: string;
  contentType: "image/jpeg" | "image/png" | "application/pdf";
  base64: string;
  sizeBytes: number;
};
type Ticket = {
  id: string;
  title: string;
  status: string;
  createdAt: string;
  message?: string;
  metadata?:
    | {
        firstResponseAt?: string | null;
        lastActivityAt?: string | null;
        [key: string]: unknown;
      }
    | null;
};

const MAX_ATTACHMENTS = 3;
const ALLOWED_ATTACHMENT_TYPES = ["image/jpeg", "image/png", "application/pdf"] as const;

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

function SupportCenterIllustration({ forceLight }: { forceLight: boolean }) {
  const imageSources = [
    "/support/support-center-illustration.png",
    "/support/support-center-illustration.webp",
    "/support/support-center-illustration.jpg",
    "/support/support-center-illustration.jpeg",
    "/support/support-center-illustration.svg",
  ];
  const [imageIndex, setImageIndex] = useState(0);
  const imageSrc = imageSources[imageIndex] ?? null;

  useEffect(() => {
    setImageIndex(0);
  }, [forceLight]);

  if (!imageSrc) {
    return (
      <div className="relative w-full max-w-[248px]">
        <div className="relative aspect-square overflow-hidden rounded-[30px] border border-[#DCE7F5] bg-[linear-gradient(180deg,#F8FBFF_0%,#EEF6FF_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]">
          <div className="absolute inset-x-10 bottom-5 h-3 rounded-full bg-[#DCE7F5] blur-sm" />
          <div className="absolute left-6 top-12 h-44 w-44 rounded-full bg-[#DDF0FF]" />
          <div className="absolute bottom-10 left-4 h-36 w-52 rounded-[44px] bg-[#D9EDFF] opacity-90" />
          <div className="absolute right-8 top-14 h-14 w-14 rounded-full bg-white/70 shadow-sm" />
          <div className="absolute right-16 top-26 h-8 w-8 rounded-full border-[6px] border-white/80" />
          <div className="absolute left-9 top-28 h-3 w-3 rounded-full bg-[#64748B]" />
          <div className="absolute left-[92px] top-[102px] h-[142px] w-[142px] rounded-[38px] border border-white/65 bg-white/55 shadow-[0_22px_40px_-30px_rgba(37,99,235,0.2)] backdrop-blur-sm" />
          <div className="absolute left-[126px] top-[134px] h-[86px] w-[86px] rounded-[28px] bg-[linear-gradient(145deg,#FFFFFF_0%,#F3F8FF_60%,#E7F0FF_100%)] shadow-inner" />
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full max-w-[248px]">
      {forceLight ? <div className="absolute inset-x-8 bottom-0 h-3 rounded-full bg-slate-200/70 blur-sm" /> : null}
      <div
        className={`relative aspect-square overflow-hidden ${
          forceLight
            ? "rounded-[30px] border border-transparent bg-white/55 p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.55)]"
            : "rounded-[30px] bg-transparent p-0 shadow-none"
        }`}
        style={
          forceLight
            ? {
                backgroundColor: "rgba(255,255,255,0.55)",
              }
            : undefined
        }
      >
        <Image
          src={imageSrc}
          alt=""
          fill
          sizes="(max-width: 1024px) 220px, 248px"
          className={
            forceLight
              ? "object-contain object-bottom"
              : "object-contain object-bottom"
          }
          onError={() => setImageIndex((current) => current + 1)}
          priority
          unoptimized
        />
      </div>
    </div>
  );
}

export default function DashboardSupportPage() {
  const { language, t } = useLanguage();
  const { resolvedTheme } = useTheme();
  const forceLight = resolvedTheme === "light";
  const [form, setForm] = useState({
    category: SUPPORT_CATEGORY_OPTIONS[0].value,
    urgency: "medium" as Urgency,
    subject: "",
    message: "",
  });
  const [status, setStatus] = useState<{ message: string; variant: "info" | "success" | "warning" | "error" } | null>(null);
  const [sending, setSending] = useState(false);
  const [errors, setErrors] = useState<{ subject?: string; message?: string }>({});
  const [attachments, setAttachments] = useState<File[]>([]);
  const [attachmentPreviews, setAttachmentPreviews] = useState<Record<string, string>>({});
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const {
    data: tickets,
    mutate: refreshTickets,
    isLoading: loadingTickets,
    error: ticketsError,
  } = useSWR<Ticket[]>("/api/support?limit=20", fetcher, { shouldRetryOnError: false });

  useEffect(() => {
    const nextPreviews: Record<string, string> = {};
    const allocated: string[] = [];
    attachments.forEach((file) => {
      if (file.type === "application/pdf") return;
      const preview = URL.createObjectURL(file);
      nextPreviews[`${file.name}-${file.size}-${file.lastModified}`] = preview;
      allocated.push(preview);
    });
    setAttachmentPreviews(nextPreviews);
    return () => {
      allocated.forEach((preview) => URL.revokeObjectURL(preview));
    };
  }, [attachments]);

  const supportHeaderBadge = t({
    en: "Support replies appear here and by email",
    fr: "Les réponses support apparaissent ici et par email",
    de: "Supportantworten erscheinen hier und per E-Mail",
    es: "Las respuestas de soporte aparecen aqui y por correo",
    pt: "As respostas do suporte aparecem aqui e por email",
  });

  const urgencyClassMap: Record<Urgency, string> = {
    low: "border-[#CBD5E1] bg-white text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200",
    medium:
      "border-blue-200 bg-blue-50 text-blue-700 font-bold dark:border-blue-500/40 dark:bg-blue-500/10 dark:text-blue-300",
    high: "border-orange-200 bg-orange-50 text-orange-700 font-bold dark:border-orange-500/40 dark:bg-orange-500/10 dark:text-orange-300",
    urgent: "border-red-200 bg-red-50 text-red-700 font-bold dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300",
  };

  const handleFileSelect = (fileList: FileList | File[] | null) => {
    const incoming = Array.from(fileList || []);
    if (incoming.length === 0) {
      setUploadError(null);
      return;
    }

    const nextFiles = [...attachments];
    let nextError: string | null = null;

    for (const file of incoming) {
      if (!ALLOWED_ATTACHMENT_TYPES.includes(file.type as (typeof ALLOWED_ATTACHMENT_TYPES)[number])) {
        nextError = t("Only JPG, PNG, or PDF files are supported.", "Seuls les fichiers JPG, PNG, ou PDF sont acceptes.", "Nur JPG-, PNG- oder PDF-Dateien werden unterst?tzt.", "Solo se admiten archivos JPG, PNG o PDF.", "Apenas s?o suportados ficheiros JPG, PNG ou PDF.");
        continue;
      }
      if (file.size > 5 * 1024 * 1024) {
        nextError = t("File too large. Maximum allowed is 5MB.", "Fichier trop volumineux. Le maximum autorise est de 5 Mo.", "Datei zu gross. Maximal 5 MB sind erlaubt.", "El archivo es demasiado grande. El maximo permitido es 5 MB.", "Ficheiro demasiado grande. O maximo permitido e 5 MB.");
        continue;
      }
      if (nextFiles.some((existing) => existing.name === file.name && existing.size === file.size && existing.lastModified === file.lastModified)) {
        continue;
      }
      if (nextFiles.length >= MAX_ATTACHMENTS) {
        nextError = t(
          "You can attach up to 3 files per ticket.",
          "Vous pouvez joindre jusqu a 3 fichiers par ticket.",
          "Du kannst bis zu 3 Dateien pro Ticket anhangen.",
          "Puedes adjuntar hasta 3 archivos por ticket.",
          "Pode anexar at? 3 ficheiros por ticket."
        );
        break;
      }
      nextFiles.push(file);
    }

    setAttachments(nextFiles);
    setUploadError(nextError);
    if (nextError) {
      setStatus({ message: nextError, variant: "warning" });
      return;
    }
    setStatus(null);
  };

  const formatFileSize = (size: number) => {
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  };

  const fileToBase64 = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = String(reader.result || "");
        const base64 = result.includes(",") ? result.split(",")[1] : result;
        if (!base64) {
          reject(new Error("Attachment encoding failed"));
          return;
        }
        resolve(base64);
      };
      reader.onerror = () => reject(new Error("Attachment encoding failed"));
      reader.readAsDataURL(file);
    });

  const toAttachmentPayload = async (file: File): Promise<SupportAttachmentPayload> => {
    const base64 = await fileToBase64(file);
    return {
      filename: file.name,
      contentType: file.type as SupportAttachmentPayload["contentType"],
      base64,
      sizeBytes: file.size,
    };
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
    if (subject.length < 5) nextErrors.subject = t("Subject must be at least 5 characters.", "Le sujet doit comporter au moins 5 caractères.", "Der Betreff muss mindestens 5 Zeichen lang sein.", "El asunto debe tener al menos 5 caracteres.", "O assunto tem de ter pelo menos 5 caracteres.");
    if (message.length < 10) nextErrors.message = t("Message must be at least 10 characters.", "Le message doit comporter au moins 10 caracteres.", "Die Nachricht muss mindestens 10 Zeichen lang sein.", "El mensaje debe tener al menos 10 caracteres.", "A mensagem tem de ter pelo menos 10 caracteres.");
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      setStatus({ message: t("Please fix the highlighted fields.", "Corrigez les champs en surbrillance.", "Bitte korrigiere die markierten Felder.", "Corrige los campos resaltados.", "Corrija os campos destacados."), variant: "warning" });
      return;
    }
    setErrors({});
    setSending(true);
    try {
      const categoryLabel = getSupportCategoryLabel(form.category, language);
      const attachmentsPayload =
        attachments.length > 0 ? await Promise.all(attachments.map((file) => toAttachmentPayload(file))) : undefined;
      const res = await fetch("/api/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: `[${categoryLabel}] ${subject}`,
          message,
          priority: form.urgency,
          attachments: attachmentsPayload,
        }),
      });
      const data = await res.json();
      if (res.status === 401) {
        setStatus({ message: t("Please sign in to submit a support ticket.", "Connectez-vous pour soumettre un ticket.", "Bitte melde dich an, um ein Support-Ticket zu senden.", "Inicia sesión para enviar un ticket de soporte.", "Inicie sessão para submeter um ticket de suporte."), variant: "error" });
      } else if (!res.ok) {
        setStatus({
          message:
            localizeSupportServerMessage(
              data.error,
              language,
              t({
                en: `Could not submit ticket (status ${res.status}).`,
                fr: `Impossible de soumettre le ticket (statut ${res.status}).`,
                de: `Ticket konnte nicht gesendet werden (Status ${res.status}).`,
                es: `No se pudo enviar el ticket (estado ${res.status}).`,
                pt: `Nao foi possivel submeter o ticket (estado ${res.status}).`,
              })
            ),
          variant: "error",
        });
      } else {
        if (data.emailError) {
          setStatus({
            message: t({
              en: "Ticket submitted, but support email delivery failed. Updates will still appear here.",
              fr: "Ticket envoy?, mais l envoi de l email support a échoué. Les mises a jour apparaitront quand meme ici.",
              de: "Ticket gesendet, aber die Zustellung der Support-E-Mail ist fehlgeschlagen. Aktualisierungen erscheinen weiterhin hier.",
              es: "El ticket se envio, pero la entrega del correo de soporte fallo. Las actualizaciones seguiran apareciendo aqui.",
              pt: "O ticket foi enviado, mas a entrega do email de suporte falhou. As atualizacoes continuarao a aparecer aqui.",
            }),
            variant: "warning",
          });
        } else {
          setStatus({
            message: t(
              "Ticket submitted successfully. You can track updates in Recent tickets.",
              "Ticket envoy? avec succes. Suivez les mises a jour dans les tickets recents.",
              "Ticket erfolgreich gesendet. Du kannst Aktualisierungen in Letzte Tickets verfolgen.",
              "Ticket enviado correctamente. Puedes seguir las actualizaciones en Tickets recientes.",
              "Ticket enviado com sucesso. Pode acompanhar as atualizacoes em Tickets recentes."
            ),
            variant: "success",
          });
        }
        setForm((prev) => ({ ...prev, category: SUPPORT_CATEGORY_OPTIONS[0].value, subject: "", message: "" }));
        setAttachments([]);
        setErrors({});
        refreshTickets();
      }
    } catch {
      setStatus({
        message: t({
          en: "Could not submit ticket. Please try again.",
          fr: "Impossible de soumettre le ticket. Veuillez réessayer.",
          de: "Ticket konnte nicht gesendet werden. Bitte versuche es erneut.",
          es: "No se pudo enviar el ticket. Intentalo de nuevo.",
          pt: "Não foi poss?vel submeter o ticket. Tente novamente.",
        }),
        variant: "error",
      });
    } finally {
      setSending(false);
    }
  };

  const recentTickets = Array.isArray(tickets)
    ? sortSubscriberSupportTicketsByRecentActivity(tickets).slice(0, 3)
    : [];

  const getTicketStatusPill = (ticketStatus: string) => {
    const normalized = String(ticketStatus || "").toUpperCase();
    if (normalized === "RESOLVED") {
      return {
        label: t("Resolved", "Résolue", "Geloest", "Resuelto", "Resolvido"),
        className:
          "bg-green-100 text-green-700 border-green-200 font-bold dark:bg-green-500/10 dark:text-green-300 dark:border-green-500/40",
      };
    }
    if (normalized === "CLOSED") {
      return {
        label: t("Closed", "Ferme", "Geschlossen", "Cerrado", "Fechado"),
        className:
          "bg-emerald-100 text-emerald-700 border-emerald-200 font-bold dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/40",
      };
    }
    if (normalized === "IN_PROGRESS" || normalized === "PENDING") {
      return {
        label: t("Pending", "En attente", "Ausstehend", "Pendiente", "Pendente"),
        className:
          "bg-amber-100 text-amber-700 border-amber-200 font-bold dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/40",
      };
    }
    return {
      label: t("Open", "Ouvert", "Offen", "Abierto", "Aberto"),
      className:
        "bg-orange-100 text-orange-700 border-orange-200 font-bold dark:bg-orange-500/10 dark:text-orange-300 dark:border-orange-500/40",
    };
  };

  const heroCardClass = forceLight
    ? "rounded-[20px] border border-[#D9E2EC] bg-[linear-gradient(135deg,#FFFFFF_0%,#F8FAFC_55%,#EFF6FF_100%)] px-8 py-7 shadow-[0_14px_34px_rgba(15,23,42,0.08)] transition-all duration-200 hover:-translate-y-[1px] hover:shadow-[0_18px_40px_rgba(15,23,42,0.1)] max-md:px-5 max-md:py-6"
    : "rounded-[20px] border border-slate-800 bg-[linear-gradient(135deg,rgba(15,23,42,0.98),rgba(15,23,42,0.95)_58%,rgba(30,41,59,0.9))] px-8 py-7 shadow-[0_18px_48px_rgba(2,6,23,0.45)] transition-all duration-200 hover:-translate-y-[1px] hover:shadow-[0_18px_40px_rgba(15,23,42,0.1)] max-md:px-5 max-md:py-6";
  const sectionCardClass = forceLight
    ? "rounded-2xl border border-[#E2E8F0] bg-white p-6 shadow-[0_18px_40px_rgba(15,23,42,0.08)] max-md:p-5"
    : "rounded-[18px] border border-slate-800 bg-[linear-gradient(180deg,rgba(15,23,42,0.96),rgba(17,24,39,0.94))] p-7 shadow-[0_18px_44px_rgba(2,6,23,0.35)] max-md:p-5";
  const insetPanelClass = forceLight
    ? "border-[#E2E8F0] bg-[#F8FAFC]"
    : "dark:border-slate-800 dark:bg-slate-950/45";
  const ticketCardClass = forceLight
    ? "!border-[#E2E8F0] !bg-white hover:!bg-[#F8FAFC]"
    : "dark:border-slate-800 dark:bg-slate-950/45 dark:hover:bg-slate-900/70";
  const formCardClass = forceLight
    ? "order-1 rounded-2xl border border-[#E2E8F0] bg-white p-6 shadow-[0_18px_40px_rgba(15,23,42,0.08)] max-md:p-5 lg:order-2 lg:col-span-7"
    : "order-1 rounded-[18px] border border-slate-800 bg-[linear-gradient(180deg,rgba(15,23,42,0.97),rgba(17,24,39,0.95))] p-7 shadow-[0_20px_44px_rgba(2,6,23,0.38)] max-md:p-5 lg:order-2 lg:col-span-7";
  const scrollToSubmitTicket = () => {
    document.getElementById("submit-ticket")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div
      className="mx-auto w-full max-w-[1150px] space-y-8 bg-[#F9FAFB] p-1 dark:bg-[#0F172A] max-md:space-y-6"
      style={forceLight ? { backgroundColor: "#F8FAFC" } : undefined}
    >
      <section className={heroCardClass}>
        <div className="border-b border-slate-200/70 pb-4 dark:border-slate-800/80">
          <div className="flex items-center gap-3">
            <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600 shadow-sm dark:bg-blue-500/10 dark:text-blue-300">
              <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <path d="M6 5.5C6 4.12 7.12 3 8.5 3H13.5V8C13.5 9.38 12.38 10.5 11 10.5H6V5.5Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M14 9.5V14.5C14 15.88 12.88 17 11.5 17H6.5V12C6.5 10.62 7.62 9.5 9 9.5H14Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div>
              <p
                className="text-[15px] font-semibold text-slate-900 dark:text-[#E2E8F0]"
                style={forceLight ? { color: "#1E293B" } : undefined}
              >
                {t("Support Center", "Centre de support", "Support-Center", "Centro de soporte", "Centro de suporte")}
              </p>
              <p
                className="text-xs text-slate-500 dark:text-slate-400"
                style={forceLight ? { color: "#64748B" } : undefined}
              >
                {t("Priority support for your workspace", "Support prioritaire pour votre espace", "Priorisierter Support für deinen Workspace", "Soporte prioritario para tu espacio de trabajo", "Suporte prioritario para o seu espa?o de trabalho")}
              </p>
            </div>
          </div>
        </div>

        <div className="grid items-center gap-8 pt-7 lg:grid-cols-[248px_minmax(0,540px)] lg:justify-between">
          <div className="-mt-2 flex justify-center lg:justify-start">
            <SupportCenterIllustration forceLight={forceLight} />
          </div>
          <div className="max-w-[540px] space-y-6">
            <div className="space-y-3">
              <p className="text-xs uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
                {t("Support", "Support", "Support", "Soporte", "Suporte")}
              </p>
              <h1
                className="text-[34px] font-bold leading-tight text-slate-900 dark:text-[#E2E8F0] max-md:text-[30px]"
                style={forceLight ? { color: "#0F172A" } : undefined}
              >
                {t("Need help with something?", "Besoin d'aide pour quelque chose ?", "Brauchst du bei etwas Hilfe?", "Necesitas ayuda con algo?", "Precisa de ajuda com alguma coisa?")}
              </h1>
              <p
                className="max-w-[500px] text-[17px] leading-relaxed text-slate-500 dark:text-slate-300"
                style={forceLight ? { color: "#667085" } : undefined}
              >
                {t(
                  "Create a support ticket or continue your existing support conversation.",
                  "Cr?ez un ticket de support ou poursuivez votre conversation de support existante.",
                  "Erstelle ein Support-Ticket oder setze deine bestehende Support-Konversation fort.",
                  "Crea un ticket de soporte o continua tu conversación de soporte existente.",
                  "Crie um ticket de suporte ou continue a sua conversa de suporte existente."
                )}
              </p>
            </div>

            <div className="flex flex-col items-start gap-3">
              <Button
                type="button"
                onClick={scrollToSubmitTicket}
                className="min-h-12 rounded-2xl bg-[linear-gradient(135deg,#4F8EF7,#2F6DEB)] px-7 text-base shadow-[0_16px_34px_rgba(47,109,235,0.28)] hover:brightness-105"
              >
                {t("Create Ticket", "Creer un ticket", "Ticket erstellen", "Crear ticket", "Criar ticket")}
              </Button>
              <div className="flex flex-wrap items-center gap-2.5">
                <span
                  className={`rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-300 ${
                    forceLight ? "!border-emerald-200 !bg-emerald-50 !text-emerald-700" : ""
                  }`}
                >
                  {supportHeaderBadge}
                </span>
                <span
                  className={`rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-600 dark:border-[#334155] dark:bg-slate-800/70 dark:text-slate-300 ${
                    forceLight ? "!border-slate-200 !bg-slate-50 !text-slate-600" : ""
                  }`}
                >
                  {t("Priority support available", "Support prioritaire disponible", "Priorisierter Support verfügbar", "Soporte prioritario disponible", "Suporte prioritario disponível")}
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-12">
        <div className="order-2 space-y-6 lg:order-1 lg:col-span-5">
          <Card className={sectionCardClass}>
            <h2
              className="text-lg font-semibold text-slate-900 dark:text-[#E2E8F0]"
              style={forceLight ? { color: "#0F172A" } : undefined}
            >
            {t("Support Overview", "Vue d'ensemble du support", "Support-überblick", "Resumen de soporte", "Visao geral do suporte")}
            </h2>
            <div className="mt-6 space-y-6">
              <div
                className={`rounded-2xl border border-slate-200 bg-slate-50/70 p-4 ${insetPanelClass}`}
              >
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">{t("Channels", "Canaux", "Kanaele", "Canales", "Canais")}</p>
                <div className="mt-3 flex items-start gap-3">
                  <span
                    className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300 ${
                      forceLight ? "!border-[#D9E2EC] !bg-white !text-slate-700" : ""
                    }`}
                  >
                    <Mail className="h-[18px] w-[18px]" strokeWidth={1.8} />
                  </span>
                  <div className="pt-0.5">
                    <p
                      className="text-sm font-semibold text-slate-900 dark:text-[#E2E8F0]"
                      style={forceLight ? { color: "#0F172A" } : undefined}
                    >
                      {t("Email-first support", "Support prioritaire par email", "Support zuerst per E-Mail", "Soporte prioritario por correo", "Suporte prioritario por email")}
                    </p>
                    <div className="mt-1.5 space-y-0.5">
                      <p
                        className="text-xs font-medium uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400"
                        style={forceLight ? { color: "#64748B" } : undefined}
                      >
                        {t("We reply from", "Nous repondons depuis", "Wir antworten von", "Respondemos desde", "Respondemos a partir de")}
                      </p>
                      <a
                        href={supportMailto}
                        className="block text-base font-medium leading-tight text-slate-700 hover:text-slate-900 dark:text-slate-200 dark:hover:text-white"
                        style={forceLight ? { color: "#334155" } : undefined}
                      >
                        {supportEmail}
                      </a>
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
                  {t("What to include", "A inclure", "Was du angeben solltest", "Que incluir", "O que incluir")}
                </p>
                <ul className="mt-3 space-y-3">
                  {[
                    t("What you were trying to do", "Ce que vous tentiez de faire", "Was du versucht hast zu tun", "Lo que intentabas hacer", "O que estava a tentar fazer"),
                    t("Exact error message", "Le message d erreur exact", "Genaue Fehlermeldung", "Mensaje de error exacto", "Mensagem de erro exata"),
                    t("Steps taken and expected outcome", "Etapes suivies et resultat attendu", "Ausgeführte Schritte und erwartetes Ergebnis", "Pasos realizados y resultado esperado", "Passos efetuados e resultado esperado"),
                    t("Screenshots or attachments (if available)", "Captures d ecran ou pieces jointes (si disponibles)", "Screenshots oder Anhange (falls vorhanden)", "Capturas o archivos adjuntos (si est?n disponibles)", "Capturas de ecran ou anexos (se dispon?veis)"),
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

          <Card className={sectionCardClass}>
            <div className="mb-4 flex items-center justify-between">
              <h2
                className="text-lg font-semibold text-slate-900 dark:text-[#E2E8F0]"
                style={forceLight ? { color: "#0F172A" } : undefined}
              >
                {t("Recent tickets", "Tickets recents", "Letzte Tickets", "Tickets recientes", "Tickets recentes")}
              </h2>
              <Link href="/dashboard/support/tickets" className="text-sm font-semibold text-[#2563EB] hover:underline dark:text-[#3B82F6]">
                {t("View all tickets", "Voir tous les tickets", "Alle Tickets anzeigen", "Ver todos los tickets", "Ver todos os tickets")}
              </Link>
            </div>
            <div className="space-y-3">
              {loadingTickets ? (
                <p className="text-sm text-slate-500 dark:text-slate-300">{t("Loading tickets...", "Chargement des tickets...", "Tickets werden geladen...", "Cargando tickets...", "A carregar tickets...")}</p>
              ) : ticketsError ? (
                <Alert variant="error">
                  {t(
                    "We could not load your recent support tickets right now.",
                    "Nous n'avons pas pu charger vos tickets support recents pour le moment.",
                    "Deine letzten Support-Tickets konnten derzeit nicht geladen werden.",
                    "No pudimos cargar tus tickets de soporte recientes en este momento.",
                    "Não foi poss?vel carregar os seus tickets de suporte recentes neste momento."
                  )}
                </Alert>
              ) : recentTickets.length === 0 ? (
                <div
                  className={`rounded-xl border border-slate-200 bg-white px-4 py-6 text-center ${insetPanelClass}`}
                >
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {t("No support tickets yet", "Aucun ticket support pour le moment", "Noch keine Support-Tickets", "Aún no hay tickets de soporte", "Ainda não ha tickets de suporte")}
                  </p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-300">
                    {t(
                      "When you submit a support request, it will appear here.",
                      "Quand vous soumettez une demande de support, elle apparait ici.",
                      "Wenn du eine Support-Anfrage einreichst, erscheint sie hier.",
                      "Cuando envies una solicitud de soporte, aparecera aqui.",
                      "Quando submeter um pedido de suporte, ele aparecera aqui."
                    )}
                  </p>
                  <Link
                    href="/dashboard/support#submit-ticket"
                    className="mt-3 inline-flex rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-[#334155] dark:text-slate-200 dark:hover:bg-slate-700/40"
                  >
                    {t("Create a Support Ticket", "Creer un ticket support", "Support-Ticket erstellen", "Crear un ticket de soporte", "Criar um ticket de suporte")}
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
                      className={`block rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3 transition-colors hover:bg-slate-100/80 ${ticketCardClass}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
                            {localizeSupportCategory(category, language)}
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
                            {formatDistanceToNow(new Date(getSubscriberSupportLastActivityAt(ticket)), {
                              addSuffix: true,
                              locale: getSupportDateLocale(language),
                            })}
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

        <Card id="submit-ticket" className={formCardClass}>
          <h2
            className="text-lg font-semibold text-slate-900 dark:text-[#E2E8F0]"
            style={forceLight ? { color: "#0F172A" } : undefined}
          >
            {t("Submit a Ticket", "Soumettre un ticket", "Ticket einreichen", "Enviar un ticket", "Submeter um ticket")}
          </h2>
          {status && (
            <div className="mt-4">
              <TransientAlert variant={status.variant} onDismiss={() => setStatus(null)}>
                {status.message}
              </TransientAlert>
            </div>
          )}
          <div className="mt-5 space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-sm text-foreground">
                <span>{t("Category", "Categorie", "Kategorie", "Categoria", "Categoria")}</span>
                <select
                  value={form.category}
                  onChange={(e) => setForm((prev) => ({ ...prev, category: e.target.value }))}
                  style={forceLight ? { colorScheme: "light" } : undefined}
                  className={`rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm text-slate-900 transition-colors hover:border-slate-300 focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-950/90 dark:text-slate-100 dark:hover:border-slate-500 dark:focus:border-blue-400 dark:focus:ring-blue-500/25 ${
                    forceLight
                      ? "!border-[#CBD5E1] !bg-white !text-[#0F172A] hover:!border-slate-400 focus:!border-[#2563EB] focus:!ring-[3px] focus:!ring-[rgba(37,99,235,0.15)]"
                      : ""
                  }`}
                >
                  {SUPPORT_CATEGORY_OPTIONS.map((option) => (
                    <option
                      key={option.value}
                      value={option.value}
                      style={forceLight ? { backgroundColor: "#FFFFFF", color: "#0F172A" } : undefined}
                    >
                      {getSupportCategoryLabel(option.value, language)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-sm text-foreground">
                <span>{t("Urgency", "Urgence", "Dringlichkeit", "Urgencia", "Urgencia")}</span>
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
                  <option value="low" style={forceLight ? { backgroundColor: "#FFFFFF", color: "#0F172A" } : undefined}>{t("Low", "Faible", "Niedrig", "Baja", "Baixa")}</option>
                  <option value="medium" style={forceLight ? { backgroundColor: "#FFFFFF", color: "#0F172A" } : undefined}>{t("Medium", "Moyenne", "Mittel", "Media", "Media")}</option>
                  <option value="high" style={forceLight ? { backgroundColor: "#FFFFFF", color: "#0F172A" } : undefined}>{t("High", "Elevee", "Hoch", "Alta", "Alta")}</option>
                  <option value="urgent" style={forceLight ? { backgroundColor: "#FFFFFF", color: "#0F172A" } : undefined}>{t("Urgent", "Urgente", "Dringend", "Urgente", "Urgente")}</option>
                </select>
              </label>
            </div>

            <Input
              label={t("Subject", "Sujet", "Betreff", "Asunto", "Assunto")}
              placeholder={t("Billing, automation, AI...", "Facturation, automatisation, IA...", "Abrechnung, Automatisierung, KI...", "Facturación, automatización, IA...", "Faturação, automação, IA...")}
              value={form.subject}
              onChange={(e) => {
                setForm((f) => ({ ...f, subject: e.target.value }));
                if (errors.subject) setErrors((prev) => ({ ...prev, subject: undefined }));
              }}
              minLength={5}
              required
              error={errors.subject}
              className={`rounded-xl border-slate-200 px-3.5 py-3 text-sm transition-colors hover:border-slate-300 focus:border-blue-500 focus:ring-4 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-950/90 dark:text-slate-100 dark:placeholder:text-slate-500 dark:hover:border-slate-500 dark:focus:border-blue-400 dark:focus:ring-blue-500/25 ${
                forceLight
                  ? "!border-[#CBD5E1] !bg-white !text-[#0F172A] placeholder:!text-slate-600 placeholder:opacity-100 hover:!border-slate-400 focus:!border-[#2563EB] focus:!ring-[3px] focus:!ring-[rgba(37,99,235,0.15)]"
                  : ""
              }`}
            />
            <Textarea
              label={t("Description", "Description", "Beschreibung", "Descripcion", "Descricao")}
              placeholder={t("Describe the issue", "Decrivez le probleme", "Beschreibe das Problem", "Describe el problema", "Descreva o problema")}
              value={form.message}
              onChange={(e) => {
                setForm((f) => ({ ...f, message: e.target.value }));
                if (errors.message) setErrors((prev) => ({ ...prev, message: undefined }));
              }}
              minLength={10}
              required
              error={errors.message}
              rows={8}
              className={`min-h-[180px] rounded-xl border-slate-200 px-3.5 py-3 text-sm transition-colors hover:border-slate-300 focus:border-blue-500 focus:ring-4 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-950/90 dark:text-slate-100 dark:placeholder:text-slate-500 dark:hover:border-slate-500 dark:focus:border-blue-400 dark:focus:ring-blue-500/25 ${
                forceLight
                  ? "!border-[#CBD5E1] !bg-white !text-[#0F172A] placeholder:!text-slate-600 placeholder:opacity-100 hover:!border-slate-400 focus:!border-[#2563EB] focus:!ring-[3px] focus:!ring-[rgba(37,99,235,0.15)]"
                  : ""
              }`}
            />

            <div className="space-y-3">
              <p className="text-sm font-medium text-slate-900 dark:text-[#E2E8F0]">{t("Attach File", "Joindre un fichier", "Datei anhangen", "Adjuntar archivo", "Anexar ficheiro")}</p>
              <label
                className={`group relative flex w-full cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed px-4 text-center transition-colors ${
                  attachments.length > 0 ? "min-h-[102px]" : "min-h-[120px]"
                } ${
                  dragging
                    ? "border-blue-400 bg-blue-50/80 dark:border-blue-400 dark:bg-slate-900/80"
                    : "border-slate-300 bg-slate-50/70 hover:border-slate-400 dark:border-slate-700 dark:bg-slate-950/55 dark:hover:border-slate-500"
                } ${forceLight ? "!border-[#CBD5E1] !bg-slate-50/70 hover:!border-slate-400" : ""}`}
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(event) => {
                  event.preventDefault();
                  setDragging(false);
                  handleFileSelect(event.dataTransfer.files);
                }}
              >
                <Paperclip className="h-5 w-5 text-slate-500 dark:text-slate-300" />
                <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                  {t("Drag & drop files here", "Glissez-deposez vos fichiers ici", "Dateien hierher ziehen und ablegen", "Arrastra y suelta archivos aqui", "Arraste e largue os ficheiros aqui")}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {t("or click to upload", "ou cliquez pour télevérser", "oder klicken zum Hochladen", "o haz clic para subirlos", "ou clique para carregar")}
                </p>
                <span className="pointer-events-none absolute bottom-3 right-3 text-[11px] text-slate-500 dark:text-slate-400">
                  {t("JPG, PNG, PDF - Up to 3 files, 5MB each", "JPG, PNG, PDF - Jusqu a 3 fichiers, 5 Mo chacun", "JPG, PNG, PDF - Bis zu 3 Dateien, je 5 MB", "JPG, PNG, PDF - Hasta 3 archivos, 5 MB cada uno", "JPG, PNG, PDF - At? 3 ficheiros, 5 MB cada")}
                </span>
                <input
                  type="file"
                  accept=".jpg,.jpeg,.png,.pdf"
                  multiple
                  className="hidden"
                  onChange={(event) => handleFileSelect(event.target.files)}
                />
              </label>
              {uploadError ? (
                <p className="text-xs text-rose-600 dark:text-rose-300">{uploadError}</p>
              ) : null}
              {attachments.length > 0 ? (
                <div className="space-y-2">
                  {attachments.map((attachment) => {
                    const preview = attachmentPreviews[`${attachment.name}-${attachment.size}-${attachment.lastModified}`];
                    return (
                      <div
                        key={`${attachment.name}-${attachment.size}-${attachment.lastModified}`}
                        className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-950/60 max-md:flex-col max-md:items-start"
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          {preview ? (
                            <Image
                              src={preview}
                              alt={t({
                                en: "Attachment preview",
                                fr: "Apercu de la piece jointe",
                                de: "Vorschau des Anhangs",
                                es: "Vista previa del adjunto",
                                pt: "Pre-visualiza??o do anexo",
                              })}
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
                            setAttachments((current) =>
                              current.filter(
                                (file) =>
                                  !(
                                    file.name === attachment.name &&
                                    file.size === attachment.size &&
                                    file.lastModified === attachment.lastModified
                                  )
                              )
                            );
                            setUploadError(null);
                          }}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                          aria-label={t({
                            en: "Remove attachment",
                            fr: "Supprimer la piece jointe",
                            de: "Anhang entfernen",
                            es: "Eliminar adjunto",
                            pt: "Remover anexo",
                          })}
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-6">
              <p className="w-full text-sm text-slate-500 dark:text-slate-400">
                {t("Our team replies from ", "Notre équipe repond depuis ", "Unser Team antwortet von ", "Nuestro equipo responde desde ", "A nossa equipa responde a partir de ")}
                <a
                  href={supportMailto}
                  className="font-medium text-slate-700 transition-colors hover:text-slate-900 dark:text-slate-200 dark:hover:text-white"
                >
                  {supportEmail}
                </a>
              </p>
              <Button
                onClick={submit}
                loading={sending}
                className={`w-full rounded-[14px] bg-gradient-to-r from-[#2563EB] to-[#1D4ED8] px-6 py-3 text-sm font-semibold text-white shadow-[0_12px_28px_rgba(37,99,235,0.35)] transition-all hover:-translate-y-[1px] hover:brightness-105 focus:ring-4 focus:ring-blue-100 dark:focus:ring-blue-500/25 sm:w-auto sm:min-w-[260px] ${
                  forceLight
                    ? "rounded-xl bg-[linear-gradient(135deg,#2563EB,#1D4ED8)] shadow-[0_4px_14px_rgba(37,99,235,0.35)] duration-200 hover:shadow-[0_6px_18px_rgba(37,99,235,0.45)] focus:!ring-[3px] focus:!ring-[rgba(37,99,235,0.15)]"
                    : ""
                }`}
              >
                {t("Submit support ticket", "Soumettre le ticket support", "Support-Ticket senden", "Enviar ticket de soporte", "Enviar ticket de suporte")}
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
