"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import useSWR from "swr";
import Image from "next/image";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { TransientAlert } from "@/components/ui/transient-alert";
import { CountrySelect } from "@/components/ui/country-select";
import { PhoneInput } from "@/components/ui/phone-input";
import { BUSINESS_CURRENCIES, formatBusinessCurrencyOption, isSupportedBusinessCurrency } from "@/lib/business-currencies";
import { type PayoutProvider } from "@/lib/payments/payment-providers";
import {
  getPreferredPayoutProvider,
  getSupportedPayoutProviders,
  resolvePayoutRequirements,
  type PayoutFieldKey,
} from "@/lib/payments/payout-requirements";
import { formatCurrency } from "@/lib/currency";
import { useLanguage } from "@/components/providers/language-provider";
import { formatBusinessAddress, hasRequiredAddress, parseBusinessAddress } from "@/lib/address";
import { getAccessibleSettingsTab, resolveRequestedSettingsTab, type SettingsTab } from "@/lib/dashboard/settings-tabs";
import {
  MIN_PASSWORD_LENGTH,
  PASSWORD_MIN_LENGTH_ERROR,
  PASSWORD_MIN_LENGTH_HELPER_TEXT,
} from "@/lib/password-policy";

const fetcher = (url: string) => fetch(url).then((r) => r.json());
const profileFetcher = async (url: string) => {
  const res = await fetch(url);
  const data = await res.json().catch(() => ({}));
  return { data, status: res.status };
};

