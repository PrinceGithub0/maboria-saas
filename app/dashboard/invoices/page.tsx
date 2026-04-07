"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { useSearchParams } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Table } from "@/components/ui/table";
import { Alert } from "@/components/ui/alert";
import { TransientAlert } from "@/components/ui/transient-alert";
import { Modal } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/empty-state";
import { InvoicePreview } from "@/components/invoices/invoice-preview";
import { CountrySelect } from "@/components/ui/country-select";
import { PhoneInput } from "@/components/ui/phone-input";
import { BUSINESS_CURRENCIES, formatBusinessCurrencyOption, getBusinessCurrencyFlag, isSupportedBusinessCurrency } from "@/lib/business-currencies";
import { formatCurrency, formatCurrencyWithCode } from "@/lib/currency";
import { parseDateInput } from "@/lib/date";
import { calculateTotalsFromAmounts } from "@/lib/invoice-calculations";
import { resolveInvoiceCompliance } from "@/lib/invoicing/resolve-compliance";
import {
  buildInvoiceIssuerCode,
  buildInvoiceNumberDraft,
  isInvoiceNumberDraft,
  suggestNextInvoiceNumber,
} from "@/lib/invoice-number";
import { currencyMinorUnits } from "@/lib/payments/currency-allowlist";
import { formatVatRateLabel, normalizeVatSettings } from "@/lib/vat";
import { useSession } from "next-auth/react";
import { useLanguage } from "@/components/providers/language-provider";
import { formatBusinessAddress, hasRequiredAddress, parseBusinessAddress } from "@/lib/address";
import { ChevronLeft, ChevronRight, Eye, MoreHorizontal, Paperclip, PencilLine, Send, Trash2, UserPlus, X } from "lucide-react";

type CustomerRecord = {
  id: string;
  name: string;
  companyName?: string | null;
  email: string;
  phone?: string | null;
  taxId?: string | null;
  registrationNumber?: string | null;
  branchCode?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  country?: string | null;
  deliveryPreference?: "EMAIL" | "WHATSAPP" | "BOTH";
  status?: "ACTIVE" | "ATTENTION" | "NEW" | "DISABLED";
  createdAt?: string;
};

type InvoiceAttachmentPayload = {
  filename: string;
  contentType: "image/jpeg" | "image/png" | "application/pdf";
  base64: string;
  sizeBytes: number;
};

type InvoiceHistorySummary = {
  total: number;
  drafts: number;
  unpaid: number;
  overdue: number;
  paid: number;
};

type InvoiceHistoryResponse = {
  items: any[];
  total: number;
  skip: number;
  take: number;
  hasMore: boolean;
  summary: InvoiceHistorySummary;
  suggestedInvoiceNumber?: string;
};

type InvoiceBuyerType = "B2B" | "B2C";
type InvoiceSupplyType = "SAAS" | "SERVICES" | "GOODS";

const MAX_INVOICE_SUPPORTING_FILES = 5;
const ALLOWED_INVOICE_SUPPORTING_FILE_TYPES = ["image/jpeg", "image/png", "application/pdf"] as const;
const INVOICE_HISTORY_PAGE_SIZE = 20;

const sanitizePriceDraft = (value: string, minorUnits: number) => {
  const normalized = String(value || "").replace(",", ".");
  if (!normalized) return "";
  if (minorUnits === 0) {
    if (!/^\d*$/.test(normalized)) return null;
    const trimmedWhole = normalized.replace(/^0+(?=\d)/, "");
    return trimmedWhole || "0";
  }
  if (normalized === ".") return "0.";
  const decimalPattern = new RegExp(`^\\d*\\.?\\d{0,${minorUnits}}$`);
  if (!decimalPattern.test(normalized)) return null;
  const [wholePart = "", fractionPart] = normalized.split(".");
  const trimmedWhole = wholePart.replace(/^0+(?=\d)/, "");
  if (fractionPart !== undefined) {
    return `${trimmedWhole || "0"}.${fractionPart}`;
  }
  return trimmedWhole || "0";
};

const roundPriceToMinorUnits = (value: number, minorUnits: number) => {
  if (!Number.isFinite(value)) return 0;
  const factor = Math.pow(10, minorUnits);
  return Math.round(value * factor) / factor;
};

const getSingleLineAmountClass = (value: string, baseClass: string) => {
  const length = String(value || "").length;
  if (length >= 36) return `${baseClass} text-[0.7rem]`;
  if (length >= 32) return `${baseClass} text-[0.8rem]`;
  if (length >= 28) return `${baseClass} text-[0.92rem]`;
  if (length >= 24) return `${baseClass} text-[1.05rem]`;
  if (length >= 20) return `${baseClass} text-[1.2rem]`;
  return baseClass;
};

const getSingleLineAmountStyle = (
  value: string,
  maxRem: number,
  minRem: number,
  startShrinkAt = 20,
  shrinkRate = 0.065
) => {
  const length = String(value || "").length;
  const overflow = Math.max(0, length - startShrinkAt);
  const fontSize = Math.max(minRem, maxRem - overflow * shrinkRate);
  return {
    fontSize: `${fontSize}rem`,
    letterSpacing: overflow > 10 ? "-0.03em" : overflow > 5 ? "-0.02em" : undefined,
  };
};

const getAdaptiveInputStyle = (value: string, maxRem = 1, minRem = 0.82, startShrinkAt = 22, shrinkRate = 0.02) => {
  const length = String(value || "").length;
  const overflow = Math.max(0, length - startShrinkAt);
  const fontSize = Math.max(minRem, maxRem - overflow * shrinkRate);
  return {
    fontSize: `${fontSize}rem`,
    letterSpacing: overflow > 16 ? "-0.025em" : overflow > 8 ? "-0.015em" : undefined,
  };
};

const heroMetricCardClass =
  "relative flex min-h-[128px] min-w-0 flex-col justify-between bg-white/92 px-3 py-3 text-center transition-colors dark:bg-slate-950/72";

const heroMetricLabelClass =
  "flex min-h-[2.1rem] items-center justify-center text-center text-[0.6rem] font-semibold uppercase leading-5 tracking-[0.22em] text-slate-500 dark:text-slate-400";

const compliancePreviewCardClass =
  "min-w-0 rounded-xl border border-slate-200/80 bg-white/90 p-3 dark:border-slate-700/80 dark:bg-slate-950/70";

const compliancePreviewLabelClass =
  "flex min-h-[2.4rem] items-start text-[0.64rem] font-semibold uppercase leading-4 tracking-[0.12em] text-slate-500 [overflow-wrap:anywhere] dark:text-slate-400";

const compliancePreviewCompactLabelClass =
  "flex min-h-[2.4rem] items-start text-[0.62rem] font-semibold uppercase leading-4 tracking-[0.08em] text-slate-500 dark:text-slate-400";

const compliancePreviewValueClass =
  "mt-1 break-words text-sm font-semibold text-slate-950 dark:text-slate-50";

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

function localizeInvoiceServerMessage(
  message: string,
  t: ReturnType<typeof useLanguage>["t"]
) {
  const normalized = String(message || "").trim();
  if (!normalized) return "";
  const translations: Record<string, string> = {
    "Attachment encoding failed": t(
      "Attachment encoding failed.",
      "L encodage de la piece jointe a échoué.",
      "Die Kodierung des Anhangs ist fehlgeschlagen.",
      "La codificacion del archivo adjunto fallo.",
      "A codificacao do anexo falhou."
    ),
    "Not found": t("Not found.", "Introuvable.", "Nicht gefunden.", "No encontrado.", "Não encontrado."),
    "This field is required": t(
      "This field is required.",
      "Ce champ est requis.",
      "Dieses Feld ist erforderlich.",
      "Este campo es obligatorio.",
      "Este campo e obrigatório."
    ),
  };
  return translations[normalized] || "";
}

function localizeInvoiceStatus(
  value: string,
  t: ReturnType<typeof useLanguage>["t"]
) {
  const normalized = String(value || "").toUpperCase();
  const labels: Record<string, string> = {
    DRAFT: t("DRAFT", "BROUILLON", "ENTWURF", "BORRADOR", "RASCUNHO"),
    SENT: t("SENT", "ENVOYÉE", "GESENDET", "ENVIADA", "ENVIADA"),
    OVERDUE: t("OVERDUE", "EN RETARD", "ÜBERFÄLLIG", "VENCIDA", "EM ATRASO"),
    UNPAID: t("UNPAID", "IMPAYÉE", "UNBEZAHLT", "IMPAGADA", "NÃO PAGA"),
    PAID: t("PAID", "PAYÉE", "BEZAHLT", "PAGADA", "PAGA"),
    REFUNDED: t("REFUNDED", "REMBOURSÉE", "ERSTATTET", "REEMBOLSADA", "REEMBOLSADA"),
    PARTIALLY_REFUNDED: t(
      "PARTIALLY REFUNDED",
      "PARTIELLEMENT REMBOURSÉE",
      "TEILWEISE ERSTATTET",
      "PARCIALMENTE REEMBOLSADA",
      "PARCIALMENTE REEMBOLSADA"
    ),
    CANCELED: t("CANCELED", "ANNULÉE", "STORNIERT", "CANCELADA", "CANCELADA"),
    FAILED: t("FAILED", "ÉCHEC", "FEHLGESCHLAGEN", "FALLIDA", "FALHOU"),
  };
  return labels[normalized] || normalized;
}

