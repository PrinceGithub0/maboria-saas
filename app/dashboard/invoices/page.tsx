"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table } from "@/components/ui/table";
import { Alert } from "@/components/ui/alert";
import { Modal } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/empty-state";
import { formatCurrencyWithCode } from "@/lib/currency";
import { parseDateInput } from "@/lib/date";
import { allowedCurrencies, formatCurrencyOption } from "@/lib/payments/currency-allowlist";
import { useSession } from "next-auth/react";
import { getTaxIdLabel } from "@/lib/tax-labels";

const fetcher = async (url: string) => {
  const res = await fetch(url, { cache: "no-store" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(data?.error || "Failed to load invoices");
    (error as any).status = res.status;
    (error as any).data = data;
    throw error;
  }
  return data;
};
const profileFetcher = async (url: string) => {
  const res = await fetch(url);
  const data = await res.json().catch(() => ({}));
  return { data, status: res.status };
};

export default function InvoicesPage() {
  const { data: session, status: sessionStatus } = useSession();
  const todayValue = new Date().toISOString().slice(0, 10);
  const invoicesKey =
    sessionStatus === "authenticated" && session?.user?.id
      ? `/api/invoice?user=${session.user.id}`
      : null;
  const { data: invoices, error: invoicesError, mutate } = useSWR(invoicesKey, fetcher, {
    keepPreviousData: false,
    revalidateOnMount: true,
  });
  const { data: me } = useSWR("/api/user/me", fetcher);
  const { data: businessProfile, mutate: refreshBusinessProfile } = useSWR(
    "/api/business-profile",
    profileFetcher
  );
  const [form, setForm] = useState({
    invoiceNumber: "",
    currency: "USD",
    status: "SENT",
    customerName: "",
    customerEmail: "",
    customerAddress: "",
    issueDate: todayValue,
    dueDate: "",
    items: [{ name: "Service", quantity: 1, price: 100 }],
  });
  const [status, setStatus] = useState<{ message: string; variant: "success" | "error" | "info" } | null>(null);
  const [query, setQuery] = useState("");
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<any | null>(null);
  const [editStatus, setEditStatus] = useState<{ message: string; variant: "success" | "error" } | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editForm, setEditForm] = useState({
    customerName: "",
    customerEmail: "",
    customerAddress: "",
  });
  const [profileForm, setProfileForm] = useState({
    businessName: "",
    country: "NG",
    defaultCurrency: "NGN",
    businessAddress: "",
    businessEmail: "",
    businessPhone: "",
    taxId: "",
  });
  const [profileStatus, setProfileStatus] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const taxLabel = getTaxIdLabel(profileForm.country);
  const scrollToCreate = () => {
    if (typeof window === "undefined") return;
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  useEffect(() => {
    setForm((prev) => (prev.invoiceNumber ? prev : { ...prev, invoiceNumber: `INV-${Date.now()}` }));
  }, []);

  useEffect(() => {
    if (me?.preferredCurrency && form.currency === "USD") {
      setForm((prev) => ({ ...prev, currency: String(me.preferredCurrency).toUpperCase() }));
    }
  }, [me?.preferredCurrency, form.currency]);

  useEffect(() => {
    const profileCurrency = businessProfile?.data?.defaultCurrency;
    if (profileCurrency && form.currency === "USD") {
      setForm((prev) => ({ ...prev, currency: String(profileCurrency).toUpperCase() }));
    }
  }, [businessProfile?.data?.defaultCurrency, form.currency]);

  const profileMissing =
    businessProfile?.status === 404 || businessProfile?.data?.error === "Not found";

  const createBusinessProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileStatus(null);
    setProfileError(null);
    const res = await fetch("/api/business-profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(profileForm),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setProfileError(json.error || "Could not create business profile.");
      return;
    }
    setProfileStatus("Business profile saved.");
    refreshBusinessProfile();
  };

  const createInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.status === "SENT" && !form.customerEmail.trim()) {
      setStatus({
        message: "Customer email is required to send an invoice.",
        variant: "error",
      });
      return;
    }
    const payload = {
      ...form,
      invoiceNumber: form.invoiceNumber.trim(),
      customerName: form.customerName.trim() || undefined,
      customerEmail: form.customerEmail.trim() || undefined,
      customerAddress: form.customerAddress.trim() || undefined,
    };
    const issueDateParsed = form.issueDate ? parseDateInput(form.issueDate) : null;
    if (form.issueDate && !issueDateParsed) {
      setStatus({
        message: "Issue date must be in DD/MM/YYYY format.",
        variant: "error",
      });
      return;
    }
    const dueDateParsed = form.dueDate ? parseDateInput(form.dueDate) : null;
    if (form.dueDate && !dueDateParsed) {
      setStatus({
        message: "Due date must be in DD/MM/YYYY format.",
        variant: "error",
      });
      return;
    }
    payload.issueDate = issueDateParsed ? issueDateParsed.toISOString().slice(0, 10) : undefined;
    payload.dueDate = dueDateParsed ? dueDateParsed.toISOString().slice(0, 10) : undefined;
    try {
      const res = await fetch("/api/invoice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) {
        const required = json.requiredPlan
          ? json.requiredPlan === "starter"
            ? "Starter"
            : json.requiredPlan === "pro"
              ? "Pro"
              : json.requiredPlan === "enterprise"
                ? "Enterprise"
                : json.requiredPlan
          : null;
        if (json.type === "upgrade_required" || json.type === "limit_reached") {
          setStatus({
            message: `${json.reason || "Upgrade required."}${required ? ` Required plan: ${required}.` : ""}`,
            variant: "error",
          });
        } else {
          setStatus({ message: json.error || "Could not create invoice.", variant: "error" });
        }
      } else {
        const savedNumber = json?.invoiceNumber as string | undefined;
        if (savedNumber && savedNumber !== form.invoiceNumber) {
          setStatus({
            message: `Invoice number already existed. Saved as ${savedNumber}.`,
            variant: "success",
          });
        } else {
          setStatus({ message: "Invoice generated.", variant: "success" });
        }
        mutate();
        const nextCurrency =
          String(businessProfile?.data?.defaultCurrency || me?.preferredCurrency || "USD").toUpperCase();
        setForm({
          invoiceNumber: `INV-${Date.now()}`,
          currency: nextCurrency,
          status: "SENT",
          customerName: "",
          customerEmail: "",
          customerAddress: "",
          issueDate: todayValue,
          dueDate: "",
          items: [{ name: "Service", quantity: 1, price: 100 }],
        });
      }
    } catch {
      setStatus({ message: "Could not create invoice. Please try again.", variant: "error" });
    }
  };

  const currencyOptions = allowedCurrencies.map((code) => ({ code, label: formatCurrencyOption(code) }));
  const businessCurrencyOptions = allowedCurrencies.map((code) => ({ code, label: code }));
  const businessCountryOptions = [
    { code: "NG", label: "Nigeria (NG)" },
    { code: "GH", label: "Ghana (GH)" },
    { code: "KE", label: "Kenya (KE)" },
    { code: "ZA", label: "South Africa (ZA)" },
    { code: "CI", label: "Cote d'Ivoire (CI)" },
    { code: "EG", label: "Egypt (EG)" },
    { code: "RW", label: "Rwanda (RW)" },
    { code: "UG", label: "Uganda (UG)" },
    { code: "TZ", label: "Tanzania (TZ)" },
    { code: "ZM", label: "Zambia (ZM)" },
    { code: "MZ", label: "Mozambique (MZ)" },
  ];

  const scopedInvoices =
    !invoicesError && Array.isArray(invoices)
      ? invoices.filter((inv: any) => inv.userId === session?.user?.id)
      : [];
  const latestInvoice = scopedInvoices[0] || null;
  const normalizedQuery = query.trim().toLowerCase();
  const getDisplayStatus = (value: string) => {
    const normalized = String(value || "").toUpperCase();
    if (normalized === "SENT" || normalized === "OVERDUE") return "UNPAID";
    if (normalized === "CANCELED") return "CANCELLED";
    return normalized;
  };
  const filteredInvoices = normalizedQuery
    ? scopedInvoices.filter((inv: any) => {
        const number = String(inv.invoiceNumber || "").toLowerCase();
        const status = getDisplayStatus(inv.status).toLowerCase();
        const currency = String(inv.currency || "").toLowerCase();
        const customerName = String(inv?.metadata?.customer?.name || "").toLowerCase();
        const customerEmail = String(inv?.metadata?.customer?.email || "").toLowerCase();
        return (
          number.includes(normalizedQuery) ||
          status.includes(normalizedQuery) ||
          currency.includes(normalizedQuery) ||
          customerName.includes(normalizedQuery) ||
          customerEmail.includes(normalizedQuery)
        );
      })
    : scopedInvoices;
  const showEmptyState = !invoicesError && filteredInvoices.length === 0;

  const readCustomerFromMeta = (meta: any) => {
    const customer = meta?.customer || {};
    return {
      name: customer.name ?? meta?.customerName ?? "",
      email: customer.email ?? meta?.customerEmail ?? "",
      address:
        customer.address ??
        customer.addressLine1 ??
        meta?.customerAddress ??
        meta?.customer_address ??
        "",
    };
  };

  const openEditCustomer = (invoice: any) => {
    const customer = readCustomerFromMeta(invoice?.metadata);
    setEditingInvoice(invoice || null);
    setEditStatus(null);
    setEditForm({
      customerName: customer.name || "",
      customerEmail: customer.email || "",
      customerAddress: customer.address || "",
    });
    setEditOpen(true);
  };

  const saveCustomerDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    const invoiceId = editingInvoice?.id ?? editingInvoice?.invoiceNumber ?? "";
    if (!invoiceId) {
      setEditStatus({ message: "Invoice not found for update.", variant: "error" });
      return;
    }
    setSavingEdit(true);
    setEditStatus(null);
    setStatus(null);
    const payload = {
      invoiceNumber: editingInvoice?.invoiceNumber,
      customerName: editForm.customerName.trim() || undefined,
      customerEmail: editForm.customerEmail.trim() || undefined,
      customerAddress: editForm.customerAddress.trim() || undefined,
    };
    try {
      const res = await fetch(`/api/invoice/${encodeURIComponent(String(invoiceId))}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setEditStatus({
          message: data?.error || "Could not update customer details.",
          variant: "error",
        });
        return;
      }
      setEditStatus({ message: "Customer details updated.", variant: "success" });
      mutate((current: any) => {
        if (!Array.isArray(current)) return current;
        return current.map((inv) =>
          inv?.id === editingInvoice?.id
            ? {
                ...inv,
                metadata: {
                  ...(inv?.metadata || {}),
                  customer: {
                    name: payload.customerName ?? inv?.metadata?.customer?.name ?? null,
                    email: payload.customerEmail ?? inv?.metadata?.customer?.email ?? null,
                    address: payload.customerAddress ?? inv?.metadata?.customer?.address ?? null,
                  },
                },
              }
            : inv
        );
      }, false);
      mutate();
      setEditOpen(false);
      setEditingInvoice(null);
    } catch {
      setEditStatus({ message: "Could not update customer details.", variant: "error" });
    } finally {
      setSavingEdit(false);
    }
  };

  const sendDraft = async (invoice: any) => {
    const invoiceId = String(invoice?.id || invoice?.invoiceNumber || "");
    if (!invoiceId) return;
    let customerEmail = invoice?.metadata?.customer?.email;
    if (!customerEmail && typeof window !== "undefined") {
      const manual = window.prompt("Enter customer email to send this invoice:");
      if (manual) customerEmail = manual.trim();
    }
    if (!customerEmail) {
      setStatus({
        message: "Customer email is required to send this invoice.",
        variant: "error",
      });
      return;
    }
    setSendingId(invoiceId);
    setStatus(null);
    try {
      const res = await fetch(`/api/invoice/${encodeURIComponent(invoiceId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "SENT",
          invoiceNumber: invoice?.invoiceNumber,
          customerEmail,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatus({
          message: data?.error || "Could not send invoice.",
          variant: "error",
        });
      } else {
        setStatus({ message: "Invoice sent.", variant: "success" });
        mutate((current: any) => {
          if (!Array.isArray(current)) return current;
          return current.map((inv) =>
            inv?.id === invoiceId ? { ...inv, status: "SENT" } : inv
          );
        }, false);
        mutate();
      }
    } catch {
      setStatus({ message: "Could not send invoice.", variant: "error" });
    } finally {
      setSendingId(null);
    }
  };

  return (
    <div className="space-y-6 max-md:space-y-7">
      <div className="md:contents max-md:rounded-[28px] max-md:border max-md:border-border/60 max-md:bg-card max-md:p-4 max-md:shadow-[0_16px_36px_rgba(15,23,42,0.18)]">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-indigo-600 dark:text-indigo-300">Invoices</p>
          <h1 className="text-3xl font-semibold text-foreground">Generator</h1>
        </div>
        {status && <div className="mt-4"><Alert variant={status.variant}>{status.message}</Alert></div>}
      </div>
      {profileMissing ? (
        <Card title="Business profile required">
          {profileStatus && <Alert variant="success">{profileStatus}</Alert>}
          {profileError && <Alert variant="error">{profileError}</Alert>}
          <p className="text-sm text-muted-foreground">
            Add your business profile before creating invoices.
          </p>
          <form
            className="mt-4 grid grid-cols-2 gap-4 max-md:grid-cols-1 max-md:gap-3"
            onSubmit={createBusinessProfile}
          >
            <Input
              label="Business name"
              value={profileForm.businessName}
              onChange={(e) => setProfileForm({ ...profileForm, businessName: e.target.value })}
            />
            <label className="flex flex-col gap-1 text-sm text-foreground">
              Country
              <select
                value={profileForm.country}
                onChange={(e) => setProfileForm({ ...profileForm, country: e.target.value })}
                className="rounded-lg border border-input bg-background px-3 py-2 text-foreground focus:border-indigo-400 focus:outline-none"
              >
                {businessCountryOptions.map((option) => (
                  <option key={option.code} value={option.code}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm text-foreground">
              Default currency
              <select
                value={profileForm.defaultCurrency}
                onChange={(e) => setProfileForm({ ...profileForm, defaultCurrency: e.target.value })}
                className="rounded-lg border border-input bg-background px-3 py-2 text-foreground focus:border-indigo-400 focus:outline-none"
              >
                {businessCurrencyOptions.map((option) => (
                  <option key={option.code} value={option.code}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <Input
              label="Business email"
              type="email"
              value={profileForm.businessEmail}
              onChange={(e) => setProfileForm({ ...profileForm, businessEmail: e.target.value })}
            />
            <Input
              label="Business phone"
              value={profileForm.businessPhone}
              onChange={(e) => setProfileForm({ ...profileForm, businessPhone: e.target.value })}
            />
            <Input
              label="Business address"
              value={profileForm.businessAddress}
              onChange={(e) => setProfileForm({ ...profileForm, businessAddress: e.target.value })}
            />
            <Input
              label={`${taxLabel.long} (optional)`}
              value={profileForm.taxId}
              onChange={(e) => setProfileForm({ ...profileForm, taxId: e.target.value })}
            />
            <div className="col-span-2 max-md:col-span-1">
              <Button type="submit" className="max-md:w-full">
                Save business profile
              </Button>
            </div>
          </form>
        </Card>
      ) : (
        <Card title="Create invoice">
          <form className="grid grid-cols-2 gap-4 max-md:grid-cols-1 max-md:gap-3" onSubmit={createInvoice}>
            <Input
              label="Invoice number"
              value={form.invoiceNumber}
              onChange={(e) => setForm({ ...form, invoiceNumber: e.target.value })}
            />
            <Input
              label="Customer name"
              value={form.customerName}
              onChange={(e) => setForm({ ...form, customerName: e.target.value })}
            />
            <Input
              label="Customer email"
              type="email"
              value={form.customerEmail}
              onChange={(e) => setForm({ ...form, customerEmail: e.target.value })}
            />
            <Input
              label="Issue date"
              type="date"
              value={form.issueDate}
              onChange={(e) => setForm({ ...form, issueDate: e.target.value })}
            />
            <Input
              label="Due date"
              type="date"
              value={form.dueDate}
              onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
            />
            <label className="flex flex-col gap-1 text-sm text-foreground">
              Status
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
                className="rounded-lg border border-input bg-background px-3 py-2 text-foreground focus:border-indigo-400 focus:outline-none"
              >
                <option value="DRAFT">Draft</option>
                <option value="SENT">Send now</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm text-foreground">
              Currency
              <select
                value={form.currency}
                onChange={(e) => setForm({ ...form, currency: e.target.value })}
                className="rounded-lg border border-input bg-background px-3 py-2 text-foreground focus:border-indigo-400 focus:outline-none"
              >
                {currencyOptions.map((option) => (
                  <option key={option.code} value={option.code}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <Input
              label="Customer address"
              value={form.customerAddress}
              onChange={(e) => setForm({ ...form, customerAddress: e.target.value })}
            />
            <Input
              label="Item name"
              value={form.items[0].name}
              onChange={(e) =>
                setForm({ ...form, items: [{ ...form.items[0], name: e.target.value }] })
              }
            />
            <div className="space-y-1">
              <Input
                label={`Item price (${form.currency})`}
                type="number"
                value={form.items[0].price}
                min={0}
                step={0.01}
                onChange={(e) =>
                  setForm({
                    ...form,
                    items: [{ ...form.items[0], price: Number(e.target.value) }],
                  })
                }
              />
              <p className="text-xs text-muted-foreground">
                Displayed as {formatCurrencyWithCode(form.items[0].price || 0, form.currency)}.
              </p>
            </div>
            <div className="col-span-2 max-md:col-span-1">
              <Button type="submit" className="max-md:w-full">
                {form.status === "SENT" ? "Save & send" : "Save draft"}
              </Button>
            </div>
          </form>
        </Card>
      )}
      <Card
        title="History"
        actions={
          <div className="flex flex-wrap items-center gap-3">
            <input
              suppressHydrationWarning
              placeholder="Search invoices"
              className="w-56 rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground max-md:w-full"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        }
      >
        {invoicesError && (
          <Alert variant="error">
            {(invoicesError as any)?.data?.reason ||
              (invoicesError as any)?.data?.error ||
              "Unable to load invoices."}
          </Alert>
        )}
        {showEmptyState ? (
          <EmptyState
            title="No invoices yet"
            description="Create your first invoice and it will appear here."
            actionLabel="Create invoice"
            onAction={scrollToCreate}
          />
        ) : (
          <Table
            data={filteredInvoices}
            keyExtractor={(row: any) => row.id || row.invoiceNumber}
            columns={[
              { key: "invoiceNumber", label: "Number" },
              {
                key: "currency",
                label: "Currency",
                render: (row: any) => String(row.currency || "").toUpperCase(),
              },
              {
                key: "status",
                label: "Status",
                render: (row: any) => getDisplayStatus(row?.status || ""),
              },
              {
                key: "total",
                label: "Total",
                render: (row: any) => formatCurrencyWithCode(Number(row.total || 0), row.currency),
              },
              {
                key: "id",
                label: "Actions",
                render: (row: any) => {
                  const invoiceId = row?.id ?? row?.invoiceNumber;
                  const invoiceNumber = row?.invoiceNumber ? String(row.invoiceNumber) : "";
                  const detailHref = invoiceId
                    ? `/dashboard/invoices/view?id=${encodeURIComponent(String(invoiceId))}${
                        invoiceNumber ? `&n=${encodeURIComponent(invoiceNumber)}` : ""
                      }`
                    : "";
                  return (
                    <div className="flex flex-wrap items-center gap-3">
                      {invoiceId && detailHref ? (
                        <Link
                          href={detailHref}
                          className="text-sm font-semibold text-indigo-600 hover:text-indigo-500"
                        >
                          View
                        </Link>
                      ) : (
                        <span className="text-sm font-semibold text-muted-foreground">View</span>
                      )}
                      {String(row?.status || "").toUpperCase() === "DRAFT" ? (
                        <>
                          <button
                            type="button"
                            onClick={() => openEditCustomer(row)}
                            className="text-sm font-semibold text-slate-700 hover:text-slate-600"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => sendDraft(row)}
                            disabled={sendingId === row?.id}
                            className="text-sm font-semibold text-emerald-700 hover:text-emerald-600 disabled:opacity-50"
                          >
                            {sendingId === row?.id ? "Sending..." : "Send"}
                          </button>
                        </>
                      ) : null}
                    </div>
                  );
                },
              },
            ]}
          />
        )}
      </Card>

      <Modal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title="Edit customer details"
      >
        <form className="space-y-4" onSubmit={saveCustomerDetails}>
          {editStatus && (
            <Alert variant={editStatus.variant}>{editStatus.message}</Alert>
          )}
          <Input
            label="Customer name"
            value={editForm.customerName}
            onChange={(e) => setEditForm({ ...editForm, customerName: e.target.value })}
          />
          <Input
            label="Customer email"
            type="email"
            value={editForm.customerEmail}
            onChange={(e) => setEditForm({ ...editForm, customerEmail: e.target.value })}
          />
          <Input
            label="Customer address"
            value={editForm.customerAddress}
            onChange={(e) => setEditForm({ ...editForm, customerAddress: e.target.value })}
          />
          <div className="flex flex-wrap items-center justify-end gap-3">
            <Button type="button" variant="secondary" onClick={() => setEditOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={savingEdit}>
              Save changes
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
