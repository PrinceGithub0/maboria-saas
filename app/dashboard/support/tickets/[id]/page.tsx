"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import useSWR, { useSWRConfig } from "swr";
import { formatDistanceToNow } from "date-fns";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { TransientAlert } from "@/components/ui/transient-alert";
import { useLanguage } from "@/components/providers/language-provider";
import { useTheme } from "@/components/providers/theme-provider";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { supportEmail, supportMailto } from "@/lib/support/contact";
import { Paperclip, X } from "lucide-react";
import Image from "next/image";

type TicketAttachment = {
  id?: string;
  filename: string;
  contentType?: string;
  sizeBytes?: number;
  storageKey?: string;
};

type TicketReply = {
  id: string;
  body: string;
  createdAt: string;
  senderType?: "SUBSCRIBER" | "ADMIN" | "SYSTEM";
  deliveryStatus?: string;
  attachments?: TicketAttachment[];
};

type Ticket = {
  id: string;
  title: string;
  message: string;
  version?: number;
  status: string;
  createdAt: string;
  metadata?: Record<string, unknown> | null;
  replies?: TicketReply[];
};

type SupportAttachmentPayload = {
  filename: string;
  contentType: "image/jpeg" | "image/png" | "application/pdf";
  base64: string;
  sizeBytes: number;
};

const MAX_ATTACHMENTS = 3;
const ALLOWED_ATTACHMENT_TYPES = ["image/jpeg", "image/png", "application/pdf"] as const;

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to fetch tickets");
  return res.json();
};

const parseTicketTitle = (rawTitle: string) => {
  const title = String(rawTitle || "");
  const match = title.match(/^\[(.+?)\]\s*(.+)$/);
  if (match) {
    return { category: match[1], subject: match[2] };
  }
  return { category: "Other", subject: title };
};

