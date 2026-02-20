"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  Clock3,
  CreditCard,
  FileText,
  GripVertical,
  Mail,
  MessageCircle,
  Plus,
  Receipt,
  Sparkles,
  Trash2,
  UserPlus,
  XCircle,
} from "lucide-react";

type StartId =
  | "invoice_created"
  | "invoice_paid"
  | "invoice_overdue"
  | "payment_received"
  | "payment_failed"
  | "customer_created"
  | "whatsapp_received"
  | "email_received";

type Start = {
  id: StartId;
  group: "Invoices" | "Payments" | "Customers" | "Messaging";
  title: string;
  desc: string;
  phrase: string;
  type: string;
};

type Def = { id: string; group: string; title: string; phrase: string; type: string };
type Mode = "now" | "after";
type Unit = "minutes" | "hours" | "days";
type Window = "anytime" | "business" | "outside";
type Act = {
  id: number;
  aid: string;
  type: string;
  note: string;
  mode: Mode;
  val: string;
  unit: Unit;
  window: Window;
  stop: boolean;
  edit: boolean;
};

const STARTS: Start[] = [
  { id: "invoice_created", group: "Invoices", title: "Invoice Created", desc: "When a new invoice is issued", phrase: "an invoice is created", type: "generateInvoice" },
  { id: "invoice_paid", group: "Invoices", title: "Invoice Paid", desc: "When a customer completes payment", phrase: "an invoice is paid", type: "generateInvoice" },
  { id: "invoice_overdue", group: "Invoices", title: "Invoice Overdue", desc: "When an unpaid invoice passes its due date", phrase: "an invoice becomes overdue", type: "generateInvoice" },
  { id: "payment_received", group: "Payments", title: "Payment Received", desc: "When money is received successfully", phrase: "a payment is received", type: "generateInvoice" },
  { id: "payment_failed", group: "Payments", title: "Payment Failed", desc: "When a payment attempt does not complete", phrase: "a payment fails", type: "generateInvoice" },
  { id: "customer_created", group: "Customers", title: "New Customer Created", desc: "When a new customer profile is added", phrase: "a new customer is created", type: "generateInvoice" },
  { id: "whatsapp_received", group: "Messaging", title: "New WhatsApp Message Received", desc: "When a customer sends a WhatsApp message", phrase: "a WhatsApp message is received", type: "generateInvoice" },
  { id: "email_received", group: "Messaging", title: "New Email Received", desc: "When a customer sends an email", phrase: "an email is received", type: "generateInvoice" },
];

