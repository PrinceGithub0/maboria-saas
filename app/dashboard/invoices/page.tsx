"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Table } from "@/components/ui/table";
import { Alert } from "@/components/ui/alert";
import { Modal } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/empty-state";
import { CountrySelect } from "@/components/ui/country-select";
import { PhoneInput } from "@/components/ui/phone-input";
import { formatCurrencyWithCode } from "@/lib/currency";
import { parseDateInput } from "@/lib/date";
import { allowedCurrencies, formatCurrencyOption } from "@/lib/payments/currency-allowlist";
import { calculateTotalsFromAmounts } from "@/lib/invoice-calculations";
import { normalizeVatSettings } from "@/lib/vat";
import { useSession } from "next-auth/react";
import { useLanguage } from "@/components/providers/language-provider";
import { formatBusinessAddress, hasRequiredAddress, parseBusinessAddress } from "@/lib/address";

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
  const { language } = useLanguage();
  const t = (en: string, fr: string) => (language === "fr" ? fr : en);
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
    customerStreet: "",
    customerCity: "",
    customerPostalCode: "",
    customerCountry: "",
    customerType: "INDIVIDUAL",
    customerCompany: "",
    customerTaxId: "",
    issueDate: todayValue,
    dueDate: "",
    note: "",
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
    customerTaxId: "",
    customerStreet: "",
    customerCity: "",
    customerPostalCode: "",
    customerCountry: "",
  });
  const [profileForm, setProfileForm] = useState({
    businessName: "",
    country: "US",
    defaultCurrency: "USD",
    streetAddress: "",
    city: "",
    postalCode: "",
    businessEmail: "",
    businessPhone: "",
    taxId: "",
  });
  const [profileStatus, setProfileStatus] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileLogoFile, setProfileLogoFile] = useState<File | null>(null);
  const [profileLogoError, setProfileLogoError] = useState<string | null>(null);
  const [profileLogoInfoOpen, setProfileLogoInfoOpen] = useState(false);
  const [profileLogoUploading, setProfileLogoUploading] = useState(false);
  const [profileLogoPreviewUrl, setProfileLogoPreviewUrl] = useState<string | null>(null);
  const profileLogoInfoRef = useRef<HTMLSpanElement | null>(null);
  const profileLogoInputRef = useRef<HTMLInputElement | null>(null);
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
  const requiredMessage = t("This field is required", "This field is required");

  useEffect(() => {
    if (businessProfile?.data?.id) return;
    if (!me?.preferredCurrency) return;
    const preferred = String(me.preferredCurrency).toUpperCase();
    if (!allowedCurrencies.includes(preferred as (typeof allowedCurrencies)[number])) return;
    setProfileForm((prev) => ({
      ...prev,
      defaultCurrency: preferred,
    }));
  }, [businessProfile?.data?.id, me?.preferredCurrency]);

  useEffect(() => {
    if (profileLogoFile) {
      const url = URL.createObjectURL(profileLogoFile);
      setProfileLogoPreviewUrl(url);
      return () => URL.revokeObjectURL(url);
    }
    if (businessProfile?.data?.logoUrl) {
      setProfileLogoPreviewUrl(String(businessProfile.data.logoUrl));
      return;
    }
    setProfileLogoPreviewUrl(null);
  }, [profileLogoFile, businessProfile?.data?.logoUrl]);

  useEffect(() => {
    if (!profileLogoInfoOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!profileLogoInfoRef.current) return;
      if (!profileLogoInfoRef.current.contains(event.target as Node)) {
        setProfileLogoInfoOpen(false);
      }
    };
    document.addEventListener("pointerdown", handlePointerDown, true);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
    };
  }, [profileLogoInfoOpen]);

  const createBusinessProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileStatus(null);
    setProfileError(null);
    setProfileLogoError(null);
    if (!profileForm.businessName.trim()) {
      setProfileError(requiredMessage);
      return;
    }
    if (!profileForm.country.trim() || !profileForm.defaultCurrency.trim()) {
      setProfileError(requiredMessage);
      return;
    }
    if (!profileForm.businessEmail.trim()) {
      setProfileError(requiredMessage);
      return;
    }
    if (!profileForm.businessPhone.trim()) {
      setProfileError(requiredMessage);
      return;
    }
    const addressFields = {
      streetAddress: profileForm.streetAddress,
      city: profileForm.city,
      region: "",
      postalCode: profileForm.postalCode,
    };
    if (!hasRequiredAddress(addressFields)) {
      setProfileError(requiredMessage);
      return;
    }
    const formattedAddress = formatBusinessAddress(addressFields);
    const payload = {
      businessName: profileForm.businessName,
      country: profileForm.country,
      defaultCurrency: profileForm.defaultCurrency,
      businessAddress: formattedAddress,
      businessEmail: profileForm.businessEmail,
      businessPhone: profileForm.businessPhone,
      taxId: profileForm.taxId,
    };
    const res = await fetch("/api/business-profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setProfileError(json.error || t("Could not create business profile.", "Impossible de creer le profil."));
      return;
    }
    setProfileStatus(t("Business profile saved.", "Profil enregistre."));
    refreshBusinessProfile();
    if (profileLogoFile) {
      setProfileLogoUploading(true);
      try {
        const formData = new FormData();
        formData.append("logo", profileLogoFile);
        const uploadRes = await fetch("/api/business-profile/logo", {
          method: "POST",
          body: formData,
        });
        const uploadData = await uploadRes.json().catch(() => ({}));
        if (!uploadRes.ok) {
          setProfileLogoError(uploadData.error || t("Logo upload failed.", "Echec du televersement du logo."));
        } else {
          setProfileLogoFile(null);
          refreshBusinessProfile();
        }
      } catch {
        setProfileLogoError(t("Logo upload failed.", "Echec du televersement du logo."));
      } finally {
        setProfileLogoUploading(false);
      }
    }
  };

  const removeProfileLogo = async () => {
    setProfileLogoError(null);
    setProfileLogoFile(null);
    try {
      const res = await fetch("/api/business-profile/logo", { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setProfileLogoError(data.error || t("Could not remove logo.", "Impossible de supprimer le logo."));
        return;
      }
      refreshBusinessProfile();
    } catch {
      setProfileLogoError(t("Could not remove logo.", "Impossible de supprimer le logo."));
    }
  };

  const buildCustomerAddress = (input: {
    street?: string;
    city?: string;
    postalCode?: string;
    country?: string;
    fallback?: string;
  }) => {
    const parts = [input.street, input.city, input.postalCode, input.country]
      .map((value) => String(value || "").trim())
      .filter(Boolean);
    if (parts.length) return parts.join("\n");
    return String(input.fallback || "").trim();
  };

  const createInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.status === "SENT" && !form.customerEmail.trim()) {
      setStatus({
        message: t("Customer email is required to send an invoice.", "Email client requis pour envoyer une facture."),
        variant: "error",
      });
      return;
    }
    const customerAddress = buildCustomerAddress({
      street: form.customerStreet,
      city: form.customerCity,
      postalCode: form.customerPostalCode,
      country: form.customerCountry,
    });
    const payload: {
      invoiceNumber: string;
      currency: string;
      status: string;
      customerName?: string;
      customerEmail?: string;
      customerAddress?: string;
      customerStreet?: string;
      customerCity?: string;
      customerPostalCode?: string;
      customerCountry?: string;
      customerType?: string;
      customerCompany?: string;
      customerTaxId?: string;
      issueDate?: string;
      dueDate?: string;
      note?: string;
      items: { name: string; quantity: number; price: number }[];
    } = {
      ...form,
      invoiceNumber: form.invoiceNumber.trim(),
      customerName: form.customerName.trim() || undefined,
      customerEmail: form.customerEmail.trim() || undefined,
      customerAddress: customerAddress || undefined,
      customerStreet: form.customerStreet.trim() || undefined,
      customerCity: form.customerCity.trim() || undefined,
      customerPostalCode: form.customerPostalCode.trim() || undefined,
      customerCountry: form.customerCountry.trim() || undefined,
      customerType: form.customerType,
      customerCompany: form.customerCompany.trim() || undefined,
      customerTaxId: form.customerTaxId.trim() || undefined,
      note: form.note.trim() || undefined,
    };
    const issueDateParsed = form.issueDate ? parseDateInput(form.issueDate) : null;
    if (form.issueDate && !issueDateParsed) {
      setStatus({
        message: t("Issue date must be in DD/MM/YYYY format.", "Date d emission au format JJ/MM/AAAA."),
        variant: "error",
      });
      return;
    }
    const dueDateParsed = form.dueDate ? parseDateInput(form.dueDate) : null;
    if (form.dueDate && !dueDateParsed) {
      setStatus({
        message: t("Due date must be in DD/MM/YYYY format.", "Date d echeance au format JJ/MM/AAAA."),
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
            message: `${json.reason || t("Upgrade required.", "Mise a niveau requise.")}${
              required ? ` ${t("Required plan:", "Plan requis :")} ${required}.` : ""
            }`,
            variant: "error",
          });
        } else {
          setStatus({ message: json.error || t("Could not create invoice.", "Impossible de creer la facture."), variant: "error" });
        }
      } else {
        const savedNumber = json?.invoiceNumber as string | undefined;
        if (savedNumber && savedNumber !== form.invoiceNumber) {
          setStatus({
            message: t(
              `Invoice number already existed. Saved as ${savedNumber}.`,
              `Numero deja utilise. Enregistre comme ${savedNumber}.`
            ),
            variant: "success",
          });
        } else {
          setStatus({ message: t("Invoice generated.", "Facture generee."), variant: "success" });
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
          customerStreet: "",
          customerCity: "",
          customerPostalCode: "",
          customerCountry: "",
          customerType: "INDIVIDUAL",
          customerCompany: "",
          customerTaxId: "",
          issueDate: todayValue,
          dueDate: "",
          note: "",
          items: [{ name: "Service", quantity: 1, price: 100 }],
        });
      }
    } catch {
      setStatus({ message: t("Could not create invoice. Please try again.", "Impossible de creer la facture. Reessayez."), variant: "error" });
    }
  };

  const currencyOptions = allowedCurrencies.map((code) => ({ code, label: formatCurrencyOption(code) }));
  const businessCurrencyOptions = allowedCurrencies.map((code) => ({ code, label: formatCurrencyOption(code) }));
  const draftVatSettings = normalizeVatSettings({
    enabled: businessProfile?.data?.vatEnabled ?? false,
    rate: businessProfile?.data?.vatRate ? Number(businessProfile.data.vatRate) : 0,
    mode:
      String(businessProfile?.data?.vatPricingMode || "EXCLUSIVE").toLowerCase() === "inclusive"
        ? "inclusive"
        : "exclusive",
  });
  const draftTotals = calculateTotalsFromAmounts(form.items, draftVatSettings, 0);
  const showDraftTax =
    Boolean(draftTotals.vatEnabled) && Number(draftTotals.vatRate || 0) > 0;

  const scopedInvoices =
    !invoicesError && Array.isArray(invoices)
      ? invoices.filter((inv: any) => inv.userId === session?.user?.id)
      : [];
  const normalizedQuery = query.trim().toLowerCase();
  const getDisplayStatus = (value: string) => {
    const normalized = String(value || "").toUpperCase();
    if (normalized === "SENT" || normalized === "OVERDUE") return "UNPAID";
    if (normalized === "CANCELED") return "CANCELLED";
    return normalized;
  };
  const translateStatus = (value: string) => {
    const normalized = String(value || "").toUpperCase();
    if (language !== "fr") return normalized;
    const map: Record<string, string> = {
      DRAFT: "BROUILLON",
      SENT: "ENVOYEE",
      OVERDUE: "RETARD",
      UNPAID: "IMPAYE",
      PAID: "PAYEE",
      CANCELLED: "ANNULEE",
      FAILED: "ECHEC",
    };
    return map[normalized] || normalized;
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
    const rawAddress =
      customer.address ??
      customer.addressLine1 ??
      meta?.customerAddress ??
      meta?.customer_address ??
      "";
    const parsedAddress = parseBusinessAddress(rawAddress);
    return {
      name: customer.name ?? meta?.customerName ?? "",
      email: customer.email ?? meta?.customerEmail ?? "",
      taxId: customer.taxId ?? meta?.customerTaxId ?? meta?.customer_tax_id ?? "",
      street:
        customer.streetAddress ??
        customer.street ??
        meta?.customerStreet ??
        parsedAddress.streetAddress,
      city: customer.city ?? meta?.customerCity ?? parsedAddress.city,
      postalCode:
        customer.postalCode ??
        meta?.customerPostalCode ??
        parsedAddress.postalCode,
      country: customer.country ?? meta?.customerCountry ?? "",
    };
  };

  const openEditCustomer = (invoice: any) => {
    const customer = readCustomerFromMeta(invoice?.metadata);
    setEditingInvoice(invoice || null);
    setEditStatus(null);
    setEditForm({
      customerName: customer.name || "",
      customerEmail: customer.email || "",
      customerTaxId: customer.taxId || "",
      customerStreet: customer.street || "",
      customerCity: customer.city || "",
      customerPostalCode: customer.postalCode || "",
      customerCountry: customer.country || "",
    });
    setEditOpen(true);
  };

  const saveCustomerDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    const invoiceId = editingInvoice?.id ?? editingInvoice?.invoiceNumber ?? "";
    if (!invoiceId) {
      setEditStatus({ message: t("Invoice not found for update.", "Facture introuvable pour mise a jour."), variant: "error" });
      return;
    }
    setSavingEdit(true);
    setEditStatus(null);
    setStatus(null);
    const customerAddress = buildCustomerAddress({
      street: editForm.customerStreet,
      city: editForm.customerCity,
      postalCode: editForm.customerPostalCode,
      country: editForm.customerCountry,
    });
    const payload = {
      invoiceNumber: editingInvoice?.invoiceNumber,
      customerName: editForm.customerName.trim() || undefined,
      customerEmail: editForm.customerEmail.trim() || undefined,
      customerTaxId: editForm.customerTaxId.trim() || undefined,
      customerAddress: customerAddress || undefined,
      customerStreet: editForm.customerStreet.trim() || undefined,
      customerCity: editForm.customerCity.trim() || undefined,
      customerPostalCode: editForm.customerPostalCode.trim() || undefined,
      customerCountry: editForm.customerCountry.trim() || undefined,
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
          message: data?.error || t("Could not update customer details.", "Impossible de mettre a jour le client."),
          variant: "error",
        });
        return;
      }
      setEditStatus({ message: t("Customer details updated.", "Details client mis a jour."), variant: "success" });
      mutate((current: any) => {
        if (!Array.isArray(current)) return current;
        return current.map((inv) =>
          inv?.id === editingInvoice?.id
            ? {
                ...inv,
                metadata: {
                  ...(inv?.metadata || {}),
                  customerTaxId: payload.customerTaxId ?? inv?.metadata?.customerTaxId ?? null,
                  customer: {
                    name: payload.customerName ?? inv?.metadata?.customer?.name ?? null,
                    email: payload.customerEmail ?? inv?.metadata?.customer?.email ?? null,
                    taxId:
                      payload.customerTaxId ??
                      inv?.metadata?.customer?.taxId ??
                      inv?.metadata?.customerTaxId ??
                      null,
                    address: payload.customerAddress ?? inv?.metadata?.customer?.address ?? null,
                    streetAddress:
                      payload.customerStreet ?? inv?.metadata?.customer?.streetAddress ?? null,
                    city: payload.customerCity ?? inv?.metadata?.customer?.city ?? null,
                    postalCode:
                      payload.customerPostalCode ?? inv?.metadata?.customer?.postalCode ?? null,
                    country: payload.customerCountry ?? inv?.metadata?.customer?.country ?? null,
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
      setEditStatus({ message: t("Could not update customer details.", "Impossible de mettre a jour le client."), variant: "error" });
    } finally {
      setSavingEdit(false);
    }
  };

  const sendDraft = async (invoice: any) => {
    const invoiceId = String(invoice?.id || invoice?.invoiceNumber || "");
    if (!invoiceId) return;
    let customerEmail = invoice?.metadata?.customer?.email;
    if (!customerEmail && typeof window !== "undefined") {
      const manual = window.prompt(t("Enter customer email to send this invoice:", "Entrez l email client pour envoyer la facture :"));
      if (manual) customerEmail = manual.trim();
    }
    if (!customerEmail) {
      setStatus({
        message: t("Customer email is required to send this invoice.", "Email client requis pour envoyer la facture."),
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
          message: data?.error || t("Could not send invoice.", "Impossible d envoyer la facture."),
          variant: "error",
        });
      } else {
        setStatus({ message: t("Invoice sent.", "Facture envoyee."), variant: "success" });
        mutate((current: any) => {
          if (!Array.isArray(current)) return current;
          return current.map((inv) =>
            inv?.id === invoiceId ? { ...inv, status: "SENT" } : inv
          );
        }, false);
        mutate();
      }
    } catch {
      setStatus({ message: t("Could not send invoice.", "Impossible d envoyer la facture."), variant: "error" });
    } finally {
      setSendingId(null);
    }
  };

  return (
    <div className="space-y-6 max-md:space-y-7">
      <div className="md:contents max-md:rounded-[28px] max-md:border max-md:border-border/60 max-md:bg-card max-md:p-4 max-md:shadow-[0_16px_36px_rgba(15,23,42,0.18)]">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-indigo-600 dark:text-indigo-300">
            {t("Invoices", "Factures")}
          </p>
          <h1 className="text-3xl font-semibold text-foreground">{t("Generator", "Generateur")}</h1>
        </div>
        {status && <div className="mt-4"><Alert variant={status.variant}>{status.message}</Alert></div>}
      </div>
      {profileMissing ? (
        <Card title={t("Business profile required", "Profil requis")}>
          {profileStatus && <Alert variant="success">{profileStatus}</Alert>}
          {profileError && <Alert variant="error">{profileError}</Alert>}
          {profileLogoError && <Alert variant="error">{profileLogoError}</Alert>}
          <p className="text-sm text-muted-foreground">
            {t(
              "Add your business profile before creating invoices.",
              "Ajoutez votre profil avant de creer des factures."
            )}
          </p>
          <form
            className="mt-4 grid grid-cols-2 gap-4 max-md:grid-cols-1 max-md:gap-3"
            onSubmit={createBusinessProfile}
          >
            <Input
              label={t("Business name", "Nom de l entreprise")}
              value={profileForm.businessName}
              onChange={(e) => setProfileForm({ ...profileForm, businessName: e.target.value })}
              onFocus={(e) => {
                const length = e.currentTarget.value.length;
                e.currentTarget.setSelectionRange(length, length);
              }}
              required
            />
            <CountrySelect
              label={t("Country", "Pays")}
              value={profileForm.country}
              locale={language === "fr" ? "fr" : "en"}
              required
              onChange={(value) => setProfileForm({ ...profileForm, country: value })}
            />
            <label className="flex flex-col gap-1 text-sm text-foreground">
              {t("Default currency", "Devise par defaut")}
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
              label={t("Business email", "Email entreprise")}
              type="email"
              value={profileForm.businessEmail}
              onChange={(e) => setProfileForm({ ...profileForm, businessEmail: e.target.value })}
              required
            />
            <PhoneInput
              label={t("Business phone", "Telephone entreprise")}
              value={profileForm.businessPhone}
              required
              locale={language === "fr" ? "fr" : "en"}
              onChange={(value) => setProfileForm({ ...profileForm, businessPhone: value })}
            />
            <Input
              label={t("Street address", "Adresse")}
              value={profileForm.streetAddress}
              onChange={(e) => setProfileForm({ ...profileForm, streetAddress: e.target.value })}
              required
            />
            <Input
              label={t("City", "Ville")}
              value={profileForm.city}
              onChange={(e) => setProfileForm({ ...profileForm, city: e.target.value })}
              required
            />
            <Input
              label={t("Postal code / ZIP (optional)", "Code postal / ZIP (optionnel)")}
              value={profileForm.postalCode}
              onChange={(e) => setProfileForm({ ...profileForm, postalCode: e.target.value })}
            />
            <label className="col-span-2 flex flex-col gap-1 text-sm text-foreground max-md:order-9 max-md:col-span-1 md:col-span-1">
              <span className="flex items-center gap-2">
                {t("Business logo (optional)", "Logo entreprise (optionnel)")}
                <span ref={profileLogoInfoRef} className="relative">
                  <button
                    type="button"
                    aria-label={t("Logo upload info", "Infos televersement logo")}
                    onClick={(event) => {
                      event.stopPropagation();
                      setProfileLogoInfoOpen((open) => !open);
                    }}
                    className="flex h-5 w-5 items-center justify-center rounded-full border border-border text-[10px] font-semibold text-muted-foreground"
                  >
                    i
                  </button>
                  <div
                    className={`absolute right-0 top-7 z-20 w-48 rounded-lg border border-border bg-background px-3 py-2 text-[11px] text-foreground shadow-lg transition ${
                      profileLogoInfoOpen ? "opacity-100" : "pointer-events-none opacity-0"
                    }`}
                  >
                    <div>{t("Accepted formats: PNG, JPG, SVG", "Formats acceptes : PNG, JPG, SVG")}</div>
                    <div>{t("Max size: 2MB", "Taille max : 2MB")}</div>
                  </div>
              </span>
            </span>
            <input
              type="file"
              accept=".png,.jpg,.jpeg,.svg"
              onChange={(e) => setProfileLogoFile(e.target.files?.[0] || null)}
              disabled={profileLogoUploading}
              ref={profileLogoInputRef}
              className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground file:mr-4 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-1.5 file:text-sm file:font-semibold"
            />
            {profileLogoPreviewUrl && (
              <div className="mt-2 flex flex-col gap-2">
                <div className="flex items-center gap-3">
                  <div className="h-12 w-12 overflow-hidden rounded-xl border border-transparent bg-white ring-1 ring-border max-md:rounded-2xl">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={profileLogoPreviewUrl}
                      alt={t("Business logo preview", "Apercu du logo")}
                      className="h-full w-full object-contain"
                    />
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <button
                      type="button"
                      onClick={() => profileLogoInputRef.current?.click()}
                      className="rounded-full border border-border px-3 py-1 text-xs font-semibold text-foreground"
                    >
                      {t("Change logo", "Modifier le logo")}
                    </button>
                    <button
                      type="button"
                      onClick={removeProfileLogo}
                      className="rounded-full border border-border px-3 py-1 text-xs font-semibold text-foreground"
                    >
                      {t("Remove logo", "Supprimer le logo")}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </label>
            <div className="space-y-1 max-md:order-8">
              <Input
                label={t("Tax ID (optional)", "ID fiscal (optionnel)")}
                value={profileForm.taxId}
                onChange={(e) => setProfileForm({ ...profileForm, taxId: e.target.value })}
              />
            </div>
            <div className="col-span-2 max-md:col-span-1 max-md:order-10">
              <Button type="submit" className="max-md:w-full">
                {t("Save business profile", "Enregistrer le profil")}
              </Button>
            </div>
          </form>
        </Card>
      ) : (
        <Card title={t("Create invoice", "Creer une facture")}>
          <form className="grid grid-cols-2 gap-4 max-md:grid-cols-1 max-md:gap-3" onSubmit={createInvoice}>
            <Input
              label={t("Invoice number", "Numero de facture")}
              value={form.invoiceNumber}
              onChange={(e) => setForm({ ...form, invoiceNumber: e.target.value })}
            />
            <Input
              label={t("Customer name", "Nom du client")}
              value={form.customerName}
              onChange={(e) => setForm({ ...form, customerName: e.target.value })}
            />
            <Input
              label={t("Customer email", "Email client")}
              type="email"
              value={form.customerEmail}
              onChange={(e) => setForm({ ...form, customerEmail: e.target.value })}
            />
            <label className="flex flex-col gap-1 text-sm text-foreground">
              {t("Customer type", "Type de client")}
              <select
                value={form.customerType}
                onChange={(e) => setForm({ ...form, customerType: e.target.value })}
                className="rounded-lg border border-input bg-background px-3 py-2 text-foreground focus:border-indigo-400 focus:outline-none"
              >
                <option value="INDIVIDUAL">{t("Individual", "Particulier")}</option>
                <option value="BUSINESS">{t("Business", "Entreprise")}</option>
              </select>
            </label>
            <Input
              label={t("Issue date", "Date d emission")}
              type="date"
              value={form.issueDate}
              onChange={(e) => setForm({ ...form, issueDate: e.target.value })}
            />
            <Input
              label={t("Due date", "Date d echeance")}
              type="date"
              value={form.dueDate}
              onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
            />
            <label className="flex flex-col gap-1 text-sm text-foreground">
              {t("Status", "Statut")}
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
                className="rounded-lg border border-input bg-background px-3 py-2 text-foreground focus:border-indigo-400 focus:outline-none"
              >
                <option value="DRAFT">{t("Draft", "Brouillon")}</option>
                <option value="SENT">{t("Send now", "Envoyer")}</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm text-foreground">
              {t("Currency", "Devise")}
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
              label={t("Street address", "Adresse")}
              value={form.customerStreet}
              onChange={(e) => setForm({ ...form, customerStreet: e.target.value })}
            />
            <Input
              label={t("City", "Ville")}
              value={form.customerCity}
              onChange={(e) => setForm({ ...form, customerCity: e.target.value })}
            />
            <Input
              label={t("Postal code / ZIP (optional)", "Code postal (optionnel)")}
              value={form.customerPostalCode}
              onChange={(e) => setForm({ ...form, customerPostalCode: e.target.value })}
            />
            <CountrySelect
              label={t("Country", "Pays")}
              value={form.customerCountry}
              locale={language === "fr" ? "fr" : "en"}
              onChange={(value) => setForm({ ...form, customerCountry: value })}
            />
            {form.customerType === "BUSINESS" && (
              <Input
                label={t("Company name", "Entreprise")}
                value={form.customerCompany}
                onChange={(e) => setForm({ ...form, customerCompany: e.target.value })}
              />
            )}
            <div
              className={
                form.customerType === "BUSINESS" ? "" : "col-span-2 max-md:col-span-1"
              }
            >
              <Input
                label={t("Tax ID (optional)", "ID fiscal (optionnel)")}
                value={form.customerTaxId}
                onChange={(e) => setForm({ ...form, customerTaxId: e.target.value })}
              />
            </div>
            <div className="col-span-2 max-md:col-span-1">
              <div className="rounded-2xl border border-border bg-muted/10 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-foreground">{t("Line items", "Articles")}</p>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() =>
                      setForm((prev) => ({
                        ...prev,
                        items: [...prev.items, { name: "", quantity: 1, price: 0 }],
                      }))
                    }
                  >
                    {t("Add item", "Ajouter")}
                  </Button>
                </div>
                <div className="mt-3 space-y-3">
                  {form.items.map((item, index) => (
                    <div
                      key={`item-${index}`}
                      className="grid grid-cols-[2fr_0.6fr_0.8fr_0.8fr_auto] gap-3 max-md:grid-cols-1"
                    >
                      <Input
                        label={t("Description", "Description")}
                        value={item.name}
                        onChange={(e) =>
                          setForm((prev) => {
                            const next = [...prev.items];
                            next[index] = { ...next[index], name: e.target.value };
                            return { ...prev, items: next };
                          })
                        }
                      />
                      <Input
                        label={t("Qty", "Qt")}
                        type="number"
                        min={1}
                        step={1}
                        value={item.quantity}
                        onChange={(e) =>
                          setForm((prev) => {
                            const next = [...prev.items];
                            next[index] = { ...next[index], quantity: Math.max(1, Number(e.target.value)) };
                            return { ...prev, items: next };
                          })
                        }
                      />
                      <Input
                        label={t("Unit price", "Prix unitaire")}
                        type="number"
                        min={0}
                        step={0.01}
                        value={item.price}
                        onChange={(e) =>
                          setForm((prev) => {
                            const next = [...prev.items];
                            next[index] = { ...next[index], price: Number(e.target.value) };
                            return { ...prev, items: next };
                          })
                        }
                      />
                      <div className="space-y-1">
                        <label className="flex flex-col gap-1 text-sm text-foreground">
                          {t("Line total", "Total ligne")}
                          <div className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground">
                            {formatCurrencyWithCode(item.quantity * item.price, form.currency)}
                          </div>
                        </label>
                      </div>
                      <div className="flex items-end max-md:items-start">
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() =>
                            setForm((prev) => {
                              if (prev.items.length === 1) return prev;
                              const next = prev.items.filter((_, idx) => idx !== index);
                              return { ...prev, items: next };
                            })
                          }
                        >
                          {t("Remove", "Supprimer")}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-4 flex justify-end">
                  <div className="w-full max-w-xs space-y-2 border-t border-border/60 pt-3 text-sm text-foreground">
                    <div className="flex items-center justify-between gap-4">
                      <span className="font-semibold">{t("Subtotal", "Sous-total")}</span>
                      <span className="font-semibold tabular-nums">
                        {formatCurrencyWithCode(draftTotals.subtotal, form.currency)}
                      </span>
                    </div>
                    {showDraftTax ? (
                      <div className="flex items-center justify-between gap-4">
                        <span className="font-semibold">
                          {t("VAT", "TVA")} ({Number(draftTotals.vatRate || 0).toFixed(1).replace(/\\.0$/, "")}%)
                        </span>
                        <span className="font-semibold tabular-nums">
                          {formatCurrencyWithCode(draftTotals.taxAmount, form.currency)}
                        </span>
                      </div>
                    ) : null}
                    <div className="flex items-center justify-between gap-4 text-base font-semibold">
                      <span>{t("Total Due", "Total du")}</span>
                      <span className="tabular-nums">
                        {formatCurrencyWithCode(draftTotals.total, form.currency)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="col-span-2 max-md:col-span-1">
              <Textarea
                label={t("Note to customer (optional)", "Note au client (optionnel)")}
                value={form.note}
                onChange={(e) => setForm({ ...form, note: e.target.value })}
              />
            </div>
            <div className="col-span-2 max-md:col-span-1">
              <Button type="submit" className="max-md:w-full">
                {form.status === "SENT"
                  ? t("Save & send", "Enregistrer et envoyer")
                  : t("Save draft", "Enregistrer brouillon")}
              </Button>
            </div>
          </form>
        </Card>
      )}
      <Card
        title={t("History", "Historique")}
        actions={
          <div className="flex flex-wrap items-center gap-3">
            <input
              suppressHydrationWarning
              placeholder={t("Search invoices", "Rechercher des factures")}
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
              t("Unable to load invoices.", "Impossible de charger les factures.")}
          </Alert>
        )}
        {showEmptyState ? (
          <EmptyState
            title={t("No invoices yet", "Aucune facture")}
            description={t("Create your first invoice and it will appear here.", "Creez votre premiere facture ici.")}
            actionLabel={t("Create invoice", "Creer une facture")}
            onAction={scrollToCreate}
          />
        ) : (
          <Table
            data={filteredInvoices}
            keyExtractor={(row: any) => row.id || row.invoiceNumber}
            columns={[
              { key: "invoiceNumber", label: t("Number", "Numero") },
              {
                key: "currency",
                label: t("Currency", "Devise"),
                render: (row: any) => String(row.currency || "").toUpperCase(),
              },
              {
                key: "status",
                label: t("Status", "Statut"),
                render: (row: any) => translateStatus(getDisplayStatus(row?.status || "")),
              },
              {
                key: "total",
                label: t("Total", "Total"),
                render: (row: any) => formatCurrencyWithCode(Number(row.total || 0), row.currency),
              },
              {
                key: "id",
                label: t("Actions", "Actions"),
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
                          {t("View", "Voir")}
                        </Link>
                      ) : (
                        <span className="text-sm font-semibold text-muted-foreground">{t("View", "Voir")}</span>
                      )}
                      {String(row?.status || "").toUpperCase() === "DRAFT" ? (
                        <>
                          <button
                            type="button"
                            onClick={() => openEditCustomer(row)}
                            className="text-sm font-semibold text-slate-700 hover:text-slate-600"
                          >
                            {t("Edit", "Modifier")}
                          </button>
                          <button
                            type="button"
                            onClick={() => sendDraft(row)}
                            disabled={sendingId === row?.id}
                            className="text-sm font-semibold text-emerald-700 hover:text-emerald-600 disabled:opacity-50"
                          >
                            {sendingId === row?.id ? t("Sending...", "Envoi...") : t("Send", "Envoyer")}
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
        title={t("Edit customer details", "Modifier les details client")}
      >
        <form className="space-y-4" onSubmit={saveCustomerDetails}>
          {editStatus && (
            <Alert variant={editStatus.variant}>{editStatus.message}</Alert>
          )}
          <Input
            label={t("Customer name", "Nom du client")}
            value={editForm.customerName}
            onChange={(e) => setEditForm({ ...editForm, customerName: e.target.value })}
          />
          <Input
            label={t("Customer email", "Email client")}
            type="email"
            value={editForm.customerEmail}
            onChange={(e) => setEditForm({ ...editForm, customerEmail: e.target.value })}
          />
          <Input
            label={t("Tax ID (optional)", "Numero fiscal (optionnel)")}
            value={editForm.customerTaxId}
            onChange={(e) => setEditForm({ ...editForm, customerTaxId: e.target.value })}
          />
          <Input
            label={t("Street address", "Adresse")}
            value={editForm.customerStreet}
            onChange={(e) => setEditForm({ ...editForm, customerStreet: e.target.value })}
          />
          <Input
            label={t("City", "Ville")}
            value={editForm.customerCity}
            onChange={(e) => setEditForm({ ...editForm, customerCity: e.target.value })}
          />
          <Input
            label={t("Postal code / ZIP (optional)", "Code postal (optionnel)")}
            value={editForm.customerPostalCode}
            onChange={(e) => setEditForm({ ...editForm, customerPostalCode: e.target.value })}
          />
          <CountrySelect
            label={t("Country", "Pays")}
            value={editForm.customerCountry}
            locale={language === "fr" ? "fr" : "en"}
            onChange={(value) => setEditForm({ ...editForm, customerCountry: value })}
          />
          <div className="flex flex-wrap items-center justify-end gap-3">
            <Button type="button" variant="secondary" onClick={() => setEditOpen(false)}>
              {t("Cancel", "Annuler")}
            </Button>
            <Button type="submit" loading={savingEdit}>
              {t("Save changes", "Enregistrer")}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
