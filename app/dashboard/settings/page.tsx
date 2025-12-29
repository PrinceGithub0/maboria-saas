"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { allowedCurrencies } from "@/lib/payments/currency-allowlist";

const fetcher = (url: string) => fetch(url).then((r) => r.json());
const profileFetcher = async (url: string) => {
  const res = await fetch(url);
  const data = await res.json().catch(() => ({}));
  return { data, status: res.status };
};

export default function SettingsPage() {
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
  const [businessForm, setBusinessForm] = useState({
    businessName: "",
    country: "NG",
    defaultCurrency: "NGN",
    businessAddress: "",
    businessEmail: "",
    businessPhone: "",
    taxId: "",
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
  const businessCurrencyOptions = allowedCurrencies.map((code) => ({ code, label: code }));

  useEffect(() => {
    if (me?.name || me?.email) {
      setProfile({ name: me?.name || "", email: me?.email || "" });
    }
  }, [me?.name, me?.email]);

  useEffect(() => {
    if (businessProfile?.id) {
      setBusinessForm({
        businessName: businessProfile.businessName || "",
        country: businessProfile.country || "NG",
        defaultCurrency: businessProfile.defaultCurrency || "NGN",
        businessAddress: businessProfile.businessAddress || "",
        businessEmail: businessProfile.businessEmail || "",
        businessPhone: businessProfile.businessPhone || "",
        taxId: businessProfile.taxId || "",
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
  ]);

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
      setProfileError(data.error || "Could not update profile.");
      return;
    }
    setProfileStatus("Profile updated.");
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
      setPasswordError(data.error || "Could not update password.");
      return;
    }
    setPasswordStatus("Password updated.");
    setPasswords({ password: "", confirm: "" });
  };

  const startTotpSetup = async () => {
    setStatus(null);
    setBackupCodes(null);
    const res = await fetch("/api/auth/2fa/totp", { method: "POST" });
    const data = await res.json();
    if (!res.ok) {
      setStatus(data.error || "Could not start 2FA setup.");
      return;
    }
    setSetup({ secret: data.secret, uri: data.uri, qr: data.qr });
    setStatus("Scan the setup in your authenticator app (or enter the secret), then confirm with a code.");
  };

  const enableTotp = async () => {
    if (!otp.trim()) return;
    const res = await fetch("/api/auth/2fa/totp", { method: "PUT", body: JSON.stringify({ code: otp }) });
    const data = await res.json();
    if (!res.ok) {
      setStatus(data.error || "Could not enable 2FA.");
      return;
    }
    setSetup(null);
    setOtp("");
    setBackupCodes(data.backupCodes || null);
    setStatus("Two-factor authentication enabled.");
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
      setStatus(data.error || "Could not disable 2FA.");
      return;
    }
    setDisableCode("");
    setBackupCodes(null);
    setSetup(null);
    setStatus("Two-factor authentication disabled.");
    refreshTotp();
  };

  const saveBusinessProfile = async () => {
    setBusinessStatus(null);
    setBusinessError(null);
    const res = await fetch("/api/business-profile", {
      method: businessExists ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(businessForm),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setBusinessError(data.error || "Could not save business profile.");
      return;
    }
    setBusinessStatus(businessExists ? "Business profile updated." : "Business profile saved.");
    refreshBusinessProfile();
  };

  return (
    <div className="space-y-6 max-md:space-y-7">
      <div className="md:contents max-md:rounded-[28px] max-md:border max-md:border-border/60 max-md:bg-card max-md:p-4 max-md:shadow-[0_16px_36px_rgba(15,23,42,0.18)]">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-indigo-600 dark:text-indigo-300">Settings</p>
          <h1 className="text-3xl font-semibold text-foreground">Profile & security</h1>
        </div>
        {status && <div className="mt-4"><Alert variant="info">{status}</Alert></div>}
      </div>
      <Card title="Profile">
        {profileStatus && <Alert variant="success">{profileStatus}</Alert>}
        {profileError && <Alert variant="error">{profileError}</Alert>}
        <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1 max-md:gap-3">
          <Input
            label="User ID"
            value={me?.publicUserId || me?.publicId || ""}
            readOnly
            className="font-mono text-xs"
          />
          <Input
            label="Name"
            placeholder="Your name"
            value={profile.name}
            onChange={(e) => setProfile({ ...profile, name: e.target.value })}
          />
          <Input
            label="Email"
            placeholder="you@company.com"
            type="email"
            value={profile.email}
            onChange={(e) => setProfile({ ...profile, email: e.target.value })}
          />
          <div className="col-span-2 max-md:col-span-1">
            <Button className="max-md:w-full" onClick={saveProfile}>
              Save profile
            </Button>
          </div>
        </div>
      </Card>
      <Card title="Business profile">
        {businessStatus && <Alert variant="success">{businessStatus}</Alert>}
        {businessError && <Alert variant="error">{businessError}</Alert>}
        <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1 max-md:gap-3">
          <Input
            label="Business name"
            value={businessForm.businessName}
            onChange={(e) => setBusinessForm({ ...businessForm, businessName: e.target.value })}
          />
          <label className="flex flex-col gap-1 text-sm text-foreground">
            Country
            <select
              value={businessForm.country}
              onChange={(e) => setBusinessForm({ ...businessForm, country: e.target.value })}
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
            label="Business email"
            type="email"
            value={businessForm.businessEmail}
            onChange={(e) => setBusinessForm({ ...businessForm, businessEmail: e.target.value })}
          />
          <Input
            label="Business phone"
            value={businessForm.businessPhone}
            onChange={(e) => setBusinessForm({ ...businessForm, businessPhone: e.target.value })}
          />
          <Input
            label="Business address"
            value={businessForm.businessAddress}
            onChange={(e) => setBusinessForm({ ...businessForm, businessAddress: e.target.value })}
          />
          <Input
            label="Tax/VAT ID (optional)"
            value={businessForm.taxId}
            onChange={(e) => setBusinessForm({ ...businessForm, taxId: e.target.value })}
          />
          <div className="col-span-2 max-md:col-span-1">
            <Button className="max-md:w-full" onClick={saveBusinessProfile}>
              {businessExists ? "Update business profile" : "Save business profile"}
            </Button>
          </div>
        </div>
      </Card>
      <Card title="Security">
        {passwordStatus && <Alert variant="success">{passwordStatus}</Alert>}
        {passwordError && <Alert variant="error">{passwordError}</Alert>}
        <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1 max-md:gap-3">
          <Input
            label="New password"
            type="password"
            value={passwords.password}
            onChange={(e) => setPasswords({ ...passwords, password: e.target.value })}
          />
          <Input
            label="Confirm password"
            type="password"
            value={passwords.confirm}
            onChange={(e) => setPasswords({ ...passwords, confirm: e.target.value })}
          />
          <div className="col-span-2 max-md:col-span-1">
            <Button variant="secondary" className="max-md:w-full" onClick={updatePassword}>
              Update password
            </Button>
          </div>
        </div>

        <div className="mt-8 rounded-2xl border border-border bg-muted/40 p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-foreground">Authenticator 2FA (TOTP)</p>
              <p className="text-xs text-muted-foreground">
                Use an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password, etc.).
              </p>
            </div>
            <div className="flex gap-2">
              {!enabled ? (
                <Button onClick={startTotpSetup}>Enable 2FA</Button>
              ) : (
                <Button variant="secondary" onClick={() => refreshTotp()}>
                  Refresh
                </Button>
              )}
            </div>
          </div>

          {!enabled && setup && (
            <div className="mt-4 space-y-3">
              <div className="rounded-xl border border-border bg-background/70 p-3 text-sm text-foreground">
                {setup.qr ? (
                  <div className="mb-3 flex items-center justify-center">
                    <img
                      src={setup.qr}
                      alt="Authenticator setup QR code"
                      className="h-44 w-44 rounded-xl border border-border bg-white p-2"
                    />
                  </div>
                ) : null}
                <p className="font-semibold text-foreground">Setup secret</p>
                <p className="mt-1 break-all font-mono text-xs text-muted-foreground">{setup.secret}</p>
                <p className="mt-2 font-semibold text-foreground">Setup link (otpauth)</p>
                <p className="mt-1 break-all font-mono text-xs text-muted-foreground">{setup.uri}</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                <Input
                  label="Enter 6-digit code from your authenticator app"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  placeholder="123456"
                />
                <Button onClick={enableTotp}>Confirm & enable</Button>
              </div>
            </div>
          )}

          {enabled && (
            <div className="mt-4 space-y-3">
              <Alert variant="success">2FA is enabled for your account.</Alert>
              <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                <Input
                  label="Disable 2FA (enter current 2FA code or a backup code)"
                  value={disableCode}
                  onChange={(e) => setDisableCode(e.target.value)}
                  placeholder="123456 or ABCDE-F1234"
                />
                <Button variant="secondary" onClick={disableTotp}>
                  Disable
                </Button>
              </div>
            </div>
          )}

          {backupCodes?.length ? (
            <div className="mt-4 rounded-xl border border-amber-500 bg-amber-200/70 p-4 dark:border-amber-500/40 dark:bg-amber-500/10">
              <p className="text-sm font-semibold text-amber-950 dark:text-amber-200">Backup codes</p>
              <p className="mt-1 text-xs text-amber-900 dark:text-amber-100/90">
                Save these now. Each code can be used once if you lose access to your authenticator app.
              </p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {backupCodes.map((c) => (
                  <div
                    key={c}
                    className="rounded-lg border border-amber-500 bg-background/70 px-3 py-2 font-mono text-xs text-amber-950 dark:border-amber-500/40 dark:text-amber-100"
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