function formatFileSize(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

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

const toAttachmentPayload = async (file: File): Promise<SupportAttachmentPayload> => ({
  filename: file.name,
  contentType: file.type as SupportAttachmentPayload["contentType"],
  base64: await fileToBase64(file),
  sizeBytes: file.size,
});

export default function SupportTicketDetailsPage() {
  const { language } = useLanguage();
  const { theme, resolvedTheme } = useTheme();
  const forceLight = theme === "light" || resolvedTheme === "light";
  const t = (en: string, fr: string) => (language === "fr" ? fr : en);
  const params = useParams<{ id: string }>();
  const ticketId = String(params?.id || "");
  const { mutate: mutateCache } = useSWRConfig();
  const { data: ticket, isLoading, error, mutate } = useSWR<Ticket>(ticketId ? `/api/support/${ticketId}` : null, fetcher, {
    shouldRetryOnError: false,
  });
  const [replyMessage, setReplyMessage] = useState("");
  const [replying, setReplying] = useState(false);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [status, setStatus] = useState<{ message: string; variant: "success" | "warning" | "error" | "info" } | null>(null);
  const [replyAttachments, setReplyAttachments] = useState<File[]>([]);
  const [replyPreviews, setReplyPreviews] = useState<Record<string, string>>({});
  const parsed = parseTicketTitle(ticket?.title || "");
  const detailCardClass = forceLight
    ? "rounded-2xl border border-[#E2E8F0] bg-white p-6 shadow-[0_18px_40px_rgba(15,23,42,0.08)]"
    : "rounded-2xl border border-slate-800 bg-[linear-gradient(180deg,rgba(15,23,42,0.97),rgba(17,24,39,0.95))] p-6 shadow-[0_20px_46px_rgba(2,6,23,0.38)]";
  const contentPanelClass = forceLight
    ? "!border-[#E2E8F0] !bg-white"
    : "dark:border-slate-800 dark:bg-slate-950/45";

  const revalidateSupportLists = async () => {
    await mutateCache(
      (key) => typeof key === "string" && key.startsWith("/api/support"),
      undefined,
      { revalidate: true }
    );
  };

  useEffect(() => {
    const nextPreviews: Record<string, string> = {};
    const allocated: string[] = [];
    replyAttachments.forEach((file) => {
      if (file.type === "application/pdf") return;
      const preview = URL.createObjectURL(file);
      nextPreviews[`${file.name}-${file.size}-${file.lastModified}`] = preview;
      allocated.push(preview);
    });
    setReplyPreviews(nextPreviews);
    return () => {
      allocated.forEach((preview) => URL.revokeObjectURL(preview));
    };
  }, [replyAttachments]);

  const attachments = (() => {
    const value = ticket?.metadata && typeof ticket.metadata === "object" ? (ticket.metadata as any).attachments : null;
    if (!Array.isArray(value)) return [] as TicketAttachment[];
    return value
      .map((item) => ({
        id: typeof (item as any)?.id === "string" ? String((item as any).id).trim() : undefined,
        filename: String((item as any)?.filename || "").trim(),
        sizeBytes: Number((item as any)?.sizeBytes || 0),
      }))
      .filter((item) => item.filename.length > 0);
  })();

  const getStatusPill = (status: string) => {
    const normalized = String(status || "").toUpperCase();
    if (normalized === "RESOLVED") {
      return {
        label: t("Resolved", "Resolue"),
        className:
          "bg-green-100 text-green-700 border-green-200 font-bold dark:bg-green-500/10 dark:text-green-300 dark:border-green-500/40",
      };
    }
    if (normalized === "IN_PROGRESS" || normalized === "PENDING") {
      return {
        label: t("Pending", "En attente"),
        className:
          "bg-amber-100 text-amber-700 border-amber-200 font-bold dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/40",
      };
    }
    if (normalized === "CLOSED") {
      return {
        label: t("Closed", "Ferme"),
        className:
          "bg-emerald-100 text-emerald-700 border-emerald-200 font-bold dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/40",
      };
    }
    return {
      label: t("Open", "Ouvert"),
      className:
        "bg-orange-100 text-orange-700 border-orange-200 font-bold dark:bg-orange-500/10 dark:text-orange-300 dark:border-orange-500/40",
    };
  };

  const handleReplyFiles = (fileList: FileList | File[] | null) => {
    const incoming = Array.from(fileList || []);
    if (incoming.length === 0) return;

    const nextFiles = [...replyAttachments];
    let nextError: string | null = null;

    for (const file of incoming) {
      if (!ALLOWED_ATTACHMENT_TYPES.includes(file.type as (typeof ALLOWED_ATTACHMENT_TYPES)[number])) {
        nextError = t("Only JPG, PNG, or PDF files are supported.", "Seuls les fichiers JPG, PNG, ou PDF sont acceptes.");
        continue;
      }
      if (file.size > 5 * 1024 * 1024) {
        nextError = t("Each file must be 5MB or smaller.", "Chaque fichier doit faire 5 Mo maximum.");
        continue;
      }
      if (nextFiles.some((existing) => existing.name === file.name && existing.size === file.size && existing.lastModified === file.lastModified)) {
        continue;
      }
      if (nextFiles.length >= MAX_ATTACHMENTS) {
        nextError = t("You can attach up to 3 files.", "Vous pouvez joindre jusqu a 3 fichiers.");
        break;
      }
      nextFiles.push(file);
    }

    setReplyAttachments(nextFiles);
    if (nextError) {
      setStatus({ message: nextError, variant: "warning" });
    }
  };

  const updateTicketStatus = async () => {
    if (!ticket || statusUpdating) return;
    setStatus(null);
    setStatusUpdating(true);
    try {
      const res = await fetch(`/api/support/${ticket.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "OPEN", version: ticket.version }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatus({
          message: data.error || t("Could not update ticket status.", "Impossible de mettre a jour le statut du ticket."),
          variant: "error",
        });
        return;
      }
      await mutate((current) => (current ? { ...current, ...data } : current), false);
      await revalidateSupportLists();
      setStatus({
        message: t("Ticket reopened.", "Ticket rouvert."),
        variant: "success",
      });
    } catch {
      setStatus({
        message: t("Could not update ticket status.", "Impossible de mettre a jour le statut du ticket."),
        variant: "error",
      });
    } finally {
      setStatusUpdating(false);
    }
  };

  const submitReply = async () => {
    if (!ticket || replying) return;
    const message = replyMessage.trim();
    if (!message) {
      setStatus({
        message: t("Reply message is required.", "Le message de reponse est requis."),
        variant: "warning",
      });
      return;
    }
    setReplying(true);
    setStatus(null);
    try {
      const attachments =
        replyAttachments.length > 0
          ? await Promise.all(replyAttachments.map((file) => toAttachmentPayload(file)))
          : undefined;
      const res = await fetch(`/api/support/${ticket.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, attachments }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatus({
          message: data.error || t("Could not send reply.", "Impossible d envoyer la reponse."),
          variant: "error",
        });
        return;
      }
      setReplyMessage("");
      setReplyAttachments([]);
      await mutate(data.ticket, false);
      await revalidateSupportLists();
      setStatus({
        message: data.emailError
          ? t(
              `Reply saved, but support email delivery failed: ${data.emailError}`,
              `Reponse enregistree, mais l envoi de l email support a echoue : ${data.emailError}`
            )
          : t("Reply sent successfully.", "Reponse envoyee avec succes."),
        variant: data.emailError ? "warning" : "success",
      });
    } catch (error: any) {
      setStatus({
        message: t(
          `Could not send reply. ${error?.message || "Please try again."}`,
          `Impossible d envoyer la reponse. ${error?.message || "Veuillez reessayer."}`
        ),
        variant: "error",
      });
    } finally {
      setReplying(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-[1150px] space-y-6">
      <section className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
            {t("Support", "Support")}
          </p>
          <h1 className="mt-2 text-3xl font-bold text-slate-900 dark:text-slate-100">
            {t("Ticket details", "Details du ticket")}
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {t("Our team replies from ", "Notre equipe repond depuis ")}
            <a href={supportMailto} className="font-medium hover:text-slate-800 dark:hover:text-slate-200">
              {supportEmail}
            </a>
          </p>
        </div>
        <Link href="/dashboard/support/tickets" className="text-sm font-semibold text-[#2563EB] hover:underline dark:text-[#3B82F6]">
          {t("Back to all tickets", "Retour a tous les tickets")}
        </Link>
      </section>

      <Card className={detailCardClass}>
        {status ? (
          <div className="mb-4">
            <TransientAlert variant={status.variant} onDismiss={() => setStatus(null)}>
              {status.message}
            </TransientAlert>
          </div>
        ) : null}
        {isLoading ? (
          <p className="text-sm text-slate-500 dark:text-slate-300">{t("Loading ticket...", "Chargement du ticket...")}</p>
        ) : error ? (
          <p className="text-sm text-slate-500 dark:text-slate-300">
            {t(
              "We could not load this ticket right now. Please refresh and try again.",
              "Nous n avons pas pu charger ce ticket pour le moment. Veuillez actualiser et reessayer."
            )}
          </p>
        ) : !ticket ? (
          <p className="text-sm text-slate-500 dark:text-slate-300">{t("Ticket not found.", "Ticket introuvable.")}</p>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
                  {parsed.category}
                </p>
                <h2 className="mt-1 text-xl font-semibold text-slate-900 dark:text-slate-100">{parsed.subject}</h2>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {formatDistanceToNow(new Date(ticket.createdAt), { addSuffix: true })}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-bold ${getStatusPill(ticket.status).className}`}>
                  {getStatusPill(ticket.status).label}
                </span>
                {String(ticket.status || "").toUpperCase() === "CLOSED" ? (
                  <Button variant="secondary" onClick={updateTicketStatus} loading={statusUpdating}>
                    {t("Reopen ticket", "Rouvrir le ticket")}
                  </Button>
                ) : null}
              </div>
            </div>
            <div
              className={`rounded-xl border border-slate-200 bg-white px-4 py-4 ${contentPanelClass}`}
            >
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700 dark:text-slate-200">
                {ticket.message}
              </p>
            </div>
            {attachments.length > 0 ? (
              <div className="space-y-2">
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t("Initial attachments", "Pieces jointes initiales")}</p>
                <ul className="space-y-1">
                  {attachments.map((attachment) => (
                    <li key={attachment.id || attachment.filename} className="text-sm text-slate-600 dark:text-slate-300">
                      {attachment.id ? (
                        <a
                          href={`/api/support/${encodeURIComponent(ticket.id)}/attachments/${encodeURIComponent(attachment.id)}`}
                          target="_blank"
                          rel="noreferrer"
                          className="font-medium text-indigo-600 underline decoration-indigo-200 underline-offset-4 hover:text-indigo-500 dark:text-indigo-300"
                        >
                          {attachment.filename}
                        </a>
                      ) : (
                        attachment.filename
                      )}
                      {typeof attachment.sizeBytes === "number" && attachment.sizeBytes > 0
                        ? ` | ${formatFileSize(attachment.sizeBytes)}`
                        : ""}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {Array.isArray(ticket.replies) && ticket.replies.length > 0 ? (
              <div className="space-y-3">
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t("Conversation", "Conversation")}</p>
                <div className="space-y-2">
                  {ticket.replies.map((reply) => (
                    <div
                      key={reply.id}
                      className={`rounded-xl border border-slate-200 bg-white px-4 py-3 ${contentPanelClass}`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
                          {reply.senderType === "SUBSCRIBER"
                            ? t("You", "Vous")
                            : t("Support team", "Equipe support")}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {formatDistanceToNow(new Date(reply.createdAt), { addSuffix: true })}
                        </p>
                      </div>
                      <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700 dark:text-slate-200">
                        {reply.body}
                      </p>
                      {Array.isArray(reply.attachments) && reply.attachments.length > 0 ? (
                        <div className="mt-3 rounded-lg border border-dashed border-slate-300 bg-slate-50/80 px-3 py-2 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-950/55 dark:text-slate-300">
                          <p className="font-semibold">
                            {t("Submitted attachments", "Pieces jointes soumises")}
                          </p>
                          <ul className="mt-1 space-y-1">
                            {reply.attachments.map((attachment) => (
                              <li key={`${reply.id}-${attachment.id || attachment.filename}`}>
                                {attachment.id ? (
                                  <a
                                    href={`/api/support/${encodeURIComponent(ticket.id)}/attachments/${encodeURIComponent(attachment.id)}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="font-medium text-indigo-600 underline decoration-indigo-200 underline-offset-4 hover:text-indigo-500 dark:text-indigo-300"
                                  >
                                    {attachment.filename}
                                  </a>
                                ) : (
                                  attachment.filename
                                )}
                                {typeof attachment.sizeBytes === "number" && attachment.sizeBytes > 0
                                  ? ` | ${formatFileSize(attachment.sizeBytes)}`
                                  : ""}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                      {reply.senderType !== "SUBSCRIBER" && String(reply.deliveryStatus || "").toUpperCase() === "FAILED" ? (
                        <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
                          {t(
                            "This support reply was saved, but email delivery to you failed.",
                            "Cette reponse support a ete enregistree, mais l envoi de l email vers vous a echoue."
                          )}
                        </p>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            <div
              className={`rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-slate-50/70 to-blue-50/40 p-5 shadow-sm dark:border-slate-700/80 dark:from-slate-900 dark:via-slate-900/95 dark:to-slate-800/80 ${
                forceLight ? "!border-[#E2E8F0] !bg-[linear-gradient(135deg,#FFFFFF,#F8FAFC_58%,#EFF6FF)] !shadow-[0_14px_32px_rgba(15,23,42,0.08)]" : ""
              }`}
            >
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {String(ticket.status || "").toUpperCase() === "CLOSED"
                  ? t("Reply to reopen this ticket", "Repondre pour rouvrir ce ticket")
                  : t("Reply to support", "Repondre au support")}
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {t(
                  "Your reply is added to the ticket thread and emailed to support.",
                  "Votre reponse est ajoutee au fil du ticket et envoyee par email au support."
                )}
              </p>
              <div className="mt-4 space-y-3">
                <Textarea
                  label={t("Reply message", "Message de reponse")}
                  value={replyMessage}
                  required
                  rows={6}
                  onChange={(event) => setReplyMessage(event.target.value)}
                  placeholder={t("Add more details or respond to support...", "Ajoutez plus de details ou repondez au support...")}
                  className={`rounded-xl border-slate-200 bg-white px-3.5 py-3 text-sm transition-colors hover:border-slate-300 focus:border-blue-500 focus:ring-4 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-950/85 dark:text-slate-100 dark:placeholder:text-slate-500 dark:hover:border-slate-500 dark:focus:border-blue-400 dark:focus:ring-blue-500/25 ${
                    forceLight
                      ? "!border-[#CBD5E1] !bg-white !text-[#0F172A] placeholder:!text-slate-500 hover:!border-slate-400 focus:!border-[#2563EB] focus:!ring-[3px] focus:!ring-[rgba(37,99,235,0.15)]"
                      : ""
                  }`}
                />
                <div className="space-y-3">
                  <label
                    className={`group relative flex min-h-[104px] w-full cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-slate-300 bg-white px-4 text-center transition-colors hover:border-slate-400 dark:border-slate-700 dark:bg-slate-900/60 dark:hover:border-slate-500 ${
                      forceLight ? "!border-[#94A3B8] !bg-white hover:!border-[#2563EB]" : ""
                    }`}
                  >
                    <Paperclip className="h-5 w-5 text-slate-500 dark:text-slate-300" />
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                      {t("Add screenshots or documents", "Ajoutez des captures ou documents")}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {t("JPG, PNG, PDF - up to 3 files, 5MB each", "JPG, PNG, PDF - jusqu a 3 fichiers, 5 Mo chacun")}
                    </p>
                    <input
                      type="file"
                      accept=".jpg,.jpeg,.png,.pdf"
                      multiple
                      className="hidden"
                      onChange={(event) => handleReplyFiles(event.target.files)}
                    />
                  </label>
                  {replyAttachments.length > 0 ? (
                    <div className="space-y-2">
                      {replyAttachments.map((attachment) => {
                        const preview = replyPreviews[`${attachment.name}-${attachment.size}-${attachment.lastModified}`];
                        return (
                          <div
                            key={`${attachment.name}-${attachment.size}-${attachment.lastModified}`}
                            className={`flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900/60 max-md:flex-col max-md:items-start ${
                              forceLight ? "!border-[#E2E8F0] !bg-[#FFFFFF]" : ""
                            }`}
                          >
                            <div className="flex min-w-0 items-center gap-3">
                              {preview ? (
                                <Image
                                  src={preview}
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
                              onClick={() =>
                                setReplyAttachments((current) =>
                                  current.filter(
                                    (file) =>
                                      !(
                                        file.name === attachment.name &&
                                        file.size === attachment.size &&
                                        file.lastModified === attachment.lastModified
                                      )
                                  )
                                )
                              }
                              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                              aria-label="Remove attachment"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {t(
                      "If the ticket is closed, sending a reply will reopen it automatically.",
                      "Si le ticket est ferme, l envoi d une reponse le rouvrira automatiquement."
                    )}
                  </p>
                  <Button onClick={submitReply} loading={replying} disabled={replying || !replyMessage.trim()}>
                    {t("Send reply", "Envoyer la reponse")}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