export default function InvoicesPage() {
  const { data: session, status: sessionStatus } = useSession();
  const searchParams = useSearchParams();
  const { language, m, t } = useLanguage();
  const todayValue = new Date().toISOString().slice(0, 10);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [invoicePage, setInvoicePage] = useState(0);
  const invoicesKey =
    sessionStatus === "authenticated" && session?.user?.id
      ? `/api/invoice?q=${encodeURIComponent(debouncedQuery)}&take=${INVOICE_HISTORY_PAGE_SIZE}&skip=${
          invoicePage * INVOICE_HISTORY_PAGE_SIZE
        }`
      : null;
  const { data: invoices, error: invoicesError, mutate } = useSWR<InvoiceHistoryResponse>(invoicesKey, fetcher, {
    keepPreviousData: false,
    revalidateOnMount: true,
    revalidateOnFocus: true,
  });
  const { data: me } = useSWR("/api/user/me", fetcher);
  const { data: businessProfile, mutate: refreshBusinessProfile } = useSWR(
    "/api/business-profile",
    profileFetcher
  );
  const [customerQuery, setCustomerQuery] = useState("");
  const [debouncedCustomerQuery, setDebouncedCustomerQuery] = useState("");
  const [customerSkip, setCustomerSkip] = useState(0);
  const customersKey =
    sessionStatus === "authenticated" && session?.user?.id
      ? `/api/customers?q=${encodeURIComponent(debouncedCustomerQuery)}&take=20&skip=${customerSkip}`
      : null;
  const { data: customersData, mutate: refreshCustomers } = useSWR(customersKey, fetcher, {
    keepPreviousData: true,
  });
  const [form, setForm] = useState({
    invoiceNumber: "",
    poNumber: "",
    currency: "USD",
    status: "DRAFT",
    customerId: "",
    buyerType: "B2C" as InvoiceBuyerType,
    supplyType: "SERVICES" as InvoiceSupplyType,
    issueDate: todayValue,
    dueDate: "",
    note: "",
    items: [{ name: "", quantity: 1, price: 100 }],
  });
  const [supportingFiles, setSupportingFiles] = useState<File[]>([]);
  const [supportingFilesError, setSupportingFilesError] = useState<string | null>(null);
  const [invoiceActionStatus, setInvoiceActionStatus] = useState<{ message: string; variant: "success" | "error" | "info" } | null>(null);
  const [customerModalOpen, setCustomerModalOpen] = useState(false);
  const [customerDropdownOpen, setCustomerDropdownOpen] = useState(false);
  const [selectedCustomerSnapshot, setSelectedCustomerSnapshot] = useState<CustomerRecord | null>(null);
  const [hasManualCurrencySelection, setHasManualCurrencySelection] = useState(false);
  const [hasManualBuyerTypeSelection, setHasManualBuyerTypeSelection] = useState(false);
  const [creatingCustomer, setCreatingCustomer] = useState(false);
  const [submittingInvoiceStatus, setSubmittingInvoiceStatus] = useState<"DRAFT" | "SENT" | null>(null);
  const [editingPriceIndex, setEditingPriceIndex] = useState<number | null>(null);
  const [priceDraft, setPriceDraft] = useState("");
  const [newCustomerForm, setNewCustomerForm] = useState({
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
  const [status, setStatus] = useState<{ message: string; variant: "success" | "error" | "info" } | null>(null);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [deletingInvoiceId, setDeletingInvoiceId] = useState<string | null>(null);
  const [openInvoiceMenuId, setOpenInvoiceMenuId] = useState<string | null>(null);
  const [deleteCandidate, setDeleteCandidate] = useState<any | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<any | null>(null);
  const [editStatus, setEditStatus] = useState<{ message: string; variant: "success" | "error" } | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editForm, setEditForm] = useState({
    customerName: "",
    customerCompanyName: "",
    customerEmail: "",
    customerTaxId: "",
    customerRegistrationNumber: "",
    customerBranchCode: "",
    customerStreet: "",
    customerAddressLine2: "",
    customerCity: "",
    customerState: "",
    customerPostalCode: "",
    customerCountry: "",
  });
  const [profileForm, setProfileForm] = useState({
    businessName: "",
    country: "US",
    defaultCurrency: "USD",
    streetAddress: "",
    addressLine2: "",
    city: "",
    state: "",
    postalCode: "",
    businessEmail: "",
    businessPhone: "",
    taxId: "",
    registrationNumber: "",
    branchCode: "",
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
  const customerInputRef = useRef<HTMLInputElement | null>(null);
  const supportingFilesInputRef = useRef<HTMLInputElement | null>(null);
  const descriptionRefs = useRef<Array<HTMLTextAreaElement | null>>([]);
  const pendingDescriptionFocusIndexRef = useRef<number | null>(null);
  const submittingInvoiceRef = useRef(false);

  const autoResizeDescription = (element: HTMLTextAreaElement | null) => {
    if (!element) return;
    element.style.height = "0px";
    const nextHeight = Math.max(44, Math.min(element.scrollHeight, 168));
    element.style.height = `${nextHeight}px`;
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

  const toInvoiceAttachmentPayload = async (file: File): Promise<InvoiceAttachmentPayload> => ({
    filename: file.name,
    contentType: file.type as InvoiceAttachmentPayload["contentType"],
    base64: await fileToBase64(file),
    sizeBytes: file.size,
  });

  const handleSupportingFilesSelect = (fileList: FileList | File[] | null) => {
    const incoming = Array.from(fileList || []);
    if (incoming.length === 0) return;

    const nextFiles = [...supportingFiles];
    let nextError: string | null = null;

    for (const file of incoming) {
      if (!ALLOWED_INVOICE_SUPPORTING_FILE_TYPES.includes(file.type as (typeof ALLOWED_INVOICE_SUPPORTING_FILE_TYPES)[number])) {
        nextError = t(
          "Only JPG, PNG, or PDF files are supported.",
          "Seuls les fichiers JPG, PNG, ou PDF sont acceptes.",
          "Nur JPG-, PNG- oder PDF-Dateien werden unterst?tzt.",
          "Solo se admiten archivos JPG, PNG o PDF.",
          "Apenas s?o suportados ficheiros JPG, PNG ou PDF."
        );
        continue;
      }
      if (file.size > 5 * 1024 * 1024) {
        nextError = t(
          "File too large. Maximum allowed is 5MB.",
          "Fichier trop volumineux. Le maximum autorise est de 5 Mo.",
          "Datei zu gross. Maximal 5 MB sind erlaubt.",
          "El archivo es demasiado grande. El maximo permitido es 5 MB.",
          "Ficheiro demasiado grande. O maximo permitido e 5 MB."
        );
        continue;
      }
      if (
        nextFiles.some(
          (existing) =>
            existing.name === file.name &&
            existing.size === file.size &&
            existing.lastModified === file.lastModified
        )
      ) {
        continue;
      }
      if (nextFiles.length >= MAX_INVOICE_SUPPORTING_FILES) {
        nextError = t(
          "You can attach up to 5 supporting files.",
          "Vous pouvez joindre jusqu a 5 fichiers d accompagnement.",
          "Du kannst bis zu 5 Begleitdateien anhangen.",
          "Puedes adjuntar hasta 5 archivos de apoyo.",
          "Pode anexar at? 5 ficheiros de apoio."
        );
        break;
      }
      nextFiles.push(file);
    }

    setSupportingFiles(nextFiles);
    setSupportingFilesError(nextError);
    if (supportingFilesInputRef.current) {
      supportingFilesInputRef.current.value = "";
    }
  };

  useEffect(() => {
    descriptionRefs.current.forEach((node) => autoResizeDescription(node));
  }, [form.items]);

  useEffect(() => {
    const pendingIndex = pendingDescriptionFocusIndexRef.current;
    if (pendingIndex === null) return;
    const target = descriptionRefs.current[pendingIndex];
    if (!target) return;
    pendingDescriptionFocusIndexRef.current = null;
    requestAnimationFrame(() => {
      target.focus();
      const length = target.value.length;
      target.setSelectionRange(length, length);
    });
  }, [form.items.length]);

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (target instanceof HTMLElement && target.closest("[data-invoice-menu]")) return;
      setOpenInvoiceMenuId(null);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  useEffect(() => {
    const onResize = () => {
      descriptionRefs.current.forEach((node) => autoResizeDescription(node));
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const scrollToCreate = () => {
    if (typeof window === "undefined") return;
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const preferredInvoiceCurrency = String(
    businessProfile?.data?.defaultCurrency || me?.preferredCurrency || "USD"
  ).toUpperCase();
  const preferredCustomerCountry = String(businessProfile?.data?.country || "").toUpperCase();
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
    country: preferredCustomerCountry,
    deliveryPreference: "",
  });
  const invoiceIssuerCode = useMemo(
    () =>
      buildInvoiceIssuerCode(
        businessProfile?.data?.businessName || businessProfile?.data?.data?.businessName || null,
        session?.user?.id || null
      ),
    [businessProfile?.data?.businessName, businessProfile?.data?.data?.businessName, session?.user?.id]
  );
  const suggestedInvoiceNumber = useMemo(
    () =>
      String(
        invoices?.suggestedInvoiceNumber ||
          suggestNextInvoiceNumber([], undefined, invoiceIssuerCode)
      ),
    [invoiceIssuerCode, invoices?.suggestedInvoiceNumber]
  );
  const buildFreshInvoiceForm = (currency: string, nextInvoiceNumber = suggestedInvoiceNumber) => ({
    invoiceNumber: nextInvoiceNumber || buildInvoiceNumberDraft(undefined, invoiceIssuerCode),
    poNumber: "",
    currency,
    status: "DRAFT",
    customerId: "",
    buyerType: "B2C" as InvoiceBuyerType,
    supplyType: "SERVICES" as InvoiceSupplyType,
    issueDate: todayValue,
    dueDate: "",
    note: "",
    items: [{ name: "", quantity: 1, price: 100 }],
  });
  const handleNewInvoice = () => {
    const nextCurrency = preferredInvoiceCurrency;
    setStatus(null);
    setInvoiceActionStatus(null);
    setHasManualCurrencySelection(false);
    setHasManualBuyerTypeSelection(false);
    setForm(buildFreshInvoiceForm(nextCurrency));
    setSupportingFiles([]);
    setSupportingFilesError(null);
    setSelectedCustomerSnapshot(null);
    setCustomerQuery("");
    setCustomerSkip(0);
    setCustomerDropdownOpen(false);
    scrollToCreate();
  };
  const appendLineItem = (options?: { focus?: boolean }) => {
    setForm((prev) => {
      const nextIndex = prev.items.length;
      if (options?.focus) {
        pendingDescriptionFocusIndexRef.current = nextIndex;
      }
      return {
        ...prev,
        items: [...prev.items, { name: "", quantity: 1, price: 100 }],
      };
    });
  };
  const beginCustomerChange = () => {
    setCustomerQuery("");
    setCustomerSkip(0);
    setDebouncedCustomerQuery("");
    setCustomerDropdownOpen(true);
    requestAnimationFrame(() => customerInputRef.current?.focus());
  };
  const openCreateCustomerModal = () => {
    setStatus(null);
    setNewCustomerForm(buildFreshCustomerForm());
    setCustomerModalOpen(true);
  };
  const toDateValue = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };
  const parseDateValue = (value: string) => {
    if (!value) return new Date();
    const [year, month, day] = value.split("-").map((part) => Number(part));
    if (!year || !month || !day) return new Date();
    return new Date(year, month - 1, day);
  };
  const setDueDateFromIssueDate = (days: number) => {
    setForm((prev) => {
      const base = parseDateValue(prev.issueDate);
      base.setDate(base.getDate() + days);
      return { ...prev, dueDate: toDateValue(base) };
    });
  };

  useEffect(() => {
    setForm((prev) =>
      prev.invoiceNumber && !isInvoiceNumberDraft(prev.invoiceNumber)
        ? prev
        : { ...prev, invoiceNumber: suggestedInvoiceNumber || buildInvoiceNumberDraft(undefined, invoiceIssuerCode) }
    );
  }, [invoiceIssuerCode, suggestedInvoiceNumber]);

  useEffect(() => {
    if (hasManualCurrencySelection) return;
    if (!preferredInvoiceCurrency) return;
    setForm((prev) =>
      prev.currency === preferredInvoiceCurrency ? prev : { ...prev, currency: preferredInvoiceCurrency }
    );
  }, [hasManualCurrencySelection, preferredInvoiceCurrency]);

  const profileMissing =
    businessProfile?.status === 404 || businessProfile?.data?.error === "Not found";
  const requiredMessage = t(
    "This field is required.",
    "Ce champ est requis.",
    "Dieses Feld ist erforderlich.",
    "Este campo es obligatorio.",
    "Este campo e obrigatório."
  );
  const customerItems: CustomerRecord[] = useMemo(
    () => (Array.isArray(customersData?.items) ? customersData.items : []),
    [customersData?.items]
  );
  const invoiceCustomerMatch: CustomerRecord | null = useMemo(
    () =>
      Array.isArray(invoices?.items)
        ? (() => {
            const existing = invoices.items
              .map((invoice: any) => invoice?.customer)
              .find((customer: any) => customer?.id === form.customerId);
            if (!existing) return null;
            return {
              id: String(existing.id || form.customerId || ""),
              name: String(existing.name || ""),
              email: String(existing.email || ""),
              phone: existing.phone ?? null,
              addressLine1: existing.addressLine1 ?? existing.streetAddress ?? null,
              addressLine2: existing.addressLine2 ?? null,
              city: existing.city ?? null,
              state: existing.state ?? null,
              postalCode: existing.postalCode ?? null,
              country: existing.country ?? null,
              deliveryPreference: existing.deliveryPreference ?? "EMAIL",
            };
          })()
        : null,
    [form.customerId, invoices?.items]
  );
  const selectedCustomer =
    (selectedCustomerSnapshot?.id === form.customerId ? selectedCustomerSnapshot : null) ||
    customerItems.find((item) => item.id === form.customerId) ||
    invoiceCustomerMatch;
  useEffect(() => {
    if (hasManualBuyerTypeSelection) return;
    const nextBuyerType: InvoiceBuyerType = String(selectedCustomer?.taxId || "").trim() ? "B2B" : "B2C";
    setForm((prev) =>
      prev.buyerType === nextBuyerType ? prev : { ...prev, buyerType: nextBuyerType }
    );
  }, [hasManualBuyerTypeSelection, selectedCustomer?.id, selectedCustomer?.taxId]);
  const requestedCustomerId = String(searchParams.get("customerId") || "").trim();
  const requestedCustomerKey =
    sessionStatus === "authenticated" &&
    session?.user?.id &&
    requestedCustomerId &&
    !customerItems.some((item) => item.id === requestedCustomerId)
      ? `/api/customers/${encodeURIComponent(requestedCustomerId)}`
      : null;
  const { data: requestedCustomerData } = useSWR<CustomerRecord | null>(
    requestedCustomerKey,
    fetcher
  );
  const selectedCustomerLabel = selectedCustomer ? `${selectedCustomer.name} (${selectedCustomer.email})` : "";

  useEffect(() => {
    const effectiveQuery =
      form.customerId && customerQuery.trim() === selectedCustomerLabel ? "" : customerQuery.trim();
    const timer = setTimeout(() => setDebouncedCustomerQuery(effectiveQuery), 300);
    return () => clearTimeout(timer);
  }, [customerQuery, form.customerId, selectedCustomerLabel]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), 250);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (!form.customerId) {
      setSelectedCustomerSnapshot(null);
      return;
    }
    const currentMatch = customerItems.find((item) => item.id === form.customerId) || invoiceCustomerMatch;
    if (currentMatch) {
      setSelectedCustomerSnapshot(currentMatch);
    }
  }, [customerItems, form.customerId, invoiceCustomerMatch]);

  useEffect(() => {
    if (!requestedCustomerId) return;
    if (form.customerId === requestedCustomerId) return;
    const requestedCustomer =
      customerItems.find((item) => item.id === requestedCustomerId) ||
      (requestedCustomerData && requestedCustomerData.id === requestedCustomerId
        ? requestedCustomerData
        : null);
    if (!requestedCustomer) return;
    if (requestedCustomer.status === "DISABLED") {
      setInvoiceActionStatus({
        message: t(
          "This customer is disabled. Restore them before creating a new invoice.",
          "Ce client est d?sactiv?. Restaurez-le avant de creer une nouvelle facture.",
          "Dieser Kunde ist deaktiviert. Stelle ihn wieder her, bevor du eine neue Rechnung erstellst.",
          "Este cliente esta desactivado. Restauralo antes de crear una nueva factura.",
          "Este cliente esta desativado. Restaure-o antes de criar uma nova fatura."
        ),
        variant: "error",
      });
      return;
    }
    setSelectedCustomerSnapshot(requestedCustomer);
    setCustomerQuery("");
    setCustomerSkip(0);
    setCustomerDropdownOpen(false);
    setForm((prev) => ({ ...prev, customerId: requestedCustomer.id }));
  }, [customerItems, form.customerId, requestedCustomerData, requestedCustomerId, t]);

  useEffect(() => {
    if (businessProfile?.data?.id) return;
    if (!me?.preferredCurrency) return;
    const preferred = String(me.preferredCurrency).toUpperCase();
    if (!isSupportedBusinessCurrency(preferred)) return;
    setProfileForm((prev) => ({
      ...prev,
      defaultCurrency: preferred,
    }));
  }, [businessProfile?.data?.id, me?.preferredCurrency]);

  useEffect(() => {
    if (!businessProfile?.data?.id) return;
    const parsedAddress = parseBusinessAddress(businessProfile.data.businessAddress);
    setProfileForm({
      businessName: businessProfile.data.businessName || "",
      country: businessProfile.data.country || "US",
      defaultCurrency: businessProfile.data.defaultCurrency || "USD",
      streetAddress: businessProfile.data.addressLine1 || parsedAddress.streetAddress || "",
      addressLine2: businessProfile.data.addressLine2 || "",
      city: businessProfile.data.city || parsedAddress.city || "",
      state: businessProfile.data.state || parsedAddress.region || "",
      postalCode: businessProfile.data.postalCode || parsedAddress.postalCode || "",
      businessEmail: businessProfile.data.businessEmail || "",
      businessPhone: businessProfile.data.businessPhone || "",
      taxId: businessProfile.data.taxId || "",
      registrationNumber: businessProfile.data.registrationNumber || "",
      branchCode: businessProfile.data.branchCode || "",
    });
  }, [
    businessProfile?.data?.id,
    businessProfile?.data?.businessName,
    businessProfile?.data?.country,
    businessProfile?.data?.defaultCurrency,
    businessProfile?.data?.businessAddress,
    businessProfile?.data?.addressLine1,
    businessProfile?.data?.addressLine2,
    businessProfile?.data?.city,
    businessProfile?.data?.state,
    businessProfile?.data?.postalCode,
    businessProfile?.data?.businessEmail,
    businessProfile?.data?.businessPhone,
    businessProfile?.data?.taxId,
    businessProfile?.data?.registrationNumber,
    businessProfile?.data?.branchCode,
  ]);

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
      addressLine2: profileForm.addressLine2,
      city: profileForm.city,
      region: profileForm.state,
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
      addressLine1: profileForm.streetAddress,
      addressLine2: profileForm.addressLine2,
      city: profileForm.city,
      state: profileForm.state,
      postalCode: profileForm.postalCode,
      businessEmail: profileForm.businessEmail,
      businessPhone: profileForm.businessPhone,
      taxId: profileForm.taxId,
      registrationNumber: profileForm.registrationNumber,
      branchCode: profileForm.branchCode,
    };
    const res = await fetch("/api/business-profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setProfileError(
        (typeof json.error === "string" && localizeInvoiceServerMessage(json.error, t)) ||
          t(
            "Could not create business profile.",
            "Impossible de creer le profil.",
            "Das Unternehmensprofil konnte nicht erstellt werden.",
            "No se pudo crear el perfil de empresa.",
            "Não foi poss?vel criar o perfil da empresa."
          )
      );
      return;
    }
    setProfileStatus(
      t(
        "Business profile saved.",
        "Profil enregistr?.",
        "Unternehmensprofil gespeichert.",
        "Perfil de empresa guardado.",
        "Perfil da empresa guardado."
      )
    );
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
          setProfileLogoError(
            (typeof uploadData.error === "string" && localizeInvoiceServerMessage(uploadData.error, t)) ||
              t(
                "Logo upload failed.",
                "?chec du télevérsement du logo.",
                "Das Hochladen des Logos ist fehlgeschlagen.",
                "La subida del logotipo fallo.",
                "O carregamento do logotipo falhou."
              )
          );
        } else {
          setProfileLogoFile(null);
          refreshBusinessProfile();
        }
      } catch {
        setProfileLogoError(
          t(
            "Logo upload failed.",
            "?chec du télevérsement du logo.",
            "Das Hochladen des Logos ist fehlgeschlagen.",
            "La subida del logotipo fallo.",
            "O carregamento do logotipo falhou."
          )
        );
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
        setProfileLogoError(
          (typeof data.error === "string" && localizeInvoiceServerMessage(data.error, t)) ||
            t(
              "Could not remove logo.",
              "Impossible de supprimer le logo.",
              "Das Logo konnte nicht entfernt werden.",
              "No se pudo eliminar el logotipo.",
              "Não foi poss?vel remover o logotipo."
            )
        );
        return;
      }
      refreshBusinessProfile();
    } catch {
      setProfileLogoError(
        t(
          "Could not remove logo.",
          "Impossible de supprimer le logo.",
          "Das Logo konnte nicht entfernt werden.",
          "No se pudo eliminar el logotipo.",
          "Não foi poss?vel remover o logotipo."
        )
      );
    }
  };

  const currencyOptions = BUSINESS_CURRENCIES.map((code) => ({
    code,
    label: formatBusinessCurrencyOption(code),
  }));
  const businessCurrencyOptions = BUSINESS_CURRENCIES.map((code) => ({
    code,
    label: formatBusinessCurrencyOption(code),
  }));
  const draftVatSettings = normalizeVatSettings({
    enabled: businessProfile?.data?.vatEnabled ?? false,
    rate: businessProfile?.data?.vatRate ? Number(businessProfile.data.vatRate) : 0,
    mode:
      String(businessProfile?.data?.vatPricingMode || "EXCLUSIVE").toLowerCase() === "inclusive"
        ? "inclusive"
        : "exclusive",
  });
  const unitPriceMinorUnits = currencyMinorUnits[form.currency as keyof typeof currencyMinorUnits] ?? 2;
  const unitPriceStep = unitPriceMinorUnits === 0 ? 1 : Math.pow(10, -unitPriceMinorUnits);
  const draftTotals = calculateTotalsFromAmounts(form.items, draftVatSettings, 0);
  const formattedDraftTotalWithCode = formatCurrencyWithCode(draftTotals.total, form.currency);
  const showDraftTax =
    Boolean(draftTotals.vatEnabled) && Number(draftTotals.vatRate || 0) > 0;
  const invoiceCompliancePreview = useMemo(
    () =>
      resolveInvoiceCompliance({
        sellerCountry: businessProfile?.data?.country,
        sellerTaxId: businessProfile?.data?.taxId,
        buyerCountry: selectedCustomer?.country,
        buyerTaxId: selectedCustomer?.taxId,
        buyerType: form.buyerType,
        customerClassification: form.buyerType === "B2B" ? "BUSINESS" : "INDIVIDUAL",
        supplyType: form.supplyType,
        itemNames: form.items.map((item) => String(item.name || "")),
      }),
    [
      businessProfile?.data?.country,
      businessProfile?.data?.taxId,
      form.buyerType,
      form.items,
      form.supplyType,
      selectedCustomer?.country,
      selectedCustomer?.taxId,
    ]
  );
  const sendBlockingReason = useMemo(() => {
    if (form.buyerType === "B2B" && invoiceCompliancePreview.requiresBuyerTaxId) {
      const missingBuyerTaxId = invoiceCompliancePreview.warnings.some(
        (warning) => warning.code === "buyer_tax_id_recommended"
      );
      if (missingBuyerTaxId) {
        return m("invoice.compliance.addBuyerTaxIdBusiness");
      }
    }
    if (invoiceCompliancePreview.requiresSellerTaxId) {
      const missingSellerTaxId = invoiceCompliancePreview.warnings.some(
        (warning) => warning.code === "seller_tax_id_recommended"
      );
      if (missingSellerTaxId) {
        return t(
          "Add your business tax ID before sending this invoice.",
          "Ajoutez l ID fiscal de votre entreprise avant d envoyer cette facture.",
          "Fuge die Steuer-ID deines Unternehmens hinzu, bevor du diese Rechnung sendest.",
          "Agrega el ID fiscal de tu empresa antes de enviar esta factura.",
          "Adicione o ID fiscal da sua empresa antes de enviar esta fatura."
        );
      }
    }
    if (
      invoiceCompliancePreview.warnings.some((warning) => warning.code === "buyer_country_missing")
    ) {
      return t(
        "Add the customer country before sending this invoice.",
        "Ajoutez le pays du client avant d envoyer cette facture.",
        "Fuge das Land des Kunden hinzu, bevor du diese Rechnung sendest.",
        "Agrega el pa?s del cliente antes de enviar esta factura.",
        "Adicione o pa?s do cliente antes de enviar esta fatura."
      );
    }
    return null;
  }, [form.buyerType, invoiceCompliancePreview, m, t]);
  const draftVatRateLabel = formatVatRateLabel(
    draftTotals.vatRate,
    businessProfile?.data?.vatRateDisplay
  );
  const supportLevelLabel = (level: string) => {
    if (level === "ADVANCED") {
      return t("Advanced support", "Support avance", "Erweiterte Unterstutzung", "Soporte avanzado", "Suporte avancado");
    }
    if (level === "LIMITED") {
      return t("Limited support", "Support limite", "Begrenzte Unterstutzung", "Soporte limitado", "Suporte limitado");
    }
    return t("Standard support", "Support standard", "Standard-Unterstutzung", "Soporte estandar", "Suporte padrao");
  };
  const supportLevelClass = (level: string) => {
    if (level === "ADVANCED") {
      return "border-emerald-200/80 bg-emerald-50 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-500/10 dark:text-emerald-200";
    }
    if (level === "LIMITED") {
      return "border-amber-200/80 bg-amber-50 text-amber-700 dark:border-amber-400/20 dark:bg-amber-500/10 dark:text-amber-200";
    }
    return "border-slate-200/80 bg-slate-50 text-slate-700 dark:border-slate-700/80 dark:bg-slate-900/80 dark:text-slate-200";
  };
  const regionLabel = (region: string | null) => {
    if (region === "NORTH_AMERICA") {
      return t("North America", "Amerique du Nord", "Nordamerika", "Norteamerica", "America do Norte");
    }
    if (region === "SOUTH_AMERICA") {
      return t("South America", "Amerique du Sud", "Sudamerika", "Sudamerica", "America do Sul");
    }
    if (region === "EUROPE") {
      return t("Europe", "Europe", "Europa", "Europa", "Europa");
    }
    if (region === "AFRICA") {
      return t("Africa", "Afrique", "Afrika", "Africa", "Africa");
    }
    if (region === "ASIA") {
      return t("Asia", "Asie", "Asien", "Asia", "Asia");
    }
    if (region === "OCEANIA") {
      return t("Australia / Oceania", "Australie / Oceanie", "Australien / Ozeanien", "Australia / Oceania", "Australia / Oceania");
    }
    return t("Unknown", "Inconnu", "Unbekannt", "Desconocido", "Desconhecido");
  };
  const localizedComplianceWarning = (code: string, fallback: string) => {
    if (code === "seller_country_missing") {
      return t(
        "Add your business country in settings before issuing invoices.",
        "Ajoutez le pays de votre entreprise dans les parametres avant d emettre des factures.",
        "Fuge vor dem Ausstellen von Rechnungen dein Unternehmensland in den Einstellungen hinzu.",
        "Agrega el pa?s de tu empresa en configuraci?n antes de emitir facturas.",
        "Adicione o pa?s da empresa nas definicoes antes de emitir faturas."
      );
    }
    if (code === "buyer_country_missing") {
      return t(
        "Add the customer country to improve cross-border tax handling.",
        "Ajoutez le pays du client pour ameliorer la gestion fiscale transfrontaliere.",
        "Fuge das Kundenland hinzu, um die grenzuberschreitende Steuerbehandlung zu verbessern.",
        "Agrega el pa?s del cliente para mejorar el tratamiento fiscal internacional.",
        "Adicione o pa?s do cliente para melhorar o tratamento fiscal internacional."
      );
    }
    if (code === "buyer_tax_id_recommended") {
      return m("invoice.compliance.recommendBuyerTaxIdBusiness");
    }
    if (code === "seller_tax_id_recommended") {
      return t(
        "Seller tax ID should be completed before sending this invoice.",
        "L identifiant fiscal du vendeur doit etre complete avant l envoi de cette facture.",
        "Die Steuer-ID des Verkaufers sollte vor dem Senden dieser Rechnung ausgefullt werden.",
        "El identificador fiscal del vendedor debe completarse antes de enviar esta factura.",
        "O identificador fiscal do vendedor deve ser preenchido antes de enviar esta fatura."
      );
    }
    if (code === "cross_border_manual_review") {
      return t(
        "Cross-border tax treatment should be reviewed before final issuance.",
        "Le traitement fiscal transfrontalier doit etre verifie avant l emission finale.",
        "Die grenzuberschreitende Steuerbehandlung sollte vor der endgultigen Ausstellung gepruft werden.",
        "El tratamiento fiscal transfronterizo debe revisarse antes de la emision final.",
        "O tratamento fiscal transfronteirico deve ser revisto antes da emissao final."
      );
    }
    if (code === "country_limited_support") {
      return t(
        "This country currently has limited local invoice compliance support.",
        "Ce pays dispose actuellement d un support limite pour la conformite locale des factures.",
        "Dieses Land hat derzeit nur begrenzte Unterstutzung f?r lokale Rechnungskonformitat.",
        "Este pa?s tiene actualmente soporte limitado para el cumplimiento local de facturas.",
        "Este pa?s tem atualmente suporte limitado para conformidade local de fatura??o."
      );
    }
    if (code === "country_requires_e_invoicing") {
      return t(
        "This country may require local e-invoicing or government clearance outside the standard PDF invoice.",
        "Ce pays peut exiger une facturation electronique locale ou une validation administrative au-dela du PDF standard.",
        "Dieses Land kann lokale E-Rechnung oder behordliche Freigabe ausserhalb der Standard-PDF-Rechnung verlangen.",
        "Este pa?s puede requerir facturaci?n electronica local o validacion gubernamental fuera de la factura PDF estandar.",
        "Este pa?s pode exigir fatura??o eletronica local ou validacao governamental fora da fatura PDF padrao."
      );
    }
    return fallback;
  };
  const preferredInvoiceCurrencyFlag = getBusinessCurrencyFlag(preferredInvoiceCurrency);
  const previewIssueDate = parseDateInput(form.issueDate) || new Date();
  const previewDueDate = form.dueDate ? parseDateInput(form.dueDate) : undefined;
  const previewBusinessName = String(
    businessProfile?.data?.businessName ||
      t("Your business", "Votre entreprise", "Dein Unternehmen", "Tu empresa", "Sua empresa")
  );
  const previewBusinessAddress = String(businessProfile?.data?.businessAddress || "").trim();
  const previewBillToAddress = [
    selectedCustomer?.addressLine1,
    selectedCustomer?.addressLine2,
    selectedCustomer?.city,
    selectedCustomer?.state,
    selectedCustomer?.postalCode,
    selectedCustomer?.country,
  ]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .join("\n");

  const scopedInvoices = useMemo(
    () =>
      !invoicesError && Array.isArray(invoices?.items)
        ? invoices.items
        : [],
    [invoices?.items, invoicesError]
  );
  const getDisplayStatus = (value: string) => {
    const normalized = String(value || "").toUpperCase();
    if (normalized === "REFUNDED" || normalized === "PARTIALLY_REFUNDED") return normalized;
    if (normalized === "SENT" || normalized === "OVERDUE") return "UNPAID";
    if (normalized === "CANCELED") return "CANCELED";
    return normalized;
  };
  const translateStatus = (value: string) => {
    return localizeInvoiceStatus(value, t);
  };
  const statusBadgeClass = (value: string) => {
    const normalized = getDisplayStatus(value).toUpperCase();
    if (normalized === "PAID") return "border-green-200 bg-green-100 text-green-800";
    if (normalized === "REFUNDED") return "border-sky-200 bg-sky-100 text-sky-800";
    if (normalized === "PARTIALLY_REFUNDED") return "border-cyan-200 bg-cyan-100 text-cyan-800";
    if (normalized === "UNPAID" || normalized === "OVERDUE")
      return "border-amber-200 bg-amber-100 text-amber-800";
    if (normalized === "DRAFT") return "border-slate-200 bg-slate-100 text-slate-700";
    if (normalized === "FAILED") return "border-rose-200 bg-rose-100 text-rose-700";
    return "border-slate-200 bg-slate-100 text-slate-700";
  };
  const complianceBadgeClass = (variant: "blocked" | "review" | "ok") => {
    if (variant === "blocked") {
      return "border-rose-200 bg-rose-50 text-rose-700";
    }
    if (variant === "review") {
      return "border-amber-200 bg-amber-50 text-amber-700";
    }
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  };
  const resolveComplianceBadge = (row: any) => {
    const record = row?.complianceRecord;
    const validation = row?.metadata?.complianceValidation;
    const blockingIssueCount = Number(record?.blockingIssueCount ?? validation?.blockingIssueCount ?? 0);
    const warningIssueCount = Number(record?.warningIssueCount ?? validation?.warningIssueCount ?? 0);
    if (blockingIssueCount > 0) {
      return {
        label: t("Blocked", "Bloqué", "Blockiert", "Bloqueado", "Bloqueado"),
        variant: "blocked" as const,
      };
    }
    if (warningIssueCount > 0) {
      return {
        label: t("Review", "À vérifier", "Prüfen", "Revisar", "Rever"),
        variant: "review" as const,
      };
    }
    return {
      label: t("OK", "Conforme", "OK", "Correcto", "OK"),
      variant: "ok" as const,
    };
  };
  const filteredInvoices = scopedInvoices;
  const pagedInvoiceTotal = Number(invoices?.total || 0);
  const showEmptyState = !invoicesError && filteredInvoices.length === 0;
  const invoiceStats = useMemo(
    () =>
      invoices?.summary || {
        total: 0,
        drafts: 0,
        unpaid: 0,
        overdue: 0,
        paid: 0,
      },
    [invoices?.summary]
  );
  const pageStart = pagedInvoiceTotal === 0 ? 0 : invoicePage * INVOICE_HISTORY_PAGE_SIZE + 1;
  const pageEnd = pageStart === 0 ? 0 : pageStart + filteredInvoices.length - 1;
  const canGoToPreviousPage = invoicePage > 0;
  const canGoToNextPage = Boolean(invoices?.hasMore);
  const totalInvoicePages = pagedInvoiceTotal === 0 ? 0 : Math.max(1, Math.ceil(pagedInvoiceTotal / INVOICE_HISTORY_PAGE_SIZE));
  const currentInvoicePage = pagedInvoiceTotal === 0 ? 0 : Math.min(invoicePage + 1, totalInvoicePages);
  const invoiceHistorySummaryLabel =
    pagedInvoiceTotal > 0
      ? pagedInvoiceTotal === 1
        ? t("1 invoice", "1 facture", "1 Rechnung", "1 factura", "1 fatura")
        : totalInvoicePages <= 1
          ? t(
              `${pagedInvoiceTotal} invoices`,
              `${pagedInvoiceTotal} factures`,
              `${pagedInvoiceTotal} Rechnungen`,
              `${pagedInvoiceTotal} facturas`,
              `${pagedInvoiceTotal} faturas`
            )
          : t(
              `Showing ${pageStart}-${pageEnd} of ${pagedInvoiceTotal} invoices`,
              `Affichage ${pageStart}-${pageEnd} sur ${pagedInvoiceTotal} factures`,
              `${pageStart}-${pageEnd} von ${pagedInvoiceTotal} Rechnungen`,
              `Mostrando ${pageStart}-${pageEnd} de ${pagedInvoiceTotal} facturas`,
              `A mostrar ${pageStart}-${pageEnd} de ${pagedInvoiceTotal} faturas`
            )
      : debouncedQuery
        ? t(
            "No invoices match this search.",
            "Aucune facture ne correspond a cette recherche.",
            "Keine Rechnungen entsprechen dieser Suche.",
            "Ninguna factura coincide con esta busqueda.",
            "Nenhuma fatura corresponde a esta pesquisa."
          )
        : t(
            "No invoices available.",
            "Aucune facture disponible.",
            "Keine Rechnungen verfügbar.",
            "No hay facturas disponibles.",
            "Nenhuma fatura disponível."
          );

  useEffect(() => {
    if (invoicesError) return;
    if (invoicePage === 0) return;
    if (filteredInvoices.length > 0) return;
    if (pagedInvoiceTotal <= 0) return;
    setInvoicePage((prev) => Math.max(0, prev - 1));
  }, [filteredInvoices.length, invoicePage, invoicesError, pagedInvoiceTotal]);

  const readCustomerFromInvoice = (invoice: any) => {
    const customer = invoice?.customer || invoice?.metadata?.customer || {};
    const meta = invoice?.metadata || {};
    const rawAddress =
      customer.address ??
      customer.addressLine1 ??
      meta?.customerAddress ??
      meta?.customer_address ??
      "";
    const parsedAddress = parseBusinessAddress(rawAddress);
    return {
      id: customer.id || invoice?.customerId || "",
      name: customer.name ?? meta?.customerName ?? "",
      companyName: customer.companyName ?? meta?.customerCompanyName ?? meta?.customer_company_name ?? "",
      email: customer.email ?? meta?.customerEmail ?? "",
      taxId: customer.taxId ?? meta?.customerTaxId ?? meta?.customer_tax_id ?? "",
      registrationNumber:
        customer.registrationNumber ?? meta?.customerRegistrationNumber ?? meta?.customer_registration_number ?? "",
      branchCode: customer.branchCode ?? meta?.customerBranchCode ?? meta?.customer_branch_code ?? "",
      street:
        customer.streetAddress ??
        customer.street ??
        meta?.customerStreet ??
        parsedAddress.streetAddress,
      addressLine2:
        customer.addressLine2 ??
        meta?.customerAddressLine2 ??
        meta?.customer_address_line2 ??
        "",
      state: customer.state ?? meta?.customerState ?? meta?.customer_state ?? "",
      city: customer.city ?? meta?.customerCity ?? parsedAddress.city,
      postalCode:
        customer.postalCode ??
        meta?.customerPostalCode ??
        parsedAddress.postalCode,
      country: customer.country ?? meta?.customerCountry ?? "",
    };
  };

  const openEditCustomer = (invoice: any) => {
    const customer = readCustomerFromInvoice(invoice);
    setEditingInvoice(invoice || null);
    setEditStatus(null);
    setEditForm({
      customerName: customer.name || "",
      customerCompanyName: customer.companyName || "",
      customerEmail: customer.email || "",
      customerTaxId: customer.taxId || "",
      customerRegistrationNumber: customer.registrationNumber || "",
      customerBranchCode: customer.branchCode || "",
      customerStreet: customer.street || "",
      customerAddressLine2: customer.addressLine2 || "",
      customerCity: customer.city || "",
      customerState: customer.state || "",
      customerPostalCode: customer.postalCode || "",
      customerCountry: customer.country || "",
    });
    setEditOpen(true);
  };

  const saveCustomerDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    const customerId = editingInvoice?.customerId ?? editingInvoice?.customer?.id ?? "";
    if (!customerId) {
      setEditStatus({
        message: t(
          "Customer not found for update.",
          "Client introuvable pour mise ? jour.",
          "Kunde für die Aktualisierung nicht gefunden.",
          "No se encontro el cliente para actualizar.",
          "Cliente não encontrado para atualiza??o."
        ),
        variant: "error",
      });
      return;
    }
    setSavingEdit(true);
    setEditStatus(null);
    setStatus(null);
    const payload = {
      name: editForm.customerName.trim() || undefined,
      companyName: editForm.customerCompanyName.trim() || undefined,
      email: editForm.customerEmail.trim().toLowerCase() || undefined,
      taxId: editForm.customerTaxId.trim() || undefined,
      registrationNumber: editForm.customerRegistrationNumber.trim() || undefined,
      branchCode: editForm.customerBranchCode.trim() || undefined,
      addressLine1: editForm.customerStreet.trim() || undefined,
      addressLine2: editForm.customerAddressLine2.trim() || undefined,
      city: editForm.customerCity.trim() || undefined,
      state: editForm.customerState.trim() || undefined,
      postalCode: editForm.customerPostalCode.trim() || undefined,
      country: editForm.customerCountry.trim() || undefined,
    };
    try {
      const res = await fetch(`/api/customers/${encodeURIComponent(String(customerId))}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setEditStatus({
          message:
            (typeof data?.error === "string" && localizeInvoiceServerMessage(data.error, t)) ||
            t(
              "Could not update customer details.",
              "Impossible de mettre ? jour le client.",
              "Kundendaten konnten nicht aktualisiert werden.",
              "No se pudieron actualizar los datos del cliente.",
              "Não foi poss?vel atualizar os dados do cliente."
            ),
          variant: "error",
        });
        return;
      }
      setEditStatus({
        message: t(
          "Customer details updated.",
          "D?tails client mis ? jour.",
          "Kundendaten aktualisiert.",
          "Datos del cliente actualizados.",
          "Dados do cliente atualizados."
        ),
        variant: "success",
      });
      if (data?.id && String(data.id) === String(form.customerId || customerId)) {
        setSelectedCustomerSnapshot((prev) =>
          prev && String(prev.id) === String(data.id)
            ? {
                ...prev,
                name: data.name ?? prev.name,
                email: data.email ?? prev.email,
                phone: data.phone ?? prev.phone,
                taxId: data.taxId ?? null,
                addressLine1: data.addressLine1 ?? prev.addressLine1,
                addressLine2: data.addressLine2 ?? prev.addressLine2,
                city: data.city ?? prev.city,
                state: data.state ?? prev.state,
                postalCode: data.postalCode ?? prev.postalCode,
                country: data.country ?? prev.country,
                deliveryPreference: data.deliveryPreference ?? prev.deliveryPreference,
              }
            : prev
        );
      }
      mutate();
      setEditOpen(false);
      setEditingInvoice(null);
    } catch {
      setEditStatus({
        message: t(
          "Could not update customer details.",
          "Impossible de mettre ? jour le client.",
          "Kundendaten konnten nicht aktualisiert werden.",
          "No se pudieron actualizar los datos del cliente.",
          "Não foi poss?vel atualizar os dados do cliente."
        ),
        variant: "error",
      });
    } finally {
      setSavingEdit(false);
    }
  };

  const sendDraft = async (invoice: any) => {
    const invoiceId = String(invoice?.id || invoice?.invoiceNumber || "");
    if (!invoiceId) return;
    const customerId = String(invoice?.customerId || "");
    if (!customerId) {
      setStatus({
        message: t(
          "Customer is required.",
          "Le client est requis.",
          "Kunde ist erforderlich.",
          "El cliente es obligatorio.",
          "O cliente e obrigatório."
        ),
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
          customerId,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatus({
          message:
            (typeof data?.error === "string" && localizeInvoiceServerMessage(data.error, t)) ||
            t(
              "Could not send invoice.",
              "Impossible d envoyer la facture.",
              "Rechnung konnte nicht gesendet werden.",
              "No se pudo enviar la factura.",
              "Não foi poss?vel enviar a fatura."
            ),
          variant: "error",
        });
      } else {
        setStatus({
          message: t("Invoice sent.", "Facture envoyee.", "Rechnung gesendet.", "Factura enviada.", "Fatura enviada."),
          variant: "success",
        });
        mutate();
      }
    } catch {
      setStatus({
        message: t(
          "Could not send invoice.",
          "Impossible d envoyer la facture.",
          "Rechnung konnte nicht gesendet werden.",
          "No se pudo enviar la factura.",
          "Não foi poss?vel enviar a fatura."
        ),
        variant: "error",
      });
    } finally {
      setSendingId(null);
    }
  };

  const confirmDeleteDraft = async () => {
    const invoice = deleteCandidate;
    const invoiceId = String(invoice?.id || "");
    if (!invoiceId) return;

    setDeletingInvoiceId(invoiceId);
    setDeleteCandidate(null);
    setStatus(null);
    try {
      const res = await fetch(`/api/invoice/${encodeURIComponent(invoiceId)}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatus({
          message:
            (typeof data?.error === "string" && localizeInvoiceServerMessage(data.error, t)) ||
            t(
              "Could not delete draft invoice.",
              "Impossible de supprimer le brouillon.",
              "Rechnungsentwurf konnte nicht gelöscht werden.",
              "No se pudo eliminar el borrador de factura.",
              "Não foi poss?vel eliminar o rascunho da fatura."
            ),
          variant: "error",
        });
        return;
      }
      setStatus({
        message: t(
          "Draft invoice deleted.",
          "Brouillon supprime.",
          "Rechnungsentwurf gelöscht.",
          "Borrador de factura eliminado.",
          "Rascunho da fatura eliminado."
        ),
        variant: "success",
      });
      mutate();
    } catch {
      setStatus({
        message: t(
          "Could not delete draft invoice.",
          "Impossible de supprimer le brouillon.",
          "Rechnungsentwurf konnte nicht gelöscht werden.",
          "No se pudo eliminar el borrador de factura.",
          "Não foi poss?vel eliminar o rascunho da fatura."
        ),
        variant: "error",
      });
    } finally {
      setDeletingInvoiceId(null);
    }
  };

  const openDeleteDraftModal = (invoice: any) => {
    setDeleteCandidate(invoice || null);
  };

  const createInvoiceWithStatus = async (statusOverride?: "DRAFT" | "SENT") => {
    const nextStatus = statusOverride || (form.status as "DRAFT" | "SENT");
    if (submittingInvoiceRef.current) return;
    setInvoiceActionStatus(null);
    if (!form.customerId) {
      setInvoiceActionStatus({
        message: t(
          "Customer is required.",
          "Le client est requis.",
          "Kunde ist erforderlich.",
          "El cliente es obligatorio.",
          "O cliente e obrigatório."
        ),
        variant: "error",
      });
      return;
    }
    const payload: {
      invoiceNumber: string;
      poNumber?: string;
      currency: string;
      status: string;
      customerId: string;
      buyerType: InvoiceBuyerType;
      supplyType: InvoiceSupplyType;
      issueDate?: string;
      dueDate?: string;
      note?: string;
      attachments?: InvoiceAttachmentPayload[];
      items: { name: string; quantity: number; price: number }[];
    } = {
      ...form,
      status: nextStatus,
      customerId: form.customerId,
      buyerType: form.buyerType,
      supplyType: form.supplyType,
      invoiceNumber: form.invoiceNumber.trim(),
      poNumber: form.poNumber.trim() || undefined,
      note: form.note.trim() || undefined,
    };
    const issueDateParsed = form.issueDate ? parseDateInput(form.issueDate) : null;
    if (form.issueDate && !issueDateParsed) {
      setInvoiceActionStatus({
        message: t(
          "Issue date must be in DD/MM/YYYY format.",
          "Date d emission au format JJ/MM/AAAA.",
          "Das Ausstellungsdatum muss im Format TT/MM/JJJJ sein.",
          "La fecha de emision debe tener el formato DD/MM/AAAA.",
          "A data de emissao deve estar no formato DD/MM/AAAA."
        ),
        variant: "error",
      });
      return;
    }
    const dueDateParsed = form.dueDate ? parseDateInput(form.dueDate) : null;
    if (form.dueDate && !dueDateParsed) {
      setInvoiceActionStatus({
        message: t(
          "Due date must be in DD/MM/YYYY format.",
          "Date d echeance au format JJ/MM/AAAA.",
          "Das Falligkeitsdatum muss im Format TT/MM/JJJJ sein.",
          "La fecha de vencimiento debe tener el formato DD/MM/AAAA.",
          "A data de vencimento deve estar no formato DD/MM/AAAA."
        ),
        variant: "error",
      });
      return;
    }
    if (supportingFilesError) {
      setInvoiceActionStatus({ message: supportingFilesError, variant: "error" });
      return;
    }
    payload.issueDate = issueDateParsed ? issueDateParsed.toISOString().slice(0, 10) : undefined;
    payload.dueDate = dueDateParsed ? dueDateParsed.toISOString().slice(0, 10) : undefined;
    submittingInvoiceRef.current = true;
    setSubmittingInvoiceStatus(nextStatus);
    try {
      payload.attachments =
        supportingFiles.length > 0
          ? await Promise.all(supportingFiles.map((file) => toInvoiceAttachmentPayload(file)))
          : undefined;
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
          setInvoiceActionStatus({
            message: `${json.reason || t(
              "Upgrade required.",
              "Mise a niveau requise.",
              "Upgrade erforderlich.",
              "Actualización requerida.",
              "Atualiza??o necessária."
            )}${
              required
                ? ` ${t(
                    "Required plan:",
                    "Plan requis :",
                    "Erforderlicher Plan:",
                    "Plan requerido:",
                    "Plano necessario:"
                  )} ${required}.`
                : ""
            }`,
            variant: "error",
          });
        } else {
          setInvoiceActionStatus({
            message:
              (typeof json.error === "string" && localizeInvoiceServerMessage(json.error, t)) ||
              t(
                "Could not create invoice.",
                "Impossible de creer la facture.",
                "Rechnung konnte nicht erstellt werden.",
                "No se pudo crear la factura.",
                "Não foi poss?vel criar a fatura."
              ),
            variant: "error",
          });
        }
      } else {
        const savedNumber = json?.invoiceNumber as string | undefined;
        if (savedNumber && savedNumber !== form.invoiceNumber) {
          setInvoiceActionStatus({
            message: isInvoiceNumberDraft(form.invoiceNumber)
              ? t(
                  `Invoice generated as ${savedNumber}.`,
                  `Facture generee sous le numero ${savedNumber}.`,
                  `Rechnung wurde als ${savedNumber} erstellt.`,
                  `La factura se genero como ${savedNumber}.`,
                  `A fatura foi gerada como ${savedNumber}.`
                )
              : t(
                  `Invoice number already existed. Saved as ${savedNumber}.`,
                  `Numero deja utilise. Enregistre comme ${savedNumber}.`,
                  `Die Rechnungsnummer existierte bereits. Als ${savedNumber} gespeichert.`,
                  `El numero de factura ya existia. Se guardo como ${savedNumber}.`,
                  `O numero da fatura ja existia. Guardada como ${savedNumber}.`
                ),
            variant: "success",
          });
        } else {
          setInvoiceActionStatus({
            message: t(
              "Invoice generated.",
              "Facture g?n?r?e.",
              "Rechnung erstellt.",
              "Factura generada.",
              "Fatura gerada."
            ),
            variant: "success",
          });
        }
        mutate();
        const nextCurrency = preferredInvoiceCurrency;
        setHasManualCurrencySelection(false);
        setHasManualBuyerTypeSelection(false);
        setForm(buildFreshInvoiceForm(nextCurrency));
        setSupportingFiles([]);
        setSupportingFilesError(null);
        setSelectedCustomerSnapshot(null);
        setCustomerQuery("");
        setCustomerSkip(0);
        setCustomerDropdownOpen(false);
      }
    } catch {
      setInvoiceActionStatus({
        message: t(
          "Could not create invoice. Please try again.",
          "Impossible de creer la facture. R?essayez.",
          "Rechnung konnte nicht erstellt werden. Bitte versuche es erneut.",
          "No se pudo crear la factura. Intentalo de nuevo.",
          "Não foi poss?vel criar a fatura. Tente novamente."
        ),
        variant: "error",
      });
    } finally {
      submittingInvoiceRef.current = false;
      setSubmittingInvoiceStatus(null);
    }
  };

  const createCustomerInline = async (event: React.FormEvent) => {
    event.preventDefault();
    setStatus(null);
    const requiresPhoneForDelivery =
      newCustomerForm.deliveryPreference === "WHATSAPP" || newCustomerForm.deliveryPreference === "BOTH";
    if (
      !newCustomerForm.name.trim() ||
      !newCustomerForm.email.trim() ||
      !newCustomerForm.addressLine1.trim() ||
      !newCustomerForm.city.trim() ||
      !newCustomerForm.state.trim() ||
      !newCustomerForm.country.trim() ||
      !newCustomerForm.deliveryPreference.trim() ||
      (requiresPhoneForDelivery && !newCustomerForm.phone.trim())
    ) {
      setStatus({
        message: t(
          "Name, email, delivery method, address, city, state, and country are required. Phone is required for WhatsApp delivery.",
          "Nom, email, mode de livraison, adresse, ville, etat et pays sont requis. Le t?l?phone est requis pour WhatsApp.",
          "Name, E-Mail, Zustellmethode, Adresse, Stadt, Bundesland und Land sind erforderlich. Für die WhatsApp-Zustellung ist eine Telefonnummer erforderlich.",
          "Nombre, correo, método de entrega, direcci?n, ciudad, estado y pa?s son obligatorios. El tel?fono es obligatorio para la entrega por WhatsApp.",
          "Nome, email, método de entrega, endereco, cidade, estado e pa?s s?o obrigatorios. O telefone e obrigatório para entrega por WhatsApp."
        ),
        variant: "error",
      });
      return;
    }
    setCreatingCustomer(true);
    try {
      const response = await fetch("/api/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...newCustomerForm,
          email: newCustomerForm.email.trim().toLowerCase(),
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setStatus({
          message:
            (typeof payload?.error === "string" && localizeInvoiceServerMessage(payload.error, t)) ||
            t(
              "Could not create customer.",
              "Impossible de creer le client.",
              "Kunde konnte nicht erstellt werden.",
              "No se pudo crear el cliente.",
              "Não foi poss?vel criar o cliente."
            ),
          variant: "error",
        });
        return;
      }
      setSelectedCustomerSnapshot({
        id: String(payload.id || ""),
        name: String(payload.name || ""),
        email: String(payload.email || ""),
        phone: payload.phone ?? null,
        taxId: payload.taxId ?? null,
        addressLine1: payload.addressLine1 ?? null,
        addressLine2: payload.addressLine2 ?? null,
        city: payload.city ?? null,
        state: payload.state ?? null,
        postalCode: payload.postalCode ?? null,
        country: payload.country ?? null,
        deliveryPreference: payload.deliveryPreference ?? "EMAIL",
      });
      setForm((prev) => ({ ...prev, customerId: payload.id }));
      setCustomerQuery(`${payload.name} (${payload.email})`);
      setCustomerModalOpen(false);
      setNewCustomerForm(buildFreshCustomerForm());
      await refreshCustomers();
    } catch {
      setStatus({
        message: t(
          "Could not create customer.",
          "Impossible de creer le client.",
          "Kunde konnte nicht erstellt werden.",
          "No se pudo crear el cliente.",
          "Não foi poss?vel criar o cliente."
        ),
        variant: "error",
      });
    } finally {
      setCreatingCustomer(false);
    }
  };

  const createInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    await createInvoiceWithStatus();
  };

  return (
    <div className="mx-auto w-full max-w-[1160px] space-y-7 max-md:space-y-5">
      <section className="relative overflow-hidden rounded-[28px] border border-slate-200/80 bg-[radial-gradient(circle_at_top_left,rgba(99,102,241,0.1),transparent_26%),radial-gradient(circle_at_82%_18%,rgba(14,165,233,0.1),transparent_22%),linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.94))] p-5 shadow-[0_22px_56px_-40px_rgba(15,23,42,0.26)] sm:p-6 dark:border-slate-800/80 dark:bg-[radial-gradient(circle_at_top_left,rgba(99,102,241,0.16),transparent_26%),radial-gradient(circle_at_82%_18%,rgba(56,189,248,0.12),transparent_22%),linear-gradient(180deg,rgba(2,6,23,0.96),rgba(15,23,42,0.9))] dark:shadow-[0_26px_64px_-42px_rgba(2,6,23,0.92)]">
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.22),transparent_32%,transparent_70%,rgba(255,255,255,0.1))] dark:bg-[linear-gradient(135deg,rgba(255,255,255,0.04),transparent_30%,transparent_70%,rgba(148,163,184,0.04))]" />
        <div className="relative grid gap-6 lg:grid-cols-[minmax(0,1.28fr)_332px] lg:items-start">
          <div className="min-w-0 flex-1 space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center rounded-full border border-indigo-200/80 bg-indigo-50 px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.24em] text-indigo-700 dark:border-indigo-400/20 dark:bg-indigo-500/10 dark:text-indigo-200">
                {t("Invoices", "Factures", "Rechnungen", "Facturas", "Faturas")}
              </span>
              <span className="inline-flex items-center gap-2 rounded-full border border-slate-200/80 bg-white/88 px-2 py-1 text-[0.7rem] font-medium tracking-[0.01em] text-slate-600 dark:border-slate-700/80 dark:bg-slate-900/70 dark:text-slate-300">
                <span className="pl-1">{t("Default currency", "Devise par defaut", "Standardwährung", "Moneda predeterminada", "Moeda predefinida")}</span>
                <span className="inline-flex min-w-[3.35rem] items-center justify-center gap-1.5 rounded-full border border-indigo-200/80 bg-indigo-50 px-2.5 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-indigo-700 dark:border-indigo-400/20 dark:bg-indigo-500/10 dark:text-indigo-200">
                  {preferredInvoiceCurrencyFlag ? <span className="text-[0.9rem] leading-none">{preferredInvoiceCurrencyFlag}</span> : null}
                  {preferredInvoiceCurrency}
                </span>
              </span>
            </div>
            <div className="space-y-3">
              <h1 className="max-w-[9.8ch] text-[2.1rem] font-semibold leading-[0.9] tracking-[-0.055em] text-slate-950 sm:text-[2.55rem] xl:text-[2.8rem] dark:text-slate-50">
                {t("Invoice Generator", "Generateur de factures", "Rechnungsgenerator", "Generador de facturas", "Gerador de faturas")}
              </h1>
              <p className="max-w-[42rem] text-[0.95rem] leading-6 text-slate-600 dark:text-slate-300">
                {t(
                  "Create, manage, and send polished invoices from one focused workspace.",
                  "Cr?ez, g?rez et envoyez des factures elegantes depuis un espace de travail unique.",
                  "Erstelle, verwalte und versende professionelle Rechnungen in einem fokussierten Arbeitsbereich.",
                  "Crea, gestiona y envia facturas profesionales desde un unico espacio de trabajo.",
                  "Crie, gira e envie faturas profissionais a partir de um unico espa?o de trabalho."
                )}
              </p>
            </div>
            <div className="overflow-hidden rounded-[24px] border border-slate-200/80 bg-white/68 shadow-[0_18px_40px_-34px_rgba(15,23,42,0.18)] backdrop-blur-sm dark:border-slate-700/80 dark:bg-slate-950/38 dark:shadow-[0_18px_44px_-36px_rgba(2,6,23,0.85)]">
              <div className="grid gap-px bg-slate-200/80 sm:grid-cols-2 xl:grid-cols-4 dark:bg-slate-800/80">
              <div className={heroMetricCardClass}>
                <div className="pointer-events-none absolute inset-x-3 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(79,70,229,0.4),transparent)]" />
                <p className={heroMetricLabelClass}>
                  {t("Total invoices", "Total factures", "Rechnungen gesamt", "Total de facturas", "Total de faturas")}
                </p>
                <p
                  className={getSingleLineAmountClass(
                    String(invoiceStats.total),
                    "mt-2 max-w-full overflow-hidden whitespace-nowrap text-center font-semibold tracking-[-0.04em] text-slate-950 dark:text-slate-50"
                  )}
                  style={getSingleLineAmountStyle(String(invoiceStats.total), 1.7, 0.98, 5, 0.1)}
                >
                  {invoiceStats.total}
                </p>
              </div>
              <div className={heroMetricCardClass}>
                <div className="pointer-events-none absolute inset-x-3 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(99,102,241,0.34),transparent)]" />
                <p className={heroMetricLabelClass}>
                  {t("Drafts", "Brouillons", "Entwurfe", "Borradores", "Rascunhos")}
                </p>
                <p
                  className={getSingleLineAmountClass(
                    String(invoiceStats.drafts),
                    "mt-2 max-w-full overflow-hidden whitespace-nowrap text-center font-semibold tracking-[-0.04em] text-slate-950 dark:text-slate-50"
                  )}
                  style={getSingleLineAmountStyle(String(invoiceStats.drafts), 1.7, 0.98, 5, 0.1)}
                >
                  {invoiceStats.drafts}
                </p>
              </div>
              <div className={heroMetricCardClass}>
                <div className="pointer-events-none absolute inset-x-3 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(245,158,11,0.38),transparent)]" />
                <p className={heroMetricLabelClass}>
                  {t("Unpaid", "Impayees", "Unbezahlt", "Pendientes de pago", "Por pagar")}
                </p>
                <p
                  className={getSingleLineAmountClass(
                    String(invoiceStats.unpaid),
                    "mt-2 max-w-full overflow-hidden whitespace-nowrap text-center font-semibold tracking-[-0.04em] text-slate-950 dark:text-slate-50"
                  )}
                  style={getSingleLineAmountStyle(String(invoiceStats.unpaid), 1.7, 0.98, 5, 0.1)}
                >
                  {invoiceStats.unpaid}
                </p>
              </div>
              <div className={heroMetricCardClass}>
                <div className="pointer-events-none absolute inset-x-3 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(239,68,68,0.38),transparent)]" />
                <p className={heroMetricLabelClass}>
                  {t("Overdue", "En retard", "überfällig", "Vencidas", "Em atraso")}
                </p>
                <p
                  className={getSingleLineAmountClass(
                    String(invoiceStats.overdue),
                    "mt-2 max-w-full overflow-hidden whitespace-nowrap text-center font-semibold tracking-[-0.04em] text-slate-950 dark:text-slate-50"
                  )}
                  style={getSingleLineAmountStyle(String(invoiceStats.overdue), 1.7, 0.98, 5, 0.1)}
                >
                  {invoiceStats.overdue}
                </p>
              </div>
            </div>
            </div>
          </div>
          <div className="w-full max-w-[332px] rounded-[24px] border border-slate-200/80 bg-white/82 p-3.5 shadow-[0_20px_42px_-32px_rgba(15,23,42,0.3)] backdrop-blur-sm dark:border-slate-700/80 dark:bg-slate-950/62 dark:shadow-[0_24px_48px_-34px_rgba(2,6,23,0.95)]">
            <div className="space-y-3.5">
              <div className="space-y-2">
                <p className="inline-flex items-center rounded-full border border-slate-200/80 bg-slate-50/85 px-3 py-1 text-[0.64rem] font-semibold uppercase tracking-[0.22em] text-slate-500 dark:border-slate-700/80 dark:bg-slate-900/75 dark:text-slate-400">
                  {t("Workspace", "Espace de travail", "Arbeitsbereich", "Espacio de trabajo", "Espa?o de trabalho")}
                </p>
                <p className="text-[1.02rem] font-semibold leading-[1.08] tracking-[-0.03em] text-slate-950 dark:text-slate-50 sm:text-[1.08rem]">
                  {t("Start a fresh invoice or jump into history.", "Cr?ez une nouvelle facture ou ouvrez l'historique.", "Starte eine neue Rechnung oder wechsle in den Verlauf.", "Empieza una factura nueva o ve al historial.", "Comece uma nova fatura ou avance para o histórico.")}
                </p>
                <p className="text-[0.87rem] leading-6 text-slate-600 dark:text-slate-300">
                  {t(
                    "Everything updates live while you build, so totals, customer details, and delivery settings stay in sync.",
                    "Tout se met à jour en direct pendant la création pour garder les totaux, le client et les réglages d’envoi parfaitement synchronisés.",
                    "Alles wird während der Erstellung live aktualisiert, damit Summen, Kundendaten und Zustelleinstellungen synchron bleiben.",
                    "Todo se actualiza en vivo mientras trabajas, para que totales, datos del cliente y ajustes de entrega permanezcan sincronizados.",
                    "Tudo se atualiza em tempo real enquanto cria, para manter totais, dados do cliente e definições de entrega sincronizados."
                  )}
                </p>
              </div>
              <div className="flex flex-col gap-2.5 sm:flex-row">
                <Button
                  onClick={handleNewInvoice}
                  className="h-11 flex-1 rounded-[18px] bg-[linear-gradient(135deg,#6657ff_0%,#5547f0_48%,#4338ca_100%)] px-4 text-[0.94rem] font-semibold text-white shadow-[0_18px_38px_-22px_rgba(79,70,229,0.82)] ring-1 ring-white/10 hover:bg-[linear-gradient(135deg,#7163ff_0%,#5f51f4_48%,#4b3fd4_100%)]"
                >
                  {t("+ New Invoice", "+ Nouvelle facture", "+ Neue Rechnung", "+ Nueva factura", "+ Nova fatura")}
                </Button>
                <a href="#invoice-history" className="sm:flex-1">
                  <Button
                    variant="secondary"
                    className="h-11 w-full rounded-[18px] border border-slate-300/90 bg-slate-50 px-4 text-[0.94rem] font-semibold text-slate-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] dark:hover:bg-slate-800"
                  >
                    {t("View history", "Voir l'historique", "Verlauf ansehen", "Ver historial", "Ver histórico")}
                  </Button>
                </a>
              </div>
              <div className="grid grid-cols-2 gap-px overflow-hidden rounded-[20px] border border-slate-200/80 bg-slate-200/80 dark:border-slate-800 dark:bg-slate-800">
                <div className="bg-white/92 px-3 py-2 text-center dark:bg-slate-950/84">
                  <p className="text-[0.58rem] font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
                    {t("Live preview", "Apercu direct", "Live-Vorschau", "Vista previa en vivo", "Pre-visualiza??o ao vivo")}
                  </p>
                  <p className="mt-1 text-[0.94rem] font-semibold tracking-[-0.02em] text-slate-950 dark:text-slate-50">
                    {t("Always on", "Toujours visible", "Immer aktiv", "Siempre activo", "Sempre ativo")}
                  </p>
                </div>
                <div className="bg-white/92 px-3 py-2 text-center dark:bg-slate-950/84">
                  <p className="text-[0.58rem] font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
                    {t("Delivery", "Envoi", "Zustellung", "Entrega", "Entrega")}
                  </p>
                  <p className="mt-1 text-[0.94rem] font-semibold tracking-[-0.02em] text-slate-950 dark:text-slate-50">
                    {t("Ready to send", "Pr?t a envoyer", "Bereit zum Senden", "Lista para enviar", "Pronta para enviar")}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
        {status ? (
          <div className="mt-5">
            <TransientAlert variant={status.variant} onDismiss={() => setStatus(null)}>
              {status.message}
            </TransientAlert>
          </div>
        ) : null}
      </section>
      {profileMissing ? (
        <Card title={t("Business profile required", "Profil requis", "Unternehmensprofil erforderlich", "Se requiere perfil de empresa", "Perfil da empresa obrigatório")}>
          {profileStatus ? (
            <TransientAlert variant="success" onDismiss={() => setProfileStatus(null)}>
              {profileStatus}
            </TransientAlert>
          ) : null}
          {profileError && <Alert variant="error">{profileError}</Alert>}
            {profileLogoError && <Alert variant="error">{profileLogoError}</Alert>}
          <p className="text-sm text-muted-foreground">
            {t(
              "Add your business profile before creating invoices.",
              "Ajoutez votre profil avant de creer des factures.",
              "Füge dein Unternehmensprofil hinzu, bevor du Rechnungen erstellst.",
              "Agrega tu perfil de empresa antes de crear facturas.",
              "Adicione o perfil da sua empresa antes de criar faturas."
            )}
          </p>
          <form
            className="mt-4 grid grid-cols-2 gap-4 max-md:grid-cols-1 max-md:gap-3"
            onSubmit={createBusinessProfile}
          >
            <Input
              label={t("Business name", "Nom de l entreprise", "Unternehmensname", "Nombre de la empresa", "Nome da empresa")}
              value={profileForm.businessName}
              onChange={(e) => setProfileForm({ ...profileForm, businessName: e.target.value })}
              onFocus={(e) => {
                const length = e.currentTarget.value.length;
                e.currentTarget.setSelectionRange(length, length);
              }}
              required
            />
            <CountrySelect
              label={t("Country", "Pays", "Land", "Pa?s", "Pa?s")}
              value={profileForm.country}
              locale={language}
              required
              onChange={(value) => setProfileForm({ ...profileForm, country: value })}
            />
            <label className="flex flex-col gap-1 text-sm text-foreground">
              {t("Default currency", "Devise par defaut", "Standardwährung", "Moneda predeterminada", "Moeda predefinida")}
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
              label={t("Business email", "Email entreprise", "Unternehmens-E-Mail", "Correo de la empresa", "Email da empresa")}
              type="email"
              value={profileForm.businessEmail}
              onChange={(e) => setProfileForm({ ...profileForm, businessEmail: e.target.value })}
              required
            />
            <PhoneInput
              label={t("Business phone", "T?l?phone entreprise", "Unternehmenstelefon", "Tel?fono de la empresa", "Telefonee da empresa")}
              value={profileForm.businessPhone}
              required
              locale={language}
              onChange={(value) => setProfileForm({ ...profileForm, businessPhone: value })}
            />
            <Input
              label={t("Address line 1", "Adresse ligne 1", "Adresszeile 1", "Linea de direcci?n 1", "Linha de endereco 1")}
              value={profileForm.streetAddress}
              onChange={(e) => setProfileForm({ ...profileForm, streetAddress: e.target.value })}
              required
            />
            <Input
              label={t("Address line 2 (optional)", "Adresse ligne 2 (optionnelle)", "Adresszeile 2 (optional)", "Linea de direcci?n 2 (opcional)", "Linha de endereco 2 (opcional)")}
              value={profileForm.addressLine2}
              onChange={(e) => setProfileForm({ ...profileForm, addressLine2: e.target.value })}
            />
            <Input
              label={t("City", "Ville", "Stadt", "Ciudad", "Cidade")}
              value={profileForm.city}
              onChange={(e) => setProfileForm({ ...profileForm, city: e.target.value })}
              required
            />
            <Input
              label={t("State / Province / Region (optional)", "Etat / province / region (optionnel)", "Bundesland / Region (optional)", "Estado / provincia / region (opcional)", "Estado / provincia / regiao (opcional)")}
              value={profileForm.state}
              onChange={(e) => setProfileForm({ ...profileForm, state: e.target.value })}
            />
            <Input
              label={t("Postal code / ZIP (optional)", "Code postal / ZIP (optionnel)", "Postleitzahl / ZIP (optional)", "Código postal / ZIP (opcional)", "Código postal / ZIP (opcional)")}
              value={profileForm.postalCode}
              onChange={(e) => setProfileForm({ ...profileForm, postalCode: e.target.value })}
            />
            <Input
              label={t("Business registration number (optional)", "Num?ro d immatriculation de l entreprise (optionnel)", "Handelsregisternummer (optional)", "N?mero de registro de la empresa (opcional)", "N?mero de registro da empresa (opcional)")}
              value={profileForm.registrationNumber}
              onChange={(e) => setProfileForm({ ...profileForm, registrationNumber: e.target.value })}
            />
            <Input
              label={t("Branch code (optional)", "Code de succursale (optionnel)", "Filialcode (optional)", "C?digo de sucursal (opcional)", "C?digo da filial (opcional)")}
              value={profileForm.branchCode}
              onChange={(e) => setProfileForm({ ...profileForm, branchCode: e.target.value })}
            />
            <label className="col-span-2 flex flex-col gap-1 text-sm text-foreground max-md:order-9 max-md:col-span-1 md:col-span-1">
              <span className="flex items-center gap-2">
                {m("branding.logo.optional")}
                <span ref={profileLogoInfoRef} className="relative">
                  <button
                    type="button"
                    aria-label={m("branding.logo.uploadInfo")}
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
                    <div>{m("branding.logo.acceptedFormats")}</div>
                    <div>{m("branding.logo.maxSize")}</div>
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
                      alt={m("branding.logo.preview")}
                      className="h-full w-full object-contain"
                    />
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <button
                      type="button"
                      onClick={() => profileLogoInputRef.current?.click()}
                      className="rounded-full border border-border px-3 py-1 text-xs font-semibold text-foreground"
                    >
                      {m("branding.logo.change")}
                    </button>
                    <button
                      type="button"
                      onClick={removeProfileLogo}
                      className="rounded-full border border-border px-3 py-1 text-xs font-semibold text-foreground"
                    >
                      {m("branding.logo.remove")}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </label>
            <div className="space-y-1 max-md:order-8">
              <Input
                label={t("Tax ID (optional)", "ID fiscal (optionnel)", "Steuer-ID (optional)", "ID fiscal (opcional)", "NIF (opcional)")}
                value={profileForm.taxId}
                onChange={(e) => setProfileForm({ ...profileForm, taxId: e.target.value })}
              />
            </div>
            <div className="col-span-2 max-md:col-span-1 max-md:order-9">
              <Button type="submit" className="max-md:w-full">
                {t("Save business profile", "Enregistrer le profil", "Unternehmensprofil speichern", "Guardar perfil de empresa", "Guardar perfil da empresa")}
              </Button>
            </div>
          </form>
        </Card>
      ) : (
        <div className="grid gap-7 sm:grid-cols-[minmax(0,1.2fr)_minmax(240px,0.86fr)] md:gap-8 md:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.92fr)] lg:gap-10 lg:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.95fr)] xl:grid-cols-[minmax(0,1.6fr)_minmax(360px,1fr)]">
          <div className="min-w-0 space-y-6">
            <Card
              title={<span className="text-base font-semibold">{t("Create invoice", "Creer une facture", "Rechnung erstellen", "Crear factura", "Criar fatura")}</span>}
              className="min-w-0 shadow-sm"
            >
              <form className="grid grid-cols-2 gap-x-4 gap-y-8 max-md:grid-cols-1 max-md:gap-4" onSubmit={createInvoice}>
            <Input
              label={t("Invoice number", "Num?ro de facture", "Rechnungsnummer", "N?mero de factura", "N?mero da fatura")}
              value={form.invoiceNumber}
              onChange={(e) => setForm({ ...form, invoiceNumber: e.target.value })}
            />
            <div className="col-span-2 space-y-2 max-md:col-span-1">
              <label className="mb-2 block text-sm font-medium text-foreground">
                {t("Customer", "Client", "Kunde", "Cliente", "Cliente")} *
              </label>
              <div className="space-y-2">
                {selectedCustomer && !customerDropdownOpen ? (
                  <div className="rounded-2xl border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.9))] p-4 shadow-[0_16px_34px_-30px_rgba(15,23,42,0.35)] dark:border-slate-700/80 dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.96),rgba(15,23,42,0.88))] dark:shadow-[0_20px_40px_-30px_rgba(2,6,23,0.95)]">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-950 dark:text-slate-50">{selectedCustomer.name}</p>
                        <p className="mt-1 truncate text-[13px] text-slate-500 dark:text-slate-300">{selectedCustomer.email}</p>
                        {selectedCustomer.phone ? (
                          <p className="mt-1 truncate text-[13px] text-slate-500 dark:text-slate-300">{selectedCustomer.phone}</p>
                        ) : null}
                        {selectedCustomer.taxId ? (
                          <p className="mt-1 truncate text-[13px] text-slate-500 dark:text-slate-300">
                            {t("Tax ID", "ID fiscal", "Steuer-ID", "ID fiscal", "NIF")}: {selectedCustomer.taxId}
                          </p>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="secondary"
                          className="h-9 rounded-full border border-slate-300/90 bg-slate-50 px-4 text-xs font-semibold text-slate-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] hover:bg-slate-100 dark:border-slate-600/80 dark:bg-slate-900 dark:text-slate-100 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] dark:hover:bg-slate-800"
                          onClick={beginCustomerChange}
                        >
                          {m("common.change")}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          className="h-9 rounded-full px-3 text-xs font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-50"
                          onClick={() =>
                            openEditCustomer({
                              customerId: selectedCustomer.id,
                              customer: selectedCustomer,
                              metadata: { customer: selectedCustomer },
                            })
                          }
                        >
                          {t("Edit details", "Modifier", "Bearbeiten", "Editar", "Editar")}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          className="h-9 rounded-full px-3 text-xs font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-50"
                          onClick={openCreateCustomerModal}
                        >
                          {t("New customer", "Nouveau client", "Neuer Kunde", "Nuevo cliente", "Novo cliente")}
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-3 max-sm:flex-col max-sm:items-stretch">
                    <div className="flex-1">
                      <input
                        ref={customerInputRef}
                        placeholder={t("Search and select customer", "Rechercher et selectionner un client", "Kunden suchen und auswählen", "Buscar y seleccionar cliente", "Pesquisar e selecionar cliente")}
                        value={customerQuery}
                        onFocus={() => {
                          setCustomerSkip(0);
                          if (form.customerId && customerQuery.trim() === selectedCustomerLabel) {
                            setDebouncedCustomerQuery("");
                          }
                          setCustomerDropdownOpen(true);
                        }}
                        onBlur={() => setTimeout(() => setCustomerDropdownOpen(false), 120)}
                        onChange={(event) => {
                          const nextQuery = event.target.value;
                          setCustomerQuery(nextQuery);
                          setCustomerSkip(0);
                          setSelectedCustomerSnapshot(null);
                          setForm((prev) => ({ ...prev, customerId: "" }));
                          if (!nextQuery.trim()) {
                            setDebouncedCustomerQuery("");
                          }
                          setCustomerDropdownOpen(true);
                        }}
                        className="h-11 w-full rounded-lg border border-border bg-background px-4 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-400 focus:outline-none"
                      />
                    </div>
                    <Button
                      type="button"
                      variant="secondary"
                      className="h-11 shrink-0 whitespace-nowrap text-muted-foreground max-sm:w-full"
                      onClick={openCreateCustomerModal}
                    >
                      {t("+ Add New Customer", "+ Ajouter client", "+ Neuen Kunden hinzufügen", "+ Anadir cliente", "+ Adicionar cliente")}
                    </Button>
                  </div>
                )}
                {customerDropdownOpen ? (
                  <div className="max-h-60 overflow-y-auto rounded-xl border border-border bg-popover text-popover-foreground shadow-[0_8px_24px_rgba(0,0,0,0.08)] dark:shadow-[0_12px_30px_rgba(0,0,0,0.4)]">
                    {customerItems.length ? (
                      <>
                        {customerItems.map((customer) => (
                          <button
                            key={customer.id}
                            type="button"
                            className="w-full border-b border-border/60 px-4 py-3 text-left transition last:border-b-0 hover:bg-muted"
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => {
                              setSelectedCustomerSnapshot(customer);
                              setForm((prev) => ({ ...prev, customerId: customer.id }));
                              setCustomerQuery(`${customer.name} (${customer.email})`);
                              setDebouncedCustomerQuery("");
                              setCustomerDropdownOpen(false);
                            }}
                          >
                            <div className="flex flex-col gap-0.5">
                              <span className="text-sm font-semibold text-foreground">{customer.name}</span>
                              <span className="text-[13px] text-muted-foreground">{customer.email}</span>
                            </div>
                          </button>
                        ))}
                        {customersData?.hasMore ? (
                          <button
                            type="button"
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => setCustomerSkip((current) => current + 20)}
                            className="m-2 w-[calc(100%-16px)] rounded-lg border border-border px-3 py-2 text-xs font-semibold text-indigo-600 transition hover:bg-indigo-50 dark:text-indigo-300 dark:hover:bg-indigo-500/10"
                          >
                            {t("Load more customers", "Charger plus de clients", "Mehr Kunden laden", "Cargar mas clientes", "Carregar mais clientes")}
                          </button>
                        ) : null}
                      </>
                    ) : (
                      <p className="px-3 py-2 text-xs text-muted-foreground">
                        {t("No customers found.", "Aucun client trouve.", "Keine Kunden gefunden.", "No se encontraron clientes.", "Nenhum cliente encontrado.")}
                      </p>
                    )}
                  </div>
                ) : null}
              </div>
              {!selectedCustomer ? (
                <p className="mt-1.5 text-[13px] text-muted-foreground">
                  {t("Select a customer to continue.", "Sélectionnez un client pour continuer.", "Wähle einen Kunden, um fortzufahren.", "Selecciona un cliente para continuar.", "Selecione um cliente para continuar.")}
                </p>
              ) : null}
            </div>
            <label className="flex flex-col gap-1 text-sm text-foreground">
              {t("Issue date", "Date d emission", "Ausstellungsdatum", "Fecha de emision", "Data de emissao")}
              <input
                type="date"
                value={form.issueDate}
                onChange={(e) => setForm({ ...form, issueDate: e.target.value })}
                className="h-11 w-full rounded-lg border border-input bg-background px-3 text-foreground focus:border-indigo-400 focus:outline-none"
              />
            </label>
            <div className="space-y-2">
              <label className="flex flex-col gap-1 text-sm text-foreground">
                {t("Due date", "Date d echeance", "Falligkeitsdatum", "Fecha de vencimiento", "Data de vencimento")}
                <input
                  type="date"
                  value={form.dueDate}
                  onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
                  className="h-11 w-full rounded-lg border border-input bg-background px-3 text-foreground focus:border-indigo-400 focus:outline-none"
                />
              </label>
              <div className="flex flex-wrap gap-2">
                {[7, 14, 30].map((days) => (
                  <button
                    key={days}
                    type="button"
                    onClick={() => setDueDateFromIssueDate(days)}
                    className="rounded-full border border-border bg-background px-2.5 py-1 text-xs font-medium text-foreground hover:bg-muted/40"
                  >
                    {t(`+${days} days`, `+${days} jours`, `+${days} Tage`, `+${days} dias`, `+${days} dias`)}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                {t("Set when payment is expected.", "Definissez la date de paiement attendue.", "Lege fest, wann die Zahlung erwartet wird.", "Define cuando se espera el pago.", "Defina quando o pagamento e esperado.")}
              </p>
            </div>
            <label className="flex flex-col gap-1 text-sm text-foreground">
              {t("Currency", "Devise", "Währung", "Moneda", "Moeda")}
              <select
                value={form.currency}
                onChange={(e) => {
                  setHasManualCurrencySelection(true);
                  setForm({ ...form, currency: e.target.value });
                }}
                className="h-11 rounded-lg border border-input bg-background px-3 text-foreground focus:border-indigo-400 focus:outline-none"
              >
                {currencyOptions.map((option) => (
                  <option key={option.code} value={option.code}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm text-foreground">
              {m("invoice.buyerType.label")}
              <select
                value={form.buyerType}
                onChange={(e) => {
                  setHasManualBuyerTypeSelection(true);
                  setForm((prev) => ({ ...prev, buyerType: e.target.value as InvoiceBuyerType }));
                }}
                className="h-11 rounded-lg border border-input bg-background px-3 text-foreground focus:border-indigo-400 focus:outline-none"
              >
                <option value="B2C">{m("invoice.buyerType.consumer")}</option>
                <option value="B2B">{m("invoice.buyerType.business")}</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm text-foreground">
              {t("Supply type", "Type de fourniture", "Leistungsart", "Tipo de suministro", "Tipo de fornecimento")}
              <select
                value={form.supplyType}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, supplyType: e.target.value as InvoiceSupplyType }))
                }
                className="h-11 rounded-lg border border-input bg-background px-3 text-foreground focus:border-indigo-400 focus:outline-none"
              >
                <option value="SAAS">{t("SaaS", "SaaS", "SaaS", "SaaS", "SaaS")}</option>
                <option value="SERVICES">{t("Services", "Services", "Dienstleistungen", "Servicios", "Servicos")}</option>
                <option value="GOODS">{t("Goods", "Biens", "Waren", "Bienes", "Bens")}</option>
              </select>
            </label>
            <Input
              label={t("PO number (optional)", "Num?ro BC (optionnel)", "Bestellnummer (optional)", "N?mero de orden de compra (opcional)", "N?mero da ordem de compra (opcional)")}
              value={form.poNumber}
              onChange={(e) => setForm({ ...form, poNumber: e.target.value })}
              placeholder={t("Purchase order", "Bon de commande", "Bestellung", "Orden de compra", "Ordem de compra")}
            />
            <div className="col-span-2 max-md:col-span-1">
              <div className="rounded-2xl border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.92))] p-5 shadow-[0_16px_34px_-30px_rgba(15,23,42,0.35)] dark:border-slate-700/80 dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.96),rgba(15,23,42,0.88))] dark:shadow-[0_20px_40px_-30px_rgba(2,6,23,0.95)]">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-950 dark:text-slate-50">
                      {t("Global compliance preview", "Apercu de conformite globale", "Globale Compliance-Vorschau", "Vista previa de cumplimiento global", "Pre-visualiza??o de conformidade global")}
                    </p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-300">
                      {t(
                        "Region is used for rollout and support. Country still drives the actual invoice rule.",
                        "La region sert au d?ploiement et au support. Le pays definit toujours la regle de facture.",
                        "Die Region dient Rollout und Support. Das Land bestimmt weiterhin die eigentliche Rechnungsregel.",
                        "La region se usa para despliegue y soporte. El pa?s sigue determinando la regla real de la factura.",
                        "A regiao serve para rollout e suporte. O pa?s continua a determinar a regra real da fatura."
                      )}
                    </p>
                  </div>
                  <span className={`rounded-full border px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] ${supportLevelClass(invoiceCompliancePreview.supportLevel)}`}>
                    {supportLevelLabel(invoiceCompliancePreview.supportLevel)}
                  </span>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <div className={compliancePreviewCardClass}>
                    <p className={language === "de" ? compliancePreviewCompactLabelClass : compliancePreviewLabelClass}>
                      {t("Seller region", "Region vendeur", "Verkaufsregion", "Region del vendedor", "Regiao do vendedor")}
                    </p>
                    <p className={compliancePreviewValueClass}>
                      {regionLabel(invoiceCompliancePreview.sellerRegion)}
                    </p>
                  </div>
                  <div className={compliancePreviewCardClass}>
                    <p className={compliancePreviewLabelClass}>
                      {t("Buyer region", "Region acheteur", "Kauferregion", "Region del comprador", "Regiao do comprador")}
                    </p>
                    <p className={compliancePreviewValueClass}>
                      {regionLabel(invoiceCompliancePreview.buyerRegion)}
                    </p>
                  </div>
                  <div className={compliancePreviewCardClass}>
                    <p className={compliancePreviewLabelClass}>
                      {t("Tax system", "Systeme fiscal", "Steuersystem", "Sistema fiscal", "Sistema fiscal")}
                    </p>
                    <p className={compliancePreviewValueClass}>
                      {invoiceCompliancePreview.taxSystem || t("Manual review", "Verification manuelle", "Manuelle Prufung", "Revision manual", "Revisao manual")}
                    </p>
                  </div>
                  <div className={compliancePreviewCardClass}>
                    <p className={compliancePreviewLabelClass}>
                      {t("Tax treatment", "Traitement fiscal", "Besteuerung", "Tratamiento fiscal", "Tratamento fiscal")}
                    </p>
                    <p className={compliancePreviewValueClass}>
                      {invoiceCompliancePreview.reverseChargeApplies
                        ? t("Reverse charge", "Autoliquidation", "Reverse Charge", "Inversion del sujeto pasivo", "Autoliquidacao")
                        : invoiceCompliancePreview.taxTreatment === "MANUAL_REVIEW"
                          ? t("Manual review", "Verification manuelle", "Manuelle Prufung", "Revision manual", "Revisao manual")
                          : t("Standard tax", "Taxe standard", "Standard", "Impuesto estandar", "Imposto padrao")}
                    </p>
                  </div>
                </div>
                {invoiceCompliancePreview.warnings.length ? (
                  <div className="mt-4 rounded-2xl border border-amber-200/80 bg-amber-50/90 p-4 dark:border-amber-400/20 dark:bg-amber-500/10">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-800 dark:text-amber-200">
                      {t("Compliance checks", "Controles de conformite", "Compliance-Prufungen", "Controles de cumplimiento", "Verificacoes de conformidade")}
                    </p>
                    <div className="mt-3 space-y-2">
                      {invoiceCompliancePreview.warnings.map((warning) => (
                        <p key={warning.code} className="text-sm text-amber-900 dark:text-amber-100">
                          {localizedComplianceWarning(warning.code, warning.message)}
                        </p>
                      ))}
                    </div>
                    {form.buyerType === "B2B" &&
                    selectedCustomer &&
                    !String(selectedCustomer.taxId || "").trim() &&
                    invoiceCompliancePreview.warnings.some(
                      (warning) => warning.code === "buyer_tax_id_recommended"
                    ) ? (
                      <div className="mt-4">
                        <Button
                          type="button"
                          variant="secondary"
                          className="h-10 rounded-full border border-amber-300/80 bg-white/90 px-4 text-sm font-semibold text-amber-900 hover:bg-white dark:border-amber-300/20 dark:bg-slate-950/70 dark:text-amber-100 dark:hover:bg-slate-950"
                          onClick={() =>
                            openEditCustomer({
                              customerId: selectedCustomer.id,
                              customer: selectedCustomer,
                              metadata: { customer: selectedCustomer },
                            })
                          }
                        >
                          {t(
                            "Add customer tax ID",
                            "Ajouter l ID fiscal du client",
                            "Steuer-ID des Kunden hinzufugen",
                            "Agregar ID fiscal del cliente",
                            "Adicionar o ID fiscal do cliente"
                          )}
                        </Button>
                      </div>
                    ) : null}
                  </div>
                ) : null}
                {sendBlockingReason ? (
                  <div className="mt-4 rounded-2xl border border-rose-200/80 bg-rose-50/90 p-4 dark:border-rose-400/20 dark:bg-rose-500/10">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-rose-800 dark:text-rose-200">
                      {t("Send blocked", "Envoi bloque", "Senden blockiert", "Envio bloqueado", "Envio bloqueado")}
                    </p>
                    <p className="mt-2 text-sm text-rose-900 dark:text-rose-100">{sendBlockingReason}</p>
                  </div>
                ) : null}
              </div>
            </div>
            <div className="col-span-2 min-w-0 max-md:col-span-1">
              <div className="min-w-0 rounded-2xl border border-border bg-muted/10 p-6">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-base font-semibold text-foreground">{t("Line items", "Articles", "Positionen", "Partidas", "Itens")}</p>
                  <Button
                    type="button"
                    variant="secondary"
                    className="h-11"
                    onClick={() => appendLineItem({ focus: true })}
                  >
                    {t("+ Add item", "+ Ajouter", "+ Position hinzufügen", "+ Anadir item", "+ Adicionar item")}
                  </Button>
                </div>

                <div className="mt-5 border-t border-border/70 pt-5">
                  <div className="space-y-4">
                    {form.items.map((item, index) => {
                      const lineTotalDisplay = formatCurrency(item.quantity * item.price, form.currency);
                      return (
                      <div
                        key={`item-${index}`}
                        className="rounded-2xl border border-border/70 bg-background/70 p-4 shadow-[0_10px_24px_-22px_rgba(15,23,42,0.5)]"
                      >
                        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
                          <label className="flex min-w-0 flex-col gap-1.5 text-sm text-foreground">
                            <span className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                              {t("Description", "Description", "Beschreibung", "Descripcion", "Descricao")}
                            </span>
                            <textarea
                              ref={(node) => {
                                descriptionRefs.current[index] = node;
                                autoResizeDescription(node);
                              }}
                              value={item.name}
                              placeholder={t("Item details", "D?tails de l article", "Artikeldetails", "Detalles del item", "Detalhes do item")}
                              onChange={(e) =>
                                setForm((prev) => {
                                  const next = [...prev.items];
                                  next[index] = { ...next[index], name: e.target.value };
                                  return { ...prev, items: next };
                                })
                              }
                              onKeyDown={(event) => {
                                if (event.key !== "Enter" || event.shiftKey) return;
                                event.preventDefault();
                                const nextIndex = index + 1;
                                if (descriptionRefs.current[nextIndex]) {
                                  descriptionRefs.current[nextIndex]?.focus();
                                  return;
                                }
                                appendLineItem({ focus: true });
                              }}
                              onInput={(event) => autoResizeDescription(event.currentTarget)}
                              rows={1}
                              className="min-h-12 w-full resize-none overflow-hidden rounded-xl border border-border bg-background px-4 py-3 text-base leading-6 text-foreground placeholder:text-muted-foreground focus:border-indigo-400 focus:outline-none"
                            />
                          </label>
                          <div className="flex justify-end lg:pt-7">
                            <button
                              type="button"
                              aria-label={t("Remove line item", "Supprimer la ligne", "Position entfernen", "Eliminar linea", "Remover item")}
                              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-background text-muted-foreground transition hover:border-rose-200 hover:text-rose-600 dark:hover:border-rose-500/40"
                              onClick={() =>
                                setForm((prev) => {
                                  if (prev.items.length === 1) return prev;
                                  const next = prev.items.filter((_, idx) => idx !== index);
                                  return { ...prev, items: next };
                                })
                              }
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </div>

                        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-[88px_minmax(0,1.05fr)_96px_minmax(0,1.15fr)]">
                          <label className="flex min-w-0 flex-col gap-1.5 text-sm text-foreground">
                            <span className="text-center text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                              {t("Qty", "Qt", "Menge", "Cant.", "Qtd.")}
                            </span>
                            <input
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
                              className="h-11 w-full rounded-xl border border-border bg-background px-3 text-center text-foreground focus:border-indigo-400 focus:outline-none"
                            />
                          </label>
                          <label className="flex min-w-0 flex-col gap-1.5 text-sm text-foreground">
                            <span className="text-center text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                              {t("Unit price", "Prix unitaire", "Einzelpreis", "Precio unitario", "Preco unitario")}
                            </span>
                            <input
                              type="number"
                              min={0}
                              step={unitPriceStep}
                              value={editingPriceIndex === index ? priceDraft : String(item.price)}
                              onFocus={() => {
                                setEditingPriceIndex(index);
                                setPriceDraft(item.price === 0 ? "" : String(item.price));
                              }}
                              onChange={(e) => {
                                const nextDraft = sanitizePriceDraft(e.target.value, unitPriceMinorUnits);
                                if (nextDraft === null) return;
                                setEditingPriceIndex(index);
                                setPriceDraft(nextDraft);
                                setForm((prev) => {
                                  const next = [...prev.items];
                                  next[index] = {
                                    ...next[index],
                                    price:
                                      nextDraft === ""
                                        ? 0
                                        : roundPriceToMinorUnits(Number(nextDraft), unitPriceMinorUnits),
                                  };
                                  return { ...prev, items: next };
                                });
                              }}
                              onBlur={() => {
                                const normalizedPrice =
                                  priceDraft === ""
                                    ? 0
                                    : roundPriceToMinorUnits(Number(priceDraft), unitPriceMinorUnits);
                                setForm((prev) => {
                                  const next = [...prev.items];
                                  next[index] = {
                                    ...next[index],
                                    price: normalizedPrice,
                                  };
                                  return { ...prev, items: next };
                                });
                                setEditingPriceIndex((current) => (current === index ? null : current));
                                setPriceDraft("");
                              }}
                              className="h-11 w-full rounded-xl border border-border bg-background px-3 text-foreground focus:border-indigo-400 focus:outline-none"
                            />
                          </label>
                          <div className="min-w-0 space-y-1.5">
                            <p className="text-center text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                              {t("VAT", "TVA", "MwSt.", "IVA", "IVA")}
                            </p>
                            <div className="flex h-11 items-center justify-center rounded-xl border border-border bg-background px-3 text-sm font-semibold text-foreground">
                              {showDraftTax
                                ? `${draftVatRateLabel}%`
                                : "-"}
                            </div>
                          </div>
                          <div className="min-w-0 space-y-1.5">
                            <p className="text-center text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                              {t("Line total", "Total ligne", "Positionssumme", "Total de linea", "Total da linha")}
                            </p>
                            <div
                              className="flex min-h-11 items-center justify-center overflow-hidden whitespace-nowrap rounded-xl border border-border bg-muted/40 px-3 py-2 text-center font-semibold tabular-nums leading-none text-foreground"
                              style={getSingleLineAmountStyle(lineTotalDisplay, 1.1, 0.68, 10, 0.08)}
                            >
                              {lineTotalDisplay}
                            </div>
                          </div>
                        </div>
                      </div>
                    )})}
                  </div>
                </div>

                <div className="mt-6 flex justify-end border-t border-border/70 pt-5">
                  <div className="w-full max-w-[440px] rounded-xl border border-border bg-muted/30 p-6 text-sm text-foreground">
                    <div className="space-y-3">
                    <div className="flex items-start justify-between gap-4">
                      <span className="text-sm font-medium text-muted-foreground">{t("Subtotal", "Sous-total", "Zwischensumme", "Subtotal", "Subtotal")}</span>
                      <span className="min-w-0 max-w-[65%] text-right text-sm font-medium tabular-nums leading-tight text-muted-foreground break-all">
                        {formatCurrencyWithCode(draftTotals.subtotal, form.currency)}
                      </span>
                    </div>
                    {showDraftTax ? (
                      <div className="flex items-start justify-between gap-4">
                        <span className="text-sm font-medium text-muted-foreground">
                          {t("VAT", "TVA", "MwSt.", "IVA", "IVA")} ({draftVatRateLabel}%)
                        </span>
                        <span className="min-w-0 max-w-[65%] text-right text-sm font-medium tabular-nums leading-tight text-muted-foreground break-all">
                          {formatCurrencyWithCode(draftTotals.taxAmount, form.currency)}
                        </span>
                      </div>
                    ) : null}
                    <div className="flex items-start justify-between gap-4 border-t border-border/70 pt-3">
                      <span className="text-[1.15rem] font-bold text-foreground">{t("Total Due", "Total du", "Gesamtbetrag fallig", "Total adeudado", "Total em divida")}</span>
                      <span
                        className={getSingleLineAmountClass(
                          formattedDraftTotalWithCode,
                          "min-w-0 max-w-[70%] overflow-hidden whitespace-nowrap text-right font-bold tabular-nums leading-none text-foreground"
                        )}
                        style={getSingleLineAmountStyle(formattedDraftTotalWithCode, 1.6, 0.72, 12, 0.085)}
                      >
                        {formattedDraftTotalWithCode}
                      </span>
                    </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
                <div className="col-span-2 max-md:col-span-1">
                  <Textarea
                    label={t("Note to customer (optional)", "Note au client (optionnel)", "Notiz für den Kunden (optional)", "Nota para el cliente (opcional)", "Nota para o cliente (opcional)")}
                    value={form.note}
                    onChange={(e) => setForm({ ...form, note: e.target.value })}
                  />
                </div>
                <div className="col-span-2 max-md:col-span-1">
                  <div className="overflow-hidden rounded-[28px] border border-slate-200/80 bg-white/95 shadow-[0_26px_60px_-42px_rgba(15,23,42,0.45)] backdrop-blur-sm dark:border-slate-700/80 dark:bg-slate-950/90 dark:shadow-[0_32px_70px_-42px_rgba(2,6,23,0.9)]">
                    <div className="flex flex-wrap items-start justify-between gap-4 px-6 py-6">
                      <div className="flex min-w-0 items-start gap-4">
                        <div className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-700 shadow-[0_18px_32px_-24px_rgba(79,70,229,0.65)] ring-1 ring-white/70 dark:bg-indigo-500/15 dark:text-indigo-200 dark:ring-indigo-400/20">
                          <Paperclip className="h-5 w-5" />
                        </div>
                        <div className="min-w-0 space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-[0.7rem] font-semibold uppercase tracking-[0.22em] text-indigo-600/80 dark:text-indigo-300/90">
                              {t("Delivery package", "Pack d envoi", "Versandpaket", "Paquete de entrega", "Pacote de entrega")}
                            </p>
                            <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                              {t("Optional", "Optionnel", "Optional", "Opcional", "Opcional")}
                            </span>
                          </div>
                          <p className="text-lg font-semibold tracking-tight text-slate-950 dark:text-slate-50">
                            {t("Supporting files", "Fichiers d accompagnement", "Begleitdateien", "Archivos adjuntos", "Ficheiros de apoio")}
                          </p>
                          <p className="max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-300">
                            {t(
                              "Attach up to 5 JPG, PNG, or PDF files to send alongside the invoice PDF. These files are delivered with the invoice package, but never appear on the invoice itself.",
                              "Ajoutez jusqu a 5 fichiers JPG, PNG, ou PDF a envoyer avec le PDF de la facture. Ces fichiers sont transmis avec l envoi, mais n apparaissent jamais sur la facture elle-meme.",
                              "Füge bis zu 5 JPG-, PNG- oder PDF-Dateien hinzu, die zusammen mit dem Rechnungs-PDF gesendet werden. Diese Dateien werden mit dem Rechnungspaket zugestellt, erscheinen aber nie auf der Rechnung selbst.",
                              "Adjunta hasta 5 archivos JPG, PNG o PDF para enviarlos junto con el PDF de la factura. Estos archivos se entregan con el paquete de factura, pero nunca aparecen en la factura.",
                              "Anexa at? 5 ficheiros JPG, PNG ou PDF para enviar com o PDF da fatura. Estes ficheiros s?o entregues com o pacote da fatura, mas nunca aparecem na pr?pria fatura."
                            )}
                          </p>
                        </div>
                      </div>
                      <input
                        ref={supportingFilesInputRef}
                        type="file"
                        multiple
                        accept=".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf"
                        className="hidden"
                        onChange={(event) => handleSupportingFilesSelect(event.target.files)}
                      />
                      <Button
                        type="button"
                        className="h-12 rounded-2xl border border-indigo-400/25 bg-[linear-gradient(135deg,#6657ff_0%,#5547f0_48%,#4338ca_100%)] px-5 text-[15px] font-semibold text-white shadow-[0_24px_54px_-24px_rgba(79,70,229,0.9)] ring-1 ring-white/10 hover:bg-[linear-gradient(135deg,#7163ff_0%,#5f51f4_48%,#4b3fd4_100%)]"
                        onClick={() => supportingFilesInputRef.current?.click()}
                      >
                        <Paperclip className="mr-2 h-4 w-4" />
                      {supportingFiles.length > 0
                          ? t("Add more files", "Ajouter d autres fichiers", "Weitere Dateien hinzufügen", "Anadir mas archivos", "Adicionar mais ficheiros")
                          : t("Add supporting files", "Ajouter des fichiers", "Begleitdateien hinzufügen", "Anadir archivos adjuntos", "Adicionar ficheiros de apoio")}
                      </Button>
                    </div>
                    {supportingFiles.length > 0 ? (
                      <div className="border-t border-slate-200/80 bg-slate-50/80 px-6 py-5 dark:border-slate-700/80 dark:bg-slate-900/50">
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <p className="text-[0.72rem] font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
                            {t("Attached now", "Ajoutes", "Jetzt angehangt", "Adjuntados ahora", "Anexados agora")}
                          </p>
                          <span className="rounded-full bg-slate-900 px-2.5 py-1 text-[0.68rem] font-semibold text-white dark:bg-slate-100 dark:text-slate-900">
                            {supportingFiles.length}/{MAX_INVOICE_SUPPORTING_FILES}
                          </span>
                        </div>
                        <div className="space-y-2">
                        {supportingFiles.map((file) => (
                          <div
                            key={`${file.name}-${file.size}-${file.lastModified}`}
                            className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-white px-4 py-3.5 shadow-[0_16px_28px_-24px_rgba(15,23,42,0.4)] dark:border-slate-700/80 dark:bg-slate-950 dark:shadow-[0_18px_34px_-28px_rgba(2,6,23,0.95)]"
                          >
                            <div className="flex min-w-0 items-center gap-3">
                              <div className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600 ring-1 ring-white dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700">
                                <Paperclip className="h-4 w-4" />
                              </div>
                              <div className="min-w-0">
                                <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{file.name}</p>
                                <p className="text-xs text-slate-500 dark:text-slate-400">{formatFileSize(file.size)}</p>
                              </div>
                            </div>
                            <button
                              type="button"
                              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400 dark:hover:border-rose-500/40 dark:hover:bg-rose-500/10 dark:hover:text-rose-300"
                              aria-label={t("Remove file", "Supprimer le fichier", "Datei entfernen", "Eliminar archivo", "Remover ficheiro")}
                              onClick={() => {
                                setSupportingFiles((current) =>
                                  current.filter(
                                    (entry) =>
                                      !(
                                        entry.name === file.name &&
                                        entry.size === file.size &&
                                        entry.lastModified === file.lastModified
                                      )
                                  )
                                );
                                setSupportingFilesError(null);
                              }}
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        ))}
                        </div>
                      </div>
                    ) : null}
                    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200/80 bg-slate-50/85 px-6 py-4 text-xs dark:border-slate-700/80 dark:bg-slate-900/80">
                      <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300">
                        {t("Maximum 5 files, 5MB each.", "Maximum 5 fichiers, 5 Mo chacun.", "Maximal 5 Dateien, je 5 MB.", "Maximo 5 archivos, 5 MB cada uno.", "Maximo de 5 ficheiros, 5 MB cada um.")}
                      </span>
                      <span className="rounded-full border border-indigo-200/80 bg-indigo-50 px-3 py-1.5 font-semibold text-indigo-700 dark:border-indigo-400/30 dark:bg-indigo-500/12 dark:text-indigo-200">
                        {selectedCustomer?.deliveryPreference === "WHATSAPP"
                          ? t(
                              "Delivered by WhatsApp document messages.",
                              "Envoyes via des documents WhatsApp.",
                              "Wird per WhatsApp-Dokumentnachricht zugestellt.",
                              "Se entrega mediante mensajes de documento de WhatsApp.",
                              "Entregue por mensagens de documento do WhatsApp."
                            )
                          : selectedCustomer?.deliveryPreference === "BOTH"
                            ? t("Delivered by email and WhatsApp.", "Envoyes par email et WhatsApp.", "Wird per E-Mail und WhatsApp zugestellt.", "Se entrega por correo y WhatsApp.", "Entregue por email e WhatsApp.")
                            : t("Delivered with the invoice email.", "Envoyes avec l email de facture.", "Wird mit der Rechnungs-E-Mail zugestellt.", "Se entrega con el correo de la factura.", "Entregue com o email da fatura.")}
                      </span>
                    </div>
                    {supportingFilesError ? (
                      <p className="px-6 pb-5 pt-4 text-sm font-medium text-rose-600">{supportingFilesError}</p>
                    ) : null}
                  </div>
                </div>
              </form>
            </Card>

            <div className="mt-8 border-t border-border/70 pt-5">
              {invoiceActionStatus ? (
                <div className="mb-4">
                  <TransientAlert
                    variant={invoiceActionStatus.variant}
                    onDismiss={() => setInvoiceActionStatus(null)}
                    className="rounded-2xl"
                  >
                    {invoiceActionStatus.message}
                  </TransientAlert>
                </div>
              ) : null}
              <div className="flex flex-wrap items-center justify-between gap-5 px-1 py-1">
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="inline-flex items-center rounded-full border border-indigo-200/80 bg-indigo-50 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-indigo-700 dark:border-indigo-400/20 dark:bg-indigo-500/10 dark:text-indigo-200">
                          {t("Final step", "Etape finale", "Letzter Schritt", "Paso final", "Etapa final")}
                  </div>
                  <div className="space-y-1">
                    <p className="text-lg font-semibold tracking-tight text-slate-950 dark:text-slate-50">
                            {t("Finalize this invoice", "Finaliser cette facture", "Diese Rechnung abschliessen", "Finalizar esta factura", "Finalizar esta fatura")}
                    </p>
                    <p className="max-w-xl text-sm leading-6 text-slate-600 dark:text-slate-300">
                      {t(
                        "Save it as a draft for later or send it now to your customer.",
                        "Enregistrez-la en brouillon pour plus tard ou envoyez-la maintenant a votre client.",
                        "Speichere sie als Entwurf für spater oder sende sie jetzt an deinen Kunden.",
                        "Guardala como borrador para mas tarde o enviala ahora a tu cliente.",
                        "Guarde-a como rascunho para mais tarde ou envie-a agora ao seu cliente."
                      )}
                    </p>
                  </div>
                </div>
                <div className="ml-auto flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
                  <Button
                    type="button"
                    variant="secondary"
                    className="h-12 rounded-2xl border border-slate-300/90 bg-slate-50 px-6 text-[0.95rem] font-semibold text-slate-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] dark:hover:bg-slate-800 sm:min-w-[148px]"
                    loading={submittingInvoiceStatus === "DRAFT"}
                    disabled={submittingInvoiceStatus !== null}
                    onClick={() => createInvoiceWithStatus("DRAFT")}
                  >
                            {t("Save Draft", "Enregistrer brouillon", "Entwurf speichern", "Guardar borrador", "Guardar rascunho")}
                  </Button>
                  <Button
                    type="button"
                    className="h-12 rounded-2xl bg-[linear-gradient(135deg,#6657ff_0%,#5547f0_48%,#4338ca_100%)] px-7 text-[0.95rem] font-semibold text-white shadow-[0_24px_50px_-24px_rgba(79,70,229,0.9)] ring-1 ring-white/10 hover:bg-[linear-gradient(135deg,#7163ff_0%,#5f51f4_48%,#4b3fd4_100%)] dark:shadow-[0_28px_56px_-26px_rgba(79,70,229,0.82)] sm:min-w-[184px]"
                    loading={submittingInvoiceStatus === "SENT"}
                    disabled={submittingInvoiceStatus !== null || Boolean(sendBlockingReason)}
                    onClick={() => createInvoiceWithStatus("SENT")}
                  >
                            {t("Save & Send", "Enregistrer et envoyer", "Speichern und senden", "Guardar y enviar", "Guardar e enviar")}
                  </Button>
                </div>
              </div>
            </div>

          </div>

          <Card
              title={<span className="text-[1.02rem] font-semibold tracking-tight">{t("Live invoice preview", "Apercu en direct", "Live-Rechnungsvorschau", "Vista previa de la factura", "Pre-visualiza??o da fatura")}</span>}
            className="h-fit shadow-sm sm:sticky sm:top-20 sm:self-start md:top-24"
          >
            <p className="mb-5 text-[0.78rem] font-medium tracking-[0.01em] text-muted-foreground">
                    {t("Preview updates as you edit.", "L’aperçu se met à jour en direct.", "Die Vorschau wird während der Bearbeitung aktualisiert.", "La vista previa se actualiza mientras editas.", "A pré-visualização atualiza enquanto edita.")}
            </p>
            <div className="overflow-hidden rounded-[28px] border border-slate-200/80 bg-white/95 shadow-[0_26px_60px_-42px_rgba(15,23,42,0.25)] dark:border-slate-700/80 dark:bg-slate-950/90 dark:shadow-[0_32px_70px_-42px_rgba(2,6,23,0.8)]">
              <InvoicePreview
                invoiceNumber={form.invoiceNumber.trim() || suggestedInvoiceNumber}
                poNumber={form.poNumber.trim() || undefined}
                status={form.status}
                issuedAt={previewIssueDate}
                dueDate={previewDueDate}
                currency={form.currency}
                items={form.items.map((item) => ({
                    name: item.name.trim() || t("Untitled item", "Article sans nom", "Unbenannter Artikel", "Item sin nombre", "Item sem nome"),
                  quantity: item.quantity,
                  price: item.price,
                }))}
                totals={draftTotals}
                totalDue={draftTotals.total}
                paymentLink="#"
                logoDataUrl={businessProfile?.data?.logoUrl || null}
                business={{
                  businessName: previewBusinessName,
                  country: businessProfile?.data?.country || null,
                  businessAddress: previewBusinessAddress || null,
                  businessEmail: businessProfile?.data?.businessEmail || null,
                  businessPhone: businessProfile?.data?.businessPhone || null,
                  taxId: businessProfile?.data?.taxId || null,
                  vatRateDisplay: businessProfile?.data?.vatRateDisplay || null,
                }}
                billTo={
                  selectedCustomer
                    ? {
                        name: selectedCustomer.name || null,
                        email: selectedCustomer.email || null,
                        address: previewBillToAddress || null,
                        companyName: null,
                        taxId: selectedCustomer.taxId || null,
                      }
                    : {
                          name: t("Customer name", "Nom du client", "Kundenname", "Nombre del cliente", "Nome do cliente"),
                        email: null,
                        address: null,
                        companyName: null,
                        taxId: null,
                      }
                }
                note={form.note.trim() || null}
                compliance={invoiceCompliancePreview}
                variant="compact"
              />
            </div>
          </Card>
        </div>
      )}
      <Card
        id="invoice-history"
        title={<span className="text-base font-semibold">{t("History", "Historique", "Verlauf", "Historial", "Histórico")}</span>}
        actions={
          <div className="flex flex-wrap items-center gap-3">
            <input
              suppressHydrationWarning
              placeholder={t("Search invoices", "Rechercher des factures", "Rechnungen suchen", "Buscar facturas", "Pesquisar faturas")}
              className="w-56 rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground max-md:w-full"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setInvoicePage(0);
              }}
            />
          </div>
        }
      >
        {invoicesError && (
          <Alert variant="error">
            {(typeof (invoicesError as any)?.data?.reason === "string" &&
              localizeInvoiceServerMessage((invoicesError as any).data.reason, t)) ||
              (typeof (invoicesError as any)?.data?.error === "string" &&
                localizeInvoiceServerMessage((invoicesError as any).data.error, t)) ||
              t(
                "Unable to load invoices.",
                "Impossible de charger les factures.",
                "Rechnungen konnten nicht geladen werden.",
                "No se pudieron cargar las facturas.",
                "Não foi poss?vel carregar as faturas."
              )}
          </Alert>
        )}
        {showEmptyState ? (
          <EmptyState
            title={t("No invoices yet", "Aucune facture", "Noch keine Rechnungen", "Todavia no hay facturas", "Ainda não existem faturas")}
            description={t("Create your first invoice and it will appear here.", "Cr?ez votre premiere facture ici.", "Erstelle deine erste Rechnung und sie erscheint hier.", "Crea tu primera factura y aparecera aqui.", "Crie a sua primeira fatura e ela aparecera aqui.")}
            actionLabel={t("Create invoice", "Creer une facture", "Rechnung erstellen", "Crear factura", "Criar fatura")}
            onAction={scrollToCreate}
          />
        ) : (
          <div className="space-y-4">
            <Table
              data={filteredInvoices}
              keyExtractor={(row: any) => row.id || row.invoiceNumber}
              columns={[
              { key: "invoiceNumber", label: t("Invoice Number", "Num?ro de facture", "Rechnungsnummer", "N?mero de factura", "N?mero da fatura"), align: "left" },
              {
                key: "customer",
                label: t("Customer", "Client", "Kunde", "Cliente", "Cliente"),
                align: "center",
                render: (row: any) =>
                  String(
                    row?.invoiceCustomerSnapshot?.name ||
                      row?.customer?.name ||
                      row?.metadata?.customer?.name ||
                      "--"
                  ),
              },
              {
                key: "currency",
                label: t("Currency", "Devise", "Währung", "Moneda", "Moeda"),
                align: "center",
                render: (row: any) => String(row.currency || "").toUpperCase(),
              },
              {
                key: "status",
                label: t("Status", "Statut", "Status", "Estado", "Estado"),
                align: "center",
                render: (row: any) => (
                  <span
                    className={`inline-flex min-w-[84px] items-center justify-center rounded-full border px-2.5 py-1 text-xs font-semibold uppercase tracking-wide ${statusBadgeClass(
                      String(row?.displayStatus || row?.status || "")
                    )}`}
                  >
                    {translateStatus(getDisplayStatus(row?.displayStatus || row?.status || ""))}
                  </span>
                ),
              },
              {
                key: "compliance",
                label: t("Compliance", "Conformite", "Compliance", "Cumplimiento", "Conformidade"),
                align: "center",
                render: (row: any) => {
                  const badge = resolveComplianceBadge(row);
                  return (
                    <span
                      className={`inline-flex min-w-[84px] items-center justify-center rounded-full border px-2.5 py-1 text-xs font-semibold uppercase tracking-wide ${complianceBadgeClass(
                        badge.variant
                      )}`}
                    >
                      {badge.label}
                    </span>
                  );
                },
              },
              {
                key: "total",
                label: t("Total", "Total", "Gesamt", "Total", "Total"),
                align: "center",
                render: (row: any) => formatCurrency(Number(row.total || 0), row.currency),
              },
              {
                key: "id",
                label: t("Actions", "Actions", "Aktionen", "Acciones", "Ações"),
                align: "center",
                render: (row: any) => {
                  const invoiceId = row?.id ?? row?.invoiceNumber;
                  const invoiceNumber = row?.invoiceNumber ? String(row.invoiceNumber) : "";
                  const detailHref = invoiceId
                    ? `/dashboard/invoices/view?id=${encodeURIComponent(String(invoiceId))}${
                        invoiceNumber ? `&n=${encodeURIComponent(invoiceNumber)}` : ""
                      }`
                    : "";
                  const isDraft = String(row?.status || "").toUpperCase() === "DRAFT";
                  const menuOpen = openInvoiceMenuId === String(row?.id || "");
                  return (
                    <div className="flex items-center justify-center gap-2 whitespace-nowrap">
                      {invoiceId && detailHref ? (
                        <Link
                          href={detailHref}
                          className="inline-flex h-9 items-center gap-2 rounded-full border border-indigo-200/80 bg-indigo-50/80 px-3.5 text-sm font-semibold text-indigo-700 shadow-[0_12px_30px_-24px_rgba(79,70,229,0.85)] transition hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-800"
                        >
                          <Eye className="h-4 w-4" />
                          {t("View", "Voir", "Ansehen", "Ver", "Ver")}
                        </Link>
                      ) : (
                        <span className="text-sm font-medium text-muted-foreground">{t("View", "Voir", "Ansehen", "Ver", "Ver")}</span>
                      )}
                      {isDraft ? (
                        <div data-invoice-menu className={`relative ${menuOpen ? "z-30" : ""}`}>
                          <button
                            type="button"
                            className={`inline-flex h-9 w-9 items-center justify-center rounded-full border transition ${
                              menuOpen
                                ? "border-slate-400 bg-slate-900 text-white shadow-[0_14px_30px_-18px_rgba(15,23,42,0.8)]"
                                : "border-border/80 bg-white text-slate-600 shadow-[0_12px_24px_-24px_rgba(15,23,42,0.85)] hover:border-slate-400 hover:bg-slate-50 hover:text-slate-900"
                            }`}
                            onClick={() =>
                              setOpenInvoiceMenuId((prev) =>
                                prev === String(row?.id || "") ? null : String(row?.id || "")
                              )
                            }
                            aria-expanded={menuOpen}
                            aria-haspopup="menu"
                            aria-label={t("Draft actions", "Actions du brouillon", "Entwurfsaktionen", "Acciones del borrador", "Ações do rascunho")}
                          >
                            <MoreHorizontal className="h-4.5 w-4.5" />
                          </button>
                          {menuOpen ? (
                            <div
                              role="menu"
                              className="absolute bottom-full right-0 z-40 mb-2 w-56 rounded-[1.35rem] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.96))] p-2 shadow-[0_28px_65px_-32px_rgba(15,23,42,0.55)] backdrop-blur"
                            >
                              <p className="px-3 pb-2 pt-1 text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-slate-500">
                                {t("Draft actions", "Actions du brouillon", "Entwurfsaktionen", "Acciones del borrador", "Ações do rascunho")}
                              </p>
                              <button
                                type="button"
                                role="menuitem"
                                onClick={() => {
                                  setOpenInvoiceMenuId(null);
                                  openEditCustomer(row);
                                }}
                                className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-100/90"
                              >
                                <span className="inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
                                  <PencilLine className="h-4 w-4" />
                                </span>
                                {t("Edit draft", "Modifier", "Entwurf bearbeiten", "Editar borrador", "Editar rascunho")}
                              </button>
                              <button
                                type="button"
                                role="menuitem"
                                onClick={() => {
                                  setOpenInvoiceMenuId(null);
                                  sendDraft(row);
                                }}
                                disabled={sendingId === row?.id || deletingInvoiceId === row?.id}
                                className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-sm font-medium text-emerald-700 transition hover:bg-emerald-50 disabled:opacity-50"
                              >
                                <span className="inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
                                  <Send className="h-4 w-4" />
                                </span>
                                {sendingId === row?.id ? t("Sending...", "Envoi...", "Wird gesendet...", "Enviando...", "A enviar...") : t("Send now", "Envoyer", "Jetzt senden", "Enviar ahora", "Enviar agora")}
                              </button>
                              <button
                                type="button"
                                role="menuitem"
                                onClick={() => {
                                  setOpenInvoiceMenuId(null);
                                  openDeleteDraftModal(row);
                                }}
                                disabled={deletingInvoiceId === row?.id || sendingId === row?.id}
                                className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-sm font-medium text-rose-700 transition hover:bg-rose-50 disabled:opacity-50"
                              >
                                <span className="inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-rose-50 text-rose-700">
                                  <Trash2 className="h-4 w-4" />
                                </span>
                                {deletingInvoiceId === row?.id
                                  ? t("Deleting...", "Suppression...", "Wird gelöscht...", "Eliminando...", "A eliminar...")
                                  : t("Delete draft", "Supprimer", "Entwurf l?schen", "Eliminar borrador", "Eliminar rascunho")}
                              </button>
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                      {false ? (
                        <>
                          <span className="text-muted-foreground">·</span>
                          <button
                            type="button"
                            onClick={() => openEditCustomer(row)}
                            className="text-sm font-medium text-slate-600 hover:text-slate-700"
                          >
                            {t("Edit", "Modifier", "Bearbeiten", "Editar", "Editar")}
                          </button>
                          <span className="text-muted-foreground">·</span>
                          <button
                            type="button"
                            onClick={() => sendDraft(row)}
                            disabled={sendingId === row?.id || deletingInvoiceId === row?.id}
                            className="text-sm font-medium text-emerald-700 hover:text-emerald-600 disabled:opacity-50"
                          >
                            {sendingId === row?.id ? t("Sending...", "Envoi...", "Wird gesendet...", "Enviando...", "A enviar...") : t("Send", "Envoyer", "Senden", "Enviar", "Enviar")}
                          </button>
                          <span className="text-muted-foreground">·</span>
                          <button
                            type="button"
                            onClick={() => openDeleteDraftModal(row)}
                            disabled={deletingInvoiceId === row?.id || sendingId === row?.id}
                            className="text-sm font-medium text-rose-700 hover:text-rose-600 disabled:opacity-50"
                          >
                            {deletingInvoiceId === row?.id ? t("Deleting...", "Suppression...", "Wird gelöscht...", "Eliminando...", "A eliminar...") : t("Delete", "Supprimer", "L?schen", "Eliminar", "Eliminar")}
                          </button>
                        </>
                      ) : null}
                    </div>
                  );
                },
              },
              ]}
            />
            {totalInvoicePages > 1 ? (
              <div className="flex flex-col gap-3 border-t border-border/70 pt-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 flex-wrap items-center gap-3">
                  <p className="text-sm font-medium text-foreground">{invoiceHistorySummaryLabel}</p>
                  <span className="inline-flex items-center rounded-full border border-border bg-muted/25 px-3 py-1 text-[0.72rem] font-semibold text-muted-foreground">
                    {t(
                      `${pagedInvoiceTotal} total`,
                      `${pagedInvoiceTotal} total`
                    )}
                  </span>
                </div>
                <div className="inline-flex items-center gap-2 self-start sm:self-auto">
                  <button
                    type="button"
                    onClick={() => setInvoicePage((prev) => Math.max(0, prev - 1))}
                    disabled={!canGoToPreviousPage}
                    aria-label={t("Previous page", "Page précédente", "Vorherige Seite", "P?gina anterior", "P?gina anterior")}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border bg-background text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <div className="min-w-[88px] text-center text-sm font-semibold tabular-nums text-foreground">
                    {currentInvoicePage}/{totalInvoicePages}
                  </div>
                  <button
                    type="button"
                    onClick={() => setInvoicePage((prev) => prev + 1)}
                    disabled={!canGoToNextPage}
                    aria-label={t("Next page", "Page suivante", "Nächste Seite", "P?gina siguiente", "P?gina seguinte")}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border bg-background text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        )}
      </Card>

      <Modal
        open={Boolean(deleteCandidate)}
        onClose={() => {
          if (deletingInvoiceId) return;
          setDeleteCandidate(null);
        }}
        hideHeader
      >
        <div className="space-y-5">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-2">
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-rose-700/80">
                {t("Permanent action", "Action permanente", "Dauerhafte Aktion", "Acción permanente", "Ação permanente")}
              </p>
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[linear-gradient(160deg,#ff3b6b,#e11d48)] text-white shadow-[0_16px_35px_-18px_rgba(225,29,72,0.9)]">
                  <Trash2 className="h-4.5 w-4.5" />
                </div>
                <div>
                  <p className="text-[1.55rem] font-semibold leading-tight text-foreground">
                    {t("Delete draft invoice?", "Supprimer le brouillon ?", "Entwurfsrechnung l?schen?", "Eliminar factura en borrador?", "Eliminar fatura em rascunho?")}
                  </p>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    {t(
                      "This removes the draft permanently from your invoice history.",
                      "Cette action supprime definitivement le brouillon de votre historique.",
                      "Dadurch wird der Entwurf dauerhaft aus deinem Rechnungsverlauf entfernt.",
                      "Esto elimina el borrador de forma permanente del historial de facturas.",
                      "Isto remove permanentemente o rascunho do histórico de faturas."
                    )}
                  </p>
                </div>
              </div>
            </div>
            <button
              type="button"
              aria-label={t("Close", "Fermer", "Schlie?en", "Cerrar", "Fechar")}
              onClick={() => {
                if (deletingInvoiceId) return;
                setDeleteCandidate(null);
              }}
              className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-border/70 bg-background text-muted-foreground transition hover:text-foreground"
            >
              <X className="h-4.5 w-4.5" />
            </button>
          </div>

          <div className="rounded-[1.5rem] border border-border/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.92))] p-5 shadow-[0_18px_40px_-34px_rgba(15,23,42,0.4)]">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                {t("Draft summary", "Resume du brouillon", "Entwurfszusammenfassung", "Resumen del borrador", "Resumo do rascunho")}
              </p>
              <div className="rounded-full border border-rose-200/80 bg-rose-50 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-rose-700">
                {t("Draft only", "Brouillon", "Nur Entwurf", "Solo borrador", "Apenas rascunho")}
              </div>
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
              <div className="min-w-0">
                <p className="truncate text-[1.15rem] font-semibold tracking-tight text-foreground">
                  {String(deleteCandidate?.invoiceNumber || t("Draft invoice", "Brouillon", "Entwurfsrechnung", "Factura en borrador", "Fatura em rascunho"))}
                </p>
                <p className="mt-1 truncate text-sm text-muted-foreground">
                  {String(
                    deleteCandidate?.invoiceCustomerSnapshot?.name ||
                      deleteCandidate?.customer?.name ||
                      deleteCandidate?.metadata?.customer?.name ||
                      "--"
                  )}
                </p>
              </div>
              <p className="text-xs font-medium text-muted-foreground">
                {t("This action cannot be undone.", "Cette action est irreversible.", "Diese Aktion kann nicht ruckgangig gemacht werden.", "Esta acción no se puede deshacer.", "Esta ação não pode ser desfeita.")}
              </p>
            </div>
          </div>

          <div className="flex flex-col-reverse gap-3 border-t border-border/60 pt-4 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="secondary"
              className="h-11 sm:min-w-[130px]"
              disabled={Boolean(deletingInvoiceId)}
              onClick={() => setDeleteCandidate(null)}
            >
              {t("Cancel", "Annuler", "Abbrechen", "Cancelar", "Cancelar")}
            </Button>
            <Button
              type="button"
              variant="danger"
              className="h-11 sm:min-w-[170px]"
              loading={Boolean(deletingInvoiceId)}
              onClick={confirmDeleteDraft}
            >
              {t("Delete Draft", "Supprimer le brouillon", "Entwurf l?schen", "Eliminar borrador", "Eliminar rascunho")}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={customerModalOpen}
        onClose={() => setCustomerModalOpen(false)}
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
                  {t("Add New Customer", "Ajouter un client", "Neuen Kunden hinzufügen", "Anadir cliente", "Adicionar cliente")}
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                    {t(
                      "Create a complete customer record for invoices and payment follow-up.",
                      "Cr?ez une fiche client complete pour la facturation et le suivi des paiements.",
                      "Erstelle einen vollständigen Kundendatensatz für Rechnungen und Zahlungsnachverfolgung.",
                      "Crea un registro completo del cliente para facturas y seguimiento de pagos.",
                      "Crie um registo completo do cliente para faturas e acompanhamento de pagamentos."
                    )}
                </p>
              </div>
            </div>
            <button
              type="button"
              aria-label={t("Close", "Fermer", "Schlie?en", "Cerrar", "Fechar")}
              onClick={() => setCustomerModalOpen(false)}
              className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-border/70 bg-white/85 text-muted-foreground shadow-[0_18px_36px_-30px_rgba(15,23,42,0.55)] transition hover:border-slate-300 hover:text-foreground dark:border-slate-700 dark:bg-slate-900/90 dark:text-slate-300 dark:shadow-[0_18px_36px_-30px_rgba(0,0,0,0.8)] dark:hover:border-slate-500 dark:hover:text-slate-100"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <form
          className="grid grid-cols-1 gap-x-5 gap-y-5 px-6 py-5 text-foreground dark:[color-scheme:dark] dark:text-slate-100 lg:grid-cols-2"
          onSubmit={createCustomerInline}
        >
          <div>
            <Input
              className="h-12 rounded-2xl border-border/80 bg-white/85 px-4 text-[15px] leading-tight shadow-[0_10px_24px_-22px_rgba(15,23,42,0.45)] dark:border-slate-700 dark:bg-slate-900/95 dark:text-slate-100 dark:placeholder:text-slate-400 dark:shadow-[0_14px_28px_-24px_rgba(0,0,0,0.75)]"
              label={t("Name", "Nom", "Name", "Nombre", "Nome")}
              value={newCustomerForm.name}
              onChange={(event) => setNewCustomerForm((prev) => ({ ...prev, name: event.target.value }))}
              style={getAdaptiveInputStyle(newCustomerForm.name, 1, 0.8, 18, 0.018)}
              required
              placeholder={t("Customer name", "Nom du client", "Kundenname", "Nombre del cliente", "Nome do cliente")}
              autoComplete="off"
              spellCheck={false}
              formNoValidate={false}
            />
          <div>
            <Input
              className="h-12 rounded-2xl border-border/80 bg-white/85 px-4 text-[15px] leading-tight shadow-[0_10px_24px_-22px_rgba(15,23,42,0.45)] dark:border-slate-700 dark:bg-slate-900/95 dark:text-slate-100 dark:placeholder:text-slate-400 dark:shadow-[0_14px_28px_-24px_rgba(0,0,0,0.75)]"
              label={t("Company / legal name (optional)", "Raison sociale / nom legal (optionnel)", "Firma / rechtlicher Name (optional)", "Nombre legal de la empresa (opcional)", "Nome legal da empresa (opcional)")}
              value={newCustomerForm.companyName}
              onChange={(event) => setNewCustomerForm((prev) => ({ ...prev, companyName: event.target.value }))}
              style={getAdaptiveInputStyle(newCustomerForm.companyName, 1, 0.8, 18, 0.018)}
              placeholder={t("Company name", "Raison sociale", "Firmenname", "Nombre de la empresa", "Nome da empresa")}
            />
          </div>
          </div>
          <div>
            <Input
              className="h-12 rounded-2xl border-border/80 bg-white/85 px-4 text-[15px] leading-tight shadow-[0_10px_24px_-22px_rgba(15,23,42,0.45)] dark:border-slate-700 dark:bg-slate-900/95 dark:text-slate-100 dark:placeholder:text-slate-400 dark:shadow-[0_14px_28px_-24px_rgba(0,0,0,0.75)]"
              label={t("Email", "Email", "E-Mail", "Correo", "Email")}
              type="email"
              value={newCustomerForm.email}
              onChange={(event) => setNewCustomerForm((prev) => ({ ...prev, email: event.target.value }))}
              style={getAdaptiveInputStyle(newCustomerForm.email, 1, 0.78, 18, 0.018)}
              required
              placeholder={t("customer@email.com", "client@email.com", "kunde@email.com", "cliente@email.com", "cliente@email.com")}
            />
          </div>
          <div>
            <PhoneInput
              label={t("Phone", "T?l?phone", "Telefon", "Tel?fono", "Telefonee")}
              value={newCustomerForm.phone}
              locale={language}
              defaultCountry={preferredCustomerCountry || "US"}
              onChange={(value) => setNewCustomerForm((prev) => ({ ...prev, phone: value }))}
              required={
                newCustomerForm.deliveryPreference === "WHATSAPP" ||
                newCustomerForm.deliveryPreference === "BOTH"
              }
              fieldClassName="h-12 rounded-2xl border-border/80 bg-white/85 px-3 shadow-[0_10px_24px_-22px_rgba(15,23,42,0.45)] dark:border-slate-700 dark:bg-slate-900/95 dark:text-slate-100 dark:shadow-[0_14px_28px_-24px_rgba(0,0,0,0.75)]"
            />
          </div>
          <label className="flex flex-col gap-1 text-sm text-foreground dark:text-slate-200">
            <span className="font-medium">{t("Delivery method", "Mode de livraison", "Zustellmethode", "Método de entrega", "Método de entrega")} *</span>
            <select
              value={newCustomerForm.deliveryPreference}
              onChange={(event) =>
                setNewCustomerForm((prev) => ({ ...prev, deliveryPreference: event.target.value }))
              }
              required
              className="h-12 rounded-2xl border border-border/80 bg-white/85 px-4 text-foreground shadow-[0_10px_24px_-22px_rgba(15,23,42,0.45)] focus:border-indigo-400 focus:outline-none dark:border-slate-700 dark:bg-slate-900/95 dark:text-slate-100 dark:shadow-[0_14px_28px_-24px_rgba(0,0,0,0.75)]"
            >
              <option value="">{t("Choose a method", "Choisir un mode", "Methode auswählen", "Elegir un método", "Escolher um método")}</option>
              <option value="EMAIL">{t("Email", "Email", "E-Mail", "Correo", "Email")}</option>
              <option value="WHATSAPP">{t("WhatsApp", "WhatsApp", "WhatsApp", "WhatsApp", "WhatsApp")}</option>
              <option value="BOTH">{t("Both", "Les deux", "Beide", "Ambos", "Ambos")}</option>
            </select>
          </label>
          <div>
            <Input
              className="h-12 rounded-2xl border-border/80 bg-white/85 px-4 text-[15px] leading-tight shadow-[0_10px_24px_-22px_rgba(15,23,42,0.45)] dark:border-slate-700 dark:bg-slate-900/95 dark:text-slate-100 dark:placeholder:text-slate-400 dark:shadow-[0_14px_28px_-24px_rgba(0,0,0,0.75)]"
              label={t("Address line 1", "Adresse ligne 1", "Adresszeile 1", "Linea de direcci?n 1", "Linha de endereco 1")}
              value={newCustomerForm.addressLine1}
              onChange={(event) => setNewCustomerForm((prev) => ({ ...prev, addressLine1: event.target.value }))}
              style={getAdaptiveInputStyle(newCustomerForm.addressLine1, 1, 0.78, 20, 0.017)}
              required
              placeholder={t("Street address", "Adresse postale", "Strassenadresse", "Direcci?n postal", "Endereco postal")}
            />
          </div>
          <div>
            <Input
              className="h-12 rounded-2xl border-border/80 bg-white/85 px-4 text-[15px] leading-tight shadow-[0_10px_24px_-22px_rgba(15,23,42,0.45)] dark:border-slate-700 dark:bg-slate-900/95 dark:text-slate-100 dark:placeholder:text-slate-400 dark:shadow-[0_14px_28px_-24px_rgba(0,0,0,0.75)]"
              label={t("Address line 2 (optional)", "Adresse ligne 2 (optionnelle)", "Adresszeile 2 (optional)", "Linea de direcci?n 2 (opcional)", "Linha de endereco 2 (opcional)")}
              value={newCustomerForm.addressLine2}
              onChange={(event) => setNewCustomerForm((prev) => ({ ...prev, addressLine2: event.target.value }))}
              style={getAdaptiveInputStyle(newCustomerForm.addressLine2, 1, 0.78, 20, 0.017)}
            />
          </div>
          <div>
            <Input
              className="h-12 rounded-2xl border-border/80 bg-white/85 px-4 shadow-[0_10px_24px_-22px_rgba(15,23,42,0.45)] dark:border-slate-700 dark:bg-slate-900/95 dark:text-slate-100 dark:placeholder:text-slate-400 dark:shadow-[0_14px_28px_-24px_rgba(0,0,0,0.75)]"
              label={t("Tax ID (optional)", "Num?ro fiscal (optionnel)", "Steuer-ID (optional)", "ID fiscal (opcional)", "NIF (opcional)")}
              value={newCustomerForm.taxId}
              onChange={(event) => setNewCustomerForm((prev) => ({ ...prev, taxId: event.target.value }))}
              placeholder={t("Tax or VAT ID", "Num?ro fiscal ou TVA", "Steuer- oder MwSt.-ID", "ID fiscal o IVA", "NIF ou IVA")}
            />
          </div>
          <div>
            <Input
              className="h-12 rounded-2xl border-border/80 bg-white/85 px-4 shadow-[0_10px_24px_-22px_rgba(15,23,42,0.45)] dark:border-slate-700 dark:bg-slate-900/95 dark:text-slate-100 dark:placeholder:text-slate-400 dark:shadow-[0_14px_28px_-24px_rgba(0,0,0,0.75)]"
              label={t("Business registration number (optional)", "Num?ro d immatriculation de l entreprise (optionnel)", "Handelsregisternummer (optional)", "N?mero de registro de la empresa (opcional)", "N?mero de registro da empresa (opcional)")}
              value={newCustomerForm.registrationNumber}
              onChange={(event) => setNewCustomerForm((prev) => ({ ...prev, registrationNumber: event.target.value }))}
              placeholder={t("Registration number", "Num?ro d immatriculation", "Registernummer", "N?mero de registro", "N?mero de registro")}
            />
          </div>
          <div>
            <Input
              className="h-12 rounded-2xl border-border/80 bg-white/85 px-4 shadow-[0_10px_24px_-22px_rgba(15,23,42,0.45)] dark:border-slate-700 dark:bg-slate-900/95 dark:text-slate-100 dark:placeholder:text-slate-400 dark:shadow-[0_14px_28px_-24px_rgba(0,0,0,0.75)]"
              label={t("Branch code (optional)", "Code de succursale (optionnel)", "Filialcode (optional)", "C?digo de sucursal (opcional)", "C?digo da filial (opcional)")}
              value={newCustomerForm.branchCode}
              onChange={(event) => setNewCustomerForm((prev) => ({ ...prev, branchCode: event.target.value }))}
              placeholder={t("Branch code", "Code agence", "Filialcode", "C?digo de sucursal", "C?digo da filial")}
            />
          </div>
          <div>
            <Input
              className="h-12 rounded-2xl border-border/80 bg-white/85 px-4 text-[15px] leading-tight shadow-[0_10px_24px_-22px_rgba(15,23,42,0.45)] dark:border-slate-700 dark:bg-slate-900/95 dark:text-slate-100 dark:placeholder:text-slate-400 dark:shadow-[0_14px_28px_-24px_rgba(0,0,0,0.75)]"
              label={t("City", "Ville", "Stadt", "Ciudad", "Cidade")}
              value={newCustomerForm.city}
              onChange={(event) => setNewCustomerForm((prev) => ({ ...prev, city: event.target.value }))}
              style={getAdaptiveInputStyle(newCustomerForm.city, 1, 0.82, 16, 0.02)}
              required
            />
          </div>
          <div>
            <Input
              className="h-12 rounded-2xl border-border/80 bg-white/85 px-4 text-[15px] leading-tight shadow-[0_10px_24px_-22px_rgba(15,23,42,0.45)] dark:border-slate-700 dark:bg-slate-900/95 dark:text-slate-100 dark:placeholder:text-slate-400 dark:shadow-[0_14px_28px_-24px_rgba(0,0,0,0.75)]"
              label={t("State", "Etat", "Bundesland", "Estado", "Estado")}
              value={newCustomerForm.state}
              onChange={(event) => setNewCustomerForm((prev) => ({ ...prev, state: event.target.value }))}
              style={getAdaptiveInputStyle(newCustomerForm.state, 1, 0.82, 16, 0.02)}
              required
            />
          </div>
          <div>
            <Input
              className="h-12 rounded-2xl border-border/80 bg-white/85 px-4 shadow-[0_10px_24px_-22px_rgba(15,23,42,0.45)] dark:border-slate-700 dark:bg-slate-900/95 dark:text-slate-100 dark:placeholder:text-slate-400 dark:shadow-[0_14px_28px_-24px_rgba(0,0,0,0.75)]"
              label={t("Postal code", "Code postal", "Postleitzahl", "Código postal", "Código postal")}
              value={newCustomerForm.postalCode}
              onChange={(event) => setNewCustomerForm((prev) => ({ ...prev, postalCode: event.target.value }))}
              placeholder={t("ZIP / postal code", "Code ZIP / postal", "ZIP / Postleitzahl", "ZIP / código postal", "ZIP / código postal")}
            />
          </div>
          <div>
            <CountrySelect
              label={t("Country", "Pays", "Land", "Pa?s", "Pa?s")}
              value={newCustomerForm.country}
              locale={language}
              onChange={(value) => setNewCustomerForm((prev) => ({ ...prev, country: value }))}
              required
              triggerClassName="h-12 rounded-2xl border-border/80 bg-white/85 px-4 shadow-[0_10px_24px_-22px_rgba(15,23,42,0.45)] dark:border-slate-700 dark:bg-slate-900/95 dark:text-slate-100 dark:shadow-[0_14px_28px_-24px_rgba(0,0,0,0.75)]"
            />
          </div>
          <div className="flex flex-col gap-4 border-t border-border/60 pt-5 dark:border-slate-800 lg:col-span-2 lg:flex-row lg:items-center lg:justify-between">
            <p className="text-sm text-muted-foreground dark:text-slate-400">
              <span className="font-semibold text-foreground dark:text-slate-100">{t("Required fields", "Champs requis", "Pflichtfelder", "Campos obligatorios", "Campos obrigatorios")}</span>
              <span className="ml-2">
                {t("must be completed before saving.", "doivent être remplis avant l enregistrement.", "müssen vor dem Speichern ausgefullt werden.", "deben completarse antes de guardar.", "devem ser preenchidos antes de guardar.")}
              </span>
            </p>
            <div className="flex items-center justify-end gap-3 whitespace-nowrap">
              <Button
                type="button"
                variant="secondary"
                className="h-12 min-w-[136px] rounded-2xl border-slate-300 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(241,245,249,0.92))] px-6 text-[15px] font-semibold text-slate-700 shadow-[0_18px_40px_-30px_rgba(15,23,42,0.45)] hover:border-slate-400 hover:bg-[linear-gradient(180deg,rgba(255,255,255,1),rgba(248,250,252,0.96))] hover:text-slate-900 dark:border-slate-700 dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.98),rgba(15,23,42,0.9))] dark:text-slate-200 dark:shadow-[0_18px_40px_-30px_rgba(0,0,0,0.82)] dark:hover:border-slate-500 dark:hover:bg-[linear-gradient(180deg,rgba(17,24,39,1),rgba(15,23,42,0.94))] dark:hover:text-slate-100"
                onClick={() => setCustomerModalOpen(false)}
              >
                {t("Cancel", "Annuler", "Abbrechen", "Cancelar", "Cancelar")}
              </Button>
              <Button
                type="submit"
                loading={creatingCustomer}
                className="h-12 min-w-[208px] rounded-2xl border border-indigo-400/30 bg-[linear-gradient(135deg,#6657ff_0%,#5547f0_48%,#4338ca_100%)] px-7 text-[15px] font-semibold text-white shadow-[0_24px_54px_-20px_rgba(79,70,229,0.95)] ring-1 ring-white/10 hover:bg-[linear-gradient(135deg,#7163ff_0%,#5f51f4_48%,#4b3fd4_100%)]"
              >
                {t("Save customer", "Enregistrer client", "Kunden speichern", "Guardar cliente", "Guardar cliente")}
              </Button>
            </div>
          </div>
        </form>
      </Modal>

      <Modal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title={t("Edit customer details", "Modifier les d?tails client", "Kundendaten bearbeiten", "Editar datos del cliente", "Editar dados do cliente")}
      >
        <form className="space-y-4" onSubmit={saveCustomerDetails}>
          {editStatus ? (
            <TransientAlert variant={editStatus.variant} onDismiss={() => setEditStatus(null)}>
              {editStatus.message}
            </TransientAlert>
          ) : null}
          <Input
            label={t("Customer name", "Nom du client", "Kundenname", "Nombre del cliente", "Nome do cliente")}
            value={editForm.customerName}
            onChange={(e) => setEditForm({ ...editForm, customerName: e.target.value })}
          />
          <Input
            label={t("Company / legal name (optional)", "Raison sociale / nom legal (optionnel)", "Firma / rechtlicher Name (optional)", "Nombre legal de la empresa (opcional)", "Nome legal da empresa (opcional)")}
            value={editForm.customerCompanyName}
            onChange={(e) => setEditForm({ ...editForm, customerCompanyName: e.target.value })}
          />
          <Input
            label={t("Customer email", "Email client", "Kunden-E-Mail", "Correo del cliente", "Email do cliente")}
            type="email"
            value={editForm.customerEmail}
            onChange={(e) => setEditForm({ ...editForm, customerEmail: e.target.value })}
          />
          <Input
            label={t("Tax ID (optional)", "Num?ro fiscal (optionnel)", "Steuer-ID (optional)", "ID fiscal (opcional)", "NIF (opcional)")}
            value={editForm.customerTaxId}
            onChange={(e) => setEditForm({ ...editForm, customerTaxId: e.target.value })}
          />
          <Input
            label={t("Business registration number (optional)", "Num?ro d immatriculation de l entreprise (optionnel)", "Handelsregisternummer (optional)", "N?mero de registro de la empresa (opcional)", "N?mero de registro da empresa (opcional)")}
            value={editForm.customerRegistrationNumber}
            onChange={(e) => setEditForm({ ...editForm, customerRegistrationNumber: e.target.value })}
          />
          <Input
            label={t("Branch code (optional)", "Code de succursale (optionnel)", "Filialcode (optional)", "C?digo de sucursal (opcional)", "C?digo da filial (opcional)")}
            value={editForm.customerBranchCode}
            onChange={(e) => setEditForm({ ...editForm, customerBranchCode: e.target.value })}
          />
          <Input
            label={t("Address line 1", "Adresse ligne 1", "Adresszeile 1", "Linea de direcci?n 1", "Linha de endereco 1")}
            value={editForm.customerStreet}
            onChange={(e) => setEditForm({ ...editForm, customerStreet: e.target.value })}
          />
          <Input
            label={t("Address line 2 (optional)", "Adresse ligne 2 (optionnelle)", "Adresszeile 2 (optional)", "Linea de direcci?n 2 (opcional)", "Linha de endereco 2 (opcional)")}
            value={editForm.customerAddressLine2}
            onChange={(e) => setEditForm({ ...editForm, customerAddressLine2: e.target.value })}
          />
          <Input
            label={t("City", "Ville", "Stadt", "Ciudad", "Cidade")}
            value={editForm.customerCity}
            onChange={(e) => setEditForm({ ...editForm, customerCity: e.target.value })}
          />
          <Input
            label={t("State / Province / Region (optional)", "Etat / province / region (optionnel)", "Bundesland / Region (optional)", "Estado / provincia / region (opcional)", "Estado / provincia / regiao (opcional)")}
            value={editForm.customerState}
            onChange={(e) => setEditForm({ ...editForm, customerState: e.target.value })}
          />
          <Input
            label={t("Postal code / ZIP (optional)", "Code postal (optionnel)", "Postleitzahl / ZIP (optional)", "Código postal / ZIP (opcional)", "Código postal / ZIP (opcional)")}
            value={editForm.customerPostalCode}
            onChange={(e) => setEditForm({ ...editForm, customerPostalCode: e.target.value })}
          />
            <CountrySelect
              label={t("Country", "Pays", "Land", "Pa?s", "Pa?s")}
              value={editForm.customerCountry}
              locale={language}
              onChange={(value) => setEditForm({ ...editForm, customerCountry: value })}
            />
          <div className="flex flex-wrap items-center justify-end gap-3">
            <Button type="button" variant="secondary" onClick={() => setEditOpen(false)}>
              {t("Cancel", "Annuler", "Abbrechen", "Cancelar", "Cancelar")}
            </Button>
            <Button type="submit" loading={savingEdit}>
              {t("Save changes", "Enregistrer", "Änderungen speichern", "Guardar cambios", "Guardar alteracoes")}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}











