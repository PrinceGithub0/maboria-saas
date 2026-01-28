"use client";

import useSWR from "swr";
import { Card } from "@/components/ui/card";
import { Table } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert } from "@/components/ui/alert";
import { Modal } from "@/components/ui/modal";
import { useLanguage } from "@/components/providers/language-provider";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function AdminUsersPage() {
  const { language } = useLanguage();
  const t = (en: string, fr: string) => (language === "fr" ? fr : en);
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | "admin" | "disabled" | "active">("all");
  const [cancelForm, setCancelForm] = useState({ publicUserId: "", lastName: "" });
  const [cancelStatus, setCancelStatus] = useState<{ message: string; variant: "success" | "error" | "info" } | null>(
    null
  );
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<any | null>(null);
  const [actionStatus, setActionStatus] = useState<{ message: string; variant: "success" | "error" | "info" } | null>(
    null
  );
  const [actionLoading, setActionLoading] = useState(false);
  const [passwordReset, setPasswordReset] = useState("");
  const [subForm, setSubForm] = useState({
    plan: "",
    status: "",
    currency: "",
    renewalDate: "",
  });
  const { data, mutate, isLoading } = useSWR("/api/admin/users", fetcher);
  const usersData = useMemo(() => (Array.isArray(data) ? data : []), [data]);
  const totalUsers = usersData.length;
  const adminUsers = usersData.filter((u: any) => u.role === "ADMIN").length;
  const disabledUsers = usersData.filter((u: any) => u.role === "DISABLED").length;
  const activeSubs = usersData.filter((u: any) => u.subscriptions?.some((s: any) => s.status === "ACTIVE")).length;
  const users = useMemo(() => { 
    const normalized = query.trim().toLowerCase();
    return usersData
      .filter((u: any) => {
        if (roleFilter === "admin") return u.role === "ADMIN";
        if (roleFilter === "disabled") return u.role === "DISABLED";
        if (roleFilter === "active") return u.subscriptions?.some((s: any) => s.status === "ACTIVE");
        return true; 
      }) 
      .filter((u: any) => {
        const email = String(u.email || "").toLowerCase();
        const name = String(u.name || "").toLowerCase();
        const publicId = String(u.publicId || "").toLowerCase();
        if (!normalized) return true;
        return email.includes(normalized) || name.includes(normalized) || publicId.includes(normalized);
      });
  }, [usersData, query, roleFilter]);

  const formatPlan = (plan: string) => {
    switch ((plan || "").toUpperCase()) {
      case "STARTER":
        return t("Starter", "Starter");
      case "PRO":
        return t("Pro", "Pro");
      case "GROWTH":
        return t("Growth", "Growth");
      case "BUSINESS":
        return t("Business", "Business");
      case "PREMIUM":
        return t("Business", "Business");
      case "ENTERPRISE":
        return t("Enterprise", "Entreprise");
      default:
        return plan || t("None", "Aucun");
    }
  };
  const formatRole = (role: string) => {
    switch ((role || "").toUpperCase()) {
      case "ADMIN":
        return t("ADMIN", "ADMIN");
      case "DISABLED":
        return t("DISABLED", "DESACTIVE");
      case "USER":
      default:
        return t("USER", "UTILISATEUR");
    }
  };
  const formatStatus = (status: string) => {
    switch ((status || "").toUpperCase()) {
      case "ACTIVE":
        return t("ACTIVE", "ACTIVE");
      case "PAST_DUE":
        return t("PAST_DUE", "EN_RETARD");
      case "CANCELED":
      case "CANCELLED":
        return t("CANCELLED", "ANNULE");
      case "INACTIVE":
      default:
        return t("INACTIVE", "INACTIF");
    }
  };

  const pickPrimarySubscription = (user: any) =>
    user?.subscriptions?.find((s: any) => s.status === "ACTIVE") || user?.subscriptions?.[0];

  const updateUserOptimistic = async (id: string, updater: (user: any) => any) => {
    await mutate(
      (current: any[] = []) => current.map((user) => (user.id === id ? updater(user) : user)),
      { revalidate: false }
    );
  };

  const updateSelectedUser = (id: string, updater: (user: any) => any) => {
    if (!selectedUser || selectedUser.id !== id) return;
    setSelectedUser(updater(selectedUser));
  };

  const formatDateInput = (value?: string | Date | null) => {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return date.toISOString().slice(0, 10);
  };

  const openManage = (user: any) => {
    const primarySub = pickPrimarySubscription(user);
    setSelectedUser({ ...user, primarySub });
    const normalizedPlan = primarySub?.plan === "PREMIUM" ? "BUSINESS" : primarySub?.plan || "";
    setSubForm({
      plan: normalizedPlan,
      status: primarySub?.status || "",
      currency: primarySub?.currency || "",
      renewalDate: formatDateInput(primarySub?.renewalDate),
    });
    setPasswordReset("");
    setActionStatus(null);
    setModalOpen(true);
  };

  const closeManage = () => {
    setModalOpen(false);
    setSelectedUser(null);
    setActionStatus(null);
  };

  const toggleAdmin = async (id: string, role: string) => {
    setActionLoading(true);
    setActionStatus(null);
    const nextRole = role === "ADMIN" ? "USER" : "ADMIN";
    await updateUserOptimistic(id, (user) => ({ ...user, role: nextRole }));
    updateSelectedUser(id, (user) => ({ ...user, role: nextRole }));
    const res = await fetch(`/api/admin/users/${id}/role`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: nextRole }),
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      setActionStatus({ message: payload.error || t("Role update failed.", "Echec de mise a jour du role."), variant: "error" });
      await mutate();
    } else {
      setActionStatus({
        message: t(
          `Role updated to ${payload.role || nextRole}.`,
          `Role mis a jour vers ${formatRole(payload.role || nextRole)}.`
        ),
        variant: "success",
      });
      await updateUserOptimistic(id, (user) => ({ ...user, role: payload.role || nextRole }));
      updateSelectedUser(id, (user) => ({ ...user, role: payload.role || nextRole }));
    }
    setActionLoading(false);
  };

  const toggleUserStatus = async (id: string) => {
    setActionLoading(true);
    setActionStatus(null);
    await updateUserOptimistic(id, (user) => ({
      ...user,
      role: user.role === "DISABLED" ? "USER" : "DISABLED",
    }));
    updateSelectedUser(id, (user) => ({
      ...user,
      role: user.role === "DISABLED" ? "USER" : "DISABLED",
    }));
    const res = await fetch(`/api/admin/users/${id}/toggle`, { method: "POST" });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      setActionStatus({
        message: payload.error || t("Unable to update user status.", "Impossible de mettre a jour le statut."),
        variant: "error",
      });
      await mutate();
    } else {
      setActionStatus({
        message:
          payload.role === "DISABLED"
            ? t("User disabled.", "Utilisateur desactive.")
            : t("User enabled.", "Utilisateur active."),
        variant: "success",
      });
      await updateUserOptimistic(id, (user) => ({ ...user, role: payload.role || user.role }));
      updateSelectedUser(id, (user) => ({ ...user, role: payload.role || user.role }));
    }
    setActionLoading(false);
  };

  const impersonateUser = async (id: string) => {
    setActionLoading(true);
    setActionStatus(null);
    const res = await fetch(`/api/admin/users/impersonate/${id}`, { method: "POST" });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      setActionStatus({ message: payload.error || t("Impersonation failed.", "Impersonation echouee."), variant: "error" });
      setActionLoading(false);
      return;
    }
    window.location.href = "/dashboard";
  };

  const resetPassword = async () => {
    if (!selectedUser) return;
    if (!passwordReset.trim()) {
      setActionStatus({ message: t("Enter a temporary password first.", "Saisissez un mot de passe temporaire."), variant: "error" });
      return;
    }
    setActionLoading(true);
    setActionStatus(null);
    const res = await fetch(`/api/admin/users/${selectedUser.id}/password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: passwordReset }),
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      setActionStatus({ message: payload.error || t("Password reset failed.", "Reinitialisation du mot de passe echouee."), variant: "error" });
    } else {
      setActionStatus({ message: t("Temporary password saved.", "Mot de passe temporaire enregistre."), variant: "success" });
      setPasswordReset("");
    }
    await mutate();
    setActionLoading(false);
  };

  const updateSubscription = async () => {
    if (!selectedUser?.primarySub?.id) {
      setActionStatus({ message: t("No subscription found for this user.", "Aucun abonnement trouve pour cet utilisateur."), variant: "error" });
      return;
    }
    const payload: Record<string, string> = {};
    if (subForm.plan) payload.plan = subForm.plan;
    if (subForm.status) payload.status = subForm.status;
    if (subForm.currency) payload.currency = subForm.currency;
    if (subForm.renewalDate) payload.renewalDate = new Date(subForm.renewalDate).toISOString();
    if (!Object.keys(payload).length) {
      setActionStatus({ message: t("No subscription changes to apply.", "Aucune modification d'abonnement."), variant: "info" });
      return;
    }
    setActionLoading(true);
    setActionStatus(null);
    await updateUserOptimistic(selectedUser.id, (user) => {
      const subscriptions = (user.subscriptions || []).map((sub: any) =>
        sub.id === selectedUser.primarySub.id ? { ...sub, ...payload } : sub
      );
      return { ...user, subscriptions };
    });
    updateSelectedUser(selectedUser.id, (user) => ({
      ...user,
      primarySub: { ...user.primarySub, ...payload },
    }));
    const res = await fetch(`/api/admin/subscriptions/${selectedUser.primarySub.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setActionStatus({ message: data.error || t("Subscription update failed.", "Mise a jour abonnement echouee."), variant: "error" });
      await mutate();
    } else {
      setActionStatus({ message: t("Subscription updated.", "Abonnement mis a jour."), variant: "success" });
      await updateUserOptimistic(selectedUser.id, (user) => {
        const subscriptions = (user.subscriptions || []).map((sub: any) =>
          sub.id === selectedUser.primarySub.id ? { ...sub, ...data } : sub
        );
        return { ...user, subscriptions };
      });
      updateSelectedUser(selectedUser.id, (user) => ({
        ...user,
        primarySub: { ...user.primarySub, ...data },
      }));
    }
    setActionLoading(false);
  };

  const cancelSubscription = async () => {
    setCancelStatus(null);
    const res = await fetch("/api/admin/subscriptions/cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cancelForm),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setCancelStatus({ message: data.error || t("Cancellation failed.", "Annulation echouee."), variant: "error" });
      return;
    }
    setCancelStatus({
      message: t(
        `Canceled ${data.count ?? 0} active subscription(s) for user ${cancelForm.publicUserId}.`,
        `Annule ${data.count ?? 0} abonnement(s) actifs pour l'utilisateur ${cancelForm.publicUserId}.`
      ),
      variant: "success",
    });
    setCancelForm({ publicUserId: "", lastName: "" });
    mutate();
  };

  return (
    <div className="space-y-4 px-6 py-6 max-md:px-4 max-md:py-4 max-md:space-y-6">
      <div className="md:contents max-md:rounded-[28px] max-md:border max-md:border-border/60 max-md:bg-card max-md:p-4 max-md:shadow-[0_16px_36px_rgba(15,23,42,0.18)]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-indigo-600 dark:text-indigo-300">{t("Admin", "Admin")}</p>
            <h1 className="text-3xl font-semibold text-foreground">{t("User management", "Gestion utilisateurs")}</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {t("Identity, access control, and subscription oversight.", "Identite, controle d'acces et abonnements.")}
            </p>
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:min-w-[320px]">
            <Input
              placeholder={t("Search by name, email, or user ID", "Rechercher par nom, email ou ID")}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full"
            />
            <div className="flex flex-wrap gap-2">
              {[
                { key: "all", label: t("All", "Tous") },
                { key: "admin", label: t("Admins", "Admins") },
                { key: "disabled", label: t("Disabled", "Desactives") },
                { key: "active", label: t("Active subs", "Abos actifs") },
              ].map((filter) => (
                <Button
                  key={filter.key}
                  size="sm"
                  variant={roleFilter === filter.key ? "primary" : "secondary"}
                  onClick={() => setRoleFilter(filter.key as typeof roleFilter)}
                  className="h-8"
                >
                  {filter.label}
                </Button>
              ))}
            </div>
          </div>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-4 max-md:grid-cols-1 max-md:gap-5">
        {isLoading ? (
          <>
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
          </>
        ) : (
          <>
            <Card title={t("Total users", "Total utilisateurs")}>
              <p className="text-2xl font-semibold text-foreground">{totalUsers}</p>
            </Card>
            <Card title={t("Admins", "Admins")}>
              <p className="text-2xl font-semibold text-foreground">{adminUsers}</p>
            </Card>
            <Card title={t("Disabled", "Desactives")}>
              <p className="text-2xl font-semibold text-foreground">{disabledUsers}</p>
            </Card>
            <Card title={t("Active subs", "Abos actifs")}>
              <p className="text-2xl font-semibold text-foreground">{activeSubs}</p>
            </Card>
          </>
        )}
      </div>
      <Card title={t("Cancel a user subscription", "Annuler un abonnement")}>
        {cancelStatus && <Alert variant={cancelStatus.variant}>{cancelStatus.message}</Alert>}
        <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto] max-md:grid-cols-1">
          <Input
            label={t("User ID", "ID utilisateur")}
            placeholder={t("Numeric user ID", "ID utilisateur numerique")}
            value={cancelForm.publicUserId}
            onChange={(e) => setCancelForm({ ...cancelForm, publicUserId: e.target.value })}
          />
          <Input
            label={t("Last name", "Nom de famille")}
            placeholder={t("Last name on account", "Nom de famille du compte")}
            value={cancelForm.lastName}
            onChange={(e) => setCancelForm({ ...cancelForm, lastName: e.target.value })}
          />
          <div className="flex items-end max-md:items-stretch">
            <Button className="max-md:w-full" onClick={cancelSubscription}>
              {t("Cancel subscription", "Annuler abonnement")}
            </Button>
          </div>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {t(
            "Cancellation is restricted to admins. Active subscriptions are set to cancelled immediately.",
            "Annulation reservee aux admins. Les abonnements actifs sont annules immediatement."
          )}
        </p>
      </Card>
      <Card title={t("Users", "Utilisateurs")}>
        {isLoading ? (
          <Skeleton className="h-24" />
        ) : (
          <Table
            data={users}
            keyExtractor={(row: any) => row.id}
            columns={[
              { key: "email", label: t("Email", "Email") },
              { key: "name", label: t("Name", "Nom") },
              { key: "publicId", label: t("User ID", "ID utilisateur"), render: (row: any) => row.publicId || "-" },
              { key: "role", label: t("Role", "Role"), render: (row: any) => <Badge>{formatRole(row.role)}</Badge> },
              {
                key: "plan",
                label: t("Plan", "Plan"),
                render: (row: any) => formatPlan(pickPrimarySubscription(row)?.plan),
              },
              {
                key: "status",
                label: t("Status", "Statut"),
                render: (row: any) => {
                  const status = pickPrimarySubscription(row)?.status || "INACTIVE";
                  const isCancelled = status === "CANCELED" || status === "CANCELLED";
                  const badgeClass = isCancelled
                    ? "!bg-red-600 !text-white !border-red-700 dark:bg-rose-500/20 dark:text-rose-200 dark:border-rose-500/40"
                    : status === "ACTIVE"
                    ? "!bg-emerald-200 !text-emerald-900 !border-emerald-400 dark:bg-emerald-500/20 dark:text-emerald-200 dark:border-emerald-500/40"
                    : "!bg-slate-200 !text-slate-900 !border-slate-400 dark:bg-slate-700 dark:text-slate-100 dark:border-slate-500";
                  return (
                    <Badge variant="default" className={badgeClass}>
                      {formatStatus(status)}
                    </Badge>
                  );
                },
              },
              {
                key: "actions",
                label: t("Actions", "Actions"),
                render: (row: any) => (
                  <div className="flex gap-2">
                    <Button size="sm" variant="secondary" onClick={() => openManage(row)}>
                      {t("Manage", "Gerer")}
                    </Button>
                  </div>
                ),
              },
            ]}
          />
        )}
      </Card>
      <Modal open={modalOpen} onClose={closeManage} title={t("Manage user", "Gerer utilisateur")}>
        {selectedUser && (
          <div className="space-y-4">
            {actionStatus && <Alert variant={actionStatus.variant}>{actionStatus.message}</Alert>}
            <div className="rounded-xl border border-border/70 bg-muted/30 px-4 py-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">{t("Identity", "Identite")}</p>
              <div className="mt-2 grid gap-1 text-sm text-foreground">
                <span>{selectedUser.name || t("Unnamed user", "Utilisateur sans nom")}</span>
                <span className="text-muted-foreground">{selectedUser.email}</span>
                <span className="text-xs text-muted-foreground">
                  {t("User ID", "ID utilisateur")}: {selectedUser.publicId || t("N/A", "N/A")}
                </span>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" loading={actionLoading} onClick={() => toggleAdmin(selectedUser.id, selectedUser.role)}>
                {selectedUser.role === "ADMIN" ? t("Remove admin", "Retirer admin") : t("Make admin", "Rendre admin")}
              </Button>
              <Button size="sm" variant="secondary" loading={actionLoading} onClick={() => toggleUserStatus(selectedUser.id)}>
                {selectedUser.role === "DISABLED" ? t("Enable user", "Activer utilisateur") : t("Disable user", "Desactiver utilisateur")}
              </Button>
              <Button size="sm" variant="ghost" loading={actionLoading} onClick={() => impersonateUser(selectedUser.id)}>
                {t("Impersonate", "Impersoner")}
              </Button>
            </div>
            <div className="rounded-xl border border-border/70 bg-muted/30 px-4 py-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">{t("Subscription", "Abonnement")}</p>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <label className="text-xs text-muted-foreground">
                  {t("Plan", "Plan")}
                  <select
                    value={subForm.plan}
                    onChange={(event) => setSubForm((prev) => ({ ...prev, plan: event.target.value }))}
                    className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-2 text-sm text-foreground"
                  >
                    <option value="">{t("Select plan", "Choisir un plan")}</option>
                    <option value="STARTER">Starter</option>
                    <option value="PRO">Pro</option>
                    <option value="GROWTH">Growth</option>
                    <option value="BUSINESS">Business</option>
                    <option value="ENTERPRISE">Enterprise</option>
                  </select>
                </label>
                <label className="text-xs text-muted-foreground">
                  {t("Status", "Statut")}
                  <select
                    value={subForm.status}
                    onChange={(event) => setSubForm((prev) => ({ ...prev, status: event.target.value }))}
                    className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-2 text-sm text-foreground"
                  >
                    <option value="">{t("Select status", "Choisir un statut")}</option>
                    <option value="ACTIVE">ACTIVE</option>
                    <option value="PAST_DUE">PAST_DUE</option>
                    <option value="CANCELED">CANCELED</option>
                    <option value="INACTIVE">INACTIVE</option>
                  </select>
                </label>
                <label className="text-xs text-muted-foreground">
                  {t("Currency", "Devise")}
                  <select
                    value={subForm.currency}
                    onChange={(event) => setSubForm((prev) => ({ ...prev, currency: event.target.value }))}
                    className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-2 text-sm text-foreground"
                  >
                    <option value="">{t("Select currency", "Choisir devise")}</option>
                    <option value="NGN">NGN</option>
                    <option value="USD">USD</option>
                  </select>
                </label>
                <label className="text-xs text-muted-foreground">
                  {t("Renewal date", "Date de renouvellement")}
                  <Input
                    type="date"
                    value={subForm.renewalDate}
                    onChange={(event) => setSubForm((prev) => ({ ...prev, renewalDate: event.target.value }))}
                    className="mt-1"
                  />
                </label>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <Button size="sm" loading={actionLoading} onClick={updateSubscription}>
                  {t("Save subscription changes", "Enregistrer les changements")}
                </Button>
              </div>
            </div>
            <div className="rounded-xl border border-border/70 bg-muted/30 px-4 py-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">{t("Reset password", "Reinitialiser mot de passe")}</p>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-end">
                <Input
                  label={t("Temporary password", "Mot de passe temporaire")}
                  type="password"
                  value={passwordReset}
                  onChange={(event) => setPasswordReset(event.target.value)}
                  className="w-full"
                />
                <Button size="sm" loading={actionLoading} onClick={resetPassword}>
                  {t("Save password", "Enregistrer mot de passe")}
                </Button>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {t(
                  "Provide a temporary password and notify the user to change it on next login.",
                  "Fournissez un mot de passe temporaire et demandez le changement a la prochaine connexion."
                )}
              </p>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
