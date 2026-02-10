"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import Image from "next/image";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { CountrySelect } from "@/components/ui/country-select";
import { PhoneInput } from "@/components/ui/phone-input";
import { allowedCurrencies, formatCurrencyOption } from "@/lib/payments/currency-allowlist";
import { isSepaCountry } from "@/lib/payments/sepa";
import { useLanguage } from "@/components/providers/language-provider";
import { formatBusinessAddress, hasRequiredAddress, parseBusinessAddress } from "@/lib/address";

const fetcher = (url: string) => fetch(url).then((r) => r.json());
const profileFetcher = async (url: string) => {
  const res = await fetch(url);
  const data = await res.json().catch(() => ({}));
  return { data, status: res.status };
};

export default function SettingsPage() {
  const { language } = useLanguage();
  const t = (en: string, fr: string) => (language === "fr" ? fr : en);
  const [status, setStatus] = useState<string | null>(null);
  const [profileStatus, setProfileStatus] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [passwordStatus, setPasswordStatus] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [profile, setProfile] = useState({ name: "", email: "" });
  const [passwords, setPasswords] = useState({ password: "", confirm: "" });
  const [otp, setOtp] = useState("");
  const [setup, setSetup] = useState<{ secret: string; uri: string; qr?: string | null } | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [disableCode, setDisableCode] = useState("");
  const [businessStatus, setBusinessStatus] = useState<string | null>(null);
  const [businessError, setBusinessError] = useState<string | null>(null);
  const [payoutStatus, setPayoutStatus] = useState<string | null>(null);
  const [payoutError, setPayoutError] = useState<string | null>(null);
  const [payoutSubmitting, setPayoutSubmitting] = useState(false);
  const [payoutProvider, setPayoutProvider] = useState<"PAYSTACK" | "FLUTTERWAVE">("PAYSTACK");
  const [payoutBankCode, setPayoutBankCode] = useState("");
  const [payoutAccountNumber, setPayoutAccountNumber] = useState("");
  const [payoutAccountName, setPayoutAccountName] = useState("");
  const [payoutIban, setPayoutIban] = useState("");
  const [payoutBicSwift, setPayoutBicSwift] = useState("");
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

  const { data: totpStatus, mutate: refreshTotp } = useSWR("/api/auth/2fa/totp", fetcher);
  const { data: me, mutate: refreshMe } = useSWR("/api/user/me", fetcher);
  const { data: businessProfileResponse, mutate: refreshBusinessProfile } = useSWR(
    "/api/business-profile",
    profileFetcher
  );
  const enabled = Boolean(totpStatus?.enabled);
  const businessProfile = businessProfileResponse?.data;
  const businessExists = Boolean(businessProfile?.id);
  const isSepa = isSepaCountry(businessForm.country);
  const payoutBankUrl = isSepa
    ? null
    : `/api/merchant-account/banks?provider=${payoutProvider}&country=${businessForm.country}&currency=${businessForm.defaultCurrency}`;
  const { data: payoutBanks } = useSWR(payoutBankUrl, fetcher);
  const { data: merchantAccountRes } = useSWR("/api/merchant-account", profileFetcher);
  const payoutBankList = useMemo(() => payoutBanks?.banks || [], [payoutBanks?.banks]);
  const payoutBankError = payoutBanks?.error ? String(payoutBanks.error) : null;

  const businessCurrencyOptions = allowedCurrencies.map((code) => ({ code, label: formatCurrencyOption(code) }));
  const requiredMessage = t("This field is required", "This field is required");

  useEffect(() => {
    if (me?.name || me?.email) {
      setProfile({ name: me?.name || "", email: me?.email || "" });
    }
  }, [me?.name, me?.email]);

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
          businessProfile.vatRate === null || businessProfile.vatRate === undefined
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
    if (!allowedCurrencies.includes(preferred as (typeof allowedCurrencies)[number])) return;
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
    if (record.provider && !isSepa) {
      setPayoutProvider(record.provider);
    }
  }, [
    merchantAccountRes?.data,
    merchantAccountRes?.status,
    payoutAccountName,
    payoutAccountNumber,
    payoutBicSwift,
    payoutIban,
    isSepa,
  ]);

  useEffect(() => {
    if (isSepa) {
      setPayoutProvider("FLUTTERWAVE");
      setPayoutBankCode("");
      setPayoutAccountNumber("");
      return;
    }
    if (!payoutBankList.length) {
      setPayoutBankCode("");
      return;
    }
    setPayoutBankCode((prev) => prev || payoutBankList[0].code);
  }, [payoutBankList, isSepa]);

  const saveProfile = async () => {
    setProfileStatus(null);
    setProfileError(null);
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
    refreshMe();
  };

  const updatePassword = async () => {
    setPasswordStatus(null);
    setPasswordError(null);
    const res = await fetch("/api/user/password", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(passwords),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setPasswordError(data.error || t("Could not update password.", "Impossible de mettre a jour le mot de passe."));
      return;
    }
    setPasswordStatus(t("Password updated.", "Mot de passe mis a jour."));
    setPasswords({ password: "", confirm: "" });
  };

  const startTotpSetup = async () => {
    setStatus(null);
    setBackupCodes(null);
    const res = await fetch("/api/auth/2fa/totp", { method: "POST" });
    const data = await res.json();
    if (!res.ok) {
      setStatus(data.error || t("Could not start 2FA setup.", "Impossible de demarrer la 2FA."));
      return;
    }
    setSetup({ secret: data.secret, uri: data.uri, qr: data.qr });
    setStatus(
      t(
        "Scan the setup in your authenticator app (or enter the secret), then confirm with a code.",
        "Scannez dans l application d authentification (ou saisissez le secret), puis confirmez avec un code."
      )
    );
  };

  const enableTotp = async () => {
    if (!otp.trim()) return;
    const res = await fetch("/api/auth/2fa/totp", { method: "PUT", body: JSON.stringify({ code: otp }) });
    const data = await res.json();
    if (!res.ok) {
      setStatus(data.error || t("Could not enable 2FA.", "Impossible d activer la 2FA."));
      return;
    }
    setSetup(null);
    setOtp("");
    setBackupCodes(data.backupCodes || null);
    setStatus(t("Two-factor authentication enabled.", "Authentification a deux facteurs activee."));
    refreshTotp();
  };

  const disableTotp = async () => {
    if (!disableCode.trim()) return;
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
    setStatus(t("Two-factor authentication disabled.", "Authentification a deux facteurs desactivee."));
    refreshTotp();
  };

  const saveBusinessProfile = async () => {
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
    const formattedAddress = formatBusinessAddress(addressFields);
    const payload = {
      businessName: businessForm.businessName,
      country: businessForm.country,
      defaultCurrency: businessForm.defaultCurrency,
      businessAddress: formattedAddress,
      businessEmail: businessForm.businessEmail,
      businessPhone: businessForm.businessPhone,
      taxId: businessForm.taxId,
      vatEnabled: businessForm.vatEnabled,
      vatRate: businessForm.vatEnabled ? Number(businessForm.vatRate) : 0,
      vatPricingMode: businessForm.vatPricingMode,
    };
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
    setBusinessStatus(
      businessExists
        ? t("Business profile updated.", "Profil entreprise mis a jour.")
        : t("Business profile saved.", "Profil entreprise enregistre.")
    );
    refreshBusinessProfile();
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
          setLogoError(uploadData.error || t("Logo upload failed.", "Echec du televersement du logo."));
        } else {
          setLogoFile(null);
          refreshBusinessProfile();
        }
      } catch {
        setLogoError(t("Logo upload failed.", "Echec du televersement du logo."));
      } finally {
        setLogoUploading(false);
      }
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
    if (payoutSubmitting) return;
    setPayoutAttempted(true);
    if (payoutProvider === "PAYSTACK" && payoutBankError) {
      return;
    }
    const businessEmail = businessForm.businessEmail || profile.email;
    if (!businessForm.businessName) {
      setPayoutError(t("Business name is required.", "Le nom de l entreprise est requis."));
      return;
    }
    if (!businessEmail) {
      setPayoutError(t("Business email is required.", "L email de l entreprise est requis."));
      return;
    }
    if (!businessForm.businessPhone) {
      setPayoutError(t("Business phone is required.", "Le telephone de l entreprise est requis."));
      return;
    }
    if (isSepa) {
      if (!payoutAccountName || !payoutIban) {
        setPayoutError(t("Account name and IBAN are required.", "Le nom du compte et l IBAN sont requis."));
        return;
      }
    } else {
      if (!payoutAccountName || !payoutAccountNumber || !payoutBankCode) {
        setPayoutError(
          t("Bank name and account details are required.", "La banque et les details du compte sont requis.")
        );
        return;
      }
      if (!payoutBankList.length) {
        setPayoutError(
          t(
            "No banks available for this provider and currency.",
            "Aucune banque disponible pour ce fournisseur et cette devise."
          )
        );
        return;
      }
    }
    setPayoutSubmitting(true);
    const res = await fetch("/api/merchant-account/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider: isSepa ? "FLUTTERWAVE" : payoutProvider,
        businessName: businessForm.businessName,
        businessEmail,
        accountName: payoutAccountName,
        accountNumber: isSepa ? undefined : payoutAccountNumber,
        bankCode: isSepa ? undefined : payoutBankCode,
        iban: isSepa ? payoutIban : undefined,
        bicSwift: isSepa ? payoutBicSwift : undefined,
        payoutType: isSepa ? "sepa" : "local",
        country: businessForm.country,
        currency: isSepa ? "EUR" : businessForm.defaultCurrency,
        phone: businessForm.businessPhone,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setPayoutError(data.error || t("Could not create payout account.", "Impossible de creer le compte de paiement."));
      setPayoutSubmitting(false);
      return;
    }
    setPayoutStatus(t("Payout account created.", "Compte de paiement cree."));
    setPayoutSubmitting(false);
  };

  return (
    <div className="space-y-6 max-md:space-y-7">
      <div className="md:contents max-md:rounded-[28px] max-md:border max-md:border-border/60 max-md:bg-card max-md:p-4 max-md:shadow-[0_16px_36px_rgba(15,23,42,0.18)]">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-indigo-600 dark:text-indigo-300">
            {t("Settings", "Parametres")}
          </p>
          <h1 className="text-3xl font-semibold text-foreground">
            {t("Profile & security", "Profil et securite")}
          </h1>
        </div>
        {status && <div className="mt-4"><Alert variant="info">{status}</Alert></div>}
      </div>
      <Card title={t("Profile", "Profil")}>
        {profileStatus && <Alert variant="success">{profileStatus}</Alert>}
        {profileError && <Alert variant="error">{profileError}</Alert>}
        <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1 max-md:gap-3">
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
            onChange={(e) => setProfile({ ...profile, name: e.target.value })}
          />
          <Input
            label={t("Email", "Email")}
            placeholder={t("you@company.com", "vous@entreprise.com")}
            type="email"
            value={profile.email}
            onChange={(e) => setProfile({ ...profile, email: e.target.value })}
          />
          <div className="col-span-2 max-md:col-span-1">
            <Button className="max-md:w-full" onClick={saveProfile}>
              {t("Save profile", "Enregistrer le profil")}
            </Button>
          </div>
        </div>
      </Card>
      <Card title={t("Business profile", "Profil entreprise")}>
        {businessStatus && <Alert variant="success">{businessStatus}</Alert>}
        {businessError && <Alert variant="error">{businessError}</Alert>}
        {logoError && <Alert variant="error">{logoError}</Alert>}
        <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1 max-md:gap-3">
          <Input
            label={t("Business name", "Nom de l entreprise")}
            value={businessForm.businessName}
            onChange={(e) => setBusinessForm({ ...businessForm, businessName: e.target.value })}
            required
          />
          <CountrySelect
            label={t("Country", "Pays")}
            value={businessForm.country}
            locale={language === "fr" ? "fr" : "en"}
            required
            onChange={(value) => setBusinessForm({ ...businessForm, country: value })}
          />
          <label className="flex flex-col gap-1 text-sm text-foreground">
            {t("Default currency", "Devise par defaut")}
            <select
              value={businessForm.defaultCurrency}
              onChange={(e) => setBusinessForm({ ...businessForm, defaultCurrency: e.target.value })}
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
            onChange={(e) => setBusinessForm({ ...businessForm, businessEmail: e.target.value })}
            required
          />
          <PhoneInput
            label={t("Business phone", "Telephone entreprise")}
            value={businessForm.businessPhone}
            required
            locale={language === "fr" ? "fr" : "en"}
            onChange={(value) => setBusinessForm({ ...businessForm, businessPhone: value })}
          />
          <Input
            label={t("Street address", "Adresse")}
            value={businessForm.streetAddress}
            onChange={(e) => setBusinessForm({ ...businessForm, streetAddress: e.target.value })}
            required
          />
          <Input
            label={t("City", "Ville")}
            value={businessForm.city}
            onChange={(e) => setBusinessForm({ ...businessForm, city: e.target.value })}
            required
          />
          <Input
            label={t("Postal code / ZIP (optional)", "Code postal / ZIP (optionnel)")}
            value={businessForm.postalCode}
            onChange={(e) => setBusinessForm({ ...businessForm, postalCode: e.target.value })}
          />
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={businessForm.vatEnabled}
              onChange={(e) => setBusinessForm({ ...businessForm, vatEnabled: e.target.checked })}
              className="h-4 w-4 rounded border border-input accent-indigo-600"
            />
            {t("Enable VAT", "Activer la TVA")}
          </label>
          <Input
            label={t("VAT rate (%)", "Taux TVA (%)")}
            type="number"
            min="0"
            max="30"
            step="0.1"
            value={businessForm.vatRate}
            onChange={(e) => setBusinessForm({ ...businessForm, vatRate: e.target.value })}
            required={businessForm.vatEnabled}
          />
          <label className="flex flex-col gap-1 text-sm text-foreground">
            {t("VAT pricing mode", "Mode TVA")}
            <select
              value={businessForm.vatPricingMode}
              onChange={(e) => setBusinessForm({ ...businessForm, vatPricingMode: e.target.value })}
              className="rounded-lg border border-input bg-background px-3 py-2 text-foreground focus:border-indigo-400 focus:outline-none"
            >
              <option value="exclusive">{t("Exclusive", "Exclusif")}</option>
              <option value="inclusive">{t("Inclusive", "Inclusif")}</option>
            </select>
          </label>
          <label className="col-span-2 flex flex-col gap-1 text-sm text-foreground max-md:order-9 max-md:col-span-1 md:col-span-1">
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
              onChange={(e) => setLogoFile(e.target.files?.[0] || null)}
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
          <Input
            label={t("Tax ID", "ID fiscal")}
            value={businessForm.taxId}
            onChange={(e) => setBusinessForm({ ...businessForm, taxId: e.target.value })}
            className="max-md:order-8"
          />
          <div className="col-span-2 max-md:col-span-1 max-md:order-10">
            <Button className="max-md:w-full" onClick={saveBusinessProfile}>
              {businessExists
                ? t("Update business profile", "Mettre a jour le profil entreprise")
                : t("Save business profile", "Enregistrer le profil entreprise")}
            </Button>
          </div>
        </div>
      </Card>
      <Card title={t("Invoice payout setup", "Configuration de paiement facture")}>
        <p className="text-xs text-muted-foreground">
          {t(
            "Add your Paystack or Flutterwave subaccount so customer invoice payments settle directly to you.",
            "Ajoutez votre sous-compte Paystack ou Flutterwave pour recevoir les paiements de factures."
          )}
        </p>
        <div className="mt-6 rounded-2xl border border-border bg-background/60 p-4">
          <p className="text-sm font-semibold text-foreground">
            {t("Create payout account", "Creer un compte de paiement")}
          </p>
          <p className="text-xs text-muted-foreground">
            {t(
              "We will create a subaccount on your behalf using the bank details below.",
              "Nous creerons un sous-compte avec les details bancaires ci-dessous."
            )}
          </p>
          {payoutStatus && <div className="mt-3"><Alert variant="success">{payoutStatus}</Alert></div>}
          {payoutError && <div className="mt-3"><Alert variant="error">{payoutError}</Alert></div>}
          <div className="mt-4 grid grid-cols-2 gap-4 max-md:grid-cols-1 max-md:gap-3">
            <label className="flex flex-col gap-1 text-sm text-foreground">
              {t("Provider", "Fournisseur")}
              <select
                value={payoutProvider}
                onChange={(e) => {
                  setPayoutProvider(e.target.value as "PAYSTACK" | "FLUTTERWAVE");
                  setPayoutBankCode("");
                  setPayoutProviderTouched(true);
                }}
                disabled={isSepa}
                className="rounded-lg border border-input bg-background px-3 py-2 text-foreground focus:border-indigo-400 focus:outline-none"
              >
                {!isSepa && <option value="PAYSTACK">Paystack</option>}
                <option value="FLUTTERWAVE">Flutterwave</option>
              </select>
              {isSepa && (
                <span className="text-xs text-muted-foreground">
                  {t(
                    "Paystack does not support SEPA payouts. Flutterwave is required.",
                    "Paystack ne prend pas en charge les paiements SEPA. Flutterwave est requis."
                  )}
                </span>
              )}
              {payoutProvider === "PAYSTACK" &&
                (payoutProviderTouched || payoutAttempted) &&
                payoutBankError && (
                  <span className="text-xs text-amber-600">{payoutBankError}</span>
                )}
            </label>
            {isSepa ? (
              <>
                <Input
                  label={t("Account holder name", "Nom du titulaire")}
                  value={payoutAccountName}
                  onChange={(e) => setPayoutAccountName(e.target.value)}
                />
                <Input
                  label={t("IBAN", "IBAN")}
                  value={payoutIban}
                  onChange={(e) => setPayoutIban(e.target.value)}
                />
                <Input
                  label={t("BIC / SWIFT (optional)", "BIC / SWIFT (optionnel)")}
                  value={payoutBicSwift}
                  onChange={(e) => setPayoutBicSwift(e.target.value)}
                />
              </>
            ) : (
              <>
                <label className="flex flex-col gap-1 text-sm text-foreground">
                  {t("Bank", "Banque")}
                  <select
                    value={payoutBankCode}
                    onChange={(e) => setPayoutBankCode(e.target.value)}
                    disabled={!payoutBankList.length}
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
                <Input
                  label={t("Account name", "Nom du compte")}
                  value={payoutAccountName}
                  onChange={(e) => setPayoutAccountName(e.target.value)}
                />
                <Input
                  label={t("Account number", "Numero de compte")}
                  value={payoutAccountNumber}
                  onChange={(e) => setPayoutAccountNumber(e.target.value)}
                />
              </>
            )}
            <div className="col-span-2 max-md:col-span-1">
              <Button
                className="max-md:w-full"
                onClick={createPayoutAccount}
                disabled={
                  payoutSubmitting ||
                  (!isSepa && (!payoutBankList.length || Boolean(payoutBankError))) ||
                  (isSepa && payoutProvider !== "FLUTTERWAVE")
                }
              >
                {t("Create payout account", "Creer un compte de paiement")}
              </Button>
            </div>
          </div>
        </div>
      </Card>
      <Card title={t("Security", "Securite")}>
        {passwordStatus && <Alert variant="success">{passwordStatus}</Alert>}
        {passwordError && <Alert variant="error">{passwordError}</Alert>}
        <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1 max-md:gap-3">
          <Input
            label={t("New password", "Nouveau mot de passe")}
            type="password"
            value={passwords.password}
            onChange={(e) => setPasswords({ ...passwords, password: e.target.value })}
          />
          <Input
            label={t("Confirm password", "Confirmer le mot de passe")}
            type="password"
            value={passwords.confirm}
            onChange={(e) => setPasswords({ ...passwords, confirm: e.target.value })}
          />
          <div className="col-span-2 max-md:col-span-1">
            <Button variant="secondary" className="max-md:w-full" onClick={updatePassword}>
              {t("Update password", "Mettre a jour le mot de passe")}
            </Button>
          </div>
        </div>

        <div className="mt-8 rounded-2xl border border-border bg-muted/40 p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-foreground">
                {t("Authenticator 2FA (TOTP)", "Authentificateur 2FA (TOTP)")}
              </p>
              <p className="text-xs text-muted-foreground">
                {t(
                  "Use an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password, etc.).",
                  "Utilisez une app d authentification (Google, Microsoft, 1Password, etc.)."
                )}
              </p>
            </div>
            <div className="flex gap-2">
              {!enabled ? (
                <Button onClick={startTotpSetup}>{t("Enable 2FA", "Activer 2FA")}</Button>
              ) : (
                <Button variant="secondary" onClick={() => refreshTotp()}>
                  {t("Refresh", "Actualiser")}
                </Button>
              )}
            </div>
          </div>

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
                  onChange={(e) => setOtp(e.target.value)}
                  placeholder="123456"
                />
                <Button onClick={enableTotp}>{t("Confirm & enable", "Confirmer et activer")}</Button>
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
                  onChange={(e) => setDisableCode(e.target.value)}
                  placeholder="123456 or ABCDE-F1234"
                />
                <Button variant="secondary" onClick={disableTotp}>
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
    </div>
  );
}
