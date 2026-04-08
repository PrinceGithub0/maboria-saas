"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { useParams, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import useSWR, { useSWRConfig } from "swr";
import { Ellipsis, Paperclip, Smile } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useLanguage } from "@/components/providers/language-provider";
import { formatAdminIdentifierLabel, localizeAdminActionLabel, localizeAdminServerMessage, localizeAdminStatus } from "@/lib/admin/localization";
import { formatDateTimeDMY } from "@/lib/date";
import { LANGUAGE_LOCALES } from "@/lib/i18n";
import { getReplyAssignmentDecision } from "@/lib/support/reply-assignment";

type TicketStatus = "OPEN" | "PENDING" | "RESOLVED";
type TicketPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";

type Agent = {
  id: string;
  name: string | null;
  email: string;
};

type ThreadEntry = {
  type: "message" | "note";
  id: string;
  author: {
    id: string;
    name: string;
    roleLabel: "Customer" | "Admin" | "System";
  };
  body: string;
  attachments: Array<{ id?: string; filename?: string; contentType?: string; sizeBytes?: number; storageKey?: string }>;
  createdAt: string;
  deliveryStatus?: "QUEUED" | "SENT" | "DELIVERED" | "FAILED";
  errorMessage?: string | null;
};

type TicketDetail = {
  id: string;
  subject: string;
  status: TicketStatus;
  priority: TicketPriority;
  createdAt: string;
  updatedAt: string;
  version: number;
  archived: boolean;
  assignedAdminId: string | null;
  firstResponseAt: string | null;
  lastActivityAt: string;
  subscriber: {
    id: string;
    name: string | null;
    email: string;
    publicId: string | null;
  };
  assignedAdmin?: {
    id: string;
    name: string | null;
    email: string;
  } | null;
  threadEntries: ThreadEntry[];
  sla: {
    firstResponse: { status: string; dueAt: string | null; metAt: string | null; breachedAt: string | null };
    nextResponse: {
      status: string;
      dueAt: string | null;
      metAt: string | null;
      breachedAt: string | null;
      baselineCustomerMessageAt: string | null;
    };
    resolution: { status: string; dueAt: string | null; metAt: string | null; breachedAt: string | null };
    totalPausedSeconds: number;
  } | null;
};

type TicketReplyResponse = {
  ticket?: TicketDetail;
  message?: ThreadEntry;
  deliveryStatus?: "SENT" | "FAILED";
  errorMessage?: string | null;
  code?: string;
  error?: string;
};

type ApiAgentsResponse = { items: Agent[] };
type ApiSupportListResponse = {
  items: Array<{
    id: string;
    assignedAdminId: string | null;
    status?: TicketStatus;
    priority?: TicketPriority;
    lastActivityAt?: string;
    version?: number;
    assignedAdmin?: {
      id: string;
      name: string | null;
      email: string;
    } | null;
  }>;
};

type TimelineEvent = {
  id: string;
  eventType: string;
  createdAt: string;
  metadata?: Record<string, unknown> | null;
};

type TimelineResponse = {
  items: TimelineEvent[];
  totalCount: number;
  page: number;
  pageSize: number;
};

type SupportAttachmentPayload = {
  filename: string;
  contentType: "image/jpeg" | "image/png" | "application/pdf";
  base64: string;
  sizeBytes: number;
};

type AssignmentUndoState = {
  previousAssigneeId: string | null;
  newAssigneeId: string | null;
  newAssigneeName: string;
};

const FILTER_SELECT_CLASS =
  "h-10 rounded-md border border-border bg-card px-3 py-1 text-sm text-foreground transition-all duration-150 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-500";
const ALLOWED_ATTACHMENT_TYPES = ["image/jpeg", "image/png", "application/pdf"] as const;
const MAX_ATTACHMENT_SIZE_BYTES = 5 * 1024 * 1024;
const MAX_REPLY_ATTACHMENTS = 5;
const COMPOSER_MIN_HEIGHT = 120;
const COMPOSER_MAX_HEIGHT = 260;
const FEEDBACK_VISIBLE_MS = 10_000;
const EMOJI_OPTIONS = ["\u{1F642}", "\u{1F44D}", "\u{1F64F}", "\u{2705}", "\u{1F389}", "\u{1F440}", "\u{26A0}\u{FE0F}", "\u{1F680}"];
const fetcher = async <T,>(url: string): Promise<T> => {
  const response = await fetch(url, { cache: "no-store" });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = String((json as { error?: string })?.error || `Request failed (${response.status})`);
    throw new Error(error);
  }
  return json as T;
};

function statusBadgeVariant(status: TicketStatus) {
  if (status === "RESOLVED") return "success" as const;
  if (status === "PENDING") return "pending" as const;
  return "warning" as const;
}

function deliveryBadgeClass(status?: ThreadEntry["deliveryStatus"]) {
  if (status === "FAILED") {
    return "border border-rose-200 bg-rose-50 text-rose-700";
  }
  if (status === "DELIVERED") {
    return "border border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  if (status === "SENT") {
    return "border border-sky-200 bg-sky-50 text-sky-700";
  }
  return "border border-amber-200 bg-amber-50 text-amber-700";
}

function formatSlaLabel(
  metric: { status: string; dueAt: string | null; metAt: string | null; breachedAt: string | null },
  locale: string,
  t: (en: string, fr?: string, de?: string, es?: string, pt?: string) => string
) {
  if (metric.metAt) return `${t("Met", "Respecte", "Eingehalten", "Cumplido", "Cumprido")} ${formatDateTimeDMY(new Date(metric.metAt), locale)}`;
  if (metric.breachedAt) return `${t("Breached", "Depasse", "Verletzt", "Incumplido", "Violado")} ${formatDateTimeDMY(new Date(metric.breachedAt), locale)}`;
  if (metric.dueAt) return `${t("Due", "Echeance", "Faellig", "Vence", "Vence")} ${formatDateTimeDMY(new Date(metric.dueAt), locale)}`;
  return t("No SLA timestamp", "Aucun horodatage SLA", "Kein SLA-Zeitstempel", "Sin marca de tiempo SLA", "Sem registo temporal de SLA");
}