export default function SettingsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { language } = useLanguage();
  const t = (en: string, fr: string) => (language === "fr" ? fr : en);
  const [activeTab, setActiveTab] = useState<SettingsTab>("profile");
  const [tabStateReady, setTabStateReady] = useState(false);
  const [pendingTab, setPendingTab] = useState<SettingsTab | null>(null);
  const [showUnsavedPrompt, setShowUnsavedPrompt] = useState(false);
  const [dirtyTabs, setDirtyTabs] = useState<Record<SettingsTab, boolean>>({
    profile: false,
    business: false,
    payout: false,
    security: false,
  });
  const [saveToast, setSaveToast] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [profileStatus, setProfileStatus] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSaving, setProfileSaving] = useState(false);
  const [passwordStatus, setPasswordStatus] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [profile, setProfile] = useState({ name: "", email: "" });
  const [passwords, setPasswords] = useState({ password: "", confirm: "" });
  const [currentPassword, setCurrentPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [setup, setSetup] = useState<{ secret: string; uri: string; qr?: string | null } | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [disableCode, setDisableCode] = useState("");
  const [totpBusy, setTotpBusy] = useState(false);
  const [businessStatus, setBusinessStatus] = useState<string | null>(null);
  const [businessError, setBusinessError] = useState<string | null>(null);
  const [businessSaving, setBusinessSaving] = useState(false);
  const [payoutStatus, setPayoutStatus] = useState<string | null>(null);
  const [payoutError, setPayoutError] = useState<string | null>(null);
  const [payoutSubmitting, setPayoutSubmitting] = useState(false);
  const [payoutProvider, setPayoutProvider] = useState<PayoutProvider>("PAYSTACK");
  const [payoutBankCode, setPayoutBankCode] = useState("");
  const [payoutAccountNumber, setPayoutAccountNumber] = useState("");
  const [payoutAccountName, setPayoutAccountName] = useState("");
  const [payoutIban, setPayoutIban] = useState("");
  const [payoutBicSwift, setPayoutBicSwift] = useState("");
  const [payoutBranchCode, setPayoutBranchCode] = useState("");
  const [payoutRoutingNumber, setPayoutRoutingNumber] = useState("");
  const [payoutProviderTouched, setPayoutProviderTouched] = useState(false);
  const [payoutAttempted, setPayoutAttempted] = useState(false);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [logoInfoOpen, setLogoInfoOpen] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null);
  const logoInfoRef = useRef<HTMLSpanElement | null>(null);
  const logoInputRef = useRef<HTMLInputElement | null>(null);
  const [businessForm, setBusinessForm] = useState({
    businessName: "",
    country: "US",
    defaultCurrency: "USD",
    streetAddress: "",
    city: "",
    postalCode: "",
    businessEmail: "",
    businessPhone: "",
    taxId: "",
    vatEnabled: false,
    vatRate: "",
    vatPricingMode: "exclusive",
  });
  const [lateFeeForm, setLateFeeForm] = useState({
    lateFeeEnabled: false,
    lateFeeType: "flat" as "flat" | "percentage",
    lateFeeValue: "",
    gracePeriodDays: "0",
    lateFeeMode: "one_time" as "one_time" | "recurring",
    lateFeeIntervalDays: "1",
    allowAutomationLateFee: false,
    maxLateFeeApplications: "",
  });

  const { data: totpStatus, mutate: refreshTotp } = useSWR("/api/auth/2fa/totp", fetcher);
  const { data: me, mutate: refreshMe } = useSWR("/api/user/me", fetcher);
  const hasResolvedUserContext = typeof me !== "undefined";
  const orgRole = String(me?.orgRole || "").toLowerCase();
  const canReadBusinessSettings =
    orgRole === "owner" || orgRole === "admin" || orgRole === "billing_admin" || orgRole === "member";
  const canEditBusinessSettings = orgRole === "owner" || orgRole === "admin";
  const canReadPayoutSettings = orgRole === "owner" || orgRole === "admin" || orgRole === "billing_admin";
  const canEditPayoutSettings = orgRole === "owner" || orgRole === "admin" || orgRole === "billing_admin";
  const { data: businessProfileResponse, mutate: refreshBusinessProfile } = useSWR(
    canReadBusinessSettings ? "/api/business-profile" : null,
    profileFetcher
  );
  const { data: lateFeeSettingsResponse, mutate: refreshLateFeeSettings } = useSWR(
    canReadBusinessSettings ? "/api/subscriber-settings/late-fee" : null,
    profileFetcher
  );
  const enabled = Boolean(totpStatus?.enabled);
  const businessProfile = businessProfileResponse?.data;
  const businessExists = Boolean(businessProfile?.id);
  const supportedPayoutProviders = useMemo(
    () =>
      getSupportedPayoutProviders({
        country: businessForm.country,
        currency: businessForm.defaultCurrency,
      }),
    [businessForm.country, businessForm.defaultCurrency]
  );
  const preferredPayoutProvider = useMemo(
    () =>
      getPreferredPayoutProvider({
        country: businessForm.country,
        currency: businessForm.defaultCurrency,
        preferredProvider: payoutProvider,
      }),
    [businessForm.country, businessForm.defaultCurrency, payoutProvider]
  );
  const payoutRequirements = useMemo(
    () =>
      resolvePayoutRequirements({
        provider: payoutProvider,
        country: businessForm.country,
        currency: businessForm.defaultCurrency,
      }),
    [businessForm.country, businessForm.defaultCurrency, payoutProvider]
  );
  const isSepa = payoutRequirements.payoutType === "sepa";
  const payoutCurrency = payoutRequirements.currency;
  const payoutProviderSupportsSelection = payoutRequirements.supported;
  const anyProviderSupportsPayoutCurrency = supportedPayoutProviders.length > 0;
  const payoutBankUrl = isSepa
    ? null
    : canEditPayoutSettings && payoutProviderSupportsSelection && payoutRequirements.bankListRequired
      ? `/api/merchant-account/banks?provider=${payoutRequirements.provider}&country=${businessForm.country}&currency=${payoutCurrency}`
      : null;
  const { data: payoutBanks } = useSWR(payoutBankUrl, fetcher);
  const payoutBankList = useMemo(() => payoutBanks?.banks || [], [payoutBanks?.banks]);
  const selectedPayoutBank = useMemo(
    () => payoutBankList.find((bank: any) => bank.code === payoutBankCode) || null,
    [payoutBankCode, payoutBankList]
  );
  const payoutBranchUrl =
    canEditPayoutSettings &&
    payoutRequirements.requiredFields.includes("branchCode") &&
    payoutRequirements.provider === "FLUTTERWAVE" &&
    selectedPayoutBank?.id
      ? `/api/merchant-account/bank-branches?bankId=${selectedPayoutBank.id}`
      : null;
  const { data: payoutBranches } = useSWR(payoutBranchUrl, fetcher);
  const { data: merchantAccountRes, mutate: refreshMerchantAccount } = useSWR(
    canReadPayoutSettings ? "/api/merchant-account" : null,
    profileFetcher
  );
  const payoutBankError = payoutBanks?.error ? String(payoutBanks.error) : null;
  const payoutBranchList = useMemo(() => payoutBranches?.branches || [], [payoutBranches?.branches]);
  const payoutBranchError = payoutBranches?.error ? String(payoutBranches.error) : null;
  const payoutConnected = Boolean(merchantAccountRes?.status === 200 && merchantAccountRes?.data?.id);
  const businessProfileReadError =
    canReadBusinessSettings &&
    businessProfileResponse?.status !== undefined &&
    ![200, 404].includes(businessProfileResponse.status)
      ? String(
          businessProfileResponse?.data?.error ||
            t("Business settings are currently unavailable.", "Les parametres entreprise sont indisponibles.")
        )
      : null;
  const lateFeeReadError =
    canReadBusinessSettings &&
    lateFeeSettingsResponse?.status !== undefined &&
    ![200, 404].includes(lateFeeSettingsResponse.status)
      ? String(
          lateFeeSettingsResponse?.data?.error ||
            t("Late fee settings are currently unavailable.", "Les parametres de frais de retard sont indisponibles.")
        )
      : null;
  const payoutReadError =
    canReadPayoutSettings &&
    merchantAccountRes?.status !== undefined &&
    ![200, 404].includes(merchantAccountRes.status)
      ? String(
          merchantAccountRes?.data?.error ||
            t("Payout settings are currently unavailable.", "Les parametres de paiement sont indisponibles.")
        )
      : null;
  const businessSettingsUnavailable = Boolean(businessProfileReadError || lateFeeReadError);
  const payoutSettingsUnavailable = Boolean(payoutReadError);
  const businessFormDisabled = !canEditBusinessSettings || businessSaving || logoUploading || businessSettingsUnavailable;
  const payoutFormDisabled = !canEditPayoutSettings || payoutSubmitting || payoutSettingsUnavailable;

  const businessCurrencyOptions = BUSINESS_CURRENCIES.map((code) => ({
    code,
    label: formatBusinessCurrencyOption(code),
  }));
  const requiredMessage = t("This field is required", "Ce champ est requis");
  const formatRequiredFieldMessage = (label: string) =>
    t(`${label} is required.`, `${label} est requis.`);
  const payoutFieldLabels: Record<PayoutFieldKey, string> = {
    accountName: t("Account holder name", "Nom du titulaire"),
    bankCode: t("Bank", "Banque"),
    accountNumber: t("Account number", "Numero de compte"),
    iban: t("IBAN", "IBAN"),
    bicSwift: t("BIC / SWIFT", "BIC / SWIFT"),
    branchCode: t("Branch code", "Code agence"),
    routingNumber: t("Routing number", "Numero d acheminement"),
    sortCode: t("Sort code", "Code guichet"),
  };

  const markDirty = (tab: SettingsTab) => {
    setDirtyTabs((prev) => (prev[tab] ? prev : { ...prev, [tab]: true }));
  };

  const clearDirty = (tab: SettingsTab) => {
    setDirtyTabs((prev) => ({ ...prev, [tab]: false }));
  };

  const showSavedToast = () => {
    setSaveToast(t("Changes saved successfully", "Modifications enregistrees avec succes"));
  };

  const switchTab = (nextTab: SettingsTab) => {
    if (!tabStateReady) return;
    if (nextTab === activeTab) return;
    if (dirtyTabs[activeTab]) {
      setPendingTab(nextTab);
      setShowUnsavedPrompt(true);
      return;
    }
    setActiveTab(nextTab);
  };

  const confirmLeaveWithUnsavedChanges = () => {
    if (pendingTab) {
      setActiveTab(pendingTab);
    }
    setPendingTab(null);
    setShowUnsavedPrompt(false);
  };

  const cancelLeaveWithUnsavedChanges = () => {
    setPendingTab(null);
    setShowUnsavedPrompt(false);
  };

  useEffect(() => {
    if (!hasResolvedUserContext || tabStateReady) return;
    const rawTab = searchParams.get("tab");
    const nextTab = resolveRequestedSettingsTab(rawTab, { canReadBusinessSettings, canReadPayoutSettings });
    setActiveTab(nextTab);
    setTabStateReady(true);
  }, [tabStateReady, hasResolvedUserContext, searchParams, canReadBusinessSettings, canReadPayoutSettings]);

  useEffect(() => {
    if (!hasResolvedUserContext || !tabStateReady) return;
    const params = new URLSearchParams(searchParams.toString());
    const currentTabParam = searchParams.get("tab");
    const nextTabParam = activeTab === "profile" ? null : activeTab;
    if (currentTabParam === nextTabParam) return;
    if (nextTabParam) {
      params.set("tab", nextTabParam);
    } else {
      params.delete("tab");
    }
    const nextQuery = params.toString();
    router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false });
  }, [activeTab, tabStateReady, hasResolvedUserContext, pathname, router, searchParams]);

  useEffect(() => {
    if (me?.name || me?.email) {
      setProfile({ name: me?.name || "", email: me?.email || "" });
    }
  }, [me?.name, me?.email]);

  useEffect(() => {
    if (!tabStateReady) return;
    const accessibleTab = getAccessibleSettingsTab(activeTab, { canReadBusinessSettings, canReadPayoutSettings });
    if (accessibleTab !== activeTab) {
      setActiveTab(accessibleTab);
    }
  }, [activeTab, tabStateReady, canReadBusinessSettings, canReadPayoutSettings]);

  useEffect(() => {
    if (businessProfile?.id) {
      const parsedAddress = parseBusinessAddress(businessProfile.businessAddress);
      setBusinessForm({
        businessName: businessProfile.businessName || "",
        country: businessProfile.country || "US",
        defaultCurrency: businessProfile.defaultCurrency || "USD",
        streetAddress: parsedAddress.streetAddress || "",
        city: parsedAddress.city || "",
        postalCode: parsedAddress.postalCode || "",
        businessEmail: businessProfile.businessEmail || "",
        businessPhone: businessProfile.businessPhone || "",
        taxId: businessProfile.taxId || "",
        vatEnabled: Boolean(businessProfile.vatEnabled),
        vatRate:
          businessProfile.vatRateDisplay
            ? String(businessProfile.vatRateDisplay)
            : businessProfile.vatRate === null || businessProfile.vatRate === undefined
            ? ""
            : String(businessProfile.vatRate),
        vatPricingMode:
          String(businessProfile.vatPricingMode || "EXCLUSIVE").toLowerCase() === "inclusive"
            ? "inclusive"
            : "exclusive",
      });
    }
  }, [
    businessProfile?.id,
    businessProfile?.businessName,
    businessProfile?.country,
    businessProfile?.defaultCurrency,
    businessProfile?.businessAddress,
    businessProfile?.businessEmail,
    businessProfile?.businessPhone,
    businessProfile?.taxId,
    businessProfile?.vatEnabled,
    businessProfile?.vatRate,
    businessProfile?.vatRateDisplay,
    businessProfile?.vatPricingMode,
  ]);

  useEffect(() => {
    if (logoFile) {
      const url = URL.createObjectURL(logoFile);
      setLogoPreviewUrl(url);
      return () => URL.revokeObjectURL(url);
    }
    if (businessProfile?.logoUrl) {
      setLogoPreviewUrl(String(businessProfile.logoUrl));
      return;
    }
    setLogoPreviewUrl(null);
  }, [logoFile, businessProfile?.logoUrl]);

  useEffect(() => {
    if (!logoInfoOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!logoInfoRef.current) return;
      if (!logoInfoRef.current.contains(event.target as Node)) {
        setLogoInfoOpen(false);
      }
    };
    document.addEventListener("pointerdown", handlePointerDown, true);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
    };
  }, [logoInfoOpen]);

  useEffect(() => {
    if (businessProfile?.id) return;
    if (!me?.preferredCurrency) return;
    const preferred = String(me.preferredCurrency).toUpperCase();
    if (!isSupportedBusinessCurrency(preferred)) return;
    setBusinessForm((prev) => ({
      ...prev,
      defaultCurrency: preferred,
    }));
  }, [businessProfile?.id, me?.preferredCurrency]);


  useEffect(() => {
    if (!merchantAccountRes?.data || merchantAccountRes.status !== 200) return;
    const record = merchantAccountRes.data;
    if (!payoutAccountName && record.accountName) {
      setPayoutAccountName(record.accountName);
    }
    if (!payoutAccountNumber && record.accountNumber) {
      setPayoutAccountNumber(record.accountNumber);
    }
    if (!payoutIban && record.iban) {
      setPayoutIban(record.iban);
    }
    if (!payoutBicSwift && record.bicSwift) {
      setPayoutBicSwift(record.bicSwift);
    }
    const details =
      record.payoutDetails && typeof record.payoutDetails === "object" ? record.payoutDetails : null;
    if (!payoutBranchCode && typeof details?.branchCode === "string") {
      setPayoutBranchCode(details.branchCode);
    }
    if (!payoutRoutingNumber && typeof details?.routingNumber === "string") {
      setPayoutRoutingNumber(details.routingNumber);
    }
    if (record.provider) {
      setPayoutProvider(record.provider);
    }
  }, [
    merchantAccountRes?.data,
    merchantAccountRes?.status,
    payoutAccountName,
    payoutAccountNumber,
    payoutBicSwift,
    payoutBranchCode,
    payoutIban,
    payoutRoutingNumber,
  ]);

  useEffect(() => {
    if (payoutProvider !== preferredPayoutProvider) {
      setPayoutProvider(preferredPayoutProvider);
      setPayoutProviderTouched(false);
      setPayoutBankCode("");
      setPayoutBranchCode("");
      return;
    }
    if (!payoutProviderSupportsSelection) {
      setPayoutBankCode("");
      setPayoutBranchCode("");
      return;
    }
    if (!payoutBankList.length) {
      setPayoutBankCode("");
      setPayoutBranchCode("");
      return;
    }
    setPayoutBankCode((prev) => prev || payoutBankList[0].code);
  }, [
    payoutBankList,
    payoutProvider,
    payoutProviderSupportsSelection,
    preferredPayoutProvider,
  ]);

  useEffect(() => {
    if (!payoutRequirements.requiredFields.includes("branchCode")) {
      setPayoutBranchCode("");
      return;
    }
    if (!payoutBranchList.length) return;
    setPayoutBranchCode((prev) => prev || payoutBranchList[0].code);
  }, [payoutBranchList, payoutRequirements.requiredFields]);

  useEffect(() => {
    if (lateFeeSettingsResponse?.status !== 200 || !lateFeeSettingsResponse?.data) return;
    const settings = lateFeeSettingsResponse.data;
    setLateFeeForm({
      lateFeeEnabled: Boolean(settings.lateFeeEnabled),
      lateFeeType:
        String(settings.lateFeeType || "FIXED").toUpperCase() === "PERCENTAGE"
          ? "percentage"
          : "flat",
      lateFeeValue: String(settings.lateFeeValue ?? "0"),
      gracePeriodDays: String(
        settings.gracePeriodDays ?? settings.lateFeeGraceDays ?? 0
      ),
      lateFeeMode:
        String(settings.lateFeeMode || "ONE_TIME").toUpperCase() === "RECURRING"
          ? "recurring"
          : "one_time",
      lateFeeIntervalDays: String(
        settings.lateFeeIntervalDays ??
          settings.lateFeeRecurringIntervalDays ??
          1
      ),
      allowAutomationLateFee: Boolean(settings.allowAutomationLateFee),
      maxLateFeeApplications:
        settings.maxLateFeeApplications === null ||
        settings.maxLateFeeApplications === undefined
          ? ""
          : String(settings.maxLateFeeApplications),
    });
  }, [lateFeeSettingsResponse?.status, lateFeeSettingsResponse?.data]);

  const updateProfileField = (field: "name" | "email", value: string) => {
    setProfile((prev) => ({ ...prev, [field]: value }));
    markDirty("profile");
  };

  const updateBusinessField = (
    field: keyof typeof businessForm,
    value: string | boolean
  ) => {
    setBusinessForm((prev) => ({ ...prev, [field]: value }));
    markDirty("business");
  };

  const toggleVatEnabled = (enabled: boolean) => {
    setBusinessForm((prev) => ({
      ...prev,
      vatEnabled: enabled,
      taxId: enabled ? prev.taxId : "",
    }));
    markDirty("business");
  };

  const updateLateFeeField = (
    field: keyof typeof lateFeeForm,
    value: string | boolean
  ) => {
    setLateFeeForm((prev) => ({ ...prev, [field]: value as never }));
    markDirty("business");
  };

  const resetLateFeeDefaults = () => {
    setLateFeeForm({
      lateFeeEnabled: false,
      lateFeeType: "percentage",
      lateFeeValue: "0",
      gracePeriodDays: "0",
      lateFeeMode: "one_time",
      lateFeeIntervalDays: "1",
      allowAutomationLateFee: false,
      maxLateFeeApplications: "",
    });
    markDirty("business");
  };

  const updatePasswordField = (field: "password" | "confirm", value: string) => {
    setPasswords((prev) => ({ ...prev, [field]: value }));
    markDirty("security");
  };

  const saveProfile = async () => {
    if (profileSaving) return;
    setProfileStatus(null);
    setProfileError(null);
    if (!profile.name.trim() || !profile.email.trim()) {
      setProfileError(requiredMessage);
      return;
    }
    setProfileSaving(true);
    try {
      const res = await fetch("/api/user/me", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profile),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setProfileError(data.error || t("Could not update profile.", "Impossible de mettre a jour le profil."));
        return;
      }
      setProfileStatus(t("Profile updated.", "Profil mis a jour."));
      if (data?.name || data?.email) {
        setProfile({ name: data?.name || profile.name, email: data?.email || profile.email });
      }
      clearDirty("profile");
      showSavedToast();
      refreshMe();
    } catch {
      setProfileError(t("Could not update profile.", "Impossible de mettre a jour le profil."));
    } finally {
      setProfileSaving(false);
    }
  };

  const updatePassword = async () => {
    if (passwordSaving) return;
    setPasswordStatus(null);
    setPasswordError(null);
    if (
      passwords.password.length < MIN_PASSWORD_LENGTH ||
      passwords.confirm.length < MIN_PASSWORD_LENGTH
    ) {
      setPasswordError(PASSWORD_MIN_LENGTH_ERROR);
      return;
    }
    setPasswordSaving(true);
    try {
      const res = await fetch("/api/user/password", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, ...passwords }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPasswordError(data.error || t("Could not update password.", "Impossible de mettre a jour le mot de passe."));
        return;
      }
      setPasswordStatus(t("Password updated.", "Mot de passe mis a jour."));
      setPasswords({ password: "", confirm: "" });
      setCurrentPassword("");
      clearDirty("security");
      showSavedToast();
    } catch {
      setPasswordError(t("Could not update password.", "Impossible de mettre a jour le mot de passe."));
    } finally {
      setPasswordSaving(false);
    }
  };

  const startTotpSetup = async () => {
    if (totpBusy) return;
    setTotpBusy(true);
    setStatus(null);
    setBackupCodes(null);
    try {
      const res = await fetch("/api/auth/2fa/totp", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setStatus(data.error || t("Could not start 2FA setup.", "Impossible de demarrer la 2FA."));
        return;
      }
      setSetup({ secret: data.secret, uri: data.uri, qr: data.qr });
      setStatus(null);
    } catch {
      setStatus(t("Could not start 2FA setup.", "Impossible de demarrer la 2FA."));
    } finally {
      setTotpBusy(false);
    }
  };

  const enableTotp = async () => {
    if (totpBusy) return;
    if (!otp.trim()) return;
    setTotpBusy(true);
    try {
      const res = await fetch("/api/auth/2fa/totp", { method: "PUT", body: JSON.stringify({ code: otp }) });
      const data = await res.json();
      if (!res.ok) {
        setStatus(data.error || t("Could not enable 2FA.", "Impossible d activer la 2FA."));
        return;
      }
      setSetup(null);
      setOtp("");
      setBackupCodes(data.backupCodes || null);
      setStatus(null);
      clearDirty("security");
      showSavedToast();
      refreshTotp();
    } catch {
      setStatus(t("Could not enable 2FA.", "Impossible d activer la 2FA."));
    } finally {
      setTotpBusy(false);
    }
  };

  const disableTotp = async () => {
    if (totpBusy) return;
    if (!disableCode.trim()) return;
    setTotpBusy(true);
    try {
      const res = await fetch("/api/auth/2fa/totp", {
        method: "DELETE",
        body: JSON.stringify({ code: disableCode }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus(data.error || t("Could not disable 2FA.", "Impossible de desactiver la 2FA."));
        return;
      }
      setDisableCode("");
      setBackupCodes(null);
      setSetup(null);
      setStatus(null);
      clearDirty("security");
      showSavedToast();
      refreshTotp();
    } catch {
      setStatus(t("Could not disable 2FA.", "Impossible de desactiver la 2FA."));
    } finally {
      setTotpBusy(false);
    }
  };

  const saveBusinessProfile = async () => {
    if (!canEditBusinessSettings) return;
    if (businessSettingsUnavailable) return;
    if (businessSaving) return;
    setBusinessStatus(null);
    setBusinessError(null);
    setLogoError(null);
    if (!businessForm.businessName.trim()) {
      setBusinessError(requiredMessage);
      return;
    }
    if (!businessForm.country.trim() || !businessForm.defaultCurrency.trim()) {
      setBusinessError(requiredMessage);
      return;
    }
    if (!businessForm.businessEmail.trim()) {
      setBusinessError(requiredMessage);
      return;
    }
    if (!businessForm.businessPhone.trim()) {
      setBusinessError(requiredMessage);
      return;
    }
    if (businessForm.vatEnabled && !String(businessForm.vatRate).trim()) {
      setBusinessError(requiredMessage);
      return;
    }
    if (businessForm.vatEnabled && !String(businessForm.taxId).trim()) {
      setBusinessError(t("Tax ID is required when VAT is enabled.", "L ID fiscal est requis lorsque la TVA est activee."));
      return;
    }
    if (lateFeeForm.lateFeeEnabled) {
      const lateFeeValue = Number(lateFeeForm.lateFeeValue);
      const graceDays = Number(lateFeeForm.gracePeriodDays);
      if (!Number.isFinite(lateFeeValue) || lateFeeValue <= 0) {
        setBusinessError(t("Late fee value must be greater than zero.", "La valeur des frais de retard doit etre superieure a zero."));
        return;
      }
      if (lateFeeForm.lateFeeType === "percentage" && lateFeeValue > 100) {
        setBusinessError(t("Late fee percentage cannot exceed 100%.", "Le pourcentage des frais de retard ne peut pas depasser 100 %."));
        return;
      }
      if (!Number.isFinite(graceDays) || graceDays < 0) {
        setBusinessError(t("Grace period must be zero or greater.", "La periode de grace doit etre egale ou superieure a zero."));
        return;
      }
      if (lateFeeForm.lateFeeMode === "recurring") {
        const intervalDays = Number(lateFeeForm.lateFeeIntervalDays);
        if (!Number.isFinite(intervalDays) || intervalDays < 1) {
          setBusinessError(t("Recurring interval must be at least 1 day.", "L intervalle recurrent doit etre d au moins 1 jour."));
          return;
        }
      }
      if (String(lateFeeForm.maxLateFeeApplications).trim()) {
        const maxApplications = Number(lateFeeForm.maxLateFeeApplications);
        if (!Number.isFinite(maxApplications) || maxApplications < 1) {
          setBusinessError(t("Maximum applications must be at least 1.", "Le maximum d applications doit etre d au moins 1."));
          return;
        }
      }
    }
    const addressFields = {
      streetAddress: businessForm.streetAddress,
      city: businessForm.city,
      region: "",
      postalCode: businessForm.postalCode,
    };
    if (!hasRequiredAddress(addressFields)) {
      setBusinessError(requiredMessage);
      return;
    }
    setBusinessSaving(true);
    const formattedAddress = formatBusinessAddress(addressFields);
    const payload = {
      businessName: businessForm.businessName,
      country: businessForm.country,
      defaultCurrency: businessForm.defaultCurrency,
      businessAddress: formattedAddress,
      businessEmail: businessForm.businessEmail,
      businessPhone: businessForm.businessPhone,
      taxId: businessForm.vatEnabled ? businessForm.taxId : "",
      vatEnabled: businessForm.vatEnabled,
      vatRate: businessForm.vatEnabled ? Number(businessForm.vatRate) : 0,
      vatRateDisplay: businessForm.vatEnabled ? String(businessForm.vatRate).trim() : null,
      vatPricingMode: businessForm.vatPricingMode,
    };
    const lateFeeValueNumber = Number(lateFeeForm.lateFeeValue || 0);
    const gracePeriodDaysNumber = Number(lateFeeForm.gracePeriodDays || 0);
    const intervalDaysNumber = Number(lateFeeForm.lateFeeIntervalDays || 0);
    const maxApplicationsNumber = Number(lateFeeForm.maxLateFeeApplications || 0);
    const lateFeePolicyText = lateFeeForm.lateFeeEnabled
      ? `Late fee may apply after ${gracePeriodDaysNumber} days.`
      : null;
    const lateFeePayload = {
      lateFeeEnabled: lateFeeForm.lateFeeEnabled,
      lateFeeType: lateFeeForm.lateFeeType === "percentage" ? "PERCENTAGE" : "FIXED",
      lateFeeValue: lateFeeForm.lateFeeEnabled ? lateFeeValueNumber : 0,
      gracePeriodDays: lateFeeForm.lateFeeEnabled ? gracePeriodDaysNumber : 0,
      lateFeeMode: lateFeeForm.lateFeeMode === "recurring" ? "RECURRING" : "ONE_TIME",
      lateFeeIntervalDays:
        lateFeeForm.lateFeeEnabled && lateFeeForm.lateFeeMode === "recurring"
          ? intervalDaysNumber
          : null,
      allowAutomationLateFee:
        lateFeeForm.lateFeeEnabled && lateFeeForm.allowAutomationLateFee,
      maxLateFeeApplications:
        lateFeeForm.lateFeeEnabled && String(lateFeeForm.maxLateFeeApplications).trim()
          ? maxApplicationsNumber
          : null,
      lateFeeGraceDays: lateFeeForm.lateFeeEnabled ? gracePeriodDaysNumber : 0,
      lateFeeCap: null,
      lateFeeRecurring: lateFeeForm.lateFeeEnabled && lateFeeForm.lateFeeMode === "recurring",
      lateFeeRecurringIntervalDays:
        lateFeeForm.lateFeeEnabled && lateFeeForm.lateFeeMode === "recurring"
          ? intervalDaysNumber
          : null,
      lateFeePolicyText,
    };
    try {
      const res = await fetch("/api/business-profile", {
        method: businessExists ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setBusinessError(data.error || t("Could not save business profile.", "Impossible d enregistrer le profil entreprise."));
        return;
      }
      await refreshBusinessProfile();
      const lateFeeRes = await fetch("/api/subscriber-settings/late-fee", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(lateFeePayload),
      });
      const lateFeeData = await lateFeeRes.json().catch(() => ({}));
      if (!lateFeeRes.ok) {
        setBusinessStatus(
          businessExists
            ? t("Business profile updated.", "Profil entreprise mis a jour.")
            : t("Business profile saved.", "Profil entreprise enregistre.")
        );
        setBusinessError(
          lateFeeData.error ||
            t(
              "Business profile saved, but late fee settings could not be saved.",
              "Le profil entreprise est enregistre, mais les parametres de frais de retard n ont pas pu etre enregistres."
            )
        );
        return;
      }
      await refreshLateFeeSettings();
      setBusinessStatus(
        businessExists
          ? t("Business profile updated.", "Profil entreprise mis a jour.")
          : t("Business profile saved.", "Profil entreprise enregistre.")
      );
      let logoUploadFailed = false;
      if (logoFile) {
        setLogoUploading(true);
        try {
          const formData = new FormData();
          formData.append("logo", logoFile);
          const uploadRes = await fetch("/api/business-profile/logo", {
            method: "POST",
            body: formData,
          });
          const uploadData = await uploadRes.json().catch(() => ({}));
          if (!uploadRes.ok) {
            logoUploadFailed = true;
            setLogoError(uploadData.error || t("Logo upload failed.", "Echec du televersement du logo."));
          } else {
            setLogoFile(null);
            await refreshBusinessProfile();
          }
        } catch {
          logoUploadFailed = true;
          setLogoError(t("Logo upload failed.", "Echec du televersement du logo."));
        } finally {
          setLogoUploading(false);
        }
      }
      if (logoUploadFailed) {
        return;
      }
      clearDirty("business");
      showSavedToast();
    } catch {
      setBusinessError(t("Could not save business profile.", "Impossible d enregistrer le profil entreprise."));
    } finally {
      setBusinessSaving(false);
    }
  };

  const removeBusinessLogo = async () => {
    setLogoError(null);
    setLogoFile(null);
    try {
      const res = await fetch("/api/business-profile/logo", { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setLogoError(data.error || t("Could not remove logo.", "Impossible de supprimer le logo."));
        return;
      }
      refreshBusinessProfile();
    } catch {
      setLogoError(t("Could not remove logo.", "Impossible de supprimer le logo."));
    }
  };

  const createPayoutAccount = async () => {
    setPayoutStatus(null);
    setPayoutError(null);
    if (!canEditPayoutSettings) return;
    if (payoutSettingsUnavailable) return;
    if (payoutSubmitting) return;
    setPayoutAttempted(true);
    if (payoutBankError) {
      setPayoutError(payoutBankError);
      return;
    }
    const businessName = businessForm.businessName.trim();
    const businessEmail = (businessForm.businessEmail || profile.email).trim();
    const businessPhone = businessForm.businessPhone.trim();
    const accountName = payoutAccountName.trim();
    const accountNumber = payoutAccountNumber.trim();
    const iban = payoutIban.trim();
    const bicSwift = payoutBicSwift.trim();
    const branchCode = payoutBranchCode.trim();
    const routingNumber = payoutRoutingNumber.trim();

    if (!businessName) {
      setPayoutError(t("Business name is required.", "Le nom de l entreprise est requis."));
      return;
    }
    if (!businessEmail) {
      setPayoutError(t("Business email is required.", "L email de l entreprise est requis."));
      return;
    }
    if (!businessPhone) {
      setPayoutError(t("Business phone is required.", "Le telephone de l entreprise est requis."));
      return;
    }
    if (!payoutProviderSupportsSelection) {
      setPayoutError(
        anyProviderSupportsPayoutCurrency
          ? t(
              "The selected payout provider does not support this country or default business currency.",
              "Le fournisseur de paiement selectionne ne prend pas en charge ce pays ou la devise par defaut de votre entreprise."
            )
          : t(
              "Automated payouts are not available yet for this country and default business currency.",
              "Les paiements automatiques ne sont pas encore disponibles pour ce pays et cette devise par defaut."
            )
      );
      return;
    }
    for (const field of payoutRequirements.requiredFields) {
      if (field === "accountName" && !accountName) {
        setPayoutError(formatRequiredFieldMessage(payoutFieldLabels.accountName));
        return;
      }
      if (field === "iban" && !iban) {
        setPayoutError(formatRequiredFieldMessage(payoutFieldLabels.iban));
        return;
      }
      if (field === "bicSwift" && !bicSwift) {
        setPayoutError(formatRequiredFieldMessage(payoutFieldLabels.bicSwift));
        return;
      }
      if (field === "bankCode" && !payoutBankCode) {
        setPayoutError(formatRequiredFieldMessage(payoutFieldLabels.bankCode));
        return;
      }
      if (field === "accountNumber" && !accountNumber) {
        setPayoutError(formatRequiredFieldMessage(payoutFieldLabels.accountNumber));
        return;
      }
      if (field === "branchCode" && !branchCode) {
        setPayoutError(formatRequiredFieldMessage(payoutFieldLabels.branchCode));
        return;
      }
      if (field === "routingNumber" && !routingNumber) {
        setPayoutError(formatRequiredFieldMessage(payoutFieldLabels.routingNumber));
        return;
      }
    }
    if (payoutRequirements.bankListRequired && !payoutBankList.length) {
      setPayoutError(
        t(
          "No banks are available for this provider and country yet.",
          "Aucune banque n est encore disponible pour ce fournisseur et ce pays."
        )
      );
      return;
    }
    setPayoutSubmitting(true);
    try {
      const res = await fetch("/api/merchant-account/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: payoutRequirements.provider,
          businessName,
          businessEmail,
          accountName,
          accountNumber: payoutRequirements.requiredFields.includes("accountNumber") ? accountNumber : undefined,
          bankCode: payoutRequirements.requiredFields.includes("bankCode") ? payoutBankCode : undefined,
          iban: payoutRequirements.requiredFields.includes("iban") ? iban : undefined,
          bicSwift: payoutRequirements.requiredFields.includes("bicSwift") ? bicSwift : undefined,
          branchCode: payoutRequirements.requiredFields.includes("branchCode") ? branchCode : undefined,
          routingNumber: payoutRequirements.requiredFields.includes("routingNumber") ? routingNumber : undefined,
          payoutType: payoutRequirements.payoutType,
          country: businessForm.country,
          currency: payoutCurrency,
          phone: businessPhone,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPayoutError(data.error || t("Could not create payout account.", "Impossible de creer le compte de paiement."));
        return;
      }
      setPayoutStatus(t("Payout account created.", "Compte de paiement cree."));
      clearDirty("payout");
      refreshMerchantAccount();
      showSavedToast();
    } catch {
      setPayoutError(t("Could not create payout account.", "Impossible de creer le compte de paiement."));
    } finally {
      setPayoutSubmitting(false);
    }
  };

  const passwordStrength = useMemo(() => {
    const value = passwords.password;
    if (!value) return { score: 0, key: "none" as const };
    let score = 0;
    if (value.length >= MIN_PASSWORD_LENGTH) score += 1;
    if (/[A-Z]/.test(value) && /[a-z]/.test(value)) score += 1;
    if (/\d/.test(value)) score += 1;
    if (/[^A-Za-z0-9]/.test(value)) score += 1;
    if (score <= 1) return { score, key: "weak" as const };
    if (score <= 3) return { score, key: "medium" as const };
    return { score, key: "strong" as const };
  }, [passwords.password]);

  const passwordStrengthLabel =
    passwordStrength.key === "none"
      ? t("No password entered", "Aucun mot de passe saisi")
      : passwordStrength.key === "weak"
      ? t("Weak", "Faible")
      : passwordStrength.key === "medium"
      ? t("Medium", "Moyen")
      : t("Strong", "Fort");
  const passwordStrengthTextTone =
    passwordStrength.key === "weak"
      ? "text-rose-600"
      : passwordStrength.key === "medium"
      ? "text-amber-600"
      : passwordStrength.key === "strong"
      ? "text-emerald-600"
      : "text-muted-foreground";
  const getPasswordStrengthBarTone = (index: number) => {
    if (passwordStrength.score <= index) return "bg-slate-300 dark:bg-slate-700";
    if (passwordStrength.key === "weak") return "bg-rose-500";
    if (passwordStrength.key === "medium") return "bg-amber-500";
    if (passwordStrength.key === "strong") return "bg-emerald-500";
    return "bg-slate-300 dark:bg-slate-700";
  };
  const passwordFormValid =
    currentPassword.trim().length > 0 &&
    passwords.password.length >= MIN_PASSWORD_LENGTH &&
    passwords.confirm.length >= MIN_PASSWORD_LENGTH &&
    passwords.password === passwords.confirm;

  const lateFeeValueNumber = Number(lateFeeForm.lateFeeValue);
  const gracePeriodDaysNumber = Number(lateFeeForm.gracePeriodDays);
  const intervalDaysNumber = Number(lateFeeForm.lateFeeIntervalDays);
  const maxApplicationsNumber = Number(lateFeeForm.maxLateFeeApplications);
  const lateFeeValueError = !lateFeeForm.lateFeeEnabled
    ? ""
    : !Number.isFinite(lateFeeValueNumber)
      ? t("Late fee value is required.", "La valeur des frais de retard est requise.")
      : lateFeeForm.lateFeeType === "percentage" && lateFeeValueNumber <= 0
        ? t("Percentage must be greater than 0.", "Le pourcentage doit etre superieur a 0.")
        : lateFeeForm.lateFeeType === "percentage" && lateFeeValueNumber > 100
          ? t("Percentage cannot exceed 100.", "Le pourcentage ne peut pas depasser 100.")
          : lateFeeForm.lateFeeType === "flat" && lateFeeValueNumber <= 0
            ? t("Flat amount must be greater than 0.", "Le montant fixe doit etre superieur a 0.")
            : "";
  const gracePeriodError = !lateFeeForm.lateFeeEnabled
    ? ""
    : !Number.isFinite(gracePeriodDaysNumber) || gracePeriodDaysNumber < 0
      ? t("Grace period must be 0 or higher.", "La periode de grace doit etre superieure ou egale a 0.")
      : "";
  const intervalDaysError =
    lateFeeForm.lateFeeEnabled && lateFeeForm.lateFeeMode === "recurring"
      ? !Number.isFinite(intervalDaysNumber) || intervalDaysNumber < 1
        ? t("Recurring interval must be at least 1 day.", "L intervalle recurrent doit etre d au moins 1 jour.")
        : ""
      : "";
  const maxApplicationsError =
    lateFeeForm.lateFeeEnabled &&
    lateFeeForm.lateFeeMode === "recurring" &&
    String(lateFeeForm.maxLateFeeApplications).trim()
      ? !Number.isFinite(maxApplicationsNumber) || maxApplicationsNumber < 1
        ? t("Maximum applications must be at least 1.", "Le maximum d applications doit etre d au moins 1.")
        : ""
      : "";
  const lateFeeValidationError =
    lateFeeValueError || gracePeriodError || intervalDaysError || maxApplicationsError;
  const lateFeeConfigValid = !lateFeeValidationError;
  const previewBaseAmount = 1000;
  const previewLateFeeAmount = !lateFeeForm.lateFeeEnabled
    ? 0
    : lateFeeForm.lateFeeType === "percentage"
      ? Math.max(0, Math.round((previewBaseAmount * Math.max(0, lateFeeValueNumber || 0)) * 100) / 10000)
      : Math.max(0, Math.round((lateFeeValueNumber || 0) * 100) / 100);

  return (
    <div className="mx-auto w-full max-w-[1050px] space-y-6 max-md:space-y-7">
      {showUnsavedPrompt ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="unsaved-changes-title"
            className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-2xl"
          >
            <h2 id="unsaved-changes-title" className="text-base font-semibold text-foreground">
              {t("Unsaved changes", "Modifications non enregistrees")}
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {t(
                "You have unsaved changes. Leave without saving?",
                "Vous avez des modifications non enregistrees. Quitter sans enregistrer ?"
              )}
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="secondary" onClick={cancelLeaveWithUnsavedChanges}>
                {t("Cancel", "Annuler")}
              </Button>
              <Button onClick={confirmLeaveWithUnsavedChanges}>
                {t("Leave", "Quitter")}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
      {saveToast ? (
        <div className="fixed right-4 top-4 z-50 max-w-sm">
          <TransientAlert
            variant="success"
            autoHideMs={5000}
            onDismiss={() => setSaveToast(null)}
            className="border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700 shadow-lg"
          >
            {saveToast}
          </TransientAlert>
        </div>
      ) : null}
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-indigo-600 dark:text-indigo-300">
          {t("Settings", "Parametres")}
        </p>
        <h1 className="text-3xl font-semibold text-foreground">{t("Settings", "Parametres")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {t(
            "Manage your account details, security and business information.",
            "Gerez les details du compte, la securite et les informations entreprise."
          )}
        </p>
      </div>
      {!tabStateReady ? (
        <Card title={t("Loading settings", "Chargement des parametres")}>
          <p className="text-sm text-muted-foreground">
            {t(
              "Preparing your settings workspace.",
              "Preparation de votre espace de parametres."
            )}
          </p>
        </Card>
      ) : (
      <>
      <div role="tablist" aria-label={t("Settings sections", "Sections des parametres")} className="flex gap-2 overflow-x-auto border-b border-border pb-3">
        {[
          { key: "profile", label: t("Profile", "Profil") },
          ...(canReadBusinessSettings ? [{ key: "business", label: t("Business", "Entreprise") }] : []),
          ...(canReadPayoutSettings ? [{ key: "payout", label: t("Payout", "Paiement") }] : []),
          { key: "security", label: t("Security", "Securite") },
        ].map((tab) => {
          const selected = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => switchTab(tab.key as SettingsTab)}
              className={`relative whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-indigo-400 ${
                selected
                  ? "bg-indigo-600 text-white shadow"
                  : "border border-border bg-background text-foreground hover:bg-muted"
              }`}
            >
              {tab.label}
              <span
                className={`absolute inset-x-3 -bottom-1 h-0.5 rounded-full bg-indigo-500 transition-all ${
                  selected ? "opacity-100" : "opacity-0"
                }`}
              />
            </button>
          );
        })}
      </div>
      {activeTab === "profile" && (
      <Card title={t("Profile Information", "Informations du profil")}>
        {profileStatus ? (
          <TransientAlert variant="success" onDismiss={() => setProfileStatus(null)}>
            {profileStatus}
          </TransientAlert>
        ) : null}
        {profileError && <Alert variant="error">{profileError}</Alert>}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-4">
          <Input
            label={t("User ID", "ID utilisateur")}
            value={me?.publicUserId || me?.publicId || ""}
            readOnly
            className="font-mono text-xs"
          />
          <Input
            label={t("Name", "Nom")}
            placeholder={t("Your name", "Votre nom")}
            value={profile.name}
            required
            onChange={(e) => updateProfileField("name", e.target.value)}
          />
          <Input
            label={t("Email", "Email")}
            placeholder={t("you@company.com", "vous@entreprise.com")}
            type="email"
            value={profile.email}
            required
            onChange={(e) => updateProfileField("email", e.target.value)}
          />
          <div className="col-span-2 flex justify-end max-md:col-span-1">
            <Button className="max-md:w-full" onClick={saveProfile} loading={profileSaving}>
              {t("Save Changes", "Enregistrer les modifications")}
            </Button>
          </div>
        </div>
      </Card>
      )}
      {activeTab === "business" && canReadBusinessSettings && (
      <Card title={t("Business Profile", "Profil entreprise")}>
        {businessStatus ? (
          <TransientAlert variant="success" onDismiss={() => setBusinessStatus(null)}>
            {businessStatus}
          </TransientAlert>
        ) : null}
        {businessError && <Alert variant="error">{businessError}</Alert>}
        {logoError && <Alert variant="error">{logoError}</Alert>}
        {businessProfileReadError ? <Alert variant="error">{businessProfileReadError}</Alert> : null}
        {lateFeeReadError ? <Alert variant="error">{lateFeeReadError}</Alert> : null}
        {!canEditBusinessSettings ? (
          <Alert variant="info">{t("You have read-only access for organization settings.", "Acces en lecture seule pour les parametres organisation.")}</Alert>
        ) : null}
        <fieldset disabled={businessFormDisabled} className="grid grid-cols-2 gap-4 max-md:grid-cols-1 max-md:gap-3">
          <div className="col-span-2 border-b border-border pb-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground max-md:col-span-1">
            {t("Company details", "Details entreprise")}
          </div>
          <Input
            label={t("Business name", "Nom de l entreprise")}
            value={businessForm.businessName}
            onChange={(e) => updateBusinessField("businessName", e.target.value)}
            required
          />
          <CountrySelect
            label={t("Country", "Pays")}
            value={businessForm.country}
            locale={language === "fr" ? "fr" : "en"}
            required
            onChange={(value) => updateBusinessField("country", value)}
          />
          <label className="flex flex-col gap-1 text-sm text-foreground">
            {t("Default currency", "Devise par defaut")} *
            <select
              value={businessForm.defaultCurrency}
              onChange={(e) => updateBusinessField("defaultCurrency", e.target.value)}
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
            value={businessForm.businessEmail}
            onChange={(e) => updateBusinessField("businessEmail", e.target.value)}
            required
          />
          <PhoneInput
            label={t("Business phone", "Telephone entreprise")}
            value={businessForm.businessPhone}
            required
            locale={language === "fr" ? "fr" : "en"}
            onChange={(value) => updateBusinessField("businessPhone", value)}
          />
          <div className="col-span-2 border-b border-border pb-2 pt-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground max-md:col-span-1">
            {t("Address", "Adresse")}
          </div>
          <Input
            label={t("Street address", "Adresse")}
            value={businessForm.streetAddress}
            onChange={(e) => updateBusinessField("streetAddress", e.target.value)}
            required
          />
          <Input
            label={t("City", "Ville")}
            value={businessForm.city}
            onChange={(e) => updateBusinessField("city", e.target.value)}
            required
          />
          <Input
            label={t("Postal code / ZIP (optional)", "Code postal / ZIP (optionnel)")}
            value={businessForm.postalCode}
            onChange={(e) => updateBusinessField("postalCode", e.target.value)}
          />
          <div className="col-span-2 border-b border-border pb-2 pt-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground max-md:col-span-1">
            {t("Tax settings", "Parametres fiscaux")}
          </div>
          <div className="col-span-2 rounded-xl border border-border bg-muted/30 p-4 max-md:col-span-1">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium text-foreground">{t("Enable VAT", "Activer la TVA")}</span>
              <button
                type="button"
                role="switch"
                aria-checked={businessForm.vatEnabled}
                onClick={() => toggleVatEnabled(!businessForm.vatEnabled)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
                  businessForm.vatEnabled ? "bg-indigo-600" : "bg-slate-300 dark:bg-slate-600"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
                    businessForm.vatEnabled ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </div>
            <div
              className={`grid overflow-hidden transition-all duration-200 ${
                businessForm.vatEnabled ? "mt-4 max-h-80 gap-4 opacity-100 md:grid-cols-3" : "max-h-0 opacity-0"
              }`}
            >
              <Input
                label={t("VAT rate (%)", "Taux TVA (%)")}
                type="number"
                min="0"
                max="30"
                step="0.1"
                value={businessForm.vatRate}
                onChange={(e) => updateBusinessField("vatRate", e.target.value)}
                required={businessForm.vatEnabled}
              />
              <label className="flex flex-col gap-1 text-sm text-foreground">
                {t("VAT pricing mode", "Mode TVA")}
                <select
                  value={businessForm.vatPricingMode}
                  onChange={(e) => updateBusinessField("vatPricingMode", e.target.value)}
                  className="rounded-lg border border-input bg-background px-3 py-2 text-foreground focus:border-indigo-400 focus:outline-none"
                >
                  <option value="exclusive">{t("Exclusive", "Exclusif")}</option>
                  <option value="inclusive">{t("Inclusive", "Inclusif")}</option>
                </select>
              </label>
              <Input
                label={t("Tax ID", "ID fiscal")}
                value={businessForm.taxId}
                onChange={(e) => updateBusinessField("taxId", e.target.value)}
                required={businessForm.vatEnabled}
              />
            </div>
          </div>
          <div className="col-span-2 flex items-center justify-between gap-3 border-b border-border pb-2 pt-2 max-md:col-span-1">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                {t("Late Fee Settings", "Parametres des frais de retard")}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {t(
                  "These rules apply to all invoices created under this account unless overridden per customer.",
                  "Ces regles s appliquent a toutes les factures de ce compte, sauf remplacement par client."
                )}
              </p>
            </div>
            <button
              type="button"
              onClick={resetLateFeeDefaults}
              disabled={!canEditBusinessSettings || businessSettingsUnavailable}
              className="text-xs text-muted-foreground transition hover:text-foreground"
            >
              {t("Reset to defaults", "Reinitialiser")}
            </button>
          </div>
          <div className="col-span-2 rounded-xl border border-border bg-muted/30 p-4 max-md:col-span-1">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium text-foreground">
                {t("Enable Late Fees", "Activer les frais de retard")}
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={lateFeeForm.lateFeeEnabled}
                onClick={() => updateLateFeeField("lateFeeEnabled", !lateFeeForm.lateFeeEnabled)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
                  lateFeeForm.lateFeeEnabled ? "bg-indigo-600" : "bg-slate-300 dark:bg-slate-600"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
                    lateFeeForm.lateFeeEnabled ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </div>

            <div
              className={`mt-4 space-y-4 transition-opacity duration-150 ${
                lateFeeForm.lateFeeEnabled ? "opacity-100" : "pointer-events-none opacity-50"
              }`}
            >
              {lateFeeForm.lateFeeEnabled ? (
                <p className="text-xs text-amber-600">
                  {t(
                    "Late fees will increase invoice totals once overdue.",
                    "Les frais de retard augmenteront le total des factures en retard."
                  )}
                </p>
              ) : null}
              <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
                <Input
                  label={t("Grace period (days)", "Periode de grace (jours)")}
                  type="number"
                  min="0"
                  value={lateFeeForm.gracePeriodDays}
                  onChange={(e) => updateLateFeeField("gracePeriodDays", e.target.value)}
                  error={gracePeriodError || undefined}
                />
                <p className="self-end text-xs text-muted-foreground">
                  {t(
                    "Number of days after invoice due date before late fees apply.",
                    "Nombre de jours apres echeance avant application des frais de retard."
                  )}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
                <label className="flex flex-col gap-2 text-sm text-foreground">
                  <span>{t("Late fee type", "Type de frais de retard")}</span>
                  <div className="flex items-center gap-4">
                    <label className="inline-flex items-center gap-2">
                      <input
                        type="radio"
                        name="lateFeeType"
                        checked={lateFeeForm.lateFeeType === "flat"}
                        onChange={() => updateLateFeeField("lateFeeType", "flat")}
                      />
                      <span>{t("Flat amount", "Montant fixe")}</span>
                    </label>
                    <label className="inline-flex items-center gap-2">
                      <input
                        type="radio"
                        name="lateFeeType"
                        checked={lateFeeForm.lateFeeType === "percentage"}
                        onChange={() => updateLateFeeField("lateFeeType", "percentage")}
                      />
                      <span>{t("Percentage", "Pourcentage")}</span>
                    </label>
                  </div>
                </label>
                <label className="flex flex-col gap-1 text-sm text-foreground">
                  <span>{t("Late fee value", "Valeur des frais de retard")}</span>
                  <div
                    className={`flex items-center rounded-lg border bg-background px-3 py-2 ${
                      lateFeeValueError ? "border-rose-500" : "border-input"
                    }`}
                  >
                    <span className="mr-2 text-xs text-muted-foreground">
                      {lateFeeForm.lateFeeType === "flat" ? businessForm.defaultCurrency : "%"}
                    </span>
                    <input
                      type="number"
                      min="0"
                      step={lateFeeForm.lateFeeType === "flat" ? "0.01" : "0.1"}
                      value={lateFeeForm.lateFeeValue}
                      onChange={(e) => updateLateFeeField("lateFeeValue", e.target.value)}
                      className="w-full bg-transparent text-foreground focus:outline-none"
                    />
                  </div>
                  {lateFeeValueError ? (
                    <span className="text-xs text-rose-700 dark:text-rose-400">{lateFeeValueError}</span>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      {lateFeeForm.lateFeeType === "percentage"
                        ? t(
                            "Percentage applied to outstanding balance.",
                            "Pourcentage applique au solde impaye."
                          )
                        : t(
                            "Fixed amount added once invoice becomes overdue.",
                            "Montant fixe ajoute une fois la facture en retard."
                          )}
                    </span>
                  )}
                </label>
              </div>

              <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
                <label className="flex flex-col gap-2 text-sm text-foreground">
                  <span>{t("Late fee mode", "Mode des frais de retard")}</span>
                  <div className="flex items-center gap-4">
                    <label className="inline-flex items-center gap-2">
                      <input
                        type="radio"
                        name="lateFeeMode"
                        checked={lateFeeForm.lateFeeMode === "one_time"}
                        onChange={() => updateLateFeeField("lateFeeMode", "one_time")}
                      />
                      <span>{t("One-time", "Une seule fois")}</span>
                    </label>
                    <label className="inline-flex items-center gap-2">
                      <input
                        type="radio"
                        name="lateFeeMode"
                        checked={lateFeeForm.lateFeeMode === "recurring"}
                        onChange={() => updateLateFeeField("lateFeeMode", "recurring")}
                      />
                      <span>{t("Recurring", "Recurrent")}</span>
                    </label>
                  </div>
                </label>
              </div>

              <div
                className={`overflow-hidden transition-all duration-150 ${
                  lateFeeForm.lateFeeMode === "recurring"
                    ? "max-h-48 opacity-100"
                    : "max-h-0 opacity-0"
                }`}
              >
                <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
                  <Input
                    label={t("Apply every (days)", "Appliquer tous les (jours)")}
                    type="number"
                    min="1"
                    value={lateFeeForm.lateFeeIntervalDays}
                    onChange={(e) => updateLateFeeField("lateFeeIntervalDays", e.target.value)}
                    error={intervalDaysError || undefined}
                  />
                  <Input
                    label={t("Maximum applications (optional)", "Maximum d applications (optionnel)")}
                    type="number"
                    min="1"
                    value={lateFeeForm.maxLateFeeApplications}
                    onChange={(e) => updateLateFeeField("maxLateFeeApplications", e.target.value)}
                    error={maxApplicationsError || undefined}
                  />
                </div>
              </div>

              <label className="inline-flex items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={lateFeeForm.allowAutomationLateFee}
                  onChange={(e) =>
                    updateLateFeeField("allowAutomationLateFee", e.target.checked)
                  }
                />
                <span>
                  {t(
                    "Allow automations to apply late fees",
                    "Autoriser les automatisations a appliquer des frais de retard"
                  )}
                </span>
              </label>
              <p className="text-xs text-muted-foreground">
                {t(
                  "If enabled, overdue invoices may automatically apply late fees based on these rules.",
                  "Si active, les factures en retard peuvent appliquer automatiquement ces frais."
                )}
              </p>
              <div className="rounded-lg bg-muted/40 p-4 text-sm">
                <p className="mb-2 font-medium text-foreground">{t("Example Preview", "Exemple")}</p>
                <p className="text-muted-foreground">
                  {t("Invoice", "Facture")}: {formatCurrency(previewBaseAmount, businessForm.defaultCurrency)} |{" "}
                  {t("Due", "Echeance")}: Jan 1 | {t("Unpaid after", "Impayee apres")}{" "}
                  {Number.isFinite(gracePeriodDaysNumber) && gracePeriodDaysNumber >= 0
                    ? gracePeriodDaysNumber
                    : 0}{" "}
                  {t("days", "jours")} | {t("Late Fee", "Frais de retard")}:{" "}
                  {formatCurrency(previewLateFeeAmount, businessForm.defaultCurrency)}
                </p>
              </div>
            </div>
          </div>
          <div className="col-span-2 border-b border-border pb-2 pt-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground max-md:col-span-1">
            {t("Branding", "Image de marque")}
          </div>
          <label className="col-span-2 flex flex-col gap-1 text-sm text-foreground max-md:order-9 max-md:col-span-1">
            <span className="flex items-center gap-2">
              {t("Business logo (optional)", "Logo entreprise (optionnel)")}
              <span ref={logoInfoRef} className="relative">
                <button
                  type="button"
                  aria-label={t("Logo upload info", "Infos televersement logo")}
                  onClick={(event) => {
                    event.stopPropagation();
                    setLogoInfoOpen((open) => !open);
                  }}
                  className="flex h-5 w-5 items-center justify-center rounded-full border border-border text-[10px] font-semibold text-muted-foreground"
                >
                  i
                </button>
                <div
                  className={`absolute right-0 top-7 z-20 w-48 rounded-lg border border-border bg-background px-3 py-2 text-[11px] text-foreground shadow-lg transition ${
                    logoInfoOpen ? "opacity-100" : "pointer-events-none opacity-0"
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
              onChange={(e) => {
                setLogoFile(e.target.files?.[0] || null);
                markDirty("business");
              }}
              disabled={logoUploading}
              ref={logoInputRef}
              className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground file:mr-4 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-1.5 file:text-sm file:font-semibold"
            />
            {logoPreviewUrl && (
              <div className="mt-2 flex flex-col gap-2">
                <div className="flex items-center gap-3">
                  <div className="h-12 w-12 overflow-hidden rounded-xl border border-transparent bg-white ring-1 ring-border max-md:rounded-2xl">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={logoPreviewUrl}
                      alt={t("Business logo preview", "Apercu du logo")}
                      className="h-full w-full object-contain"
                    />
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <button
                      type="button"
                      onClick={() => logoInputRef.current?.click()}
                      className="rounded-full border border-border px-3 py-1 text-xs font-semibold text-foreground"
                    >
                      {t("Change logo", "Modifier le logo")}
                    </button>
                    <button
                      type="button"
                      onClick={removeBusinessLogo}
                      className="rounded-full border border-border px-3 py-1 text-xs font-semibold text-foreground"
                    >
                      {t("Remove logo", "Supprimer le logo")}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </label>
          <div className="col-span-2 flex justify-end max-md:col-span-1 max-md:order-10">
            <div className="w-full max-md:space-y-2 md:w-auto">
              <Button
                className="max-md:w-full"
                onClick={saveBusinessProfile}
                loading={businessSaving || logoUploading}
                disabled={!canEditBusinessSettings || businessSettingsUnavailable || (lateFeeForm.lateFeeEnabled && !lateFeeConfigValid)}
              >
                {businessExists
                  ? t("Update business profile", "Mettre a jour le profil entreprise")
                  : t("Save business profile", "Enregistrer le profil entreprise")}
              </Button>
              {lateFeeForm.lateFeeEnabled && !lateFeeConfigValid ? (
                <p className="mt-1 text-right text-xs text-rose-700 dark:text-rose-400 max-md:text-left">
                  {lateFeeValidationError}
                </p>
              ) : null}
            </div>
          </div>
        </fieldset>
      </Card>
      )}
      {activeTab === "payout" && canReadPayoutSettings && (
      <Card title={t("Invoice payout setup", "Configuration de paiement facture")}>
        <p className="text-xs text-muted-foreground">
          {t(
            "Payout details are used for invoice settlements.",
            "Les details de paiement sont utilises pour les reglements de factures."
          )}
        </p>
        <div
          className={`mt-4 rounded-xl border px-4 py-3 text-sm font-medium ${
            payoutConnected
              ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-300"
              : "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300"
          }`}
        >
          {payoutConnected
            ? t("Connected payout account", "Compte de paiement connecte")
            : t("Payout account not configured", "Compte de paiement non configure")}
        </div>
        <fieldset disabled={payoutFormDisabled} className="mt-6 rounded-2xl border border-border bg-background/60 p-4">
          <p className="text-sm font-semibold text-foreground">
            {t("Create payout account", "Creer un compte de paiement")}
          </p>
          <p className="text-xs text-muted-foreground">
            {t(
              "We will create a subaccount on your behalf using the bank details below.",
              "Nous creerons un sous-compte avec les details bancaires ci-dessous."
            )}
          </p>
          {payoutStatus ? (
            <div className="mt-3">
              <TransientAlert variant="success" onDismiss={() => setPayoutStatus(null)}>
                {payoutStatus}
              </TransientAlert>
            </div>
          ) : null}
          {payoutError && <div className="mt-3"><Alert variant="error">{payoutError}</Alert></div>}
          {payoutReadError ? <div className="mt-3"><Alert variant="error">{payoutReadError}</Alert></div> : null}
          {!canEditPayoutSettings ? (
            <div className="mt-3"><Alert variant="info">{t("You have read-only access for payout settings.", "Acces en lecture seule pour les parametres de paiement.")}</Alert></div>
          ) : null}
          <div className="mt-4 grid grid-cols-2 gap-4 max-md:grid-cols-1 max-md:gap-3">
            <label className="flex flex-col gap-1 text-sm text-foreground">
              {t("Provider", "Fournisseur")}
              <select
                value={payoutProvider}
                onChange={(e) => {
                  setPayoutProvider(e.target.value as PayoutProvider);
                  setPayoutBankCode("");
                  setPayoutBranchCode("");
                  setPayoutProviderTouched(true);
                  markDirty("payout");
                }}
                disabled={payoutFormDisabled || payoutRequirements.providerLocked}
                className="rounded-lg border border-input bg-background px-3 py-2 text-foreground focus:border-indigo-400 focus:outline-none"
              >
                {(["PAYSTACK", "FLUTTERWAVE"] as const).map((providerOption) => {
                  const optionRequirements = resolvePayoutRequirements({
                    provider: providerOption,
                    country: businessForm.country,
                    currency: businessForm.defaultCurrency,
                  });
                  const label = providerOption === "PAYSTACK" ? "Paystack" : "Flutterwave";
                  return (
                    <option
                      key={providerOption}
                      value={providerOption}
                      disabled={!optionRequirements.supported}
                    >
                      {label}
                    </option>
                  );
                })}
              </select>
              {payoutRequirements.hints.includes("sepa_flutterwave_only") && (
                <span className="text-xs text-muted-foreground">
                  {t(
                    "EUR payouts in SEPA countries use Flutterwave with IBAN and BIC / SWIFT.",
                    "Les paiements EUR dans les pays SEPA utilisent Flutterwave avec IBAN et BIC / SWIFT."
                  )}
                </span>
              )}
              {payoutRequirements.hints.includes("flutterwave_branch_code_required") ? (
                <span className="text-xs text-muted-foreground">
                  {t(
                    "This country requires a branch code in addition to bank and account details.",
                    "Ce pays requiert un code agence en plus de la banque et des details du compte."
                  )}
                </span>
              ) : null}
              {payoutRequirements.hints.includes("flutterwave_us_routing_required") ? (
                <span className="text-xs text-muted-foreground">
                  {t(
                    "US payouts require routing number and SWIFT details.",
                    "Les paiements vers les Etats-Unis exigent un numero d acheminement et un code SWIFT."
                  )}
                </span>
              ) : null}
              {!payoutProviderSupportsSelection && anyProviderSupportsPayoutCurrency ? (
                <span className="text-xs text-amber-600">
                  {t(
                    "This provider does not support the selected country or business currency. Switch provider to continue.",
                    "Ce fournisseur ne prend pas en charge le pays ou la devise entreprise selectionnee. Changez de fournisseur pour continuer."
                  )}
                </span>
              ) : null}
              {!anyProviderSupportsPayoutCurrency ? (
                <span className="text-xs text-amber-600">
                  {t(
                    "Your business can invoice in this currency, but automated payouts are not available for this country and currency yet.",
                    "Votre entreprise peut facturer dans cette devise, mais les paiements automatiques ne sont pas encore disponibles pour ce pays et cette devise."
                  )}
                </span>
              ) : null}
              {(payoutProviderTouched || payoutAttempted) && payoutBankError && (
                <span className="text-xs text-amber-600">{payoutBankError}</span>
              )}
              {(payoutProviderTouched || payoutAttempted) && payoutBranchError ? (
                <span className="text-xs text-amber-600">
                  {t(
                    "We could not load branch options automatically. You can still enter the branch code manually.",
                    "Nous n avons pas pu charger les agences automatiquement. Vous pouvez toujours saisir le code agence manuellement."
                  )}
                </span>
              ) : null}
            </label>
            <Input
              label={payoutFieldLabels.accountName}
              value={payoutAccountName}
              onChange={(e) => {
                setPayoutAccountName(e.target.value);
                markDirty("payout");
              }}
              required={payoutRequirements.requiredFields.includes("accountName")}
            />
            {payoutRequirements.requiredFields.includes("bankCode") ? (
              <label className="flex flex-col gap-1 text-sm text-foreground">
                {payoutFieldLabels.bankCode} *
                <select
                  value={payoutBankCode}
                  onChange={(e) => {
                    setPayoutBankCode(e.target.value);
                    setPayoutBranchCode("");
                    markDirty("payout");
                  }}
                  disabled={payoutFormDisabled || !payoutBankList.length}
                  className="rounded-lg border border-input bg-background px-3 py-2 text-foreground focus:border-indigo-400 focus:outline-none"
                >
                  {payoutBankList.length === 0 && (
                    <option value="">
                      {t("No banks available", "Aucune banque disponible")}
                    </option>
                  )}
                  {payoutBankList.map((bank: any, index: number) => (
                    <option key={`${bank.code}-${bank.name}-${index}`} value={bank.code}>
                      {bank.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {payoutRequirements.requiredFields.includes("accountNumber") ? (
              <Input
                label={payoutFieldLabels.accountNumber}
                value={payoutAccountNumber}
                onChange={(e) => {
                  setPayoutAccountNumber(e.target.value);
                  markDirty("payout");
                }}
                required
              />
            ) : null}
            {payoutRequirements.requiredFields.includes("iban") ? (
              <Input
                label={payoutFieldLabels.iban}
                value={payoutIban}
                onChange={(e) => {
                  setPayoutIban(e.target.value);
                  markDirty("payout");
                }}
                required
              />
            ) : null}
            {payoutRequirements.requiredFields.includes("bicSwift") ? (
              <Input
                label={payoutFieldLabels.bicSwift}
                value={payoutBicSwift}
                onChange={(e) => {
                  setPayoutBicSwift(e.target.value);
                  markDirty("payout");
                }}
                required
              />
            ) : null}
            {payoutRequirements.requiredFields.includes("routingNumber") ? (
              <Input
                label={payoutFieldLabels.routingNumber}
                value={payoutRoutingNumber}
                onChange={(e) => {
                  setPayoutRoutingNumber(e.target.value);
                  markDirty("payout");
                }}
                required
              />
            ) : null}
            {payoutRequirements.requiredFields.includes("branchCode") ? (
              payoutBranchList.length ? (
                <label className="flex flex-col gap-1 text-sm text-foreground">
                  {payoutFieldLabels.branchCode} *
                  <select
                    value={payoutBranchCode}
                    onChange={(e) => {
                      setPayoutBranchCode(e.target.value);
                      markDirty("payout");
                    }}
                    className="rounded-lg border border-input bg-background px-3 py-2 text-foreground focus:border-indigo-400 focus:outline-none"
                  >
                    {payoutBranchList.map((branch: any, index: number) => (
                      <option key={`${branch.code}-${branch.name}-${index}`} value={branch.code}>
                        {branch.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <Input
                  label={payoutFieldLabels.branchCode}
                  value={payoutBranchCode}
                  onChange={(e) => {
                    setPayoutBranchCode(e.target.value);
                    markDirty("payout");
                  }}
                  required
                />
              )
            ) : null}
            <div className="col-span-2 flex justify-end max-md:col-span-1">
              <Button
                className="max-md:w-full"
                onClick={createPayoutAccount}
                loading={payoutSubmitting}
                disabled={
                  !canEditPayoutSettings ||
                  payoutSettingsUnavailable ||
                  payoutSubmitting ||
                  !payoutProviderSupportsSelection ||
                  (payoutRequirements.bankListRequired &&
                    (!payoutBankList.length || Boolean(payoutBankError)))
                }
              >
                {t("Create payout account", "Creer un compte de paiement")}
              </Button>
            </div>
          </div>
        </fieldset>
      </Card>
      )}
      {activeTab === "security" && (
      <>
      <Card title={t("Change Password", "Changer le mot de passe")}>
        {status ? (
          <TransientAlert variant="info" onDismiss={() => setStatus(null)}>
            {status}
          </TransientAlert>
        ) : null}
        {passwordStatus ? (
          <TransientAlert variant="success" onDismiss={() => setPasswordStatus(null)}>
            {passwordStatus}
          </TransientAlert>
        ) : null}
        {passwordError && <Alert variant="error">{passwordError}</Alert>}
        <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1 max-md:gap-3">
          <Input
            label={t("Current password", "Mot de passe actuel")}
            type="password"
            value={currentPassword}
            required
            onChange={(e) => {
              setCurrentPassword(e.target.value);
              markDirty("security");
            }}
          />
          <div className="space-y-1">
            <Input
              label={t("New password", "Nouveau mot de passe")}
              type="password"
              value={passwords.password}
              minLength={MIN_PASSWORD_LENGTH}
              required
              onChange={(e) => updatePasswordField("password", e.target.value)}
            />
            <p className="text-xs text-muted-foreground">{PASSWORD_MIN_LENGTH_HELPER_TEXT}</p>
          </div>
          <Input
            label={t("Confirm password", "Confirmer le mot de passe")}
            type="password"
            value={passwords.confirm}
            minLength={MIN_PASSWORD_LENGTH}
            required
            onChange={(e) => updatePasswordField("confirm", e.target.value)}
          />
          <div className="space-y-2 md:col-span-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{t("Password strength", "Force du mot de passe")}</span>
              <span className={`font-semibold ${passwordStrengthTextTone}`}>{passwordStrengthLabel}</span>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {[0, 1, 2, 3].map((index) => (
                <div
                  key={index}
                  className={`h-1.5 rounded-full ${getPasswordStrengthBarTone(index)}`}
                />
              ))}
            </div>
          </div>
          <div className="flex justify-end md:col-span-2">
            <Button
              variant="secondary"
              className="w-full md:w-auto"
              onClick={updatePassword}
              loading={passwordSaving}
              disabled={!passwordFormValid || passwordSaving}
            >
              {t("Update password", "Mettre a jour le mot de passe")}
            </Button>
          </div>
        </div>
      </Card>
      <Card title={t("Two-Factor Authentication", "Authentification a deux facteurs")}>
        <div className="rounded-2xl border border-border bg-muted/40 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-foreground">
                {t("Two-Factor Authentication", "Authentification a deux facteurs")}
              </p>
              <p className="text-xs text-muted-foreground">
                {t(
                  "Use an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password, etc.).",
                  "Utilisez une app d authentification (Google, Microsoft, 1Password, etc.)."
                )}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={enabled}
              onClick={!enabled ? startTotpSetup : undefined}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
                enabled ? "bg-emerald-500" : "bg-slate-300 dark:bg-slate-600"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
                  enabled ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </div>
          {!enabled && !setup && (
            <p className="mt-3 text-xs text-muted-foreground">
              {t(
                "Two-factor authentication is off. Enable it to protect sign-in with a time-based code.",
                "La double authentification est desactivee. Activez-la pour proteger la connexion."
              )}
            </p>
          )}

          {!enabled && setup && (
            <div className="mt-4 space-y-3">
              <div className="rounded-xl border border-border bg-background/70 p-3 text-sm text-foreground">
                {setup.qr ? (
                  <div className="mb-3 flex items-center justify-center">
                    <Image
                      src={setup.qr}
                      alt="Authenticator setup QR code"
                      width={176}
                      height={176}
                      className="h-44 w-44 rounded-xl border border-border bg-white p-2"
                    />
                  </div>
                ) : null}
                <p className="font-semibold text-foreground">{t("Setup secret", "Secret de configuration")}</p>
                <p className="mt-1 break-all font-mono text-xs text-muted-foreground">{setup.secret}</p>
                <p className="mt-2 font-semibold text-foreground">
                  {t("Setup link (otpauth)", "Lien de configuration (otpauth)")}
                </p>
                <p className="mt-1 break-all font-mono text-xs text-muted-foreground">{setup.uri}</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                <Input
                  label={t(
                    "Enter 6-digit code from your authenticator app",
                    "Saisissez le code 6 chiffres de votre app"
                  )}
                  value={otp}
                  required
                  onChange={(e) => {
                    setOtp(e.target.value);
                    markDirty("security");
                  }}
                  placeholder="123456"
                />
                <Button onClick={enableTotp} loading={totpBusy} disabled={totpBusy || !otp.trim()}>
                  {t("Confirm & enable", "Confirmer et activer")}
                </Button>
              </div>
            </div>
          )}

          {enabled && (
            <div className="mt-4 space-y-3">
              <Alert variant="success">{t("2FA is enabled for your account.", "2FA est activee.")}</Alert>
              <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                <Input
                  label={t(
                    "Disable 2FA (enter current 2FA code or a backup code)",
                    "Desactiver 2FA (code 2FA actuel ou code de secours)"
                  )}
                  value={disableCode}
                  required
                  onChange={(e) => {
                    setDisableCode(e.target.value);
                    markDirty("security");
                  }}
                  placeholder="123456 or ABCDE-F1234"
                />
                <Button
                  variant="secondary"
                  onClick={disableTotp}
                  loading={totpBusy}
                  disabled={totpBusy || !disableCode.trim()}
                >
                  {t("Disable", "Desactiver")}
                </Button>
              </div>
            </div>
          )}

            {backupCodes?.length ? (
              <div className="mt-4 rounded-xl border border-amber-400 bg-amber-100 p-4 text-slate-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100">
                <p className="text-sm font-semibold text-slate-900 dark:text-amber-200">
                  {t("Backup codes", "Codes de secours")}
                </p>
                <p className="mt-1 text-xs text-slate-800 dark:text-amber-100/90">
                  {t(
                    "Save these now. Each code can be used once if you lose access to your authenticator app.",
                    "Sauvegardez-les. Chaque code est utilisable une seule fois."
                  )}
                </p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {backupCodes.map((c) => (
                    <div
                      key={c}
                      className="rounded-lg border border-slate-900 bg-slate-900 px-3 py-2 font-mono text-xs text-white dark:border-slate-700"
                    >
                      {c}
                    </div>
                  ))}
                </div>
            </div>
          ) : null}
        </div>
      </Card>
      </>
      )}
      </>
      )}
    </div>
  );
}
