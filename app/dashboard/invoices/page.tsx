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
  email: string;
  phone?: string | null;
  taxId?: string | null;
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
  "relative flex min-h-[172px] min-w-0 flex-col items-center justify-between overflow-hidden rounded-[22px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.92),rgba(248,250,252,0.78))] px-4 py-4 text-center shadow-[0_20px_38px_-32px_rgba(15,23,42,0.22),inset_0_1px_0_rgba(255,255,255,0.82)] backdrop-blur-sm dark:border-slate-700/80 dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.7),rgba(2,6,23,0.62))] dark:shadow-[0_22px_44px_-34px_rgba(2,6,23,0.82),inset_0_1px_0_rgba(255,255,255,0.03)]";

const heroMetricLabelClass =
  "flex min-h-[2.9rem] items-center justify-center text-center text-[0.64rem] font-semibold uppercase leading-6 tracking-[0.24em] text-slate-500 dark:text-slate-400";

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
  const searchParams = useSearchParams();
  const { language } = useLanguage();
  const t = (en: string, fr: string) => (language === "fr" ? fr : en);
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
  const [creatingCustomer, setCreatingCustomer] = useState(false);
  const [submittingInvoiceStatus, setSubmittingInvoiceStatus] = useState<"DRAFT" | "SENT" | null>(null);
  const [editingPriceIndex, setEditingPriceIndex] = useState<number | null>(null);
  const [priceDraft, setPriceDraft] = useState("");
  const [newCustomerForm, setNewCustomerForm] = useState({
    name: "",
    email: "",
    phone: "",
    taxId: "",
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
          "Seuls les fichiers JPG, PNG, ou PDF sont acceptes."
        );
        continue;
      }
      if (file.size > 5 * 1024 * 1024) {
        nextError = t(
          "File too large. Maximum allowed is 5MB.",
          "Fichier trop volumineux. Le maximum autorise est de 5 Mo."
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
          "Vous pouvez joindre jusqu a 5 fichiers d accompagnement."
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
    email: "",
    phone: "",
    taxId: "",
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
  const requiredMessage = t("This field is required", "This field is required");
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
        message:
          language === "fr"
            ? "Ce client est desactive. Restaurez-le avant de creer une nouvelle facture."
            : "This customer is disabled. Restore them before creating a new invoice.",
        variant: "error",
      });
      return;
    }
    setSelectedCustomerSnapshot(requestedCustomer);
    setCustomerQuery("");
    setCustomerSkip(0);
    setCustomerDropdownOpen(false);
    setForm((prev) => ({ ...prev, customerId: requestedCustomer.id }));
  }, [customerItems, form.customerId, language, requestedCustomerData, requestedCustomerId]);

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
  const draftVatRateLabel = formatVatRateLabel(
    draftTotals.vatRate,
    businessProfile?.data?.vatRateDisplay
  );
  const preferredInvoiceCurrencyFlag = getBusinessCurrencyFlag(preferredInvoiceCurrency);
  const previewIssueDate = parseDateInput(form.issueDate) || new Date();
  const previewDueDate = form.dueDate ? parseDateInput(form.dueDate) : undefined;
  const previewBusinessName = String(
    businessProfile?.data?.businessName || t("Your business", "Votre entreprise")
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
    const normalized = String(value || "").toUpperCase();
    if (language !== "fr") return normalized;
    const map: Record<string, string> = {
      DRAFT: "BROUILLON",
      SENT: "ENVOYEE",
      OVERDUE: "RETARD",
      UNPAID: "IMPAYE",
      PAID: "PAYEE",
      REFUNDED: "REMBOURSEE",
      PARTIALLY_REFUNDED: "PARTIELLEMENT REMBOURSEE",
      CANCELED: "ANNULEE",
      FAILED: "ECHEC",
    };
    return map[normalized] || normalized;
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
        ? t("1 invoice", "1 facture")
        : totalInvoicePages <= 1
          ? t(`${pagedInvoiceTotal} invoices`, `${pagedInvoiceTotal} factures`)
          : t(
              `Showing ${pageStart}-${pageEnd} of ${pagedInvoiceTotal} invoices`,
              `Affichage ${pageStart}-${pageEnd} sur ${pagedInvoiceTotal} factures`
            )
      : debouncedQuery
        ? t("No invoices match this search.", "Aucune facture ne correspond a cette recherche.")
        : t("No invoices available.", "Aucune facture disponible.");

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
    const customer = readCustomerFromInvoice(invoice);
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
    const customerId = editingInvoice?.customerId ?? editingInvoice?.customer?.id ?? "";
    if (!customerId) {
      setEditStatus({ message: t("Customer not found for update.", "Client introuvable pour mise a jour."), variant: "error" });
      return;
    }
    setSavingEdit(true);
    setEditStatus(null);
    setStatus(null);
    const payload = {
      name: editForm.customerName.trim() || undefined,
      email: editForm.customerEmail.trim().toLowerCase() || undefined,
      addressLine1: editForm.customerStreet.trim() || undefined,
      city: editForm.customerCity.trim() || undefined,
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
          message: data?.error || t("Could not update customer details.", "Impossible de mettre a jour le client."),
          variant: "error",
        });
        return;
      }
      setEditStatus({ message: t("Customer details updated.", "Details client mis a jour."), variant: "success" });
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
    const customerId = String(invoice?.customerId || "");
    if (!customerId) {
      setStatus({
        message: t("Customer is required.", "Le client est requis."),
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
          message: data?.error || t("Could not send invoice.", "Impossible d envoyer la facture."),
          variant: "error",
        });
      } else {
        setStatus({ message: t("Invoice sent.", "Facture envoyee."), variant: "success" });
        mutate();
      }
    } catch {
      setStatus({ message: t("Could not send invoice.", "Impossible d envoyer la facture."), variant: "error" });
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
          message: data?.error || t("Could not delete draft invoice.", "Impossible de supprimer le brouillon."),
          variant: "error",
        });
        return;
      }
      setStatus({ message: t("Draft invoice deleted.", "Brouillon supprime."), variant: "success" });
      mutate();
    } catch {
      setStatus({
        message: t("Could not delete draft invoice.", "Impossible de supprimer le brouillon."),
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
        message: t("Customer is required.", "Le client est requis."),
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
      issueDate?: string;
      dueDate?: string;
      note?: string;
      attachments?: InvoiceAttachmentPayload[];
      items: { name: string; quantity: number; price: number }[];
    } = {
      ...form,
      status: nextStatus,
      customerId: form.customerId,
      invoiceNumber: form.invoiceNumber.trim(),
      poNumber: form.poNumber.trim() || undefined,
      note: form.note.trim() || undefined,
    };
    const issueDateParsed = form.issueDate ? parseDateInput(form.issueDate) : null;
    if (form.issueDate && !issueDateParsed) {
      setInvoiceActionStatus({
        message: t("Issue date must be in DD/MM/YYYY format.", "Date d emission au format JJ/MM/AAAA."),
        variant: "error",
      });
      return;
    }
    const dueDateParsed = form.dueDate ? parseDateInput(form.dueDate) : null;
    if (form.dueDate && !dueDateParsed) {
      setInvoiceActionStatus({
        message: t("Due date must be in DD/MM/YYYY format.", "Date d echeance au format JJ/MM/AAAA."),
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
            message: `${json.reason || t("Upgrade required.", "Mise a niveau requise.")}${
              required ? ` ${t("Required plan:", "Plan requis :")} ${required}.` : ""
            }`,
            variant: "error",
          });
        } else {
          setInvoiceActionStatus({
            message: json.error || t("Could not create invoice.", "Impossible de creer la facture."),
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
                  `Facture generee sous le numero ${savedNumber}.`
                )
              : t(
                  `Invoice number already existed. Saved as ${savedNumber}.`,
                  `Numero deja utilise. Enregistre comme ${savedNumber}.`
                ),
            variant: "success",
          });
        } else {
          setInvoiceActionStatus({ message: t("Invoice generated.", "Facture generee."), variant: "success" });
        }
        mutate();
        const nextCurrency = preferredInvoiceCurrency;
        setHasManualCurrencySelection(false);
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
        message: t("Could not create invoice. Please try again.", "Impossible de creer la facture. Reessayez."),
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
          "Nom, email, mode de livraison, adresse, ville, etat et pays sont requis. Le telephone est requis pour WhatsApp."
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
          message: payload?.error || t("Could not create customer.", "Impossible de creer le client."),
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
        message: t("Could not create customer.", "Impossible de creer le client."),
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
    <div className="mx-auto w-full max-w-[1200px] space-y-8 max-md:space-y-6">
      <section className="relative overflow-hidden rounded-[32px] border border-slate-200/80 bg-[radial-gradient(circle_at_top_left,rgba(99,102,241,0.12),transparent_28%),radial-gradient(circle_at_82%_18%,rgba(14,165,233,0.12),transparent_24%),linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.94))] p-6 shadow-[0_28px_70px_-42px_rgba(15,23,42,0.32)] sm:p-8 dark:border-slate-800/80 dark:bg-[radial-gradient(circle_at_top_left,rgba(99,102,241,0.18),transparent_28%),radial-gradient(circle_at_82%_18%,rgba(56,189,248,0.14),transparent_24%),linear-gradient(180deg,rgba(2,6,23,0.96),rgba(15,23,42,0.9))] dark:shadow-[0_32px_80px_-46px_rgba(2,6,23,0.95)]">
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.22),transparent_32%,transparent_70%,rgba(255,255,255,0.1))] dark:bg-[linear-gradient(135deg,rgba(255,255,255,0.04),transparent_30%,transparent_70%,rgba(148,163,184,0.04))]" />
        <div className="relative grid gap-8 lg:grid-cols-[minmax(0,1.18fr)_minmax(320px,360px)] lg:items-start">
          <div className="min-w-0 flex-1 space-y-5">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="inline-flex items-center rounded-full border border-indigo-200/80 bg-indigo-50 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.26em] text-indigo-700 dark:border-indigo-400/20 dark:bg-indigo-500/10 dark:text-indigo-200">
                {t("Invoices", "Factures")}
              </span>
              <span className="inline-flex items-center gap-2 rounded-full border border-slate-200/80 bg-white/85 px-2 py-1.5 text-[0.72rem] font-medium tracking-[0.01em] text-slate-600 dark:border-slate-700/80 dark:bg-slate-900/70 dark:text-slate-300">
                <span className="pl-1">{t("Default currency", "Devise par defaut")}</span>
                <span className="inline-flex min-w-[3.5rem] items-center justify-center gap-1.5 rounded-full border border-indigo-200/80 bg-indigo-50 px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-indigo-700 dark:border-indigo-400/20 dark:bg-indigo-500/10 dark:text-indigo-200">
                  {preferredInvoiceCurrencyFlag ? <span className="text-[0.9rem] leading-none">{preferredInvoiceCurrencyFlag}</span> : null}
                  {preferredInvoiceCurrency}
                </span>
              </span>
            </div>
            <div className="space-y-4">
              <h1 className="max-w-[9.4ch] text-[2.55rem] font-semibold leading-[0.92] tracking-[-0.055em] text-slate-950 sm:text-[3.08rem] xl:text-[3.22rem] dark:text-slate-50">
                {t("Invoice Generator", "Generateur de factures")}
              </h1>
              <p className="max-w-[46rem] text-[1.02rem] leading-7 text-slate-600 dark:text-slate-300">
                {t(
                  "Create, manage, and send polished invoices from one focused workspace.",
                  "Creez, gerez et envoyez des factures elegantes depuis un espace de travail unique."
                )}
              </p>
            </div>
            <div className="grid gap-3.5 pt-1 sm:grid-cols-2 xl:grid-cols-4 sm:max-w-[860px]">
              <div className={heroMetricCardClass}>
                <div className="pointer-events-none absolute inset-x-4 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(79,70,229,0.45),transparent)]" />
                <p className={heroMetricLabelClass}>
                  {t("Total invoices", "Total factures")}
                </p>
                <p
                  className={getSingleLineAmountClass(
                    String(invoiceStats.total),
                    "mt-3 max-w-full overflow-hidden whitespace-nowrap text-center font-semibold tracking-[-0.04em] text-slate-950 dark:text-slate-50"
                  )}
                  style={getSingleLineAmountStyle(String(invoiceStats.total), 2.05, 1.05, 5, 0.12)}
                >
                  {invoiceStats.total}
                </p>
              </div>
              <div className={heroMetricCardClass}>
                <div className="pointer-events-none absolute inset-x-4 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(99,102,241,0.38),transparent)]" />
                <p className={heroMetricLabelClass}>
                  {t("Drafts", "Brouillons")}
                </p>
                <p
                  className={getSingleLineAmountClass(
                    String(invoiceStats.drafts),
                    "mt-3 max-w-full overflow-hidden whitespace-nowrap text-center font-semibold tracking-[-0.04em] text-slate-950 dark:text-slate-50"
                  )}
                  style={getSingleLineAmountStyle(String(invoiceStats.drafts), 2.05, 1.05, 5, 0.12)}
                >
                  {invoiceStats.drafts}
                </p>
              </div>
              <div className={heroMetricCardClass}>
                <div className="pointer-events-none absolute inset-x-4 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(245,158,11,0.42),transparent)]" />
                <p className={heroMetricLabelClass}>
                  {t("Unpaid", "Impayees")}
                </p>
                <p
                  className={getSingleLineAmountClass(
                    String(invoiceStats.unpaid),
                    "mt-3 max-w-full overflow-hidden whitespace-nowrap text-center font-semibold tracking-[-0.04em] text-slate-950 dark:text-slate-50"
                  )}
                  style={getSingleLineAmountStyle(String(invoiceStats.unpaid), 2.05, 1.05, 5, 0.12)}
                >
                  {invoiceStats.unpaid}
                </p>
              </div>
              <div className={heroMetricCardClass}>
                <div className="pointer-events-none absolute inset-x-4 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(239,68,68,0.42),transparent)]" />
                <p className={heroMetricLabelClass}>
                  {t("Overdue", "En retard")}
                </p>
                <p
                  className={getSingleLineAmountClass(
                    String(invoiceStats.overdue),
                    "mt-3 max-w-full overflow-hidden whitespace-nowrap text-center font-semibold tracking-[-0.04em] text-slate-950 dark:text-slate-50"
                  )}
                  style={getSingleLineAmountStyle(String(invoiceStats.overdue), 2.05, 1.05, 5, 0.12)}
                >
                  {invoiceStats.overdue}
                </p>
              </div>
            </div>
          </div>
          <div className="w-full max-w-[360px] rounded-[28px] border border-slate-200/80 bg-white/78 p-4 shadow-[0_24px_50px_-34px_rgba(15,23,42,0.38)] backdrop-blur-sm dark:border-slate-700/80 dark:bg-slate-950/62 dark:shadow-[0_28px_56px_-34px_rgba(2,6,23,0.95)]">
            <div className="space-y-4">
              <div className="space-y-2">
                <p className="inline-flex items-center rounded-full border border-slate-200/80 bg-slate-50/85 px-3 py-1 text-[0.66rem] font-semibold uppercase tracking-[0.24em] text-slate-500 dark:border-slate-700/80 dark:bg-slate-900/75 dark:text-slate-400">
                  {t("Workspace", "Espace de travail")}
                </p>
                <p className="text-[1.22rem] font-semibold leading-[1.05] tracking-[-0.04em] text-slate-950 dark:text-slate-50">
                  {t("Start a fresh invoice or jump into history.", "Creez une nouvelle facture ou ouvrez l historique.")}
                </p>
                <p className="text-[0.92rem] leading-6 text-slate-600 dark:text-slate-300">
                  {t(
                    "Everything updates live while you build, so totals, customer details, and delivery settings stay in sync.",
                    "Tout se met a jour en direct pendant la creation pour garder les totaux, le client et les reglages d envoi parfaitement synchronises."
                  )}
                </p>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row">
                <Button
                  onClick={handleNewInvoice}
                  className="h-12 flex-1 rounded-2xl bg-[linear-gradient(135deg,#6657ff_0%,#5547f0_48%,#4338ca_100%)] text-[0.98rem] font-semibold text-white shadow-[0_24px_50px_-24px_rgba(79,70,229,0.88)] ring-1 ring-white/10 hover:bg-[linear-gradient(135deg,#7163ff_0%,#5f51f4_48%,#4b3fd4_100%)]"
                >
                  {t("+ New Invoice", "+ Nouvelle facture")}
                </Button>
                <a href="#invoice-history" className="sm:flex-1">
                  <Button
                    variant="secondary"
                    className="h-12 w-full rounded-2xl border border-slate-300/90 bg-slate-50 text-[0.98rem] font-semibold text-slate-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] dark:hover:bg-slate-800"
                  >
                    {t("View history", "Voir l historique")}
                  </Button>
                </a>
              </div>
              <div className="grid grid-cols-2 gap-2 rounded-2xl border border-slate-200/80 bg-slate-50/80 p-2 dark:border-slate-800 dark:bg-slate-900/75">
                <div className="rounded-[1rem] bg-white/90 px-3 py-2 text-center dark:bg-slate-950/80">
                  <p className="text-[0.62rem] font-semibold uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">
                    {t("Live preview", "Apercu direct")}
                  </p>
                  <p className="mt-1 text-sm font-semibold tracking-[-0.02em] text-slate-950 dark:text-slate-50">
                    {t("Always on", "Toujours visible")}
                  </p>
                </div>
                <div className="rounded-[1rem] bg-white/90 px-3 py-2 text-center dark:bg-slate-950/80">
                  <p className="text-[0.62rem] font-semibold uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">
                    {t("Delivery", "Envoi")}
                  </p>
                  <p className="mt-1 text-sm font-semibold tracking-[-0.02em] text-slate-950 dark:text-slate-50">
                    {t("Ready to send", "Pret a envoyer")}
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
        <Card title={t("Business profile required", "Profil requis")}>
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
        <div className="grid gap-7 sm:grid-cols-[minmax(0,1.2fr)_minmax(240px,0.86fr)] md:gap-8 md:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.92fr)] lg:gap-10 lg:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.95fr)] xl:grid-cols-[minmax(0,1.6fr)_minmax(360px,1fr)]">
          <div className="min-w-0 space-y-6">
            <Card
              title={<span className="text-base font-semibold">{t("Create invoice", "Creer une facture")}</span>}
              className="min-w-0 shadow-sm"
            >
              <form className="grid grid-cols-2 gap-x-4 gap-y-8 max-md:grid-cols-1 max-md:gap-4" onSubmit={createInvoice}>
            <Input
              label={t("Invoice number", "Numero de facture")}
              value={form.invoiceNumber}
              onChange={(e) => setForm({ ...form, invoiceNumber: e.target.value })}
            />
            <div className="col-span-2 space-y-2 max-md:col-span-1">
              <label className="mb-2 block text-sm font-medium text-foreground">
                {t("Customer", "Client")} *
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
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="secondary"
                          className="h-9 rounded-full border border-slate-300/90 bg-slate-50 px-4 text-xs font-semibold text-slate-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] hover:bg-slate-100 dark:border-slate-600/80 dark:bg-slate-900 dark:text-slate-100 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] dark:hover:bg-slate-800"
                          onClick={beginCustomerChange}
                        >
                          {t("Change", "Changer")}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          className="h-9 rounded-full px-3 text-xs font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-50"
                          onClick={openCreateCustomerModal}
                        >
                          {t("New customer", "Nouveau client")}
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-3 max-sm:flex-col max-sm:items-stretch">
                    <div className="flex-1">
                      <input
                        ref={customerInputRef}
                        placeholder={t("Search and select customer", "Rechercher et selectionner un client")}
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
                      {t("+ Add New Customer", "+ Ajouter client")}
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
                            {t("Load more customers", "Charger plus de clients")}
                          </button>
                        ) : null}
                      </>
                    ) : (
                      <p className="px-3 py-2 text-xs text-muted-foreground">
                        {t("No customers found.", "Aucun client trouve.")}
                      </p>
                    )}
                  </div>
                ) : null}
              </div>
              {!selectedCustomer ? (
                <p className="mt-1.5 text-[13px] text-muted-foreground">
                  {t("Select a customer to continue.", "Selectionnez un client pour continuer.")}
                </p>
              ) : null}
            </div>
            <label className="flex flex-col gap-1 text-sm text-foreground">
              {t("Issue date", "Date d emission")}
              <input
                type="date"
                value={form.issueDate}
                onChange={(e) => setForm({ ...form, issueDate: e.target.value })}
                className="h-11 w-full rounded-lg border border-input bg-background px-3 text-foreground focus:border-indigo-400 focus:outline-none"
              />
            </label>
            <div className="space-y-2">
              <label className="flex flex-col gap-1 text-sm text-foreground">
                {t("Due date", "Date d echeance")}
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
                    {t(`+${days} days`, `+${days} jours`)}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                {t("Set when payment is expected.", "Definissez la date de paiement attendue.")}
              </p>
            </div>
            <label className="flex flex-col gap-1 text-sm text-foreground">
              {t("Currency", "Devise")}
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
            <Input
              label={t("PO number (optional)", "Numero BC (optionnel)")}
              value={form.poNumber}
              onChange={(e) => setForm({ ...form, poNumber: e.target.value })}
              placeholder={t("Purchase order", "Bon de commande")}
            />
            <div className="col-span-2 min-w-0 max-md:col-span-1">
              <div className="min-w-0 rounded-2xl border border-border bg-muted/10 p-6">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-base font-semibold text-foreground">{t("Line items", "Articles")}</p>
                  <Button
                    type="button"
                    variant="secondary"
                    className="h-11"
                    onClick={() => appendLineItem({ focus: true })}
                  >
                    {t("+ Add item", "+ Ajouter")}
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
                              {t("Description", "Description")}
                            </span>
                            <textarea
                              ref={(node) => {
                                descriptionRefs.current[index] = node;
                                autoResizeDescription(node);
                              }}
                              value={item.name}
                              placeholder={t("Item details", "Details de l article")}
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
                              aria-label={t("Remove line item", "Supprimer la ligne")}
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
                              {t("Qty", "Qt")}
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
                              {t("Unit price", "Prix unitaire")}
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
                              {t("VAT", "TVA")}
                            </p>
                            <div className="flex h-11 items-center justify-center rounded-xl border border-border bg-background px-3 text-sm font-semibold text-foreground">
                              {showDraftTax
                                ? `${draftVatRateLabel}%`
                                : "-"}
                            </div>
                          </div>
                          <div className="min-w-0 space-y-1.5">
                            <p className="text-center text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                              {t("Line total", "Total ligne")}
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
                      <span className="text-sm font-medium text-muted-foreground">{t("Subtotal", "Sous-total")}</span>
                      <span className="min-w-0 max-w-[65%] text-right text-sm font-medium tabular-nums leading-tight text-muted-foreground break-all">
                        {formatCurrencyWithCode(draftTotals.subtotal, form.currency)}
                      </span>
                    </div>
                    {showDraftTax ? (
                      <div className="flex items-start justify-between gap-4">
                        <span className="text-sm font-medium text-muted-foreground">
                          {t("VAT", "TVA")} ({draftVatRateLabel}%)
                        </span>
                        <span className="min-w-0 max-w-[65%] text-right text-sm font-medium tabular-nums leading-tight text-muted-foreground break-all">
                          {formatCurrencyWithCode(draftTotals.taxAmount, form.currency)}
                        </span>
                      </div>
                    ) : null}
                    <div className="flex items-start justify-between gap-4 border-t border-border/70 pt-3">
                      <span className="text-[1.15rem] font-bold text-foreground">{t("Total Due", "Total du")}</span>
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
                    label={t("Note to customer (optional)", "Note au client (optionnel)")}
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
                              {t("Delivery package", "Pack d envoi")}
                            </p>
                            <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                              {t("Optional", "Optionnel")}
                            </span>
                          </div>
                          <p className="text-lg font-semibold tracking-tight text-slate-950 dark:text-slate-50">
                            {t("Supporting files", "Fichiers d accompagnement")}
                          </p>
                          <p className="max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-300">
                            {t(
                              "Attach up to 5 JPG, PNG, or PDF files to send alongside the invoice PDF. These files are delivered with the invoice package, but never appear on the invoice itself.",
                              "Ajoutez jusqu a 5 fichiers JPG, PNG, ou PDF a envoyer avec le PDF de la facture. Ces fichiers sont transmis avec l envoi, mais n apparaissent jamais sur la facture elle-meme."
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
                          ? t("Add more files", "Ajouter d autres fichiers")
                          : t("Add supporting files", "Ajouter des fichiers")}
                      </Button>
                    </div>
                    {supportingFiles.length > 0 ? (
                      <div className="border-t border-slate-200/80 bg-slate-50/80 px-6 py-5 dark:border-slate-700/80 dark:bg-slate-900/50">
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <p className="text-[0.72rem] font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
                            {t("Attached now", "Ajoutes")}
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
                              aria-label={t("Remove file", "Supprimer le fichier")}
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
                        {t("Maximum 5 files, 5MB each.", "Maximum 5 fichiers, 5 Mo chacun.")}
                      </span>
                      <span className="rounded-full border border-indigo-200/80 bg-indigo-50 px-3 py-1.5 font-semibold text-indigo-700 dark:border-indigo-400/30 dark:bg-indigo-500/12 dark:text-indigo-200">
                        {selectedCustomer?.deliveryPreference === "WHATSAPP"
                          ? t("Delivered by WhatsApp document messages.", "Envoyes via des documents WhatsApp.")
                          : selectedCustomer?.deliveryPreference === "BOTH"
                            ? t("Delivered by email and WhatsApp.", "Envoyes par email et WhatsApp.")
                            : t("Delivered with the invoice email.", "Envoyes avec l email de facture.")}
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
                    {t("Final step", "Etape finale")}
                  </div>
                  <div className="space-y-1">
                    <p className="text-lg font-semibold tracking-tight text-slate-950 dark:text-slate-50">
                      {t("Finalize this invoice", "Finaliser cette facture")}
                    </p>
                    <p className="max-w-xl text-sm leading-6 text-slate-600 dark:text-slate-300">
                      {t(
                        "Save it as a draft for later or send it now to your customer.",
                        "Enregistrez-la en brouillon pour plus tard ou envoyez-la maintenant a votre client."
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
                    {t("Save Draft", "Enregistrer brouillon")}
                  </Button>
                  <Button
                    type="button"
                    className="h-12 rounded-2xl bg-[linear-gradient(135deg,#6657ff_0%,#5547f0_48%,#4338ca_100%)] px-7 text-[0.95rem] font-semibold text-white shadow-[0_24px_50px_-24px_rgba(79,70,229,0.9)] ring-1 ring-white/10 hover:bg-[linear-gradient(135deg,#7163ff_0%,#5f51f4_48%,#4b3fd4_100%)] dark:shadow-[0_28px_56px_-26px_rgba(79,70,229,0.82)] sm:min-w-[184px]"
                    loading={submittingInvoiceStatus === "SENT"}
                    disabled={submittingInvoiceStatus !== null}
                    onClick={() => createInvoiceWithStatus("SENT")}
                  >
                    {t("Save & Send", "Enregistrer et envoyer")}
                  </Button>
                </div>
              </div>
            </div>

          </div>

          <Card
            title={<span className="text-[1.02rem] font-semibold tracking-tight">{t("Live invoice preview", "Apercu en direct")}</span>}
            className="h-fit shadow-sm sm:sticky sm:top-20 sm:self-start md:top-24"
          >
            <p className="mb-5 text-[0.78rem] font-medium tracking-[0.01em] text-muted-foreground">
              {t("Preview updates as you edit.", "L apercu se met a jour en direct.")}
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
                  name: item.name.trim() || t("Untitled item", "Article sans nom"),
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
                        name: t("Customer name", "Nom du client"),
                        email: null,
                        address: null,
                        companyName: null,
                        taxId: null,
                      }
                }
                note={form.note.trim() || null}
                variant="compact"
              />
            </div>
          </Card>
        </div>
      )}
      <Card
        id="invoice-history"
        title={<span className="text-base font-semibold">{t("History", "Historique")}</span>}
        actions={
          <div className="flex flex-wrap items-center gap-3">
            <input
              suppressHydrationWarning
              placeholder={t("Search invoices", "Rechercher des factures")}
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
          <div className="space-y-4">
            <Table
              data={filteredInvoices}
              keyExtractor={(row: any) => row.id || row.invoiceNumber}
              columns={[
              { key: "invoiceNumber", label: t("Invoice Number", "Numero de facture"), align: "left" },
              {
                key: "customer",
                label: t("Customer", "Client"),
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
                label: t("Currency", "Devise"),
                align: "center",
                render: (row: any) => String(row.currency || "").toUpperCase(),
              },
              {
                key: "status",
                label: t("Status", "Statut"),
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
                key: "total",
                label: t("Total", "Total"),
                align: "center",
                render: (row: any) => formatCurrency(Number(row.total || 0), row.currency),
              },
              {
                key: "id",
                label: t("Actions", "Actions"),
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
                          {t("View", "Voir")}
                        </Link>
                      ) : (
                        <span className="text-sm font-medium text-muted-foreground">{t("View", "Voir")}</span>
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
                            aria-label={t("Draft actions", "Actions du brouillon")}
                          >
                            <MoreHorizontal className="h-4.5 w-4.5" />
                          </button>
                          {menuOpen ? (
                            <div
                              role="menu"
                              className="absolute bottom-full right-0 z-40 mb-2 w-56 rounded-[1.35rem] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.96))] p-2 shadow-[0_28px_65px_-32px_rgba(15,23,42,0.55)] backdrop-blur"
                            >
                              <p className="px-3 pb-2 pt-1 text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-slate-500">
                                {t("Draft actions", "Actions du brouillon")}
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
                                {t("Edit draft", "Modifier")}
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
                                {sendingId === row?.id ? t("Sending...", "Envoi...") : t("Send now", "Envoyer")}
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
                                  ? t("Deleting...", "Suppression...")
                                  : t("Delete draft", "Supprimer")}
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
                            {t("Edit", "Modifier")}
                          </button>
                          <span className="text-muted-foreground">·</span>
                          <button
                            type="button"
                            onClick={() => sendDraft(row)}
                            disabled={sendingId === row?.id || deletingInvoiceId === row?.id}
                            className="text-sm font-medium text-emerald-700 hover:text-emerald-600 disabled:opacity-50"
                          >
                            {sendingId === row?.id ? t("Sending...", "Envoi...") : t("Send", "Envoyer")}
                          </button>
                          <span className="text-muted-foreground">·</span>
                          <button
                            type="button"
                            onClick={() => openDeleteDraftModal(row)}
                            disabled={deletingInvoiceId === row?.id || sendingId === row?.id}
                            className="text-sm font-medium text-rose-700 hover:text-rose-600 disabled:opacity-50"
                          >
                            {deletingInvoiceId === row?.id ? t("Deleting...", "Suppression...") : t("Delete", "Supprimer")}
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
                    aria-label={t("Previous page", "Page precedente")}
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
                    aria-label={t("Next page", "Page suivante")}
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
                {t("Permanent action", "Action permanente")}
              </p>
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[linear-gradient(160deg,#ff3b6b,#e11d48)] text-white shadow-[0_16px_35px_-18px_rgba(225,29,72,0.9)]">
                  <Trash2 className="h-4.5 w-4.5" />
                </div>
                <div>
                  <p className="text-[1.55rem] font-semibold leading-tight text-foreground">
                    {t("Delete draft invoice?", "Supprimer le brouillon ?")}
                  </p>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    {t(
                      "This removes the draft permanently from your invoice history.",
                      "Cette action supprime definitivement le brouillon de votre historique."
                    )}
                  </p>
                </div>
              </div>
            </div>
            <button
              type="button"
              aria-label={t("Close", "Fermer")}
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
                {t("Draft summary", "Resume du brouillon")}
              </p>
              <div className="rounded-full border border-rose-200/80 bg-rose-50 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-rose-700">
                {t("Draft only", "Brouillon")}
              </div>
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
              <div className="min-w-0">
                <p className="truncate text-[1.15rem] font-semibold tracking-tight text-foreground">
                  {String(deleteCandidate?.invoiceNumber || t("Draft invoice", "Brouillon"))}
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
                {t("This action cannot be undone.", "Cette action est irreversible.")}
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
              {t("Cancel", "Annuler")}
            </Button>
            <Button
              type="button"
              variant="danger"
              className="h-11 sm:min-w-[170px]"
              loading={Boolean(deletingInvoiceId)}
              onClick={confirmDeleteDraft}
            >
              {t("Delete Draft", "Supprimer le brouillon")}
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
                  {t("Customer profile", "Profil client")}
                </p>
                <h3 className="mt-1 text-[1.7rem] font-semibold tracking-tight text-foreground">
                  {t("Add New Customer", "Ajouter un client")}
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t(
                    "Create a complete customer record for invoices and payment follow-up.",
                    "Creez une fiche client complete pour la facturation et le suivi des paiements."
                  )}
                </p>
              </div>
            </div>
            <button
              type="button"
              aria-label={t("Close", "Fermer")}
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
              label={t("Name", "Nom")}
              value={newCustomerForm.name}
              onChange={(event) => setNewCustomerForm((prev) => ({ ...prev, name: event.target.value }))}
              style={getAdaptiveInputStyle(newCustomerForm.name, 1, 0.8, 18, 0.018)}
              required
              placeholder={t("Customer name", "Nom du client")}
              autoComplete="off"
              spellCheck={false}
              formNoValidate={false}
            />
          </div>
          <div>
            <Input
              className="h-12 rounded-2xl border-border/80 bg-white/85 px-4 text-[15px] leading-tight shadow-[0_10px_24px_-22px_rgba(15,23,42,0.45)] dark:border-slate-700 dark:bg-slate-900/95 dark:text-slate-100 dark:placeholder:text-slate-400 dark:shadow-[0_14px_28px_-24px_rgba(0,0,0,0.75)]"
              label={t("Email", "Email")}
              type="email"
              value={newCustomerForm.email}
              onChange={(event) => setNewCustomerForm((prev) => ({ ...prev, email: event.target.value }))}
              style={getAdaptiveInputStyle(newCustomerForm.email, 1, 0.78, 18, 0.018)}
              required
              placeholder={t("customer@email.com", "client@email.com")}
            />
          </div>
          <div>
            <PhoneInput
              label={t("Phone", "Telephone")}
              value={newCustomerForm.phone}
              locale={language === "fr" ? "fr" : "en"}
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
            <span className="font-medium">{t("Delivery method", "Mode de livraison")} *</span>
            <select
              value={newCustomerForm.deliveryPreference}
              onChange={(event) =>
                setNewCustomerForm((prev) => ({ ...prev, deliveryPreference: event.target.value }))
              }
              required
              className="h-12 rounded-2xl border border-border/80 bg-white/85 px-4 text-foreground shadow-[0_10px_24px_-22px_rgba(15,23,42,0.45)] focus:border-indigo-400 focus:outline-none dark:border-slate-700 dark:bg-slate-900/95 dark:text-slate-100 dark:shadow-[0_14px_28px_-24px_rgba(0,0,0,0.75)]"
            >
              <option value="">{t("Choose a method", "Choisir un mode")}</option>
              <option value="EMAIL">Email</option>
              <option value="WHATSAPP">WhatsApp</option>
              <option value="BOTH">{t("Both", "Les deux")}</option>
            </select>
          </label>
          <div>
            <Input
              className="h-12 rounded-2xl border-border/80 bg-white/85 px-4 text-[15px] leading-tight shadow-[0_10px_24px_-22px_rgba(15,23,42,0.45)] dark:border-slate-700 dark:bg-slate-900/95 dark:text-slate-100 dark:placeholder:text-slate-400 dark:shadow-[0_14px_28px_-24px_rgba(0,0,0,0.75)]"
              label={t("Address", "Adresse")}
              value={newCustomerForm.addressLine1}
              onChange={(event) => setNewCustomerForm((prev) => ({ ...prev, addressLine1: event.target.value }))}
              style={getAdaptiveInputStyle(newCustomerForm.addressLine1, 1, 0.78, 20, 0.017)}
              required
              placeholder={t("Street address", "Adresse postale")}
            />
          </div>
          <div>
            <Input
              className="h-12 rounded-2xl border-border/80 bg-white/85 px-4 shadow-[0_10px_24px_-22px_rgba(15,23,42,0.45)] dark:border-slate-700 dark:bg-slate-900/95 dark:text-slate-100 dark:placeholder:text-slate-400 dark:shadow-[0_14px_28px_-24px_rgba(0,0,0,0.75)]"
              label={t("Tax ID (optional)", "Numero fiscal (optionnel)")}
              value={newCustomerForm.taxId}
              onChange={(event) => setNewCustomerForm((prev) => ({ ...prev, taxId: event.target.value }))}
              placeholder={t("Tax or VAT ID", "Numero fiscal ou TVA")}
            />
          </div>
          <div>
            <Input
              className="h-12 rounded-2xl border-border/80 bg-white/85 px-4 text-[15px] leading-tight shadow-[0_10px_24px_-22px_rgba(15,23,42,0.45)] dark:border-slate-700 dark:bg-slate-900/95 dark:text-slate-100 dark:placeholder:text-slate-400 dark:shadow-[0_14px_28px_-24px_rgba(0,0,0,0.75)]"
              label={t("City", "Ville")}
              value={newCustomerForm.city}
              onChange={(event) => setNewCustomerForm((prev) => ({ ...prev, city: event.target.value }))}
              style={getAdaptiveInputStyle(newCustomerForm.city, 1, 0.82, 16, 0.02)}
              required
            />
          </div>
          <div>
            <Input
              className="h-12 rounded-2xl border-border/80 bg-white/85 px-4 text-[15px] leading-tight shadow-[0_10px_24px_-22px_rgba(15,23,42,0.45)] dark:border-slate-700 dark:bg-slate-900/95 dark:text-slate-100 dark:placeholder:text-slate-400 dark:shadow-[0_14px_28px_-24px_rgba(0,0,0,0.75)]"
              label={t("State", "Etat")}
              value={newCustomerForm.state}
              onChange={(event) => setNewCustomerForm((prev) => ({ ...prev, state: event.target.value }))}
              style={getAdaptiveInputStyle(newCustomerForm.state, 1, 0.82, 16, 0.02)}
              required
            />
          </div>
          <div>
            <Input
              className="h-12 rounded-2xl border-border/80 bg-white/85 px-4 shadow-[0_10px_24px_-22px_rgba(15,23,42,0.45)] dark:border-slate-700 dark:bg-slate-900/95 dark:text-slate-100 dark:placeholder:text-slate-400 dark:shadow-[0_14px_28px_-24px_rgba(0,0,0,0.75)]"
              label={t("Postal code", "Code postal")}
              value={newCustomerForm.postalCode}
              onChange={(event) => setNewCustomerForm((prev) => ({ ...prev, postalCode: event.target.value }))}
              placeholder={t("ZIP / postal code", "Code ZIP / postal")}
            />
          </div>
          <div>
            <CountrySelect
              label={t("Country", "Pays")}
              value={newCustomerForm.country}
              locale={language === "fr" ? "fr" : "en"}
              onChange={(value) => setNewCustomerForm((prev) => ({ ...prev, country: value }))}
              required
              triggerClassName="h-12 rounded-2xl border-border/80 bg-white/85 px-4 shadow-[0_10px_24px_-22px_rgba(15,23,42,0.45)] dark:border-slate-700 dark:bg-slate-900/95 dark:text-slate-100 dark:shadow-[0_14px_28px_-24px_rgba(0,0,0,0.75)]"
            />
          </div>
          <div className="flex flex-col gap-4 border-t border-border/60 pt-5 dark:border-slate-800 lg:col-span-2 lg:flex-row lg:items-center lg:justify-between">
            <p className="text-sm text-muted-foreground dark:text-slate-400">
              <span className="font-semibold text-foreground dark:text-slate-100">{t("Required fields", "Champs requis")}</span>
              <span className="ml-2">
                {t("must be completed before saving.", "doivent etre remplis avant l enregistrement.")}
              </span>
            </p>
            <div className="flex items-center justify-end gap-3 whitespace-nowrap">
              <Button
                type="button"
                variant="secondary"
                className="h-12 min-w-[136px] rounded-2xl border-slate-300 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(241,245,249,0.92))] px-6 text-[15px] font-semibold text-slate-700 shadow-[0_18px_40px_-30px_rgba(15,23,42,0.45)] hover:border-slate-400 hover:bg-[linear-gradient(180deg,rgba(255,255,255,1),rgba(248,250,252,0.96))] hover:text-slate-900 dark:border-slate-700 dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.98),rgba(15,23,42,0.9))] dark:text-slate-200 dark:shadow-[0_18px_40px_-30px_rgba(0,0,0,0.82)] dark:hover:border-slate-500 dark:hover:bg-[linear-gradient(180deg,rgba(17,24,39,1),rgba(15,23,42,0.94))] dark:hover:text-slate-100"
                onClick={() => setCustomerModalOpen(false)}
              >
                {t("Cancel", "Annuler")}
              </Button>
              <Button
                type="submit"
                loading={creatingCustomer}
                className="h-12 min-w-[208px] rounded-2xl border border-indigo-400/30 bg-[linear-gradient(135deg,#6657ff_0%,#5547f0_48%,#4338ca_100%)] px-7 text-[15px] font-semibold text-white shadow-[0_24px_54px_-20px_rgba(79,70,229,0.95)] ring-1 ring-white/10 hover:bg-[linear-gradient(135deg,#7163ff_0%,#5f51f4_48%,#4b3fd4_100%)]"
              >
                {t("Save customer", "Enregistrer client")}
              </Button>
            </div>
          </div>
        </form>
      </Modal>

      <Modal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title={t("Edit customer details", "Modifier les details client")}
      >
        <form className="space-y-4" onSubmit={saveCustomerDetails}>
          {editStatus ? (
            <TransientAlert variant={editStatus.variant} onDismiss={() => setEditStatus(null)}>
              {editStatus.message}
            </TransientAlert>
          ) : null}
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