export default function AdminSupportTicketDetailPage() {
  const { language, t } = useLanguage();
  const { data: session } = useSession();
  const { mutate: mutateCache } = useSWRConfig();
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const ticketId = String(params?.id || "");
  const backQuery = searchParams.toString();
  const backHref = `/admin/support${backQuery ? `?${backQuery}` : ""}`;

  const {
    data: ticket,
    error,
    isLoading,
    mutate: mutateTicket,
  } = useSWR<TicketDetail>(ticketId ? `/api/admin/support/tickets/${ticketId}` : null, fetcher);
  const { data: agentsData } = useSWR<ApiAgentsResponse>("/api/admin/support/agents", fetcher);
  const agents = agentsData?.items || [];

  const actorId = String(session?.user?.id || "").trim() || null;
  const [composerMode, setComposerMode] = useState<"reply" | "note">("reply");
  const [replyDraft, setReplyDraft] = useState("");
  const [replyAttachments, setReplyAttachments] = useState<File[]>([]);
  const [replyAttachmentError, setReplyAttachmentError] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [showTakeoverConfirm, setShowTakeoverConfirm] = useState(false);
  const [feedback, setFeedback] = useState<{
    message: string;
    variant: "success" | "error" | "info";
    undoAvailable?: boolean;
  } | null>(null);
  const [saving, setSaving] = useState<null | "reply" | "assign" | "status" | "priority" | "note">(null);
  const [optimisticAssigneeId, setOptimisticAssigneeId] = useState<string | null | undefined>(undefined);
  const [assignmentUndo, setAssignmentUndo] = useState<AssignmentUndoState | null>(null);
  const [undoProcessing, setUndoProcessing] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const actionMenuRef = useRef<HTMLDivElement | null>(null);

  const [timelinePage, setTimelinePage] = useState(1);
  const [timelineItems, setTimelineItems] = useState<TimelineEvent[]>([]);
  const [timelineTotalCount, setTimelineTotalCount] = useState(0);
  const {
    data: timelineData,
    isLoading: timelineLoading,
    mutate: mutateTimeline,
  } = useSWR<TimelineResponse>(
    ticket?.id ? `/api/admin/support/tickets/${ticket.id}/timeline?page=${timelinePage}&pageSize=20` : null,
    fetcher
  );

  useEffect(() => {
    setTimelinePage(1);
    setTimelineItems([]);
    setTimelineTotalCount(0);
  }, [ticketId]);

  useEffect(() => {
    if (!timelineData) return;
    setTimelineTotalCount(timelineData.totalCount || 0);
    setTimelineItems((prev) => {
      const map = new Map<string, TimelineEvent>();
      for (const item of prev) map.set(item.id, item);
      for (const item of timelineData.items || []) map.set(item.id, item);
      return [...map.values()].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    });
  }, [timelineData]);

  const draftSnippets = {
    greeting: t("Hi there,\n\n", "Bonjour,\n\n", "Hallo,\n\n", "Hola,\n\n", "Ola,\n\n"),
    closing: t("\n\nThanks,\nSupport Team", "\n\nMerci,\néquipe support", "\n\nDanke,\nSupport-Team", "\n\nGracias,\nEquipo de soporte", "\n\nObrigado,\nEquipa de suporte"),
  };
  const takeoverAssigneeName =
    ticket?.assignedAdmin?.name ||
    ticket?.assignedAdmin?.email ||
    ticket?.assignedAdminId ||
    t("another admin", "un autre admin", "ein anderer Admin", "otro admin", "outro admin");
  const resolvedAssigneeId = (optimisticAssigneeId ?? ticket?.assignedAdminId) || null;

  const resolveAssigneeName = (assigneeId: string | null) => {
    if (!assigneeId) return t("Unassigned", "Non assigne", "Nicht zugewiesen", "Sin asignar", "Não atribuido");
    if (ticket?.assignedAdmin?.id === assigneeId) {
      return (
        ticket.assignedAdmin.name ||
        ticket.assignedAdmin.email ||
        t("Unassigned", "Non assigne", "Nicht zugewiesen", "Sin asignar", "Não atribuido")
      );
    }
    const agent = agents.find((item) => item.id === assigneeId);
    return agent?.name || agent?.email || t("Selected admin", "Admin selectionne", "Ausgewählter Admin", "Admin seleccionado", "Admin selecionado");
  };

  const supportListKeyFilter = (key: unknown) =>
    typeof key === "string" && (key === "/api/admin/support" || key.startsWith("/api/admin/support?"));

  const syncSupportListAssigneeCache = async (
    targetTicketId: string,
    nextAssigneeId: string | null,
    nextAssignee: { id: string; name: string | null; email: string } | null
  ) => {
    await mutateCache(
      supportListKeyFilter,
      (current: ApiSupportListResponse | undefined) => {
        if (!current?.items?.length) return current;
        return {
          ...current,
          items: current.items.map((item) =>
            item.id === targetTicketId
              ? {
                  ...item,
                  assignedAdminId: nextAssigneeId,
                  assignedAdmin: nextAssignee,
                }
              : item
          ),
        };
      },
      false
    );
  };

  const syncSupportListTicketCache = async (
    targetTicketId: string,
    updates: Partial<ApiSupportListResponse["items"][number]>
  ) => {
    await mutateCache(
      supportListKeyFilter,
      (current: ApiSupportListResponse | undefined) => {
        if (!current?.items?.length) return current;
        return {
          ...current,
          items: current.items.map((item) =>
            item.id === targetTicketId
              ? {
                  ...item,
                  ...updates,
                }
              : item
          ),
        };
      },
      false
    );
  };

  const revalidateSupportListCache = async () => {
    await mutateCache(supportListKeyFilter);
  };

  const fileToBase64 = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = String(reader.result || "");
        const base64 = result.includes(",") ? result.split(",")[1] : result;
        if (!base64) {
          reject(new Error("Attachment encoding failed."));
          return;
        }
        resolve(base64);
      };
      reader.onerror = () => reject(new Error("Attachment encoding failed."));
      reader.readAsDataURL(file);
    });

  const toAttachmentPayload = async (file: File): Promise<SupportAttachmentPayload> => ({
    filename: file.name,
    contentType: file.type as SupportAttachmentPayload["contentType"],
    base64: await fileToBase64(file),
    sizeBytes: file.size,
  });

  const onReplyAttachmentSelect = (fileList: FileList | null) => {
    if (!fileList?.length) return;
    const incoming = Array.from(fileList);
    const next = [...replyAttachments];
    let error: string | null = null;

    for (const file of incoming) {
      if (!ALLOWED_ATTACHMENT_TYPES.includes(file.type as (typeof ALLOWED_ATTACHMENT_TYPES)[number])) {
        error = "Only JPG, PNG, or PDF files are supported.";
        continue;
      }
      if (file.size > MAX_ATTACHMENT_SIZE_BYTES) {
        error = "Each attachment must be 5MB or smaller.";
        continue;
      }
      if (next.length >= MAX_REPLY_ATTACHMENTS) {
        error = `You can attach up to ${MAX_REPLY_ATTACHMENTS} files.`;
        break;
      }
      const duplicate = next.some(
        (existing) =>
          existing.name === file.name &&
          existing.size === file.size &&
          existing.lastModified === file.lastModified
      );
      if (!duplicate) next.push(file);
    }

    setReplyAttachmentError(error);
    setReplyAttachments(next);
  };

  const removeReplyAttachment = (index: number) => {
    setReplyAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  const updateComposerDraft = (value: string) => {
    if (composerMode === "reply") {
      setReplyDraft(value);
    } else {
      setNoteDraft(value);
    }
  };

  const getCurrentDraft = () => (composerMode === "reply" ? replyDraft : noteDraft);

  const insertIntoDraftAtCursor = (snippet: string) => {
    const textarea = document.getElementById("support-composer-textarea") as HTMLTextAreaElement | null;
    if (!textarea) {
      updateComposerDraft(`${getCurrentDraft()}${snippet}`);
      return;
    }

    const start = textarea.selectionStart ?? getCurrentDraft().length;
    const end = textarea.selectionEnd ?? start;
    const current = getCurrentDraft();
    const next = `${current.slice(0, start)}${snippet}${current.slice(end)}`;
    updateComposerDraft(next);

    window.requestAnimationFrame(() => {
      textarea.focus();
      const cursor = start + snippet.length;
      textarea.setSelectionRange(cursor, cursor);
    });
  };

  const handleMoreMenuAction = (action: "greeting" | "closing" | "clear") => {
    if (action === "greeting") {
      insertIntoDraftAtCursor(draftSnippets.greeting);
    } else if (action === "closing") {
      insertIntoDraftAtCursor(draftSnippets.closing);
    } else {
      updateComposerDraft("");
    }
    setShowMoreMenu(false);
  };

  const setStatus = async (status: TicketStatus) => {
    if (!ticket) return;
    setSaving("status");
    setFeedback(null);
    const response = await fetch(`/api/admin/support/tickets/${ticket.id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, version: ticket.version }),
    });
    const raw = await response.text();
    const payload = (() => {
      try {
        return raw ? JSON.parse(raw) : {};
      } catch {
        return {};
      }
    })() as { error?: string; ticket?: TicketDetail };
    if (!response.ok) {
      if (response.status === 409) {
        setFeedback({ message: "This ticket changed elsewhere. Reloaded latest data.", variant: "error" });
        await mutateTicket();
      } else {
        const fallback =
          typeof raw === "string" && raw.trim().length > 0
            ? raw.trim().slice(0, 180)
            : `Failed to update ticket status (${response.status}).`;
        setFeedback({ message: String(payload?.error || fallback), variant: "error" });
      }
      setSaving(null);
      return;
    }
    const nextTicket = payload?.ticket;
    if (nextTicket) {
      await mutateTicket(
        (current) =>
          current
            ? {
                ...current,
                ...nextTicket,
                threadEntries: current.threadEntries,
                sla: current.sla,
                subscriber: nextTicket.subscriber ?? current.subscriber,
                assignedAdmin: nextTicket.assignedAdmin ?? current.assignedAdmin,
              }
            : current,
        false
      );
    }
    await syncSupportListTicketCache(ticket.id, {
      status,
      lastActivityAt: new Date().toISOString(),
      version: payload?.ticket?.version,
    });
    await Promise.all([mutateTicket(), mutateTimeline(), revalidateSupportListCache()]);
    setFeedback({ message: "Status updated.", variant: "success" });
    setSaving(null);
  };

  const setPriority = async (priority: TicketPriority) => {
    if (!ticket) return;
    setSaving("priority");
    setFeedback(null);
    const response = await fetch(`/api/admin/support/tickets/${ticket.id}/priority`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ priority, version: ticket.version }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 409) {
        setFeedback({ message: "This ticket changed elsewhere. Reloaded latest data.", variant: "error" });
        await mutateTicket();
      } else {
        setFeedback({ message: String(payload?.error || "Failed to update ticket priority."), variant: "error" });
      }
      setSaving(null);
      return;
    }
    await syncSupportListTicketCache(ticket.id, {
      priority,
      lastActivityAt: new Date().toISOString(),
    });
    await Promise.all([mutateTicket(), mutateTimeline(), revalidateSupportListCache()]);
    setFeedback({ message: "Priority updated.", variant: "success" });
    setSaving(null);
  };

  const assignTicket = async (
    assigneeId: string | null,
    options?: {
      previousAssigneeId?: string | null;
      enableUndo?: boolean;
      successMessage?: string;
    }
  ) => {
    if (!ticket) return;
    const previousAssigneeId =
      options?.previousAssigneeId !== undefined ? options.previousAssigneeId : ticket.assignedAdminId || null;
    const enableUndo = options?.enableUndo === true;
    const currentAssigneeId = ticket.assignedAdminId || null;
    if (currentAssigneeId === assigneeId && optimisticAssigneeId === undefined) {
      return;
    }

    setSaving("assign");
    setOptimisticAssigneeId(assigneeId);
    setFeedback(null);
    if (enableUndo) {
      setAssignmentUndo(null);
    }
    const response = await fetch(`/api/admin/support/tickets/${ticket.id}/assign`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assigneeId, version: ticket.version }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 409) {
        setFeedback({ message: "This ticket changed elsewhere. Reloaded latest data.", variant: "error" });
        await mutateTicket();
      } else {
        setFeedback({ message: String(payload?.error || "Failed to assign ticket."), variant: "error" });
      }
      setOptimisticAssigneeId(undefined);
      setSaving(null);
      return;
    }
    const nextAssignee =
      assigneeId === null
        ? null
        : ((payload?.ticket?.assignedAdmin as { id: string; name: string | null; email: string } | undefined) ??
          (() => {
            const agent = agents.find((item) => item.id === assigneeId);
            return agent ? { id: agent.id, name: agent.name, email: agent.email } : null;
          })());
    await syncSupportListAssigneeCache(ticket.id, assigneeId, nextAssignee);
    setOptimisticAssigneeId(undefined);
    await Promise.all([mutateTicket(), mutateTimeline(), revalidateSupportListCache()]);
    if (enableUndo && previousAssigneeId !== assigneeId) {
      const newAssigneeName = resolveAssigneeName(assigneeId);
      setAssignmentUndo({
        previousAssigneeId,
        newAssigneeId: assigneeId,
        newAssigneeName,
      });
      setSaving(null);
      setFeedback({
        message: `Assigned to ${newAssigneeName}`,
        variant: "success",
        undoAvailable: true,
      });
    } else {
      setAssignmentUndo(null);
      setSaving(null);
      setFeedback({ message: options?.successMessage || "Assignee updated.", variant: "success" });
    }
  };

  const undoAssignmentChange = async () => {
    if (!assignmentUndo || undoProcessing) return;
    setUndoProcessing(true);
    await assignTicket(assignmentUndo.previousAssigneeId, {
      previousAssigneeId: assignmentUndo.newAssigneeId,
      enableUndo: false,
      successMessage: "Assignment reverted",
    });
    setUndoProcessing(false);
  };

  const sendReply = async (forceTakeover = false) => {
    if (!ticket || !replyDraft.trim()) return;
    if (!actorId) {
      setFeedback({ message: "Current admin context is unavailable.", variant: "error" });
      return;
    }
    const decision = getReplyAssignmentDecision({
      assignedAdminId: ticket.assignedAdminId,
      currentAdminId: actorId,
    });
    if (decision === "invalid") {
      setFeedback({ message: "Current admin context is unavailable.", variant: "error" });
      return;
    }
    if (decision === "confirm_takeover" && !forceTakeover) {
      setShowTakeoverConfirm(true);
      return;
    }

    let attachmentsPayload: SupportAttachmentPayload[] | undefined;
    if (replyAttachments.length > 0) {
      try {
        attachmentsPayload = await Promise.all(replyAttachments.map((file) => toAttachmentPayload(file)));
      } catch {
        setFeedback({ message: "Failed to process attachment. Please try another file.", variant: "error" });
        return;
      }
    }

    setSaving("reply");
    setFeedback(null);
    const response = await fetch(`/api/admin/support/tickets/${ticket.id}/reply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: replyDraft.trim(),
        attachments: attachmentsPayload,
        version: ticket.version,
        takeover: forceTakeover,
      }),
    });
    const payload = (await response.json().catch(() => ({}))) as TicketReplyResponse;
    if (!response.ok) {
      if (response.status === 409 && payload.code === "TAKEOVER_REQUIRED") {
        setShowTakeoverConfirm(true);
      } else if (response.status === 409) {
        setFeedback({ message: "This ticket changed elsewhere. Reloaded latest data.", variant: "error" });
        await mutateTicket();
      } else {
        setFeedback({ message: String(payload.error || "Failed to send reply."), variant: "error" });
      }
      setSaving(null);
      return;
    }

    setReplyDraft("");
    setReplyAttachments([]);
    setReplyAttachmentError(null);
    setShowTakeoverConfirm(false);
    await Promise.all([mutateTicket(), mutateTimeline()]);
    const thread = document.getElementById("support-thread-scroll");
    thread?.scrollTo({ top: thread.scrollHeight, behavior: "smooth" });
    if (payload.deliveryStatus === "FAILED") {
      setFeedback({ message: payload.errorMessage || "Reply saved but delivery failed.", variant: "error" });
    } else {
      setFeedback({ message: "Reply sent.", variant: "success" });
    }
    setSaving(null);
  };

  const addInternalNote = async () => {
    if (!ticket || !noteDraft.trim()) return;
    setSaving("note");
    setFeedback(null);
    const response = await fetch(`/api/admin/support/tickets/${ticket.id}/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: noteDraft.trim(),
        version: ticket.version,
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 409) {
        setFeedback({ message: "This ticket changed elsewhere. Reloaded latest data.", variant: "error" });
        await mutateTicket();
      } else {
        setFeedback({ message: String(payload?.error || "Failed to add internal note."), variant: "error" });
      }
      setSaving(null);
      return;
    }
    setNoteDraft("");
    await Promise.all([mutateTicket(), mutateTimeline()]);
    const thread = document.getElementById("support-thread-scroll");
    thread?.scrollTo({ top: thread.scrollHeight, behavior: "smooth" });
    setFeedback({ message: "Internal note added.", variant: "success" });
    setSaving(null);
  };

  const handleComposerKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      if (composerMode === "reply") {
        void sendReply();
      } else {
        void addInternalNote();
      }
    }
  };

  useEffect(() => {
    const el = document.getElementById("support-composer-textarea") as HTMLTextAreaElement | null;
    if (!el) return;
    el.style.height = "auto";
    const nextHeight = Math.min(Math.max(el.scrollHeight, COMPOSER_MIN_HEIGHT), COMPOSER_MAX_HEIGHT);
    el.style.height = `${nextHeight}px`;
  }, [composerMode, noteDraft, replyDraft]);

  useEffect(() => {
    if (!feedback) return;
    const timer = window.setTimeout(() => {
      setFeedback((current) => (current?.message === feedback.message ? null : current));
    }, FEEDBACK_VISIBLE_MS);
    return () => window.clearTimeout(timer);
  }, [feedback]);

  useEffect(() => {
    if (feedback) return;
    setAssignmentUndo(null);
    setUndoProcessing(false);
  }, [feedback]);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!actionMenuRef.current) return;
      if (!actionMenuRef.current.contains(event.target as Node)) {
        setShowEmojiPicker(false);
        setShowMoreMenu(false);
      }
    };

    const onEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setShowEmojiPicker(false);
      setShowMoreMenu(false);
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onEscape);
    };
  }, []);

  return (
    <div className="w-full bg-background">
      <div className="mx-auto w-full max-w-[1440px] overflow-x-hidden px-10 py-8">
        <header className="shrink-0 rounded-2xl border border-border bg-card px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <Link href={backHref} className="text-sm font-medium text-indigo-600 hover:underline">
                &larr; {t("Back to tickets", "Retour aux tickets", "Zurück zu den Tickets", "Volver a los tickets", "Voltar aos tickets")}
              </Link>
              <p className="mt-2 text-xs uppercase tracking-[0.2em] text-indigo-600">
                {t("ADMIN SUPPORT", "SUPPORT ADMIN", "ADMIN-SUPPORT", "SOPORTE ADMIN", "SUPORTE ADMIN")}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <h1 className="text-3xl font-semibold text-foreground">
                  {ticket?.subject || t("Ticket detail", "Detail du ticket", "Ticketdetails", "Detalle del ticket", "Detalhe do ticket")}
                </h1>
                {ticket ? (
                  <Badge variant="default" className="rounded-full px-3 py-1 text-sm">
                    {`#TKT-${ticket.id.slice(-8).toUpperCase()}`}
                  </Badge>
                ) : null}
                {ticket ? (
                  <Badge variant={statusBadgeVariant(ticket.status)} className="rounded-full px-3 py-1 text-sm">
                    {localizeAdminStatus(ticket.status, language)}
                  </Badge>
                ) : null}
              </div>
            </div>
            <Button
              className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white !shadow-none hover:bg-emerald-500"
              disabled={!ticket || ticket.status === "RESOLVED" || saving === "status"}
              onClick={() => void setStatus("RESOLVED")}
            >
              {t("Mark Resolved", "Marquer comme résolu", "Als gelöst markieren", "Marcar como resuelto", "Marcar como resolvido")}
            </Button>
          </div>
        </header>

        {feedback ? (
          <Alert variant={feedback.variant} className="relative z-20">
            <div className="flex items-center justify-between gap-3">
              <span>
                {feedback.variant === "error"
                  ? localizeAdminServerMessage(
                      feedback.message,
                      language,
                      t(
                        "Support action failed.",
                        "L'action de support a échoué.",
                        "Support-Aktion fehlgeschlagen.",
                        "La acción de soporte fallo.",
                        "A ação de suporte falhou."
                      )
                    )
                  : feedback.message}
              </span>
              {feedback.undoAvailable && assignmentUndo ? (
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => void undoAssignmentChange()}
                  disabled={undoProcessing}
                >
                  {undoProcessing
                    ? t("Undoing...", "Annulation...", "Wird ruckgangig gemacht...", "Deshaciendo...", "A desfazer...")
                    : t("Undo", "Annuler", "Ruckgangig", "Deshacer", "Desfazer")}
                </Button>
              ) : null}
            </div>
          </Alert>
        ) : null}
        {error ? (
          <Alert variant="error" className="relative z-20">
            {localizeAdminServerMessage(
              error.message,
              language,
              t(
                  "Failed to load ticket detail.",
                  "Impossible de charger le detail du ticket.",
                  "Ticketdetails konnten nicht geladen werden.",
                  "No se pudo cargar el detalle del ticket.",
                  "Não foi possível carregar o detalhe do ticket."
                )
            )}
          </Alert>
        ) : null}

        <div className="flex flex-col gap-8 xl:flex-row">
          <section className="min-w-0 flex-1">
            <div
              id="support-thread-scroll"
              className="max-h-[calc(100dvh-430px)] min-h-[380px] overflow-y-auto rounded-2xl border border-border bg-card p-8"
            >
              {isLoading || !ticket ? (
                <div className="space-y-3">
                  <Skeleton className="h-16 w-3/4 rounded-2xl" />
                  <Skeleton className="h-16 w-2/3 rounded-2xl" />
                  <Skeleton className="ml-auto h-16 w-3/5 rounded-2xl" />
                </div>
              ) : ticket.threadEntries.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {t("No messages yet.", "Aucun message pour le moment.", "Noch keine Nachrichten.", "Todavia no hay mensajes.", "Ainda não existem mensagens.")}
                </p>
              ) : (
                <div className="relative pl-12">
                  <div className="absolute bottom-0 left-5 top-0 w-px bg-border" />
                  {ticket.threadEntries.map((entry) => {
                    const isNote = entry.type === "note";
                    const isAdminMessage = entry.type === "message" && entry.author.roleLabel === "Admin";
                    return (
                      <article key={entry.id} className={clsx("relative mb-10 flex gap-4", isAdminMessage && "justify-end")}>
                        <div
                          className={clsx(
                            "absolute -left-12 top-1 flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card text-sm font-semibold text-muted-foreground",
                            isAdminMessage && "text-blue-600"
                          )}
                        >
                          {(entry.author.name || "?").trim().charAt(0).toUpperCase()}
                        </div>
                        <div
                          className={clsx(
                            "max-w-[680px] rounded-2xl px-6 py-4",
                            isNote
                              ? "bg-indigo-500/10"
                              : isAdminMessage
                                ? "bg-blue-500/10"
                                : "bg-muted"
                          )}
                        >
                          <div className="mb-2 flex items-center justify-between gap-4 text-sm">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-foreground">{entry.author.name}</span>
                              {isNote ? (
                                <Badge variant="default" className="rounded-full px-2 py-0.5 text-[11px]">
                                  {t("Internal Note", "Note interne", "Interne Notiz", "Nota interna", "Nota interna")}
                                </Badge>
                              ) : null}
                            </div>
                            <div className="flex items-center gap-3 text-muted-foreground">
                              <span>{formatDateTimeDMY(new Date(entry.createdAt), LANGUAGE_LOCALES[language])}</span>
                              {isAdminMessage ? <span>{t("Seen", "Vu", "Gesehen", "Visto", "Visto")}</span> : null}
                            </div>
                          </div>
                          <p className="whitespace-pre-wrap break-words text-base leading-relaxed text-foreground">{entry.body}</p>
                          {entry.attachments.length > 0 ? (
                            <div className="mt-3 space-y-1">
                              {entry.attachments.map((attachment, index) => (
                                <p key={`${entry.id}-a-${attachment.id || index}`} className="text-xs text-muted-foreground">
                                  {t("Attachment:", "Piece jointe :", "Anhang:", "Adjunto:", "Anexo:")}{" "}
                                  {attachment.id ? (
                                    <a
                                      href={`/api/admin/support/tickets/${encodeURIComponent(ticket.id)}/attachments/${encodeURIComponent(attachment.id)}`}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="font-medium text-indigo-600 underline decoration-indigo-200 underline-offset-4 hover:text-indigo-500 dark:text-indigo-300"
                                    >
                                      {attachment.filename || t("file", "fichier", "Datei", "archivo", "ficheiro")}
                                    </a>
                                  ) : (
                                    attachment.filename || t("file", "fichier", "Datei", "archivo", "ficheiro")
                                  )}
                                </p>
                              ))}
                            </div>
                          ) : null}
                          <div className="mt-3 flex items-center gap-2">
                            {entry.type === "message" && entry.deliveryStatus ? (
                              <span
                                className={clsx(
                                  "inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize",
                                  deliveryBadgeClass(entry.deliveryStatus)
                                )}
                              >
                                {t(
                                  entry.deliveryStatus === "FAILED"
                                    ? "Failed"
                                    : entry.deliveryStatus === "DELIVERED"
                                      ? "Delivered"
                                      : entry.deliveryStatus === "SENT"
                                        ? "Sent"
                                        : "Queued",
                                  entry.deliveryStatus === "FAILED"
                                    ? "Échoué"
                                    : entry.deliveryStatus === "DELIVERED"
                                      ? "Livre"
                                      : entry.deliveryStatus === "SENT"
                                        ? "Envoye"
                                        : "En file",
                                  entry.deliveryStatus === "FAILED"
                                    ? "Fehlgeschlagen"
                                    : entry.deliveryStatus === "DELIVERED"
                                      ? "Zugestellt"
                                      : entry.deliveryStatus === "SENT"
                                        ? "Gesendet"
                                        : "In Warteschlange",
                                  entry.deliveryStatus === "FAILED"
                                    ? "Fallido"
                                    : entry.deliveryStatus === "DELIVERED"
                                      ? "Entregado"
                                      : entry.deliveryStatus === "SENT"
                                        ? "Enviado"
                                        : "En cola",
                                  entry.deliveryStatus === "FAILED"
                                    ? "Falhado"
                                    : entry.deliveryStatus === "DELIVERED"
                                      ? "Entregue"
                                      : entry.deliveryStatus === "SENT"
                                        ? "Enviado"
                                        : "Em fila"
                                )}
                              </span>
                            ) : null}
                          </div>
                          {entry.errorMessage ? <p className="mt-2 text-xs text-rose-700">{entry.errorMessage}</p> : null}
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="mt-8 rounded-2xl border border-border bg-card p-6">
              <div className="space-y-6">
                <div className="inline-flex rounded-full bg-muted p-1">
                  <button
                    type="button"
                    className={clsx(
                      "rounded-full px-4 py-2 text-sm font-semibold transition",
                      composerMode === "reply" ? "bg-blue-600 text-white" : "text-foreground"
                    )}
                    onClick={() => setComposerMode("reply")}
                  >
                    {t("Reply", "Repondre", "Antworten", "Responder", "Responder")}
                  </button>
                  <button
                    type="button"
                    className={clsx(
                      "rounded-full px-4 py-2 text-sm font-semibold transition",
                      composerMode === "note" ? "bg-blue-600 text-white" : "text-foreground"
                    )}
                    onClick={() => setComposerMode("note")}
                  >
                    {t("Internal Note", "Note interne", "Interne Notiz", "Nota interna", "Nota interna")}
                  </button>
                </div>

                {replyAttachmentError ? <p className="text-xs text-rose-700">{replyAttachmentError}</p> : null}
                {composerMode === "reply" && replyAttachments.length > 0 ? (
                  <div className="max-h-20 overflow-y-auto pr-1">
                    <div className="flex flex-wrap gap-2">
                      {replyAttachments.map((file, index) => (
                        <span
                          key={`${file.name}-${file.lastModified}-${index}`}
                          className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground"
                        >
                          <span className="max-w-[240px] truncate">{file.name}</span>
                          <button
                            type="button"
                            className="text-rose-700 hover:underline"
                            onClick={() => removeReplyAttachment(index)}
                            aria-label={`${t("Remove attachment", "Supprimer la piece jointe", "Anhang entfernen", "Eliminar adjunto", "Remover anexo")} ${file.name}`}
                          >
                            {t("Remove", "Supprimer", "Entfernen", "Eliminar", "Remover")}
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}

                <Textarea
                  id="support-composer-textarea"
                  rows={5}
                  className="min-h-[120px] max-h-[260px] resize-none overflow-y-auto rounded-xl border border-border px-5 py-4 text-sm leading-relaxed focus:ring-2 focus:ring-blue-500"
                  value={composerMode === "reply" ? replyDraft : noteDraft}
                  onChange={(event) => {
                    const target = event.currentTarget;
                    target.style.height = "auto";
                    const nextHeight = Math.min(
                      Math.max(target.scrollHeight, COMPOSER_MIN_HEIGHT),
                      COMPOSER_MAX_HEIGHT
                    );
                    target.style.height = `${nextHeight}px`;
                    if (composerMode === "reply") {
                      setReplyDraft(event.target.value);
                    } else {
                      setNoteDraft(event.target.value);
                    }
                  }}
                  onKeyDown={handleComposerKeyDown}
                  placeholder={
                    composerMode === "reply"
                      ? t("Write your reply...", "Ecrivez votre réponse...", "Schreibe deine Antwort...", "Escribe tu respuesta...", "Escreva a sua resposta...")
                      : t("Write an internal note...", "Ecrivez une note interne...", "Interne Notiz schreiben...", "Escribe una nota interna...", "Escreva uma nota interna...")
                  }
                  aria-label={
                    composerMode === "reply"
                      ? t("Reply to subscriber", "Repondre a l abonne", "Dem Abonnenten antworten", "Responder al suscriptor", "Responder ao subscritor")
                      : t("Add internal note", "Ajouter une note interne", "Interne Notiz hinzufügen", "Agregar nota interna", "Adicionar nota interna")
                  }
                />

                <div className="flex items-center justify-between">
                  <div ref={actionMenuRef} className="relative flex items-center gap-2">
                    <label className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-border bg-card text-foreground hover:bg-muted">
                      <Paperclip className="h-4 w-4" />
                      <input
                        type="file"
                        accept=".jpg,.jpeg,.png,.pdf"
                        multiple
                        className="hidden"
                        onChange={(event) => {
                          onReplyAttachmentSelect(event.target.files);
                          event.currentTarget.value = "";
                        }}
                      />
                    </label>
                    <button
                      type="button"
                      className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card text-foreground hover:bg-muted"
                      aria-label={t("Emoji", "Emoji", "Emoji", "Emoji", "Emoji")}
                      onClick={() => {
                        setShowEmojiPicker((prev) => !prev);
                        setShowMoreMenu(false);
                      }}
                    >
                      <Smile className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card text-foreground hover:bg-muted"
                      aria-label={t("More options", "Plus d options", "Weitere Optionen", "Más opciones", "Mais opcoes")}
                      onClick={() => {
                        setShowMoreMenu((prev) => !prev);
                        setShowEmojiPicker(false);
                      }}
                    >
                      <Ellipsis className="h-4 w-4" />
                    </button>
                    {showEmojiPicker ? (
                      <div className="absolute bottom-11 left-0 z-20 flex items-center gap-1 rounded-xl border border-border bg-card p-2">
                        {EMOJI_OPTIONS.map((emoji) => (
                          <button
                            key={emoji}
                            type="button"
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-base hover:bg-muted"
                            onClick={() => {
                              insertIntoDraftAtCursor(emoji);
                              setShowEmojiPicker(false);
                            }}
                            aria-label={`Insert ${emoji}`}
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                    ) : null}
                    {showMoreMenu ? (
                      <div className="absolute bottom-11 left-24 z-20 w-52 rounded-xl border border-border bg-card p-1">
                        <button
                          type="button"
                          className="block w-full rounded-lg px-3 py-2 text-left text-sm text-foreground hover:bg-muted"
                          onClick={() => handleMoreMenuAction("greeting")}
                        >
                          {t("Insert greeting", "Inserer une salutation", "Begrussung einfügen", "Insertar saludo", "Inserir saudacao")}
                        </button>
                        <button
                          type="button"
                          className="block w-full rounded-lg px-3 py-2 text-left text-sm text-foreground hover:bg-muted"
                          onClick={() => handleMoreMenuAction("closing")}
                        >
                          {t("Insert closing", "Inserer une formule finale", "Abschluss einfügen", "Insertar cierre", "Inserir despedida")}
                        </button>
                        <button
                          type="button"
                          className="block w-full rounded-lg px-3 py-2 text-left text-sm text-rose-700 hover:bg-rose-50"
                          onClick={() => handleMoreMenuAction("clear")}
                        >
                          {t("Clear draft", "Effacer le brouillon", "Entwurf leeren", "Borrar borrador", "Limpar rascunho")}
                        </button>
                      </div>
                    ) : null}
                  </div>
                  <Button
                    className="rounded-xl bg-blue-600 px-6 py-2 text-sm font-semibold text-white !shadow-none hover:bg-blue-500"
                    onClick={() => (composerMode === "reply" ? void sendReply() : void addInternalNote())}
                    disabled={
                      saving === "reply" ||
                      saving === "note" ||
                      (composerMode === "reply" ? !replyDraft.trim() : !noteDraft.trim())
                    }
                  >
                    {composerMode === "reply"
                      ? saving === "reply"
                        ? t("Sending...", "Envoi...", "Wird gesendet...", "Enviando...", "A enviar...")
                        : t("Send Reply", "Envoyer la réponse", "Antwort senden", "Enviar respuesta", "Enviar resposta")
                      : saving === "note"
                        ? t("Saving...", "Enregistrement...", "Wird gespeichert...", "Guardando...", "A guardar...")
                        : t("Add Note", "Ajouter une note", "Notiz hinzufügen", "Agregar nota", "Adicionar nota")}
                  </Button>
                </div>
              </div>
            </div>
          </section>

          <aside className="w-full shrink-0 rounded-2xl border border-border bg-card p-6 xl:w-[340px]">
            {isLoading || !ticket ? (
              <div className="space-y-3">
                <Skeleton className="h-10 w-full rounded" />
                <Skeleton className="h-10 w-full rounded" />
                <Skeleton className="h-10 w-full rounded" />
              </div>
            ) : (
              <div className="space-y-5">
                <div className="space-y-1">
                  <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                    {t("Status", "Statut", "Status", "Estado", "Estado")}
                  </p>
                  <Badge variant={statusBadgeVariant(ticket.status)} className="px-2 py-0.5">
                    {localizeAdminStatus(ticket.status, language)}
                  </Badge>
                </div>

                <div className="space-y-2">
                  <label className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                    {t("Status", "Statut", "Status", "Estado", "Estado")}
                  </label>
                  <select
                    value={ticket.status}
                    onChange={(event) => void setStatus(event.target.value as TicketStatus)}
                    disabled={saving === "status"}
                    className={FILTER_SELECT_CLASS}
                    aria-label={t("Update ticket status", "Mettre ? jour le statut du ticket", "Ticketstatus aktualisieren", "Actualizar estado del ticket", "Atualizar estado do ticket")}
                  >
                    <option value="OPEN">{t("Open", "Ouvert", "Offen", "Abierto", "Aberto")}</option>
                    <option value="PENDING">{t("Pending", "En attente", "Ausstehend", "Pendiente", "Pendente")}</option>
                    <option value="RESOLVED">{t("Resolved", "Résolu", "Gelöst", "Resuelto", "Resolvido")}</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                    {t("Priority", "Priorit?", "Prioritat", "Prioridad", "Prioridade")}
                  </label>
                  <select
                    value={ticket.priority}
                    onChange={(event) => void setPriority(event.target.value as TicketPriority)}
                    disabled={saving === "priority"}
                    className={FILTER_SELECT_CLASS}
                    aria-label={t("Update ticket priority", "Mettre ? jour la priorité du ticket", "Ticketprioritat aktualisieren", "Actualizar prioridad del ticket", "Atualizar prioridade do ticket")}
                  >
                    <option value="LOW">{t("Low", "Bas", "Niedrig", "Baja", "Baixa")}</option>
                    <option value="MEDIUM">{t("Medium", "Moyen", "Mittel", "Media", "Media")}</option>
                    <option value="HIGH">{t("High", "Eleve", "Hoch", "Alta", "Alta")}</option>
                    <option value="URGENT">{t("Urgent", "Urgent", "Dringend", "Urgente", "Urgente")}</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                    {t("Assignee", "Responsable", "Bearbeiter", "Asignado", "Responsavel")}
                  </label>
                  <select
                    value={resolvedAssigneeId || ""}
                    onChange={(event) =>
                      void assignTicket(event.target.value || null, {
                        previousAssigneeId: ticket.assignedAdminId || null,
                        enableUndo: true,
                      })
                    }
                    disabled={saving === "assign"}
                    className={FILTER_SELECT_CLASS}
                    aria-label={t("Assign ticket", "Assigner le ticket", "Ticket zuweisen", "Asignar ticket", "Atribuir ticket")}
                  >
                    <option value="">{t("Unassigned", "Non assigne", "Nicht zugewiesen", "Sin asignar", "Não atribuido")}</option>
                    {agents.map((agent) => (
                      <option key={agent.id} value={agent.id}>
                        {agent.name || agent.email}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1 border-t border-border/70 pt-4 text-sm">
                  <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                    {t("Ticket metadata", "Métadonnées du ticket", "Ticket-Metadaten", "Metadatos del ticket", "Metadados do ticket")}
                  </p>
                  <p className="text-muted-foreground">
                    {t("Updated", "Mis ? jour", "Aktualisiert", "Actualizado", "Atualizado")} {formatDateTimeDMY(new Date(ticket.lastActivityAt), LANGUAGE_LOCALES[language])}
                  </p>
                  <p className="text-muted-foreground">
                    {t("First response", "Premiere réponse", "Erste Antwort", "Primera respuesta", "Primeira resposta")}{" "}
                    {ticket.firstResponseAt ? formatDateTimeDMY(new Date(ticket.firstResponseAt), LANGUAGE_LOCALES[language]) : t("Pending", "En attente", "Ausstehend", "Pendiente", "Pendente")}
                  </p>
                </div>

                <div className="space-y-2 border-t border-border/70 pt-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">SLA</p>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className={clsx(
                        "h-full rounded-full",
                        ticket.sla?.firstResponse?.status === "breached" ||
                          ticket.sla?.nextResponse?.status === "breached" ||
                          ticket.sla?.resolution?.status === "breached"
                          ? "w-full bg-rose-500"
                          : "w-2/3 bg-emerald-500"
                      )}
                    />
                  </div>
                  {ticket.sla ? (
                    <div className="space-y-2 text-sm">
                      <div className="flex items-start justify-between gap-3">
                        <span className="text-muted-foreground">{t("First Response", "Premiere réponse", "Erste Antwort", "Primera respuesta", "Primeira resposta")}</span>
                        <span className="text-right text-foreground">
                          {ticket.sla.firstResponse.status}
                          <br />
                          <span className="text-xs text-muted-foreground">
                            {formatSlaLabel(ticket.sla.firstResponse, LANGUAGE_LOCALES[language], t)}
                          </span>
                        </span>
                      </div>
                      <div className="flex items-start justify-between gap-3">
                        <span className="text-muted-foreground">{t("Next Response", "Réponse suivante", "Nächste Antwort", "Siguiente respuesta", "Resposta seguinte")}</span>
                        <span className="text-right text-foreground">
                          {ticket.sla.nextResponse.status}
                          <br />
                          <span className="text-xs text-muted-foreground">{formatSlaLabel(ticket.sla.nextResponse, LANGUAGE_LOCALES[language], t)}</span>
                        </span>
                      </div>
                      <div className="flex items-start justify-between gap-3">
                        <span className="text-muted-foreground">{t("Résolution", "Résolution", "Lösung", "Résolucion", "Résolucao")}</span>
                        <span className="text-right text-foreground">
                          {ticket.sla.resolution.status}
                          <br />
                          <span className="text-xs text-muted-foreground">{formatSlaLabel(ticket.sla.resolution, LANGUAGE_LOCALES[language], t)}</span>
                        </span>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      {t("SLA not available.", "SLA indisponible.", "SLA nicht verfügbar.", "SLA no disponible.", "SLA indisponível.")}
                    </p>
                  )}
                </div>

                <div className="space-y-3 border-t border-border/70 pt-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                    {t("Customer", "Client", "Kunde", "Cliente", "Cliente")}
                  </p>
                  <div className="rounded-2xl border border-border p-4">
                    <div className="mb-3 flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-muted text-sm font-semibold text-foreground">
                        {(ticket.subscriber.name || ticket.subscriber.email || "C").trim().charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-foreground">
                          {ticket.subscriber.name || t("Customer", "Client", "Kunde", "Cliente", "Cliente")}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {ticket.subscriber.publicId || ticket.subscriber.id}
                        </p>
                      </div>
                    </div>
                    <p className="truncate text-sm text-muted-foreground">{ticket.subscriber.email}</p>
                    <Link
                      href={`/admin/users?search=${encodeURIComponent(ticket.subscriber.email)}&openEmail=${encodeURIComponent(ticket.subscriber.email)}`}
                      className="mt-3 inline-flex rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-background"
                    >
                      {t("View Profile", "Voir le profil", "Profil anzeigen", "Ver perfil", "Ver perfil")}
                    </Link>
                  </div>
                </div>

                <div className="space-y-2 border-t border-border/70 pt-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                    {t("Timeline", "Chronologie", "Zeitachse", "Cronologia", "Cronologia")}
                  </p>
                  <div className="max-h-64 divide-y divide-border/70 overflow-y-auto">
                    {timelineLoading && timelineItems.length === 0 ? (
                      <Skeleton className="h-12 w-full rounded" />
                    ) : timelineItems.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        {t("No timeline events yet.", "Aucun evenement de chronologie pour le moment.", "Noch keine Zeitleistenereignisse.", "Todavia no hay eventos en la cronologia.", "Ainda não existem eventos na cronologia.")}
                      </p>
                    ) : (
                      timelineItems.map((event) => (
                        <div key={event.id} className="py-2">
                          <p className="text-xs font-semibold text-foreground">
                            {localizeAdminActionLabel(event.eventType, language, formatAdminIdentifierLabel(event.eventType))}
                          </p>
                          <p className="text-xs text-muted-foreground">{formatDateTimeDMY(new Date(event.createdAt), LANGUAGE_LOCALES[language])}</p>
                        </div>
                      ))
                    )}
                  </div>
                  {timelineItems.length < timelineTotalCount ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setTimelinePage((prev) => prev + 1)}
                      disabled={timelineLoading}
                    >
                      {t("Load more", "Charger plus", "Mehr laden", "Cargar más", "Carregar mais")}
                    </Button>
                  ) : null}
                </div>
              </div>
            )}
          </aside>
        </div>

        <Modal
          open={showTakeoverConfirm}
          onClose={() => {
            if (saving === "reply") return;
            setShowTakeoverConfirm(false);
          }}
          title={t("Take over this ticket?", "Reprendre ce ticket ?", "Dieses Ticket übernehmen?", "Tomar este ticket?", "Assumir este ticket?")}
        >
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {t("This ticket is assigned to", "Ce ticket est assigne a", "Dieses Ticket ist zugewiesen an", "Este ticket esta asignado a", "Este ticket esta atribuido a")}{" "}
              <span className="font-semibold text-foreground">{takeoverAssigneeName}</span>.{" "}
              {t("Sending a reply will reassign it to you.", "Envoyer une réponse vous le reattribuera.", "Wenn du antwortest, wird es dir neu zugewiesen.", "Enviar una respuesta lo reasignara a ti.", "Enviar uma resposta vai reatribui-lo a si.")}
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setShowTakeoverConfirm(false)} disabled={saving === "reply"}>
                {t("Cancel", "Annuler", "Abbrechen", "Cancelar", "Cancelar")}
              </Button>
              <Button onClick={() => void sendReply(true)} loading={saving === "reply"}>
                {t("Take Over & Send", "Reprendre et envoyer", "übernehmen und senden", "Tomar y enviar", "Assumir e enviar")}
              </Button>
            </div>
          </div>
        </Modal>
      </div>
    </div>
  );
}