const DEFS: Def[] = [
  { id: "send_whatsapp_message", group: "Send a Message", title: "Send WhatsApp message", phrase: "send a WhatsApp message", type: "sendWhatsApp" },
  { id: "send_email", group: "Send a Message", title: "Send Email", phrase: "send an email", type: "sendEmail" },
  { id: "send_receipt", group: "Send a Message", title: "Send Receipt", phrase: "send a receipt", type: "sendEmail" },
  { id: "send_payment_reminder", group: "Send a Message", title: "Send Payment Reminder", phrase: "send a payment reminder", type: "sendWhatsApp" },
  { id: "send_payment_confirmation", group: "Send a Message", title: "Send Payment Confirmation", phrase: "send a payment confirmation", type: "sendWhatsApp" },
  { id: "send_failed_payment_message", group: "Send a Message", title: "Send Failed Payment Message", phrase: "send a failed payment message", type: "sendWhatsApp" },
  { id: "create_invoice", group: "Manage Invoice", title: "Create Invoice", phrase: "create an invoice", type: "generateInvoice" },
  { id: "mark_as_paid", group: "Manage Invoice", title: "Mark as Paid", phrase: "mark the invoice as paid", type: "generateInvoice" },
  { id: "apply_late_fee", group: "Manage Invoice", title: "Apply Late Fee", phrase: "apply a late fee", type: "generateInvoice" },
  { id: "cancel_invoice", group: "Manage Invoice", title: "Cancel Invoice", phrase: "cancel the invoice", type: "generateInvoice" },
  { id: "issue_refund", group: "Payment & Confirmation", title: "Issue Refund", phrase: "issue a refund", type: "generateReport" },
  { id: "notify_team_payment", group: "Payment & Confirmation", title: "Notify Team of Payment", phrase: "notify the team about payment", type: "sendEmail" },
  { id: "send_payment_link", group: "Payment & Confirmation", title: "Send Payment Link", phrase: "send a payment link", type: "sendWhatsApp" },
  { id: "add_tag", group: "Update Customer", title: "Add Tag", phrase: "add a customer tag", type: "generateReport" },
  { id: "remove_tag", group: "Update Customer", title: "Remove Tag", phrase: "remove a customer tag", type: "generateReport" },
  { id: "update_status", group: "Update Customer", title: "Update Status", phrase: "update customer status", type: "generateReport" },
  { id: "assign_team_member", group: "Update Customer", title: "Assign to Team Member", phrase: "assign to a team member", type: "generateReport" },
  { id: "add_internal_note", group: "Update Customer", title: "Add Internal Note", phrase: "add an internal note", type: "generateReport" },
  { id: "improve_message", group: "AI Assist", title: "Improve Message", phrase: "improve a message with AI", type: "aiTransform" },
  { id: "rewrite_tone", group: "AI Assist", title: "Rewrite Tone", phrase: "rewrite the message tone", type: "aiTransform" },
  { id: "generate_auto_reply", group: "AI Assist", title: "Generate Auto Reply", phrase: "generate an automatic reply", type: "aiTransform" },
  { id: "generate_summary", group: "AI Assist", title: "Generate Summary", phrase: "generate a summary", type: "aiTransform" },
  { id: "create_internal_task", group: "Internal / Team Action", title: "Create Internal Task", phrase: "create an internal task", type: "generateReport" },
  { id: "log_activity", group: "Internal / Team Action", title: "Log Activity", phrase: "log activity", type: "generateReport" },
  { id: "notify_team", group: "Internal / Team Action", title: "Notify Team", phrase: "notify the team", type: "sendEmail" },
];

const GROUPS = ["Send a Message", "Manage Invoice", "Payment & Confirmation", "Update Customer", "AI Assist", "Internal / Team Action"] as const;
const isRawValidationError = (value: unknown) =>
  typeof value === "string" &&
  (value.includes("Invalid option: expected one of") || value.includes(`path: ["status"]`));
const resolveFriendlyApiMessage = (payload: any, fallback: string, devLabel: string) => {
  const raw = payload?.reason ?? payload?.error;
  if (typeof raw === "string" && !isRawValidationError(raw)) {
    return raw;
  }
  if (process.env.NODE_ENV !== "production") {
    console.error(devLabel, payload);
  }
  return fallback;
};

