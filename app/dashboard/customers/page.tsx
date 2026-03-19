"use client";

import Link from "next/link";
import useSWR from "swr";
import { useEffect, useMemo, useState } from "react";
import { ChevronRight, Plus, Search, User, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { TransientAlert } from "@/components/ui/transient-alert";
import { formatCurrency } from "@/lib/currency";
import { useLanguage } from "@/components/providers/language-provider";

type CustomerRow = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  createdAt: string;
  status: "ACTIVE" | "ATTENTION" | "NEW" | "DISABLED";
  metrics: {
    invoiced: number;
    paid: number;
    outstanding: number;
    lastInvoiceAt: string | null;
  };
};

type CustomersResponse = {
  items: CustomerRow[];
  total: number;
  take: number;
  skip: number;
  hasMore: boolean;
  displayCurrency: string;
};

const fetcher = async (url: string): Promise<CustomersResponse> => {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const error = new Error(
      typeof payload?.error === "string" ? payload.error : "Failed to load customers"
    ) as Error & { status?: number };
    error.status = response.status;
    throw error;
  }
  return response.json();
};

export default function CustomersPage() {
  const { language } = useLanguage();
  const t = (en: string, fr: string) => (language === "fr" ? fr : en);

  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [page, setPage] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ variant: "success" | "error" | "info" | "warning"; message: string } | null>(null);
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    addressLine1: "",
    addressLine2: "",
    city: "",
    state: "",
    postalCode: "",
    country: "",
    deliveryPreference: "EMAIL",
  });

  const pageSize = 10;
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    setPage(0);
  }, [debouncedQuery]);

  const key = useMemo(() => {
    const params = new URLSearchParams();
    if (debouncedQuery) params.set("q", debouncedQuery);
    params.set("take", String(pageSize));
    params.set("skip", String(page * pageSize));
    return `/api/customers/intelligence?${params.toString()}`;
  }, [debouncedQuery, page]);

  const { data, error, isLoading, isValidating, mutate } = useSWR<CustomersResponse>(key, fetcher, {
    keepPreviousData: true,
  });

  const customers = data?.items || [];
  const total = data?.total || 0;
  const displayCurrency = data?.displayCurrency || "USD";
  const hasMore = Boolean(data?.hasMore);
  const pageLabel =
    total > 0
      ? `${page * pageSize + 1}-${Math.min((page + 1) * pageSize, total)} / ${total}`
      : `0 / 0`;

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const pageWindowStart = Math.max(1, Math.min(totalPages - 2, page + 1));
  const visiblePages = Array.from(
    { length: Math.min(3, totalPages) },
    (_, index) => pageWindowStart + index
  ).filter((value) => value <= totalPages);

  const resetForm = () =>
    setForm({
      name: "",
      email: "",
      phone: "",
      addressLine1: "",
      addressLine2: "",
      city: "",
      state: "",
      postalCode: "",
      country: "",
      deliveryPreference: "EMAIL",
    });

  const submitNewCustomer = async (event: React.FormEvent) => {
    event.preventDefault();
    setStatus(null);
    if (!form.name.trim() || !form.email.trim()) {
      setStatus({
        variant: "warning",
        message: t("Name and email are required.", "Nom et email sont requis."),
      });
      return;
    }
    if (!form.addressLine1.trim() || !form.city.trim() || !form.state.trim() || !form.country.trim()) {
      setStatus({
        variant: "warning",
        message: t(
          "Address, city, state, and country are required.",
          "Adresse, ville, etat et pays sont requis."
        ),
      });
      return;
    }
    if (form.country.trim().length !== 2) {
      setStatus({
        variant: "warning",
        message: t(
          "Country must be a 2-letter code like US or FR.",
          "Le pays doit etre un code a 2 lettres comme US ou FR."
        ),
      });
      return;
    }
    if (
      (form.deliveryPreference === "WHATSAPP" || form.deliveryPreference === "BOTH") &&
      !form.phone.trim()
    ) {
      setStatus({
        variant: "warning",
        message: t(
          "Phone is required for WhatsApp delivery.",
          "Le telephone est requis pour la livraison WhatsApp."
        ),
      });
      return;
    }

    setSaving(true);
    try {
      const response = await fetch("/api/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          email: form.email.trim().toLowerCase(),
          country: form.country.trim().toUpperCase(),
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setStatus({
          variant: "error",
          message: payload?.error || t("Could not save customer.", "Impossible d'enregistrer le client."),
        });
        return;
      }

      resetForm();
      setModalOpen(false);
      setStatus({
        variant: "success",
        message: t("Customer saved.", "Client enregistre."),
      });
      mutate();
    } catch {
      setStatus({
        variant: "error",
        message: t("Could not save customer.", "Impossible d'enregistrer le client."),
      });
    } finally {
      setSaving(false);
    }
  };

  const statusStyles: Record<CustomerRow["status"], string> = {
    ACTIVE: "border-emerald-300 bg-emerald-100 text-emerald-800",
    ATTENTION: "border-amber-300 bg-amber-100 text-amber-800",
    NEW: "border-slate-200 bg-slate-100 text-slate-700",
    DISABLED: "border-rose-200 bg-rose-50 text-rose-700",
  };

  return (
    <div className="bg-[#F9FAFB] py-12">
      <div className="mx-auto w-full max-w-[1100px] space-y-8">
        <header className="mt-12 flex flex-wrap items-end justify-between gap-6">
          <div className="space-y-2">
            <h1 className="text-[32px] font-bold tracking-tight text-foreground">{t("Customers", "Clients")}</h1>
            <p className="text-[15px] text-muted-foreground">{t("Manage your business clients", "Gerez vos clients entreprise")}</p>
          </div>
          <div className="flex w-full max-w-[620px] items-center justify-end gap-3">
            <div className="relative w-full max-w-[420px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t("Search customers", "Rechercher des clients")}
                className="h-11 w-full rounded-xl border border-slate-300 bg-white pl-9 pr-3 text-[15px] text-foreground placeholder:text-muted-foreground focus:border-indigo-400 focus:outline-none"
              />
            </div>
            <Button className="h-11 rounded-xl bg-blue-600 px-5 text-white shadow-sm hover:bg-blue-500" onClick={() => setModalOpen(true)}>
              <Plus className="h-4 w-4" />
              {t("New Customer", "Nouveau client")}
            </Button>
          </div>
        </header>

        {status ? (
          <TransientAlert variant={status.variant} onDismiss={() => setStatus(null)}>
            {status.message}
          </TransientAlert>
        ) : null}
        {error ? (
          <Alert variant="error">
            {typeof (error as { status?: unknown }).status === "number" &&
            Number((error as { status?: number }).status) === 403
              ? t("You do not have access to customers.", "Vous n'avez pas acces aux clients.")
              : t("Something went wrong loading customers.", "Erreur lors du chargement des clients.")}
          </Alert>
        ) : null}

        <Card className="rounded-2xl border border-slate-200 bg-white p-8 shadow-[0_10px_30px_rgba(15,23,42,0.06)]">
          <div className="space-y-1">
            {isLoading ? (
              [...Array(4)].map((_, index) => (
                <div key={index} className="h-[88px] animate-pulse rounded-xl bg-slate-50" />
              ))
            ) : customers.length === 0 ? (
              <div className="px-6 py-16 text-center">
                <p className="text-base font-semibold text-foreground">
                  {t("No customers found", "Aucun client trouve")}
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  {t("Create your first customer to start issuing invoices.", "Creez votre premier client pour commencer a emettre des factures.")}
                </p>
              </div>
            ) : (
              customers.map((customer) => {
                const cleanName = String(customer.name || "").trim();
                const showName = cleanName && !/^unknown customer$/i.test(cleanName);
                return (
                  <Link
                    key={customer.id}
                    href={`/dashboard/customers/${customer.id}`}
                    className="group grid min-h-[88px] gap-4 rounded-xl px-4 py-5 transition-colors hover:bg-[#F9FAFB] md:grid-cols-[minmax(0,2.2fr)_minmax(0,2.4fr)_minmax(160px,0.9fr)]"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-500">
                        <User className="h-4 w-4" />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-[16px] font-semibold text-foreground">
                          {showName ? cleanName : customer.email}
                        </p>
                        <p className="truncate text-[13px] text-muted-foreground">
                          {showName ? customer.email : t("No name added", "Nom non renseigne")}
                        </p>
                      </div>
                    </div>

                    <div className="flex min-w-0 flex-wrap items-start justify-center gap-6 lg:gap-8">
                      <div className="space-y-0.5 text-center">
                        <p className="text-[11px] uppercase tracking-[0.12em] text-slate-500">{t("Invoiced", "Facture")}</p>
                        <p className="text-[15px] font-semibold text-slate-900">{formatCurrency(customer.metrics.invoiced, displayCurrency)}</p>
                        <p className="text-[11px] text-slate-400">{displayCurrency}</p>
                      </div>
                      <div className="space-y-0.5 text-center">
                        <p className="text-[11px] uppercase tracking-[0.12em] text-slate-500">{t("Paid", "Paye")}</p>
                        <p className="text-[15px] font-semibold text-slate-900">{formatCurrency(customer.metrics.paid, displayCurrency)}</p>
                        <p className="text-[11px] text-slate-400">{displayCurrency}</p>
                      </div>
                      <div className="space-y-0.5 text-center">
                        <p className="text-[11px] uppercase tracking-[0.12em] text-slate-500">{t("Outstanding", "En attente")}</p>
                        <p className="text-[15px] font-semibold text-slate-900">{formatCurrency(customer.metrics.outstanding, displayCurrency)}</p>
                        <p className="text-[11px] text-slate-400">{displayCurrency}</p>
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-3">
                      <span
                        className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${statusStyles[customer.status]}`}
                      >
                        {customer.status === "ATTENTION"
                          ? t("Attention", "Attention")
                          : customer.status === "DISABLED"
                          ? t("Disabled", "Desactive")
                          : customer.status === "ACTIVE"
                          ? t("Active", "Actif")
                          : t("New", "Nouveau")}
                      </span>
                      <span className="inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition-colors group-hover:text-slate-700">
                        <ChevronRight className="h-4 w-4" />
                      </span>
                    </div>
                  </Link>
                );
              })
            )}
          </div>

          <div className="mt-6 border-t border-slate-100 pt-5">
            <div className="flex items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => setPage((prev) => Math.max(0, prev - 1))}
                disabled={page === 0 || isValidating}
                className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {t("Previous", "Precedent")}
              </button>
              {visiblePages.map((pageNumber) => {
                const active = page === pageNumber - 1;
                return (
                  <button
                    key={pageNumber}
                    type="button"
                    onClick={() => setPage(pageNumber - 1)}
                    className={`h-9 min-w-9 rounded-lg border px-3 text-sm transition ${
                      active
                        ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                        : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    {pageNumber}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => setPage((prev) => prev + 1)}
                disabled={!hasMore || isValidating}
                className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {t("Next", "Suivant")}
              </button>
            </div>
            <p className="mt-3 text-center text-xs text-slate-500">{pageLabel}</p>
          </div>
        </Card>
      </div>

      {modalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-4xl rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-foreground">{t("New Customer", "Nouveau client")}</h2>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-slate-100 hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={submitNewCustomer} className="space-y-6">
              <div className="grid gap-6 md:grid-cols-2">
                <section className="space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">{t("Basic info", "Infos de base")}</p>
                  <Input
                    label={t("Name", "Nom")}
                    value={form.name}
                    onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                    required
                  />
                  <Input
                    label={t("Email", "Email")}
                    type="email"
                    value={form.email}
                    onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
                    required
                  />
                  <Input
                    label={t("Phone", "Telephone")}
                    value={form.phone}
                    onChange={(event) => setForm((prev) => ({ ...prev, phone: event.target.value }))}
                    required={form.deliveryPreference === "WHATSAPP" || form.deliveryPreference === "BOTH"}
                  />
                </section>
                <section className="space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">{t("Contact info", "Coordonnees")}</p>
                  <Input
                    label={t("Address line 1", "Adresse ligne 1")}
                    value={form.addressLine1}
                    onChange={(event) => setForm((prev) => ({ ...prev, addressLine1: event.target.value }))}
                    required
                  />
                  <Input
                    label={t("Address line 2", "Adresse ligne 2")}
                    value={form.addressLine2}
                    onChange={(event) => setForm((prev) => ({ ...prev, addressLine2: event.target.value }))}
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <Input
                      label={t("City", "Ville")}
                      value={form.city}
                      onChange={(event) => setForm((prev) => ({ ...prev, city: event.target.value }))}
                      required
                    />
                    <Input
                      label={t("State", "Etat")}
                      value={form.state}
                      onChange={(event) => setForm((prev) => ({ ...prev, state: event.target.value }))}
                      required
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Input
                      label={t("Postal code", "Code postal")}
                      value={form.postalCode}
                      onChange={(event) => setForm((prev) => ({ ...prev, postalCode: event.target.value }))}
                    />
                    <Input
                      label={t("Country", "Pays")}
                      value={form.country}
                      onChange={(event) => setForm((prev) => ({ ...prev, country: event.target.value }))}
                      required
                      maxLength={2}
                    />
                  </div>
                  <label className="flex flex-col gap-1 text-sm text-foreground">
                    {t("Delivery preference", "Preference de livraison")}
                    <select
                      value={form.deliveryPreference}
                      onChange={(event) => setForm((prev) => ({ ...prev, deliveryPreference: event.target.value }))}
                      className="h-10 rounded-lg border border-input bg-background px-3 text-foreground focus:border-indigo-400 focus:outline-none"
                    >
                      <option value="EMAIL">Email</option>
                      <option value="WHATSAPP">WhatsApp</option>
                      <option value="BOTH">{t("Both", "Les deux")}</option>
                    </select>
                  </label>
                </section>
              </div>
              <div className="flex items-center justify-end gap-3 border-t border-slate-100 pt-4">
                <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>
                  {t("Cancel", "Annuler")}
                </Button>
                <Button type="submit" loading={saving}>
                  {t("Save Customer", "Enregistrer le client")}
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
