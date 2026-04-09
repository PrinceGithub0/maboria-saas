"use client";

import Link from "next/link";
import useSWR from "swr";
import { useEffect, useMemo, useState } from "react";
import { ChevronRight, Plus, Search, User, UserPlus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CountrySelect } from "@/components/ui/country-select";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { PhoneInput } from "@/components/ui/phone-input";
import { Alert } from "@/components/ui/alert";
import { TransientAlert } from "@/components/ui/transient-alert";
import { formatCurrency } from "@/lib/currency";
import { useLanguage } from "@/components/providers/language-provider";

function localizeCustomersServerMessage(
  message: string,
  t: ReturnType<typeof useLanguage>["t"]
) {
  const normalized = String(message || "").trim();
  if (!normalized) return "";
  const translations: Record<string, string> = {
    Unauthorized: t("Unauthorized.", "Non autorise.", "Nicht autorisiert.", "No autorizado.", "Não autorizado."),
    "Invalid query parameters": t(
      "Invalid customer filters.",
      "Filtres client invalides.",
      "Ungültige Kundenfilter.",
      "Filtros de cliente no validos.",
      "Filtros de cliente invalidos."
    ),
    "Invalid customer payload": t(
      "Invalid customer details.",
      "D?tails client invalides.",
      "Ungültige Kundendaten.",
      "Datos de cliente no validos.",
      "Dados de cliente invalidos."
    ),
  };
  return translations[normalized] || "";
}

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
  const { t, language } = useLanguage();

  const buildFreshCustomerForm = () => ({
    name: "",
    companyName: "",
    email: "",
    phone: "",
    taxId: "",
    registrationNumber: "",
    branchCode: "",
    addressLine1: "",
    addressLine2: "",
    city: "",
    state: "",
    postalCode: "",
    country: "",
    deliveryPreference: "",
  });

  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [page, setPage] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ variant: "success" | "error" | "info" | "warning"; message: string } | null>(null);
  const [form, setForm] = useState(buildFreshCustomerForm);

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

  const resetForm = () => setForm(buildFreshCustomerForm());

  const submitNewCustomer = async (event: React.FormEvent) => {
    event.preventDefault();
    setStatus(null);
    const requiresPhoneForDelivery =
      form.deliveryPreference === "WHATSAPP" || form.deliveryPreference === "BOTH";
    if (
      !form.name.trim() ||
      !form.email.trim() ||
      !form.addressLine1.trim() ||
      !form.city.trim() ||
      !form.state.trim() ||
      !form.country.trim() ||
      !form.deliveryPreference.trim() ||
      (requiresPhoneForDelivery && !form.phone.trim())
    ) {
      setStatus({
        variant: "warning",
        message: t(
          "Name, email, delivery method, address, city, state, and country are required. Phone is required for WhatsApp delivery.",
          "Nom, email, mode de livraison, adresse, ville, etat et pays sont requis. Le tÃ©lÃ©phone est requis pour WhatsApp.",
          "Name, E-Mail, Zustellmethode, Adresse, Stadt, Bundesland und Land sind erforderlich. FÃ¼r die WhatsApp-Zustellung ist eine Telefonnummer erforderlich.",
          "Nombre, correo, mÃ©todo de entrega, direcci?n, ciudad, estado y paÃ­s son obligatorios. El telÃ©fono es obligatorio para la entrega por WhatsApp.",
          "Nome, email, mÃ©todo de entrega, endereco, cidade, estado e paÃ­s sÃ£o obrigatorios. O telefone e obrigatÃ³rio para entrega por WhatsApp."
        ),
      });
      return;
    }
    if (!form.name.trim() || !form.email.trim()) {
      setStatus({
        variant: "warning",
        message: t(
          "Name and email are required.",
          "Nom et email sont requis.",
          "Name und E-Mail sind erforderlich.",
          "El nombre y el correo electr?nico son obligatorios.",
          "Nome e email são obrigatorios."
        ),
      });
      return;
    }
    if (!form.addressLine1.trim() || !form.city.trim() || !form.state.trim() || !form.country.trim()) {
      setStatus({
        variant: "warning",
        message: t(
          "Address, city, state, and country are required.",
          "Adresse, ville, etat et pays sont requis.",
          "Adresse, Stadt, Bundesland und Land sind erforderlich.",
          "La direcci?n, la ciudad, el estado y el país son obligatorios.",
          "Morada, cidade, estado e país são obrigatorios."
        ),
      });
      return;
    }
    if (form.country.trim().length !== 2) {
      setStatus({
        variant: "warning",
        message: t(
          "Country must be a 2-letter code like US or FR.",
          "Le pays doit être un code a 2 lettres comme US ou FR.",
          "Das Land muss ein 2-Buchstaben-Code wie US oder FR sein.",
          "El país debe ser un código de 2 letras como US o FR.",
          "O país deve ser um código de 2 letras como US ou FR."
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
          "Le téléphone est requis pour la livraison WhatsApp.",
          "Für die WhatsApp-Zustellung ist eine Telefonnummer erforderlich.",
          "El teléfono es obligatorio para la entrega por WhatsApp.",
          "O telefone e obrigatório para a entrega por WhatsApp."
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
          message:
            (typeof payload?.error === "string" && localizeCustomersServerMessage(payload.error, t)) ||
            t(
              "Could not save customer.",
              "Impossible d'enregistrer le client.",
              "Der Kunde konnte nicht gespeichert werden.",
              "No se pudo guardar el cliente.",
              "Não foi possível guardar o cliente."
            ),
        });
        return;
      }

      resetForm();
      setModalOpen(false);
      setStatus({
        variant: "success",
        message: t("Customer saved.", "Client enregistr?.", "Kunde gespeichert.", "Cliente guardado.", "Cliente guardado."),
      });
      mutate();
    } catch {
      setStatus({
        variant: "error",
        message: t(
          "Could not save customer.",
          "Impossible d'enregistrer le client.",
          "Der Kunde konnte nicht gespeichert werden.",
          "No se pudo guardar el cliente.",
          "Não foi possível guardar o cliente."
        ),
      });
    } finally {
      setSaving(false);
    }
  };

  const statusStyles: Record<CustomerRow["status"], string> = {
    ACTIVE: "border-emerald-300 bg-emerald-100 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-200",
    ATTENTION: "border-amber-300 bg-amber-100 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-200",
    NEW: "border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200",
    DISABLED: "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/15 dark:text-rose-200",
  };

  return (
    <div className="bg-[#F9FAFB] py-12 dark:bg-[#0B1020]">
      <div className="mx-auto w-full max-w-[1100px] space-y-8">
        <header className="mt-12 flex flex-wrap items-end justify-between gap-6">
          <div className="space-y-2">
            <h1 className="text-[32px] font-bold tracking-tight text-foreground">{t("Customers", "Clients", "Kunden", "Clientes", "Clientes")}</h1>
            <p className="text-[15px] text-muted-foreground">{t("Manage your business clients", "G?rez vos clients entreprise", "Verwalte deine Unternehmenskunden", "Gestiona tus clientes empresariales", "Gira os teus clientes empresariais")}</p>
          </div>
          <div className="flex w-full max-w-[620px] items-center justify-end gap-3">
            <div className="relative w-full max-w-[420px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t("Search customers", "Rechercher des clients", "Kunden suchen", "Buscar clientes", "Pesquisar clientes")}
                className="h-11 w-full rounded-xl border border-slate-300 bg-white pl-9 pr-3 text-[15px] text-foreground placeholder:text-muted-foreground focus:border-indigo-400 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-400"
              />
            </div>
            <Button className="h-11 rounded-xl bg-blue-600 px-5 text-white shadow-sm hover:bg-blue-500" onClick={() => setModalOpen(true)}>
              <Plus className="h-4 w-4" />
              {t("New Customer", "Nouveau client", "Neuer Kunde", "Nuevo cliente", "Novo cliente")}
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
              ? t(
                  "You do not have access to customers.",
                  "Vous n'avez pas accès aux clients.",
                  "Du hast keinen Zugriff auf Kunden.",
                  "No tienes acceso a clientes.",
                  "Não tem acesso a clientes."
                )
              : localizeCustomersServerMessage(
                  (error as Error)?.message || "",
                  t
                ) ||
                t(
                  "Something went wrong loading customers.",
                  "Erreur lors du chargement des clients.",
                  "Beim Laden der Kunden ist ein Fehler aufgêtreten.",
                  "Se produjo un error al cargar los clientes.",
                  "Ocorreu um erro ao carregar os clientes."
                )}
          </Alert>
        ) : null}

        <Card className="rounded-2xl border border-slate-200 bg-white p-8 shadow-[0_10px_30px_rgba(15,23,42,0.06)] dark:border-slate-800 dark:bg-slate-950 dark:shadow-[0_18px_40px_rgba(2,6,23,0.45)]">
          <div className="space-y-1">
            {isLoading ? (
              [...Array(4)].map((_, index) => (
                <div key={index} className="h-[88px] animate-pulse rounded-xl bg-slate-50 dark:bg-slate-900" />
              ))
            ) : customers.length === 0 ? (
              <div className="px-6 py-16 text-center">
                <p className="text-base font-semibold text-foreground">
                  {t("No customers found", "Aucun client trouvé", "Keine Kunden gefunden", "No se encontraron clientes", "Nenhum cliente encontrado")}
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  {t("Create your first customer to start issuing invoices.", "Créez votre premier client pour commencer a emettre des factures.", "Erstelle deinen ersten Kunden, um Rechnungen auszustellen.", "Crea tu primer cliente para empezar a emitir facturas.", "Crie o seu primeiro cliente para começar a emitir faturas.")}
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
                    className="group grid min-h-[88px] gap-4 rounded-xl px-4 py-5 transition-colors hover:bg-[#F9FAFB] dark:hover:bg-slate-900 md:grid-cols-[minmax(0,2.2fr)_minmax(0,2.4fr)_minmax(160px,0.9fr)]"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                        <User className="h-4 w-4" />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-[16px] font-semibold text-foreground">
                          {showName ? cleanName : customer.email}
                        </p>
                        <p className="truncate text-[13px] text-muted-foreground">
                          {showName ? customer.email : t("No name added", "Nom non renseigne", "Kein Name hinzugefugt", "Sin nombre agregado", "Sem nome adicionado")}
                        </p>
                      </div>
                    </div>

                    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] items-start gap-4 lg:gap-6">
                      <div className="min-w-0 overflow-hidden space-y-0.5 text-center">
                        <p className="truncate leading-tight text-[11px] uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">{t("Invoiced", "Facture", "In Rechnung gestellt", "Facturado", "Faturado")}</p>
                        <p
                          className="truncate whitespace-nowrap text-[clamp(0.88rem,0.55vw+0.7rem,0.95rem)] font-semibold text-slate-900 tabular-nums dark:text-slate-100"
                          title={formatCurrency(customer.metrics.invoiced, displayCurrency)}
                        >
                          {formatCurrency(customer.metrics.invoiced, displayCurrency)}
                        </p>
                        <p className="text-[11px] text-slate-400 dark:text-slate-500">{displayCurrency}</p>
                      </div>
                      <div className="min-w-0 overflow-hidden space-y-0.5 text-center">
                        <p className="truncate leading-tight text-[11px] uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">{t("Paid", "Paye", "Bezahlt", "Pagado", "Pago")}</p>
                        <p
                          className="truncate whitespace-nowrap text-[clamp(0.88rem,0.55vw+0.7rem,0.95rem)] font-semibold text-slate-900 tabular-nums dark:text-slate-100"
                          title={formatCurrency(customer.metrics.paid, displayCurrency)}
                        >
                          {formatCurrency(customer.metrics.paid, displayCurrency)}
                        </p>
                        <p className="text-[11px] text-slate-400 dark:text-slate-500">{displayCurrency}</p>
                      </div>
                      <div className="min-w-0 overflow-hidden space-y-0.5 text-center">
                        <p className="truncate leading-tight text-[11px] uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">{t("Outstanding", "En attente", "Offen", "Pendiente", "Pendente")}</p>
                        <p
                          className="truncate whitespace-nowrap text-[clamp(0.88rem,0.55vw+0.7rem,0.95rem)] font-semibold text-slate-900 tabular-nums dark:text-slate-100"
                          title={formatCurrency(customer.metrics.outstanding, displayCurrency)}
                        >
                          {formatCurrency(customer.metrics.outstanding, displayCurrency)}
                        </p>
                        <p className="text-[11px] text-slate-400 dark:text-slate-500">{displayCurrency}</p>
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-3">
                      <span
                        className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${statusStyles[customer.status]}`}
                      >
                        {customer.status === "ATTENTION"
                          ? t("Attention", "Attention", "Achtung", "Atencion", "Atencao")
                          : customer.status === "DISABLED"
                          ? t("Disabled", "D?sactiv?", "Deaktiviert", "Desactivado", "Desativado")
                          : customer.status === "ACTIVE"
                          ? t("Active", "Actif", "Aktiv", "Activo", "Ativo")
                          : t("New", "Nouveau", "Neu", "Nuevo", "Novo")}
                      </span>
                      <span className="inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition-colors group-hover:text-slate-700 dark:text-slate-500 dark:group-hover:text-slate-200">
                        <ChevronRight className="h-4 w-4" />
                      </span>
                    </div>
                  </Link>
                );
              })
            )}
          </div>

          <div className="mt-6 border-t border-slate-100 pt-5 dark:border-slate-800">
            <div className="flex items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => setPage((prev) => Math.max(0, prev - 1))}
                disabled={page === 0 || isValidating}
                className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-900"
              >
                {t("Previous", "Precedent", "Zurück", "Anterior", "Anterior")}
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
                        ? "border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-200"
                        : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-900"
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
                className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-900"
              >
                {t("Next", "Suivant", "Weiter", "Siguiente", "Seguinte")}
              </button>
            </div>
            <p className="mt-3 text-center text-xs text-slate-500 dark:text-slate-400">{pageLabel}</p>
          </div>
        </Card>
      </div>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        hideHeader
        className="max-w-[1120px] rounded-[2rem] border-border/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.94))] p-0 shadow-[0_38px_90px_-42px_rgba(15,23,42,0.48)] dark:border-slate-800 dark:bg-[linear-gradient(180deg,rgba(7,12,24,0.98),rgba(10,16,30,0.96))] dark:shadow-[0_42px_100px_-44px_rgba(0,0,0,0.82)] max-md:max-w-none"
        bodyClassName="max-h-[82vh] pr-0"
      >
        <div className="border-b border-border/60 bg-[radial-gradient(circle_at_top_left,rgba(79,70,229,0.12),transparent_38%),linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.9))] px-6 py-5 dark:border-slate-800 dark:bg-[radial-gradient(circle_at_top_left,rgba(99,102,241,0.22),transparent_34%),linear-gradient(180deg,rgba(8,14,28,0.98),rgba(10,18,32,0.94))]">
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 items-start gap-4">
              <div className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[linear-gradient(145deg,#5b4df5,#4338ca)] text-white shadow-[0_20px_45px_-24px_rgba(79,70,229,0.9)]">
                <UserPlus className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-indigo-600/80 dark:text-indigo-300/90">
                  {t("Customer profile", "Profil client", "Kundenprofil", "Perfil del cliente", "Perfil do cliente")}
                </p>
                <h3 className="mt-1 text-[1.7rem] font-semibold tracking-tight text-foreground">
                  {t("Add New Customer", "Ajouter un client", "Neuen Kunden hinzufuegen", "Anadir cliente", "Adicionar cliente")}
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t(
                    "Create a complete customer record for invoices and payment follow-up.",
                    "Creez une fiche client complete pour la facturation et le suivi des paiements.",
                    "Erstelle einen vollstaendigen Kundendatensatz fuer Rechnungen und Zahlungsnachverfolgung.",
                    "Crea un registro completo del cliente para facturas y seguimiento de pagos.",
                    "Crie um registo completo do cliente para faturas e acompanhamento de pagamentos."
                  )}
                </p>
              </div>
            </div>
            <button
              type="button"
              aria-label={t("Close", "Fermer", "Schliessen", "Cerrar", "Fechar")}
              onClick={() => setModalOpen(false)}
              className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-border/70 bg-white/85 text-muted-foreground shadow-[0_18px_36px_-30px_rgba(15,23,42,0.55)] transition hover:border-slate-300 hover:text-foreground dark:border-slate-700 dark:bg-slate-900/90 dark:text-slate-300 dark:shadow-[0_18px_36px_-30px_rgba(0,0,0,0.8)] dark:hover:border-slate-500 dark:hover:text-slate-100"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
        <form
          className="grid grid-cols-1 gap-x-5 gap-y-5 px-6 py-5 text-foreground dark:[color-scheme:dark] dark:text-slate-100 lg:grid-cols-2"
          onSubmit={submitNewCustomer}
        >
          <div>
            <Input
              className="h-12 rounded-2xl border-border/80 bg-white/85 px-4 text-[15px] leading-tight shadow-[0_10px_24px_-22px_rgba(15,23,42,0.45)] dark:border-slate-700 dark:bg-slate-900/95 dark:text-slate-100 dark:placeholder:text-slate-400 dark:shadow-[0_14px_28px_-24px_rgba(0,0,0,0.75)]"
              label={t("Name", "Nom", "Name", "Nombre", "Nome")}
              value={form.name}
              onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
              required
              placeholder={t("Customer name", "Nom du client", "Kundenname", "Nombre del cliente", "Nome do cliente")}
              autoComplete="off"
              spellCheck={false}
              formNoValidate={false}
            />
          </div>
          <div>
            <Input
              className="h-12 rounded-2xl border-border/80 bg-white/85 px-4 text-[15px] leading-tight shadow-[0_10px_24px_-22px_rgba(15,23,42,0.45)] dark:border-slate-700 dark:bg-slate-900/95 dark:text-slate-100 dark:placeholder:text-slate-400 dark:shadow-[0_14px_28px_-24px_rgba(0,0,0,0.75)]"
              label={t("Company / legal name (optional)", "Raison sociale / nom legal (optionnel)", "Firma / rechtlicher Name (optional)", "Nombre legal de la empresa (opcional)", "Nome legal da empresa (opcional)")}
              value={form.companyName}
              onChange={(event) => setForm((prev) => ({ ...prev, companyName: event.target.value }))}
              placeholder={t("Company name", "Raison sociale", "Firmenname", "Nombre de la empresa", "Nome da empresa")}
            />
          </div>
          <div>
            <Input
              className="h-12 rounded-2xl border-border/80 bg-white/85 px-4 text-[15px] leading-tight shadow-[0_10px_24px_-22px_rgba(15,23,42,0.45)] dark:border-slate-700 dark:bg-slate-900/95 dark:text-slate-100 dark:placeholder:text-slate-400 dark:shadow-[0_14px_28px_-24px_rgba(0,0,0,0.75)]"
              label={t("Email", "Email", "E-Mail", "Correo", "Email")}
              type="email"
              value={form.email}
              onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
              required
              placeholder={t("customer@email.com", "client@email.com", "kunde@email.com", "cliente@email.com", "cliente@email.com")}
            />
          </div>
          <div>
            <PhoneInput
              label={t("Phone", "Telephone", "Telefon", "Telefono", "Telefone")}
              value={form.phone}
              locale={language}
              defaultCountry={form.country || "US"}
              onChange={(value) => setForm((prev) => ({ ...prev, phone: value }))}
              required={form.deliveryPreference === "WHATSAPP" || form.deliveryPreference === "BOTH"}
              fieldClassName="h-12 rounded-2xl border-border/80 bg-white/85 px-3 shadow-[0_10px_24px_-22px_rgba(15,23,42,0.45)] dark:border-slate-700 dark:bg-slate-900/95 dark:text-slate-100 dark:shadow-[0_14px_28px_-24px_rgba(0,0,0,0.75)]"
            />
          </div>
          <label className="flex flex-col gap-1 text-sm text-foreground dark:text-slate-200">
            <span className="font-medium">{t("Delivery method", "Mode de livraison", "Zustellmethode", "Metodo de entrega", "Metodo de entrega")} *</span>
            <select
              value={form.deliveryPreference}
              onChange={(event) => setForm((prev) => ({ ...prev, deliveryPreference: event.target.value }))}
              required
              className="h-12 rounded-2xl border border-border/80 bg-white/85 px-4 text-foreground shadow-[0_10px_24px_-22px_rgba(15,23,42,0.45)] focus:border-indigo-400 focus:outline-none dark:border-slate-700 dark:bg-slate-900/95 dark:text-slate-100 dark:shadow-[0_14px_28px_-24px_rgba(0,0,0,0.75)]"
            >
              <option value="">{t("Choose a method", "Choisir un mode", "Methode auswahlen", "Elegir un metodo", "Escolher um metodo")}</option>
              <option value="EMAIL">{t("Email", "Email", "E-Mail", "Correo", "Email")}</option>
              <option value="WHATSAPP">{t("WhatsApp", "WhatsApp", "WhatsApp", "WhatsApp", "WhatsApp")}</option>
              <option value="BOTH">{t("Both", "Les deux", "Beide", "Ambos", "Ambos")}</option>
            </select>
          </label>
          <div>
            <Input
              className="h-12 rounded-2xl border-border/80 bg-white/85 px-4 text-[15px] leading-tight shadow-[0_10px_24px_-22px_rgba(15,23,42,0.45)] dark:border-slate-700 dark:bg-slate-900/95 dark:text-slate-100 dark:placeholder:text-slate-400 dark:shadow-[0_14px_28px_-24px_rgba(0,0,0,0.75)]"
              label={t("Address line 1", "Adresse ligne 1", "Adresszeile 1", "Linea de direccion 1", "Linha de endereco 1")}
              value={form.addressLine1}
              onChange={(event) => setForm((prev) => ({ ...prev, addressLine1: event.target.value }))}
              required
              placeholder={t("Street address", "Adresse postale", "Strassenadresse", "Direccion postal", "Endereco postal")}
            />
          </div>
          <div>
            <Input
              className="h-12 rounded-2xl border-border/80 bg-white/85 px-4 text-[15px] leading-tight shadow-[0_10px_24px_-22px_rgba(15,23,42,0.45)] dark:border-slate-700 dark:bg-slate-900/95 dark:text-slate-100 dark:placeholder:text-slate-400 dark:shadow-[0_14px_28px_-24px_rgba(0,0,0,0.75)]"
              label={t("Address line 2 (optional)", "Adresse ligne 2 (optionnelle)", "Adresszeile 2 (optional)", "Linea de direccion 2 (opcional)", "Linha de endereco 2 (opcional)")}
              value={form.addressLine2}
              onChange={(event) => setForm((prev) => ({ ...prev, addressLine2: event.target.value }))}
            />
          </div>
          <div>
            <Input
              className="h-12 rounded-2xl border-border/80 bg-white/85 px-4 shadow-[0_10px_24px_-22px_rgba(15,23,42,0.45)] dark:border-slate-700 dark:bg-slate-900/95 dark:text-slate-100 dark:placeholder:text-slate-400 dark:shadow-[0_14px_28px_-24px_rgba(0,0,0,0.75)]"
              label={t("Tax ID (optional)", "Numero fiscal (optionnel)", "Steuer-ID (optional)", "ID fiscal (opcional)", "NIF (opcional)")}
              value={form.taxId}
              onChange={(event) => setForm((prev) => ({ ...prev, taxId: event.target.value }))}
              placeholder={t("Tax or VAT ID", "Numero fiscal ou TVA", "Steuer- oder MwSt.-ID", "ID fiscal o IVA", "NIF ou IVA")}
            />
          </div>
          <div>
            <Input
              className="h-12 rounded-2xl border-border/80 bg-white/85 px-4 shadow-[0_10px_24px_-22px_rgba(15,23,42,0.45)] dark:border-slate-700 dark:bg-slate-900/95 dark:text-slate-100 dark:placeholder:text-slate-400 dark:shadow-[0_14px_28px_-24px_rgba(0,0,0,0.75)]"
              label={t("Business registration number (optional)", "Numero d immatriculation de l entreprise (optionnel)", "Handelsregisternummer (optional)", "Numero de registro de la empresa (opcional)", "Numero de registro da empresa (opcional)")}
              value={form.registrationNumber}
              onChange={(event) => setForm((prev) => ({ ...prev, registrationNumber: event.target.value }))}
              placeholder={t("Registration number", "Numero d immatriculation", "Registernummer", "Numero de registro", "Numero de registro")}
            />
          </div>
          <div>
            <Input
              className="h-12 rounded-2xl border-border/80 bg-white/85 px-4 shadow-[0_10px_24px_-22px_rgba(15,23,42,0.45)] dark:border-slate-700 dark:bg-slate-900/95 dark:text-slate-100 dark:placeholder:text-slate-400 dark:shadow-[0_14px_28px_-24px_rgba(0,0,0,0.75)]"
              label={t("Branch code (optional)", "Code de succursale (optionnel)", "Filialcode (optional)", "Codigo de sucursal (opcional)", "Codigo da filial (opcional)")}
              value={form.branchCode}
              onChange={(event) => setForm((prev) => ({ ...prev, branchCode: event.target.value }))}
              placeholder={t("Branch code", "Code agence", "Filialcode", "Codigo de sucursal", "Codigo da filial")}
            />
          </div>
          <div>
            <Input
              className="h-12 rounded-2xl border-border/80 bg-white/85 px-4 text-[15px] leading-tight shadow-[0_10px_24px_-22px_rgba(15,23,42,0.45)] dark:border-slate-700 dark:bg-slate-900/95 dark:text-slate-100 dark:placeholder:text-slate-400 dark:shadow-[0_14px_28px_-24px_rgba(0,0,0,0.75)]"
              label={t("City", "Ville", "Stadt", "Ciudad", "Cidade")}
              value={form.city}
              onChange={(event) => setForm((prev) => ({ ...prev, city: event.target.value }))}
              required
            />
          </div>
          <div>
            <Input
              className="h-12 rounded-2xl border-border/80 bg-white/85 px-4 text-[15px] leading-tight shadow-[0_10px_24px_-22px_rgba(15,23,42,0.45)] dark:border-slate-700 dark:bg-slate-900/95 dark:text-slate-100 dark:placeholder:text-slate-400 dark:shadow-[0_14px_28px_-24px_rgba(0,0,0,0.75)]"
              label={t("State", "Etat", "Bundesland", "Estado", "Estado")}
              value={form.state}
              onChange={(event) => setForm((prev) => ({ ...prev, state: event.target.value }))}
              required
            />
          </div>
          <div>
            <Input
              className="h-12 rounded-2xl border-border/80 bg-white/85 px-4 shadow-[0_10px_24px_-22px_rgba(15,23,42,0.45)] dark:border-slate-700 dark:bg-slate-900/95 dark:text-slate-100 dark:placeholder:text-slate-400 dark:shadow-[0_14px_28px_-24px_rgba(0,0,0,0.75)]"
              label={t("Postal code", "Code postal", "Postleitzahl", "Codigo postal", "Codigo postal")}
              value={form.postalCode}
              onChange={(event) => setForm((prev) => ({ ...prev, postalCode: event.target.value }))}
              placeholder={t("ZIP / postal code", "Code ZIP / postal", "ZIP / Postleitzahl", "ZIP / codigo postal", "ZIP / codigo postal")}
            />
          </div>
          <div>
            <CountrySelect
              label={t("Country", "Pays", "Land", "Pais", "Pais")}
              value={form.country}
              locale={language}
              onChange={(value) => setForm((prev) => ({ ...prev, country: value }))}
              required
              triggerClassName="h-12 rounded-2xl border-border/80 bg-white/85 px-4 shadow-[0_10px_24px_-22px_rgba(15,23,42,0.45)] dark:border-slate-700 dark:bg-slate-900/95 dark:text-slate-100 dark:shadow-[0_14px_28px_-24px_rgba(0,0,0,0.75)]"
            />
          </div>
          <div className="flex flex-col gap-4 border-t border-border/60 pt-5 dark:border-slate-800 lg:col-span-2 lg:flex-row lg:items-center lg:justify-between">
            <p className="text-sm text-muted-foreground dark:text-slate-400">
              <span className="font-semibold text-foreground dark:text-slate-100">{t("Required fields", "Champs requis", "Pflichtfelder", "Campos obligatorios", "Campos obrigatorios")}</span>
              <span className="ml-2">
                {t("must be completed before saving.", "doivent etre remplis avant l enregistrement.", "muessen vor dem Speichern ausgefuellt werden.", "deben completarse antes de guardar.", "devem ser preenchidos antes de guardar.")}
              </span>
            </p>
            <div className="flex items-center justify-end gap-3 whitespace-nowrap">
              <Button
                type="button"
                variant="secondary"
                className="h-12 min-w-[136px] rounded-2xl border-slate-300 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(241,245,249,0.92))] px-6 text-[15px] font-semibold text-slate-700 shadow-[0_18px_40px_-30px_rgba(15,23,42,0.45)] hover:border-slate-400 hover:bg-[linear-gradient(180deg,rgba(255,255,255,1),rgba(248,250,252,0.96))] hover:text-slate-900 dark:border-slate-700 dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.98),rgba(15,23,42,0.9))] dark:text-slate-200 dark:shadow-[0_18px_40px_-30px_rgba(0,0,0,0.82)] dark:hover:border-slate-500 dark:hover:bg-[linear-gradient(180deg,rgba(17,24,39,1),rgba(15,23,42,0.94))] dark:hover:text-slate-100"
                onClick={() => setModalOpen(false)}
              >
                {t("Cancel", "Annuler", "Abbrechen", "Cancelar", "Cancelar")}
              </Button>
              <Button
                type="submit"
                loading={saving}
                className="h-12 min-w-[208px] rounded-2xl border border-indigo-400/30 bg-[linear-gradient(135deg,#6657ff_0%,#5547f0_48%,#4338ca_100%)] px-7 text-[15px] font-semibold text-white shadow-[0_24px_54px_-20px_rgba(79,70,229,0.95)] ring-1 ring-white/10 hover:bg-[linear-gradient(135deg,#7163ff_0%,#5f51f4_48%,#4b3fd4_100%)]"
              >
                {t("Save customer", "Enregistrer client", "Kunden speichern", "Guardar cliente", "Guardar cliente")}
              </Button>
            </div>
          </div>
        </form>
      </Modal>
    </div>
  );
}