export default function NewAutomationPage() {
  const router = useRouter();
  const [form, setForm] = useState({ title: "", description: "", category: "" });
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [startId, setStartId] = useState<StartId | null>(null);
  const [showCatalog, setShowCatalog] = useState(false);
  const [highlightActionId, setHighlightActionId] = useState<number | null>(null);
  const [dragging, setDragging] = useState<number | null>(null);
  const [cfg, setCfg] = useState({ overdueDays: "3", onlyIfUnpaid: true, paidDelayHours: "0", markAsClosed: true, paymentConfirmMinutes: "5", paymentRetryHours: "6", notifyOnFailure: true, customerDelayDays: "1", messageDelayMinutes: "2" });
  const [actions, setActions] = useState<Act[]>([]);

  const start = STARTS.find((s) => s.id === startId) ?? null;
  const mappedSteps = useMemo(
    () => [
      ...(start
        ? [
            {
              type: start.type,
              config: {
                startId: start.id,
              },
            },
          ]
        : []),
      ...actions.map((a) => ({
        type: a.type,
        config: {
          actionId: a.aid,
          note: a.note,
          mode: a.mode,
          delayValue: a.mode === "after" ? Number(a.val || 1) : 0,
          delayUnit: a.mode === "after" ? a.unit : undefined,
          window: a.window,
          stopOnFailure: a.stop,
        },
      })),
    ],
    [start, actions]
  );

  const validationIssues = [
    !form.title.trim() ? "Enter an automation name." : null,
    !start ? "Select what starts this automation." : null,
    actions.length === 0 ? "Add at least one step to complete this automation." : null,
  ].filter(Boolean) as string[];
  const canSave = validationIssues.length === 0 && !loading;

  const inputClass = "h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100";

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim() || !start || actions.length === 0) return;
    setLoading(true);
    const res = await fetch("/api/automation", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, steps: mappedSteps, status: "ACTIVE" }) });
    let json: any = {};
    try { json = await res.json(); } catch { json = {}; }
    if (!res.ok) {
      setStatus(resolveFriendlyApiMessage(json, "Unable to save automation. Please try again.", "automation_create_failed"));
      setLoading(false);
      return;
    }
    const id = json?.id || json?.flow?.id;
    if (!id) { router.push("/dashboard/automations"); setLoading(false); return; }
    router.push(`/dashboard/automations/${encodeURIComponent(id)}`);
    setLoading(false);
  };

  const def = (id: string) => DEFS.find((d) => d.id === id);
  const label = (id: string) => def(id)?.title || id;
  const phrase = (id: string) => def(id)?.phrase || id;

  const addAction = (id: string) => {
    const d = def(id);
    if (!d) return;
    const nextId = Date.now() + Math.floor(Math.random() * 1000);
    setActions((p) => [...p, { id: nextId, aid: d.id, type: d.type, note: "", mode: "now", val: "1", unit: "days", window: "anytime", stop: false, edit: true }]);
    setShowCatalog(false);
    setHighlightActionId(nextId);
    setTimeout(() => {
      setHighlightActionId((current) => (current === nextId ? null : current));
    }, 1600);
  };
  const updateAction = (id: number, patch: Partial<Act>) => setActions((p) => p.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  const removeAction = (id: number) => {
    if (typeof window !== "undefined" && !window.confirm("Delete this step?")) return;
    setActions((p) => p.filter((a) => a.id !== id));
  };
  const reorder = (fromId: number, toId: number) => setActions((p) => {
    const from = p.findIndex((a) => a.id === fromId); const to = p.findIndex((a) => a.id === toId);
    if (from < 0 || to < 0 || from === to) return p;
    const n = [...p]; const [m] = n.splice(from, 1); n.splice(to, 0, m); return n;
  });
  const iconStart = (id: StartId) => {
    if (id === "invoice_created") return <FileText className="h-4 w-4" />;
    if (id === "invoice_paid") return <CheckCircle2 className="h-4 w-4" />;
    if (id === "invoice_overdue") return <AlertCircle className="h-4 w-4" />;
    if (id === "payment_received") return <CreditCard className="h-4 w-4" />;
    if (id === "payment_failed") return <XCircle className="h-4 w-4" />;
    if (id === "customer_created") return <UserPlus className="h-4 w-4" />;
    if (id === "whatsapp_received") return <MessageCircle className="h-4 w-4" />;
    if (id === "email_received") return <Mail className="h-4 w-4" />;
    return <Clock3 className="h-4 w-4" />;
  };

  const iconStartTone = (id: StartId) => {
    if (id === "invoice_created") return "border-blue-200 bg-blue-100 text-blue-700";
    if (id === "invoice_paid") return "border-emerald-200 bg-emerald-100 text-emerald-700";
    if (id === "invoice_overdue") return "border-amber-200 bg-amber-100 text-amber-700";
    if (id === "payment_received") return "border-lime-200 bg-lime-100 text-lime-700";
    if (id === "payment_failed") return "border-rose-200 bg-rose-100 text-rose-700";
    if (id === "customer_created") return "border-indigo-200 bg-indigo-100 text-indigo-700";
    if (id === "whatsapp_received") return "border-teal-200 bg-teal-100 text-teal-700";
    if (id === "email_received") return "border-cyan-200 bg-cyan-100 text-cyan-700";
    return "border-slate-200 bg-slate-100 text-slate-700";
  };

  const iconAction = (id: string) => {
    if (id.includes("whatsapp")) return <MessageCircle className="h-4 w-4" />;
    if (id.includes("email") || id.includes("receipt") || id.includes("notify")) return <Mail className="h-4 w-4" />;
    if (id.includes("invoice") || id.includes("late_fee")) return <Receipt className="h-4 w-4" />;
    if (id.includes("payment") || id.includes("refund")) return <CreditCard className="h-4 w-4" />;
    if (id.includes("ai") || id.includes("rewrite") || id.includes("summary") || id.includes("reply") || id.includes("improve")) return <Sparkles className="h-4 w-4" />;
    if (id.includes("customer") || id.includes("tag") || id.includes("status") || id.includes("assign")) return <UserPlus className="h-4 w-4" />;
    return <FileText className="h-4 w-4" />;
  };

  const iconCategory = (group: string) => {
    if (group === "Send a Message") return <MessageCircle className="h-4 w-4" />;
    if (group === "Manage Invoice") return <Receipt className="h-4 w-4" />;
    if (group === "Payment & Confirmation") return <CreditCard className="h-4 w-4" />;
    if (group === "Update Customer") return <UserPlus className="h-4 w-4" />;
    if (group === "AI Assist") return <Sparkles className="h-4 w-4" />;
    return <FileText className="h-4 w-4" />;
  };

  const timing = (a: Act) => (a.mode === "now" ? "Immediately" : `${a.val || "1"} ${a.unit} later`);
  const previewData = (() => {
    if (!actions.length) {
      return {
        title: "When this automation starts, nothing will happen yet.",
        steps: [] as string[],
      };
    }

    if (!start) {
      return {
        title: "Select what starts this automation.",
        steps: [] as string[],
      };
    }

    if (actions.length === 1) {
      const action = actions[0];
      const line = action.mode === "now" ? phrase(action.aid) : `${phrase(action.aid)} after ${action.val || "1"} ${action.unit}`;
      return { title: `When ${start.phrase}, the system will ${line}.`, steps: [] as string[] };
    }

    return {
      title: `When ${start.phrase}:`,
      steps: actions.map((a) => (a.mode === "now" ? `${phrase(a.aid)} immediately` : `${phrase(a.aid)} after ${a.val || "1"} ${a.unit}`)),
    };
  })();

  const renderStartConfig = (id: StartId) => {
    if (id === "invoice_overdue") return <div className="space-y-3"><label className="block space-y-2 text-sm text-slate-700"><span>Send reminder after</span><div className="flex items-center gap-2"><input type="number" min={0} value={cfg.overdueDays} onChange={(e) => setCfg((p) => ({ ...p, overdueDays: e.target.value }))} className={`${inputClass} max-w-[140px]`} /><span className="text-sm text-slate-600">days</span></div></label><label className="inline-flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={cfg.onlyIfUnpaid} onChange={(e) => setCfg((p) => ({ ...p, onlyIfUnpaid: e.target.checked }))} className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500" /><span>Only if invoice is still unpaid</span></label></div>;
    if (id === "invoice_paid") return <label className="block space-y-2 text-sm text-slate-700"><span>Send confirmation after</span><div className="flex items-center gap-2"><input type="number" min={0} value={cfg.paidDelayHours} onChange={(e) => setCfg((p) => ({ ...p, paidDelayHours: e.target.value }))} className={`${inputClass} max-w-[140px]`} /><span className="text-sm text-slate-600">hours</span></div></label>;
    if (id === "payment_received") return <label className="block space-y-2 text-sm text-slate-700"><span>Confirm payment after</span><div className="flex items-center gap-2"><input type="number" min={0} value={cfg.paymentConfirmMinutes} onChange={(e) => setCfg((p) => ({ ...p, paymentConfirmMinutes: e.target.value }))} className={`${inputClass} max-w-[140px]`} /><span className="text-sm text-slate-600">minutes</span></div></label>;
    if (id === "payment_failed") return <label className="block space-y-2 text-sm text-slate-700"><span>Try again after</span><div className="flex items-center gap-2"><input type="number" min={0} value={cfg.paymentRetryHours} onChange={(e) => setCfg((p) => ({ ...p, paymentRetryHours: e.target.value }))} className={`${inputClass} max-w-[140px]`} /><span className="text-sm text-slate-600">hours</span></div></label>;
    if (id === "customer_created") return <label className="block space-y-2 text-sm text-slate-700"><span>Send welcome message after</span><div className="flex items-center gap-2"><input type="number" min={0} value={cfg.customerDelayDays} onChange={(e) => setCfg((p) => ({ ...p, customerDelayDays: e.target.value }))} className={`${inputClass} max-w-[140px]`} /><span className="text-sm text-slate-600">days</span></div></label>;
    return <label className="block space-y-2 text-sm text-slate-700"><span>Send reply after</span><div className="flex items-center gap-2"><input type="number" min={0} value={cfg.messageDelayMinutes} onChange={(e) => setCfg((p) => ({ ...p, messageDelayMinutes: e.target.value }))} className={`${inputClass} max-w-[140px]`} /><span className="text-sm text-slate-600">minutes</span></div></label>;
  };

  return (
    <div className="-mx-4 min-h-[calc(100vh-4rem)] bg-slate-50 px-4 py-6 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8 lg:py-8">
      <div className="mx-auto w-full max-w-4xl space-y-8 lg:space-y-10">
        <header className="space-y-5">
          <div className="flex items-center justify-between gap-3">
            <button type="button" onClick={() => router.push("/dashboard/automations")} className="inline-flex h-9 items-center gap-1.5 text-sm font-medium text-slate-500 transition hover:text-slate-700"><ArrowLeft className="h-4 w-4" />Back to Automations</button>
            <div className="ml-auto flex max-w-sm flex-col items-end">
              <button
                type="submit"
                form="automation-form"
                disabled={!canSave}
                className={`inline-flex h-12 items-center justify-center rounded-lg px-6 text-base font-semibold transition ${
                  canSave
                    ? "border border-blue-900 bg-blue-700 text-white shadow-md hover:bg-blue-600"
                    : "cursor-not-allowed border border-blue-900 bg-blue-700 text-white opacity-70"
                }`}
              >
                {loading ? "Saving..." : "Save Automation"}
              </button>
            </div>
          </div>
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">Create Automation</h1>
            <p className="mt-2 text-base text-slate-600">Automate tasks so your business runs automatically.</p>
          </div>
        </header>
        {status ? <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">{status}</div> : null}
        <form id="automation-form" onSubmit={save} className="space-y-10 lg:space-y-12">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <h2 className="text-lg font-semibold text-slate-900">Create Automation</h2>
            <label className="mt-4 block space-y-2 text-sm text-slate-700"><span className="font-semibold text-slate-900">Automation Name</span><input required value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} placeholder="Example: Invoice reminder" className={inputClass} /></label>
            <label className="mt-4 block space-y-2 text-sm text-slate-700"><span className="font-semibold text-slate-900">Short Description (optional)</span><textarea value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} placeholder="Describe what this automation should do." className="min-h-[110px] w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100" /></label>
            <div className="mt-5 rounded-xl border border-blue-100 bg-blue-50/60 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Live preview</p>
              <p className="mt-2 text-sm text-slate-700">{previewData.title}</p>
              {previewData.steps.length > 0 ? (
                <ul className="mt-2 space-y-1 text-sm text-slate-700">
                  {previewData.steps.map((line, idx) => (
                    <li key={`${line}-${idx}`} className="flex items-start gap-2">
                      <span className="mt-1 h-1.5 w-1.5 rounded-full bg-slate-400" />
                      <span>{line}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-300 bg-white p-5 shadow-md sm:p-6">
            <h2 className="text-lg font-semibold text-slate-900">What starts this automation?</h2>
            <div className="mt-5 space-y-5">
              {(["Invoices", "Payments", "Customers", "Messaging"] as const).map((group) => (
                <div key={group} className="space-y-2.5">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{group}</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {STARTS.filter((s) => s.group === group).map((s) => (
                      <div key={s.id} className={`rounded-xl border transition ${s.id === startId ? "border-blue-300 bg-blue-50/60 ring-1 ring-blue-100" : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/60"}`}>
                        <button type="button" onClick={() => setStartId(s.id)} className="w-full px-3 py-3 text-left"><div className="flex items-start gap-3"><span className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border shadow-sm ${iconStartTone(s.id)}`}>{iconStart(s.id)}</span><div><p className="text-sm font-semibold text-slate-900">{s.title}</p><p className="mt-0.5 text-xs text-slate-600">{s.desc}</p></div></div></button>
                        {s.id === startId ? <div className="border-t border-slate-200 px-3 pb-3 pt-3">{renderStartConfig(s.id)}</div> : null}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-300 bg-white p-5 shadow-md sm:p-6">
            <h2 className="text-lg font-semibold text-slate-900">What should the system do?</h2>
            <div className="mt-6 border-t border-slate-200 pt-5">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Steps you&apos;ve added</p>
              <div className="mt-3 space-y-4">
                {!actions.length ? (
                  <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-600">
                    No steps added yet. Add your first step below.
                  </div>
                ) : null}
                {actions.map((a, idx) => (
                  <article
                    key={a.id}
                    draggable
                    onDragStart={() => setDragging(a.id)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => {
                      if (dragging !== null) reorder(dragging, a.id);
                    }}
                    onDragEnd={() => setDragging(null)}
                    className={`rounded-xl border p-4 shadow-sm transition-all duration-300 hover:shadow ${
                      highlightActionId === a.id
                        ? "border-blue-300 bg-blue-50 ring-2 ring-blue-100"
                        : "border-slate-200 bg-slate-50"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <button type="button" className="mt-0.5 inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500" aria-label="Drag to reorder">
                          <GripVertical className="h-4 w-4" />
                        </button>
                        <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700">{iconAction(a.aid)}</span>
                        <div>
                          <span className="inline-flex rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-600">Step {idx + 1}</span>
                          <p className="mt-1 text-sm font-semibold text-slate-900">{label(a.aid)}</p>
                          <p className="mt-1 text-xs text-slate-600">Template: {a.note || "Default"}</p>
                          <p className="text-xs text-slate-600">Send: {timing(a)}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button type="button" onClick={() => updateAction(a.id, { edit: !a.edit })} className="inline-flex h-8 items-center justify-center rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-600 transition hover:bg-slate-100">{a.edit ? "Close" : "Edit"}</button>
                        <button type="button" onClick={() => removeAction(a.id)} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>
                      </div>
                    </div>

                    <div className={`overflow-hidden transition-all duration-200 ${a.edit ? "mt-4 max-h-[900px] border-t border-slate-200 pt-3 opacity-100" : "max-h-0 opacity-0"}`}>
                      <div className="space-y-3">
                        <label className="block space-y-2 text-sm text-slate-700"><span>Choose action</span><div className="relative"><select value={a.aid} onChange={(e) => { const d = def(e.target.value); if (!d) return; updateAction(a.id, { aid: d.id, type: d.type }); }} className={`${inputClass} h-10 appearance-none pr-10 text-sm`}>{GROUPS.map((g) => <optgroup key={g} label={g}>{DEFS.filter((d) => d.group === g).map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}</optgroup>)}</select><ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /></div></label>
                        <label className="block space-y-2 text-sm text-slate-700"><span>Template or message details</span><input value={a.note} onChange={(e) => updateAction(a.id, { note: e.target.value })} placeholder="Example: Payment Reminder" className={`${inputClass} h-10 text-sm`} /></label>
                        <div className="grid gap-3 sm:grid-cols-[minmax(0,180px)_minmax(0,1fr)] sm:items-end">
                          <label className="block space-y-2 text-sm text-slate-700"><span>Send timing</span><select value={a.mode} onChange={(e) => updateAction(a.id, { mode: e.target.value as Mode })} className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"><option value="now">Send immediately</option><option value="after">Send after</option></select></label>
                          {a.mode === "after" ? <div className="grid gap-2 sm:grid-cols-[120px_1fr]"><input type="number" min={1} value={a.val} onChange={(e) => updateAction(a.id, { val: e.target.value })} className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100" /><select value={a.unit} onChange={(e) => updateAction(a.id, { unit: e.target.value as Unit })} className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"><option value="minutes">minutes</option><option value="hours">hours</option><option value="days">days</option></select></div> : null}
                        </div>
                        <details className="rounded-xl border border-slate-200 bg-white p-3"><summary className="cursor-pointer text-sm font-medium text-slate-700">Advanced settings</summary><div className="mt-3 space-y-3"><label className="block space-y-2 text-sm text-slate-700"><span>Run this step</span><select value={a.window} onChange={(e) => updateAction(a.id, { window: e.target.value as Window })} className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"><option value="anytime">Anytime</option><option value="business">Only during business hours</option><option value="outside">Only outside business hours</option></select></label><label className="inline-flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={a.stop} onChange={(e) => updateAction(a.id, { stop: e.target.checked })} className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500" /><span>Stop automation if this step fails</span></label></div></details>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </div>

            <div className="mt-6 border-t border-slate-200 pt-5">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Add another step</p>
              <div className="mt-3">
                <button type="button" onClick={() => setShowCatalog(true)} className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 transition hover:bg-slate-100"><Plus className="h-4 w-4" />Add another step</button>
              </div>
            </div>

            <div className={`mt-6 border-t border-slate-200 transition-all duration-300 ${showCatalog ? "pt-5 opacity-100" : "pt-0 opacity-90"}`}>
              <div className={`overflow-hidden transition-all duration-300 ${showCatalog ? "max-h-[2000px] opacity-100" : "max-h-0 opacity-0"}`}>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Available actions</p>
                <div className="mt-3 grid gap-4 sm:grid-cols-2">
                  {GROUPS.map((g) => (
                    <div key={g} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600">{iconCategory(g)}</span>
                        {g}
                      </h3>
                      <div className="mt-3 space-y-2">
                        {DEFS.filter((d) => d.group === g).map((d) => (
                          <button key={d.id} type="button" onClick={() => addAction(d.id)} className="flex w-full items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-sm text-slate-700 transition hover:bg-slate-100"><span>{d.title}</span><Plus className="h-4 w-4 text-slate-400" /></button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <div className="pt-6 sm:pt-8">
            <div className="flex justify-end">
              <button
                type="submit"
                form="automation-form"
                disabled={!canSave}
                className={`inline-flex h-12 w-full items-center justify-center rounded-lg px-6 text-base font-semibold transition sm:w-auto ${
                  canSave
                    ? "border border-blue-900 bg-blue-700 text-white shadow-md hover:bg-blue-600"
                    : "cursor-not-allowed border border-blue-900 bg-blue-700 text-white opacity-70"
                }`}
              >
                {loading ? "Saving..." : "Save Automation"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
