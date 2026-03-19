"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { ArrowLeft, Copy, ShieldAlert, UserPlus } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmationModal } from "@/components/ui/ConfirmationModal";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import type {
  IdentityAccessRole,
  IdentityAccessStatus,
  IdentityCreateMetadataResponse,
  IdentityCreateUserResponse,
} from "@/lib/admin/users-types";

type TenantRole = "" | "OWNER" | "ADMIN" | "MEMBER" | "BILLING_ADMIN";

const fetcher = async <T,>(url: string): Promise<T> => {
  const response = await fetch(url, { cache: "no-store" });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(String((payload as { error?: string }).error || `Request failed (${response.status})`));
  }
  return payload as T;
};

function formatRoleLabel(role: string) {
  return role.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (m) => m.toUpperCase());
}

function formatStatusLabel(status: string) {
  return status.toLowerCase().replace(/\b\w/g, (m) => m.toUpperCase());
}

export default function CreatePlatformUserPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<IdentityAccessRole>("USER");
  const [status, setStatus] = useState<IdentityAccessStatus>("PENDING");
  const [sendSetupEmail, setSendSetupEmail] = useState(true);
  const [tenantId, setTenantId] = useState<string>("");
  const [tenantQuery, setTenantQuery] = useState("");
  const [tenantRole, setTenantRole] = useState<TenantRole>("");
  const [feedback, setFeedback] = useState<{ variant: "error" | "success" | "info"; message: string } | null>(null);
  const [emailExists, setEmailExists] = useState(false);
  const [checkingEmail, setCheckingEmail] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [superAdminConfirmOpen, setSuperAdminConfirmOpen] = useState(false);
  const [superAdminAcknowledge, setSuperAdminAcknowledge] = useState(false);
  const [stepUpOpen, setStepUpOpen] = useState(false);
  const [stepUpPassword, setStepUpPassword] = useState("");
  const [stepUpLoading, setStepUpLoading] = useState(false);
  const [createdTempPassword, setCreatedTempPassword] = useState<string | null>(null);
  const [setupEmailSent, setSetupEmailSent] = useState<boolean | null>(null);

  const { data, error, isLoading } = useSWR<IdentityCreateMetadataResponse>(
    "/api/admin/users/create",
    fetcher
  );

  useEffect(() => {
    if (!data) return;
    setStatus(data.defaults.status);
    setSendSetupEmail(data.defaults.sendSetupEmail);
  }, [data]);

  useEffect(() => {
    if (role !== "SUPER_ADMIN" && superAdminAcknowledge) {
      setSuperAdminAcknowledge(false);
    }
  }, [role, superAdminAcknowledge]);

  useEffect(() => {
    if (role === "USER") return;
    if (tenantId) setTenantId("");
    if (tenantQuery) setTenantQuery("");
    if (tenantRole) setTenantRole("");
  }, [role, tenantId, tenantQuery, tenantRole]);

  useEffect(() => {
    if (status === "DISABLED" && sendSetupEmail) {
      setSendSetupEmail(false);
    }
  }, [status, sendSetupEmail]);

  useEffect(() => {
    if (sendSetupEmail && status !== "PENDING") {
      setStatus("PENDING");
    }
  }, [sendSetupEmail, status]);

  useEffect(() => {
    const normalized = email.trim().toLowerCase();
    if (!normalized || !normalized.includes("@")) {
      setEmailExists(false);
      setCheckingEmail(false);
      return;
    }

    const timer = window.setTimeout(async () => {
      setCheckingEmail(true);
      try {
        const result = await fetcher<{ exists: boolean }>(
          `/api/admin/users/create?email=${encodeURIComponent(normalized)}`
        );
        setEmailExists(result.exists);
      } catch {
        setEmailExists(false);
      } finally {
        setCheckingEmail(false);
      }
    }, 350);

    return () => window.clearTimeout(timer);
  }, [email]);

  const selectedTenant = useMemo(
    () => data?.tenants.find((tenant) => tenant.id === tenantId) || null,
    [data?.tenants, tenantId]
  );
  const canAttachTenant = role === "USER";
  const filteredTenants = useMemo(() => {
    const query = tenantQuery.trim().toLowerCase();
    if (!query) return data?.tenants || [];
    return (data?.tenants || []).filter(
      (tenant) =>
        tenant.name.toLowerCase().includes(query) ||
        tenant.id.toLowerCase().includes(query)
    );
  }, [data?.tenants, tenantQuery]);

  const handleTenantQueryChange = (value: string) => {
    if (!canAttachTenant) return;
    setTenantQuery(value);
    const normalized = value
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");
    if (!normalized) {
      setTenantId("");
      return;
    }

    const tenants = data?.tenants || [];
    const exactMatch = tenants.find(
      (tenant) =>
        tenant.name.trim().toLowerCase().replace(/\s+/g, " ") === normalized ||
        tenant.id.toLowerCase() === normalized
    );

    if (exactMatch) {
      setTenantId(exactMatch.id);
      return;
    }

    const partialMatches = tenants.filter(
      (tenant) =>
        tenant.name.toLowerCase().includes(normalized) ||
        tenant.id.toLowerCase().includes(normalized)
    );

    if (partialMatches.length > 0) {
      const ranked = partialMatches
        .slice()
        .sort((a, b) => {
          const aName = a.name.toLowerCase();
          const bName = b.name.toLowerCase();
          const aStarts = aName.startsWith(normalized) ? 0 : 1;
          const bStarts = bName.startsWith(normalized) ? 0 : 1;
          if (aStarts !== bStarts) return aStarts - bStarts;
          return aName.localeCompare(bName);
        });
      setTenantId(ranked[0].id);
      return;
    }

    setTenantId("");
  };

  const disableSubmit =
    submitting ||
    !fullName.trim() ||
    !email.trim() ||
    emailExists ||
    (role === "SUPER_ADMIN" && !superAdminAcknowledge) ||
    (Boolean(tenantId) && !tenantRole) ||
    !data;

  const submit = async (confirmSuperAdminGrant = false, stepUpToken?: string) => {
    if (!data) return;
    setSubmitting(true);
    setFeedback(null);
    try {
      const response = await fetch("/api/admin/users/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: fullName.trim(),
          email: email.trim().toLowerCase(),
          role,
          status,
          sendSetupEmail,
          tenantId: canAttachTenant ? tenantId || null : null,
          tenantRole: canAttachTenant && tenantId && tenantRole ? tenantRole : null,
          confirmSuperAdminGrant,
          stepUpToken: stepUpToken || null,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as
        | IdentityCreateUserResponse
        | { error?: string; code?: string };

      if (!response.ok) {
        const failure = payload as { error?: string; code?: string };
        if (failure.code === "FORBIDDEN_ROLE_ESCALATION") {
          throw new Error("You are not allowed to assign Super Admin.");
        }
        if (failure.code === "STEP_UP_REQUIRED") {
          setStepUpOpen(true);
          throw new Error("Step-up verification is required.");
        }
        if (failure.code === "STEP_UP_INVALID_OR_EXPIRED") {
          setStepUpOpen(true);
          throw new Error("Step-up token expired. Verify again.");
        }
        if (failure.code === "EMAIL_ALREADY_EXISTS") {
          throw new Error("This email already exists.");
        }
        throw new Error(String(failure.error || "Unable to create user."));
      }

      const created = payload as IdentityCreateUserResponse;
      setSetupEmailSent(created.setupEmailSent);
      if (created.tempPassword) {
        setCreatedTempPassword(created.tempPassword);
      } else {
        setFeedback({
          variant: created.setupEmailSent ? "success" : "info",
          message: created.setupEmailSent
            ? "User created and setup email sent."
            : "User created, but setup email failed. Use 'Resend setup email' from the user actions.",
        });
        window.setTimeout(() => router.push("/admin/users"), 1200);
      }
    } catch (submitError) {
      setFeedback({
        variant: "error",
        message: submitError instanceof Error ? submitError.message : "Unable to create user.",
      });
    } finally {
      setSubmitting(false);
      setSuperAdminConfirmOpen(false);
    }
  };

  const handleCreateClick = () => {
    if (canAttachTenant && tenantId && !tenantRole) {
      setFeedback({
        variant: "error",
        message: "Tenant role is required when tenant workspace is selected.",
      });
      return;
    }

    if (role === "SUPER_ADMIN") {
      if (!superAdminAcknowledge) {
        setFeedback({
          variant: "error",
          message: "Acknowledgment is required for Super Admin provisioning.",
        });
        return;
      }
      setSuperAdminConfirmOpen(true);
      return;
    }
    void submit(false);
  };

  const startStepUp = async () => {
    if (!stepUpPassword.trim()) {
      setFeedback({ variant: "error", message: "Enter your current password for verification." });
      return;
    }
    setStepUpLoading(true);
    setFeedback(null);
    try {
      const response = await fetch("/api/admin/step-up/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: stepUpPassword }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        stepUpToken?: string;
        error?: string;
      };
      if (!response.ok || !payload.stepUpToken) {
        throw new Error(payload.error || "Step-up verification failed.");
      }
      setStepUpOpen(false);
      setStepUpPassword("");
      await submit(true, payload.stepUpToken);
    } catch (stepUpError) {
      setFeedback({
        variant: "error",
        message: stepUpError instanceof Error ? stepUpError.message : "Step-up verification failed.",
      });
    } finally {
      setStepUpLoading(false);
    }
  };

  return (
    <div className="space-y-5 px-6 py-6 max-md:px-4 max-md:py-4">
      <section className="rounded-2xl border border-border/60 bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-[0.2em] text-indigo-600 dark:text-indigo-300">Ops Admin</p>
            <h1 className="text-3xl font-semibold text-foreground">Create Platform User</h1>
            <p className="text-sm text-muted-foreground">
              Provision a new identity within the system.
            </p>
          </div>
          <Button variant="secondary" onClick={() => router.push("/admin/users")}>
            <ArrowLeft className="h-4 w-4" />
            Back to Users
          </Button>
        </div>
      </section>

      {feedback ? <Alert variant={feedback.variant}>{feedback.message}</Alert> : null}
      {error ? <Alert variant="error">{error.message}</Alert> : null}

      <Card title="Identity">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading provisioning metadata...</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            <Input
              label="Full Name"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              placeholder="Enter full name"
            />
            <Input
              label="Email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="user@domain.com"
            />
            <div className="md:col-span-2">
              {checkingEmail ? (
                <p className="text-xs text-muted-foreground">Checking email availability...</p>
              ) : emailExists ? (
                <p className="text-xs font-medium text-rose-700 dark:text-rose-300">
                  This email is already in use.
                </p>
              ) : email.trim() ? (
                <p className="text-xs text-emerald-700 dark:text-emerald-300">Email is available.</p>
              ) : null}
            </div>
          </div>
        )}
      </Card>

      <Card title="Role">
        <div className="grid gap-3 md:grid-cols-2">
          <label className="text-sm text-muted-foreground">
            Global Role
            <select
              value={role}
              onChange={(event) => setRole(event.target.value as IdentityAccessRole)}
              className="mt-1 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground"
            >
              {data?.roleOptions.map((item) => (
                <option key={item} value={item}>
                  {formatRoleLabel(item)}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm text-muted-foreground">
            Account Status
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value as IdentityAccessStatus)}
              disabled={sendSetupEmail}
              className="mt-1 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground disabled:opacity-60"
            >
              {data?.statusOptions.map((item) => (
                <option key={item} value={item}>
                  {formatStatusLabel(item)}
                </option>
              ))}
            </select>
          </label>
        </div>
        {role === "SUPER_ADMIN" ? (
          <div className="mt-3 space-y-2">
            <p className="text-sm font-medium text-rose-700 dark:text-rose-300">
              Creating a super admin grants full platform control.
            </p>
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={superAdminAcknowledge}
                onChange={(event) => setSuperAdminAcknowledge(event.target.checked)}
              />
              I understand this grants unrestricted platform access.
            </label>
          </div>
        ) : null}
      </Card>

      <Card title="Tenant (Optional)">
        <div className="grid gap-3 md:grid-cols-2">
          <Input
            label="Search Tenant"
            value={tenantQuery}
            onChange={(event) => handleTenantQueryChange(event.target.value)}
            placeholder="Search workspace by name or tenant ID"
            list="tenant-workspace-options"
            disabled={!canAttachTenant}
          />
          <datalist id="tenant-workspace-options">
            {(data?.tenants || []).map((tenant) => (
              <option key={tenant.id} value={tenant.name}>
                {tenant.id}
              </option>
            ))}
          </datalist>
          <label className="text-sm text-muted-foreground">
            Tenant Workspace
            <select
              value={tenantId}
              onChange={(event) => {
                const nextTenantId = event.target.value;
                setTenantId(nextTenantId);
                if (!canAttachTenant) return;
                if (!nextTenantId) {
                  setTenantQuery("");
                  setTenantRole("");
                  return;
                }
                const tenant = (data?.tenants || []).find((item) => item.id === nextTenantId);
                setTenantQuery(tenant?.name || "");
                setTenantRole("");
              }}
              disabled={!canAttachTenant}
              className="mt-1 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground disabled:opacity-60"
            >
              <option value="">No tenant attachment</option>
              {filteredTenants.map((tenant) => (
                <option key={tenant.id} value={tenant.id}>
                  {tenant.name}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm text-muted-foreground">
            Tenant Role
            <select
              value={tenantRole}
              onChange={(event) => setTenantRole(event.target.value as TenantRole)}
              disabled={!canAttachTenant || !tenantId}
              className="mt-1 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground disabled:opacity-60"
            >
              <option value="">Select role</option>
              <option value="MEMBER">Member</option>
              <option value="OPS_ADMIN">Ops Admin</option>
              <option value="BILLING_ADMIN">Billing Admin</option>
              <option value="OWNER">Owner</option>
            </select>
          </label>
        </div>
        {!canAttachTenant ? (
          <p className="mt-2 text-xs font-medium text-rose-700 dark:text-rose-300">
            Platform Ops Admins cannot be attached to a tenant workspace.
          </p>
        ) : null}
        {tenantQuery.trim() && filteredTenants.length === 0 ? (
          <p className="mt-2 text-xs text-muted-foreground">
            No tenant matches your search.
          </p>
        ) : null}

        {selectedTenant ? (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            <Badge variant="default">{selectedTenant.name}</Badge>
            <Badge variant={selectedTenant.accessStatus === "ACTIVE" ? "success" : "warning"}>
              Access: {selectedTenant.accessStatus}
            </Badge>
            <Badge variant={selectedTenant.subscriptionStatus === "ACTIVE" ? "success" : "warning"}>
              Subscription: {selectedTenant.subscriptionStatus || "NONE"}
            </Badge>
            <Badge variant="country">
              Seats: {selectedTenant.seatsUsed}/{selectedTenant.seatLimit ?? "Unlimited"}
            </Badge>
          </div>
        ) : null}
      </Card>

      <Card title="Security">
        <div className="space-y-3">
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={sendSetupEmail}
              onChange={(event) => setSendSetupEmail(event.target.checked)}
              disabled={status === "DISABLED"}
            />
            Send password setup email (recommended)
          </label>
          <p className="text-xs text-muted-foreground">
            If enabled, account status is set to <strong>PENDING</strong> until password setup is completed.
            If disabled, a temporary password is generated once and must be changed on first login.
          </p>
          {!sendSetupEmail ? (
            <p className="text-sm font-medium text-rose-700 dark:text-rose-300">
              Temporary password mode is enabled. Keep generated credentials secure.
            </p>
          ) : null}
          {status === "DISABLED" ? (
            <p className="text-xs text-muted-foreground">Disabled users cannot receive setup email.</p>
          ) : null}
        </div>
      </Card>

      <section className="flex items-center justify-end gap-2">
        <Button variant="secondary" onClick={() => router.push("/admin/users")}>
          Cancel
        </Button>
        <Button onClick={handleCreateClick} disabled={disableSubmit} loading={submitting}>
          <UserPlus className="h-4 w-4" />
          Create User
        </Button>
      </section>

      <ConfirmationModal
        open={superAdminConfirmOpen}
        variant="danger"
        title="Grant Super Admin Role"
        description="This user will have full platform control. This action is audited."
        confirmLabel="Confirm & Create"
        onConfirm={() => {
          setSuperAdminConfirmOpen(false);
          setStepUpOpen(true);
        }}
        onCancel={() => setSuperAdminConfirmOpen(false)}
      />

      <Modal
        open={stepUpOpen}
        onClose={() => {
          setStepUpOpen(false);
          setStepUpPassword("");
        }}
        title="Step-up Verification"
      >
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Re-enter your current password to authorize Super Admin creation.
          </p>
          <Input
            label="Current Password"
            type="password"
            value={stepUpPassword}
            onChange={(event) => setStepUpPassword(event.target.value)}
            placeholder="Enter your password"
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setStepUpOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void startStepUp()} loading={stepUpLoading}>
              Verify & Continue
            </Button>
          </div>
        </div>
      </Modal>

      {createdTempPassword ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4">
          <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-2xl">
            <div className="flex items-start gap-3">
              <ShieldAlert className="mt-0.5 h-5 w-5 text-amber-600" />
              <div className="space-y-2">
                <h2 className="text-lg font-semibold text-foreground">Temporary Password Generated</h2>
                <p className="text-sm text-muted-foreground">
                  Copy this password now. It will not be shown again.
                </p>
              </div>
            </div>
            <div className="mt-4 rounded-lg border border-border bg-muted/20 px-3 py-2 font-mono text-sm text-foreground">
              {createdTempPassword}
            </div>
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <Button
                variant="secondary"
                onClick={async () => {
                  await navigator.clipboard.writeText(createdTempPassword);
                  setFeedback({ variant: "success", message: "Temporary password copied." });
                }}
              >
                <Copy className="h-4 w-4" />
                Copy
              </Button>
              <Button onClick={() => router.push("/admin/users")}>
                Continue
              </Button>
            </div>
            {setupEmailSent === false ? (
              <p className="mt-3 text-xs text-amber-700 dark:text-amber-300">
                Setup email was not sent. Resend from user actions if needed.
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

    </div>
  );
}
