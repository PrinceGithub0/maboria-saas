"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  Search,
  UserCog,
  UserMinus,
  UserPlus,
} from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmationModal } from "@/components/ui/ConfirmationModal";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Skeleton } from "@/components/ui/skeleton";
import type {
  IdentityAccessRole,
  IdentityAccessStatus,
  IdentityFilter,
  IdentityListItem,
  IdentityListResponse,
  IdentitySummary,
  IdentityUserDetailResponse,
} from "@/lib/admin/users-types";

const FILTERS: Array<{ key: IdentityFilter; label: string }> = [
  { key: "all", label: "All" },
  { key: "super_admins", label: "Super Admins" },
  { key: "admins", label: "Admins" },
  { key: "subscribers", label: "Subscribers" },
  { key: "no_plan", label: "No Plan" },
  { key: "disabled", label: "Disabled" },
];

const ROLE_OPTIONS: IdentityAccessRole[] = ["SUPER_ADMIN", "OPS_ADMIN", "USER"];
const STATUS_OPTIONS: IdentityAccessStatus[] = ["ACTIVE", "PENDING", "SUSPENDED", "DISABLED"];

const fetcher = async <T,>(url: string): Promise<T> => {
  const response = await fetch(url, { cache: "no-store" });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(String((json as { error?: string })?.error || `Request failed (${response.status})`));
  }
  return json as T;
};

function formatRole(role: IdentityAccessRole) {
  if (role === "SUPER_ADMIN") return "SUPER_ADMIN";
  if (role === "OPS_ADMIN") return "OPS_ADMIN";
  return "USER";
}

function roleBadgeVariant(role: IdentityAccessRole) {
  if (role === "SUPER_ADMIN") return "roleSuperAdmin" as const;
  if (role === "OPS_ADMIN") return "roleAdmin" as const;
  return "roleUser" as const;
}

function formatSubscriptionState(state: IdentityListItem["subscriptionState"]) {
  if (state === "PAST_DUE") return "Past Due";
  if (state === "CANCELED") return "Canceled";
  if (state === "TRIAL") return "Trial";
  if (state === "ACTIVE") return "Active";
  return "None";
}

function subscriptionBadgeVariant(state: IdentityListItem["subscriptionState"]) {
  if (state === "ACTIVE") return "success" as const;
  if (state === "CANCELED") return "danger" as const;
  if (state === "PAST_DUE" || state === "TRIAL") return "warning" as const;
  return "default" as const;
}

function subscriptionBadgeClass(state: IdentityListItem["subscriptionState"]) {
  if (state === "CANCELED") {
    return "text-white";
  }
  return undefined;
}

function subscriptionBadgeStyle(state: IdentityListItem["subscriptionState"]) {
  if (state === "CANCELED") {
    return {
      backgroundColor: "#dc2626",
      borderColor: "#b91c1c",
      color: "#ffffff",
    };
  }
  return undefined;
}

function statusBadgeVariant(status: IdentityAccessStatus) {
  if (status === "ACTIVE") return "success" as const;
  if (status === "PENDING") return "warning" as const;
  if (status === "SUSPENDED") return "warning" as const;
  return "danger" as const;
}

function getAllowedRoleOptions(params: {
  actorRole: IdentityAccessRole;
  actorId: string | null;
  target: IdentityListItem;
  isRootSuperAdmin?: boolean;
}): IdentityAccessRole[] {
  const { actorRole, actorId, target, isRootSuperAdmin } = params;
  const isSelf = Boolean(actorId && actorId === target.id);

  if (actorRole === "SUPER_ADMIN") {
    if (target.role === "SUPER_ADMIN" && (isRootSuperAdmin || isSelf)) {
      return ["SUPER_ADMIN"] as IdentityAccessRole[];
    }
    return ROLE_OPTIONS;
  }

  return [] as IdentityAccessRole[];
}

function getUserActionPolicy(params: {
  actorRole: IdentityAccessRole;
  actorId: string | null;
  target: IdentityListItem;
}) {
  const { actorRole, actorId, target } = params;
  const isSelf = Boolean(actorId && actorId === target.id);
  const isTargetSuperAdmin = target.role === "SUPER_ADMIN";
  const canManageAdminLevel = actorRole === "SUPER_ADMIN";

  const canChangeRole = canManageAdminLevel && !isTargetSuperAdmin && !isSelf;

  const canChangeStatus =
    !isSelf &&
    !isTargetSuperAdmin &&
    (canManageAdminLevel || target.role === "USER");

  const canResetPassword = canManageAdminLevel || target.role === "USER";

  const canCancelSubscription = true;

  return {
    isSelf,
    canChangeRole,
    canChangeStatus,
    canResetPassword,
    canCancelSubscription,
  };
}

function formatAbsoluteTime(value?: string | null) {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Never";
  return date.toLocaleString();
}

function formatRelativeTime(value?: string | null) {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Never";
  const now = Date.now();
  const diffMs = date.getTime() - now;
  const diffMinutes = Math.round(diffMs / 60000);
  const absMinutes = Math.abs(diffMinutes);
  if (absMinutes < 1) return "just now";
  if (absMinutes < 60) return `${Math.abs(diffMinutes)} minute${Math.abs(diffMinutes) === 1 ? "" : "s"} ago`;
  const diffHours = Math.round(diffMinutes / 60);
  const absHours = Math.abs(diffHours);
  if (absHours < 24) return `${absHours} hour${absHours === 1 ? "" : "s"} ago`;
  const diffDays = Math.round(diffHours / 24);
  const absDays = Math.abs(diffDays);
  return `${absDays} day${absDays === 1 ? "" : "s"} ago`;
}

function formatAuditActionLabel(value?: string | null) {
  const normalized = String(value || "").trim();
  if (!normalized || normalized === "AUDIT_EVENT" || normalized === "UNKNOWN_ACTION") {
    return "Audit event";
  }

  return normalized
    .replace(/[._]+/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function toCsv(rows: IdentityListItem[]) {
  const header = [
    "id",
    "name",
    "email",
    "userId",
    "role",
    "status",
    "subscriptionPlan",
    "subscriptionState",
    "lastLoginAt",
    "createdAt",
  ];
  const body = rows.map((row) =>
    [
      row.id,
      row.fullName,
      row.email,
      row.userId || "",
      row.role,
      row.status,
      row.subscriptionPlan || "",
      row.subscriptionState,
      row.lastLoginAt || "",
      row.createdAt,
    ]
      .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
      .join(",")
  );
  return [header.join(","), ...body].join("\n");
}

function triggerCsvDownload(fileName: string, content: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", fileName);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function KpiItem({
  label,
  value,
  subtext,
}: {
  label: string;
  value: string;
  subtext: string;
}) {
  return (
    <div className="space-y-1.5 px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold text-foreground">{value}</p>
      <p className="text-xs text-muted-foreground">{subtext}</p>
    </div>
  );
}

export default function AdminUsersPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const deepLinkSearch = searchParams.get("search")?.trim() || "";
  const deepLinkOpenEmail = searchParams.get("openEmail")?.trim().toLowerCase() || "";
  const deepLinkHandledRef = useRef(false);
  const [searchDraft, setSearchDraft] = useState(deepLinkSearch);
  const [query, setQuery] = useState(deepLinkSearch);
  const [filter, setFilter] = useState<IdentityFilter>("all");
  const [cursorStack, setCursorStack] = useState<string[]>([]);
  const [pageSize] = useState(20);
  const [activeMenuUserId, setActiveMenuUserId] = useState<string | null>(null);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [statusConfirm, setStatusConfirm] = useState<{
    user: IdentityListItem;
    nextStatus: IdentityAccessStatus;
  } | null>(null);
  const [subscriptionCancelConfirm, setSubscriptionCancelConfirm] = useState<IdentityListItem | null>(null);
  const [roleModal, setRoleModal] = useState<{ user: IdentityListItem; nextRole: IdentityAccessRole } | null>(null);
  const [bulkRoleModal, setBulkRoleModal] = useState<IdentityAccessRole>("USER");
  const [bulkRoleOpen, setBulkRoleOpen] = useState(false);
  const [feedback, setFeedback] = useState<{ variant: "success" | "error" | "info"; message: string } | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [passwordDraft, setPasswordDraft] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setQuery(searchDraft.trim());
      setCursorStack([]);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchDraft]);

  useEffect(() => {
    setCursorStack([]);
  }, [filter]);

  const currentCursor = cursorStack[cursorStack.length - 1] || null;
  const currentPage = cursorStack.length + 1;

  const requestKey = useMemo(() => {
    const params = new URLSearchParams();
    if (query) params.set("query", query);
    params.set("filter", filter);
    params.set("cursorMode", "1");
    if (currentCursor) params.set("cursor", currentCursor);
    params.set("pageSize", String(pageSize));
    return `/api/admin/users?${params.toString()}`;
  }, [currentCursor, filter, pageSize, query]);

  const { data, error, isLoading, mutate } = useSWR<IdentityListResponse>(requestKey, fetcher);

  const detailKey = selectedUserId ? `/api/admin/users/${selectedUserId}` : null;
  const {
    data: selectedUserDetail,
    error: detailError,
    isLoading: detailLoading,
    mutate: mutateDetail,
  } = useSWR<IdentityUserDetailResponse>(detailKey, fetcher);

  const users = useMemo(() => data?.items ?? [], [data?.items]);
  const summary = data?.summary;
  const pagination = data?.pagination;
  const actorId = data?.actor?.id || null;
  const actorRole: IdentityAccessRole = data?.actor?.role || "OPS_ADMIN";

  useEffect(() => {
    deepLinkHandledRef.current = false;
  }, [deepLinkOpenEmail]);

  useEffect(() => {
    if (!deepLinkSearch) return;
    setSearchDraft((prev) => (prev === deepLinkSearch ? prev : deepLinkSearch));
    setQuery((prev) => (prev === deepLinkSearch ? prev : deepLinkSearch));
    setCursorStack([]);
  }, [deepLinkSearch]);

  useEffect(() => {
    if (!deepLinkOpenEmail || deepLinkHandledRef.current || users.length === 0) return;
    const matchedUser = users.find((user) => user.email.toLowerCase() === deepLinkOpenEmail);
    if (!matchedUser) return;

    setSelectedUserId(matchedUser.id);
    deepLinkHandledRef.current = true;

    const params = new URLSearchParams(searchParams.toString());
    params.delete("openEmail");
    const nextQuery = params.toString();
    router.replace(nextQuery ? `/admin/users?${nextQuery}` : "/admin/users", { scroll: false });
  }, [deepLinkOpenEmail, router, searchParams, users]);

  useEffect(() => {
    setSelectedUserIds((prev) => {
      if (!users.length) {
        return prev.length ? [] : prev;
      }

      const next = prev.filter((id) => users.some((user) => user.id === id));
      if (next.length === prev.length && next.every((id, index) => id === prev[index])) {
        return prev;
      }
      return next;
    });
  }, [users]);

  const selectedUserDetailId = selectedUserDetail?.user.id ?? null;

  useEffect(() => {
    if (!selectedUserDetailId) return;
    setPasswordDraft("");
  }, [selectedUserDetailId]);

  const summaryView: IdentitySummary = summary || {
    totalUsers: 0,
    totalUsersDelta: 0,
    adminCount: 0,
    activeSubscribers: 0,
    disabledAccounts: 0,
    usersWithoutActivePlan: 0,
  };

  const selectedRows = useMemo(
    () => users.filter((user) => selectedUserIds.includes(user.id)),
    [selectedUserIds, users]
  );

  const allVisibleSelected = users.length > 0 && users.every((user) => selectedUserIds.includes(user.id));
  const adminRatioPercent = summaryView.totalUsers
    ? Math.round((summaryView.adminCount / summaryView.totalUsers) * 100)
    : 0;
  const drawerPolicy = selectedUserDetail
    ? getUserActionPolicy({ actorRole, actorId, target: selectedUserDetail.user })
    : null;
  const drawerRoleOptions = selectedUserDetail
    ? getAllowedRoleOptions({
        actorRole,
        actorId,
        target: selectedUserDetail.user,
        isRootSuperAdmin: selectedUserDetail.user.isRootSuperAdmin,
      })
    : [];
  const roleOptionsForDrawer: IdentityAccessRole[] = selectedUserDetail
    ? drawerRoleOptions.length > 0
      ? drawerRoleOptions
      : [selectedUserDetail.user.role as IdentityAccessRole]
    : [];
  const canBulkDisable = selectedRows.every((row) =>
    getUserActionPolicy({ actorRole, actorId, target: row }).canChangeStatus
  );
  const canBulkRoleChange = selectedRows.every((row) =>
    getUserActionPolicy({ actorRole, actorId, target: row }).canChangeRole
  );

  const runAction = async (executor: () => Promise<void>) => {
    setActionLoading(true);
    setFeedback(null);
    try {
      await executor();
      await mutate();
      if (selectedUserId) {
        await mutateDetail();
      }
    } catch (actionError) {
      setFeedback({
        variant: "error",
        message: actionError instanceof Error ? actionError.message : "Action failed.",
      });
    } finally {
      setActionLoading(false);
    }
  };

  const submitRoleChange = async (userId: string, role: IdentityAccessRole) => {
    await runAction(async () => {
      const response = await fetch(`/api/admin/users/${userId}/role`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(String((payload as { error?: string }).error || "Unable to update role."));
      }
      setFeedback({
        variant: "success",
        message: "Role updated successfully.",
      });
      setRoleModal(null);
      setActiveMenuUserId(null);
    });
  };

  const submitStatusChange = async (userId: string, status: IdentityAccessStatus) => {
    await runAction(async () => {
      const response = await fetch(`/api/admin/users/${userId}/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(String((payload as { error?: string }).error || "Unable to update status."));
      }
      setFeedback({
        variant: "success",
        message: "Status updated successfully.",
      });
      setStatusConfirm(null);
      setActiveMenuUserId(null);
    });
  };

  const submitPasswordReset = async () => {
    if (!selectedUserDetail) return;
    if (!passwordDraft.trim()) {
      setFeedback({ variant: "error", message: "Enter a temporary password first." });
      return;
    }
    await runAction(async () => {
      const response = await fetch(`/api/admin/users/${selectedUserDetail.user.id}/password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: passwordDraft.trim() }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(String((payload as { error?: string }).error || "Unable to reset password."));
      }
      setFeedback({
        variant: "success",
        message: "Temporary password saved.",
      });
      setPasswordDraft("");
    });
  };

  const submitSubscriptionCancel = async (user: IdentityListItem) => {
    await runAction(async () => {
      const response = await fetch(`/api/admin/users/${user.id}/subscription/cancel`, {
        method: "POST",
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(String((payload as { error?: string }).error || "Unable to cancel subscription."));
      }
      const count = Number((payload as { count?: number }).count || 0);
      setFeedback({
        variant: "success",
        message: count > 0 ? `${count} subscription(s) canceled.` : "No active subscription found.",
      });
      setSubscriptionCancelConfirm(null);
      setActiveMenuUserId(null);
    });
  };

  const submitResendSetupEmail = async (user: IdentityListItem) => {
    await runAction(async () => {
      const response = await fetch(`/api/admin/users/${user.id}/resend-setup`, {
        method: "POST",
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(String((payload as { error?: string }).error || "Unable to resend setup email."));
      }
      setFeedback({
        variant: "success",
        message: "Setup email resent.",
      });
      setActiveMenuUserId(null);
    });
  };

  const runBulkAction = async (
    action: "disable" | "change_role" | "delete",
    role?: IdentityAccessRole
  ) => {
    await runAction(async () => {
      const response = await fetch("/api/admin/users/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userIds: selectedUserIds,
          action,
          role,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(String((payload as { error?: string }).error || "Bulk action failed."));
      }
      const changed = Number((payload as { changed?: number }).changed || 0);
      const skipped = Number((payload as { skipped?: number }).skipped || 0);
      setFeedback({
        variant: changed > 0 ? "success" : "info",
        message: `Bulk action completed. Changed: ${changed}. Skipped: ${skipped}.`,
      });
      setSelectedUserIds([]);
      setBulkRoleOpen(false);
      setActiveMenuUserId(null);
    });
  };

  const exportSelected = () => {
    if (!selectedRows.length) {
      setFeedback({ variant: "info", message: "Select at least one user to export." });
      return;
    }
    triggerCsvDownload("identity-access-users.csv", toCsv(selectedRows));
    setFeedback({ variant: "success", message: "CSV exported." });
  };

  const scrollDrawerSection = (sectionId: "profile" | "billing") => {
    const element = document.getElementById(`user-profile-${sectionId}`);
    if (!element) return;
    element.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="space-y-4 px-6 py-6 max-md:space-y-6 max-md:px-4 max-md:py-4">
      <section className="rounded-2xl border border-border/60 bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-[0.2em] text-indigo-600 dark:text-indigo-300">Admin</p>
            <h1 className="text-3xl font-semibold text-foreground">Identity &amp; Access</h1>
            <p className="text-sm text-muted-foreground">
              Manage platform users, roles, and subscription authority.
            </p>
          </div>
          <Button
            onClick={() => router.push("/admin/users/create")}
            className="h-10"
          >
            <UserPlus className="h-4 w-4" />
            Create / Invite User
          </Button>
        </div>
      </section>

      {feedback ? <Alert variant={feedback.variant}>{feedback.message}</Alert> : null}
      {error ? <Alert variant="error">{error.message}</Alert> : null}

      <section className="rounded-2xl border border-border/60 bg-card">
        {isLoading ? (
          <div className="grid gap-2 p-4 md:grid-cols-5">
            {Array.from({ length: 5 }).map((_, index) => (
              <Skeleton key={index} className="h-24 w-full rounded-xl" />
            ))}
          </div>
        ) : (
          <div className="grid gap-0 md:grid-cols-5">
            <div className="border-b border-border/60 border-r-border/60 md:border-b-0 md:border-r">
              <KpiItem
                label="Total Users"
                value={String(summaryView.totalUsers)}
                subtext={`+${summaryView.totalUsersDelta} this month`}
              />
            </div>
            <div className="border-b border-border/60 border-r-border/60 md:border-b-0 md:border-r">
              <KpiItem
                label="Admin Ratio"
                value={`${summaryView.adminCount} / ${summaryView.totalUsers}`}
                subtext={`${adminRatioPercent}% access exposure level`}
              />
            </div>
            <div className="border-b border-border/60 border-r-border/60 md:border-b-0 md:border-r">
              <KpiItem
                label="Active Subscribers"
                value={String(summaryView.activeSubscribers)}
                subtext="Revenue generating accounts"
              />
            </div>
            <div className="border-b border-border/60 border-r-border/60 md:border-b-0 md:border-r">
              <KpiItem
                label="Disabled Accounts"
                value={String(summaryView.disabledAccounts)}
                subtext="Requires manual review"
              />
            </div>
            <KpiItem
              label="Users Without Active Plan"
              value={String(summaryView.usersWithoutActivePlan)}
              subtext="No active subscription"
            />
          </div>
        )}
      </section>

      <Card>
        <div className="space-y-3">
          <div className="grid gap-3 md:grid-cols-[1fr_auto]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchDraft}
                onChange={(event) => setSearchDraft(event.target.value)}
                className="pl-9"
                placeholder="Search by name, email, or user ID"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {FILTERS.map((tab) => (
              <Button
                key={tab.key}
                variant={filter === tab.key ? "primary" : "secondary"}
                size="sm"
                onClick={() => setFilter(tab.key)}
              >
                {tab.label}
              </Button>
            ))}
          </div>
        </div>
      </Card>

      <Card title="Platform users">
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 10 }).map((_, index) => (
              <Skeleton key={index} className="h-12 rounded-lg" />
            ))}
          </div>
        ) : users.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">
            No users matched your current filters.
          </p>
        ) : (
          <div className="overflow-x-hidden rounded-xl border border-border/60">
            <table className="w-full table-fixed border-collapse">
              <colgroup>
                <col className="w-[4%]" />
                <col className="w-[32%]" />
                <col className="w-[14%]" />
                <col className="w-[10%]" />
                <col className="w-[12%]" />
                <col className="w-[12%]" />
                <col className="w-[8%]" />
                <col className="w-[8%]" />
              </colgroup>
              <thead>
                <tr className="bg-muted/25 text-center text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                  <th className="px-4 py-3 text-center">
                    <input
                      type="checkbox"
                      checked={allVisibleSelected}
                      onChange={(event) => {
                        if (event.target.checked) {
                          setSelectedUserIds(users.map((user) => user.id));
                        } else {
                          setSelectedUserIds([]);
                        }
                      }}
                    />
                  </th>
                  <th className="px-4 py-3 text-left font-semibold">User</th>
                  <th className="px-4 py-3 text-center font-semibold">Role</th>
                  <th className="px-4 py-3 text-center font-semibold">Plan</th>
                  <th className="px-4 py-3 text-center font-semibold">Subscription</th>
                  <th className="px-4 py-3 text-center font-semibold">Last Login</th>
                  <th className="px-4 py-3 text-center font-semibold">Status</th>
                  <th className="px-4 py-3 text-center font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => {
                  const policy = getUserActionPolicy({ actorRole, actorId, target: user });
                  const canShowMenu =
                    policy.canChangeRole ||
                    policy.canChangeStatus ||
                    policy.canResetPassword ||
                    policy.canCancelSubscription;
                  return (
                  <tr key={user.id} className="border-t border-border/50 align-middle">
                    <td className="px-4 py-3 text-center">
                      <input
                        type="checkbox"
                        checked={selectedUserIds.includes(user.id)}
                        onChange={(event) => {
                          if (event.target.checked) {
                            setSelectedUserIds((prev) => Array.from(new Set([...prev, user.id])));
                          } else {
                            setSelectedUserIds((prev) => prev.filter((id) => id !== user.id));
                          }
                        }}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <button type="button" className="flex w-full items-start gap-3 text-left" onClick={() => setSelectedUserId(user.id)}>
                        <span className="flex h-9 w-9 items-center justify-center rounded-full border border-border/60 bg-muted/40 text-xs font-semibold text-foreground">
                          {user.fullName
                            .split(" ")
                            .map((part) => part[0] || "")
                            .join("")
                            .slice(0, 2)
                            .toUpperCase()}
                        </span>
                        <span className="min-w-0 space-y-0.5">
                          <span className="block truncate font-semibold text-foreground">{user.fullName}</span>
                          <span className="block truncate text-xs text-muted-foreground">{user.email}</span>
                          <span className="block truncate font-mono text-[11px] text-muted-foreground">
                            {user.userId || user.id}
                          </span>
                        </span>
                      </button>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Badge variant={roleBadgeVariant(user.role)}>
                        {formatRole(user.role)}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-center text-sm text-foreground">{user.subscriptionPlan || "None"}</td>
                    <td className="px-4 py-3 text-center">
                      <Badge
                        variant={subscriptionBadgeVariant(user.subscriptionState)}
                        className={subscriptionBadgeClass(user.subscriptionState)}
                        style={subscriptionBadgeStyle(user.subscriptionState)}
                      >
                        {formatSubscriptionState(user.subscriptionState)}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-center text-sm text-foreground">
                      <span title={formatAbsoluteTime(user.lastLoginAt)}>{formatRelativeTime(user.lastLoginAt)}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Badge variant={statusBadgeVariant(user.status)}>{user.status}</Badge>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="relative inline-flex justify-center">
                        {canShowMenu ? (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => setActiveMenuUserId((prev) => (prev === user.id ? null : user.id))}
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => setSelectedUserId(user.id)}
                          >
                            View
                          </Button>
                        )}
                        {activeMenuUserId === user.id ? (
                          <div className="absolute right-0 top-10 z-20 w-52 rounded-xl border border-border bg-card p-1 shadow-xl">
                            <button
                              type="button"
                              className="w-full rounded-lg px-3 py-2 text-left text-sm text-foreground hover:bg-muted"
                              onClick={() => {
                                setSelectedUserId(user.id);
                                setActiveMenuUserId(null);
                              }}
                            >
                              View Profile
                            </button>
                            <button
                              type="button"
                              className="w-full rounded-lg px-3 py-2 text-left text-sm text-foreground hover:bg-muted"
                              onClick={() => {
                                router.push(`/admin/users/${encodeURIComponent(user.id)}/activity`);
                                setActiveMenuUserId(null);
                              }}
                            >
                              Activity Timeline
                            </button>
                            {policy.canChangeRole ? (
                              <button
                                type="button"
                                className="w-full rounded-lg px-3 py-2 text-left text-sm text-foreground hover:bg-muted"
                                onClick={() => {
                                  setRoleModal({ user, nextRole: user.role });
                                  setActiveMenuUserId(null);
                                }}
                              >
                                Change Role
                              </button>
                            ) : null}
                            {policy.canChangeStatus ? (
                              <button
                                type="button"
                                className="w-full rounded-lg px-3 py-2 text-left text-sm text-foreground hover:bg-muted"
                                onClick={() =>
                                  {
                                    setStatusConfirm({
                                      user,
                                      nextStatus: user.status === "ACTIVE" ? "DISABLED" : "ACTIVE",
                                    });
                                    setActiveMenuUserId(null);
                                  }
                                }
                              >
                                {user.status === "ACTIVE" ? "Disable" : "Enable"}
                              </button>
                            ) : null}
                            {policy.canResetPassword ? (
                              <button
                                type="button"
                                className="w-full rounded-lg px-3 py-2 text-left text-sm text-foreground hover:bg-muted"
                                onClick={() => {
                                  setSelectedUserId(user.id);
                                  setActiveMenuUserId(null);
                                }}
                              >
                                Reset Password
                              </button>
                            ) : null}
                            {user.status === "PENDING" ? (
                              <button
                                type="button"
                                className="w-full rounded-lg px-3 py-2 text-left text-sm text-foreground hover:bg-muted"
                                onClick={() => {
                                  void submitResendSetupEmail(user);
                                }}
                              >
                                Resend Setup Email
                              </button>
                            ) : null}
                            {policy.canCancelSubscription ? (
                              <button
                                type="button"
                                className="w-full rounded-lg px-3 py-2 text-left text-sm text-rose-700 hover:bg-rose-50"
                                onClick={() => {
                                  setSubscriptionCancelConfirm(user);
                                  setActiveMenuUserId(null);
                                }}
                              >
                                Cancel Subscription
                              </button>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                )})}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-4 flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            Page {currentPage}
            {pagination?.mode === "offset" && pagination?.totalPages ? ` of ${pagination.totalPages}` : ""}
            {" • "}
            {pagination?.totalItems ?? users.length} users
          </p>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              disabled={cursorStack.length === 0}
              onClick={() =>
                setCursorStack((prev) => {
                  if (!prev.length) return prev;
                  return prev.slice(0, -1);
                })
              }
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={!pagination?.hasMore || !pagination?.nextCursor}
              onClick={() => {
                if (!pagination?.nextCursor) return;
                setCursorStack((prev) => [...prev, pagination.nextCursor as string]);
              }}
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </Card>

      {selectedUserIds.length > 0 ? (
        <section className="sticky bottom-4 z-20 rounded-2xl border border-border bg-card px-4 py-3 shadow-xl">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-foreground">{selectedUserIds.length} selected</p>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => runBulkAction("disable")}
                disabled={!canBulkDisable}
              >
                <UserMinus className="h-4 w-4" />
                Disable
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setBulkRoleOpen(true)}
                disabled={!canBulkRoleChange}
              >
                <UserCog className="h-4 w-4" />
                Change Role
              </Button>
              <Button size="sm" variant="secondary" onClick={exportSelected}>
                Export
              </Button>
              {actorRole === "SUPER_ADMIN" ? (
                <Button size="sm" variant="danger" onClick={() => runBulkAction("delete")}>
                  Delete
                </Button>
              ) : null}
            </div>
          </div>
        </section>
      ) : null}

      {selectedUserId ? (
        <div className="fixed inset-0 z-40 flex">
          <button
            type="button"
            className="absolute inset-0 bg-black/35"
            onClick={() => setSelectedUserId(null)}
            aria-label="Close profile drawer"
          />
          <aside className="relative ml-auto flex h-full w-full max-w-2xl flex-col border-l border-border bg-background shadow-2xl">
            <div className="border-b border-border p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Identity &amp; Access</p>
                  <h2 className="mt-1 text-xl font-semibold text-foreground">User Profile</h2>
                </div>
                <Button size="sm" variant="secondary" onClick={() => setSelectedUserId(null)}>
                  Close
                </Button>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Button size="sm" variant="secondary" onClick={() => scrollDrawerSection("profile")}>
                  Profile
                </Button>
                <Button size="sm" variant="secondary" onClick={() => scrollDrawerSection("billing")}>
                  Billing
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    if (!selectedUserId) return;
                    router.push(`/admin/users/${encodeURIComponent(selectedUserId)}/activity`);
                  }}
                >
                  Activity Timeline
                </Button>
              </div>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto p-5">
              {detailError ? <Alert variant="error">{detailError.message}</Alert> : null}
              {detailLoading || !selectedUserDetail ? (
                <div className="space-y-3">
                  <Skeleton className="h-28 rounded-xl" />
                  <Skeleton className="h-28 rounded-xl" />
                  <Skeleton className="h-28 rounded-xl" />
                </div>
              ) : (
                <>
                  <div id="user-profile-profile">
                  <Card title="Profile">
                    <div className="grid gap-3 text-sm text-foreground md:grid-cols-2">
                      <p>
                        <span className="text-xs uppercase tracking-wide text-muted-foreground">Name</span>
                        <span className="mt-1 block font-semibold">{selectedUserDetail.user.fullName}</span>
                      </p>
                      <p>
                        <span className="text-xs uppercase tracking-wide text-muted-foreground">Email</span>
                        <span className="mt-1 block">{selectedUserDetail.user.email}</span>
                      </p>
                      <p>
                        <span className="text-xs uppercase tracking-wide text-muted-foreground">User ID</span>
                        <span className="mt-1 block font-mono text-xs">
                          {selectedUserDetail.user.userId || selectedUserDetail.user.id}
                        </span>
                      </p>
                      <p>
                        <span className="text-xs uppercase tracking-wide text-muted-foreground">Created</span>
                        <span className="mt-1 block">{formatAbsoluteTime(selectedUserDetail.user.createdAt)}</span>
                      </p>
                    </div>
                  </Card>
                  </div>

                  <Card title="Authority">
                    <div className="grid gap-3 md:grid-cols-2">
                      <label className="text-xs text-muted-foreground">
                        Role
                        <select
                          value={selectedUserDetail.user.role}
                          disabled={!drawerPolicy?.canChangeRole || drawerRoleOptions.length === 0}
                          onChange={(event) =>
                            setRoleModal({
                              user: selectedUserDetail.user,
                              nextRole: event.target.value as IdentityAccessRole,
                            })
                          }
                          className="mt-1 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground"
                        >
                          {roleOptionsForDrawer.map((role) => (
                            <option key={role} value={role}>
                              {formatRole(role)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="text-xs text-muted-foreground">
                        Status
                        <select
                          value={selectedUserDetail.user.status}
                          disabled={!drawerPolicy?.canChangeStatus}
                          onChange={(event) =>
                            setStatusConfirm({
                              user: selectedUserDetail.user,
                              nextStatus: event.target.value as IdentityAccessStatus,
                            })
                          }
                          className="mt-1 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground"
                        >
                          {STATUS_OPTIONS.map((status) => (
                            <option key={status} value={status}>
                              {status}
                            </option>
                          ))}
                        </select>
                      </label>
                      <p className="text-sm text-foreground">
                        <span className="text-xs uppercase tracking-wide text-muted-foreground">Auth Provider</span>
                        <span className="mt-1 block">{selectedUserDetail.user.authProvider}</span>
                      </p>
                      <p className="text-sm text-foreground">
                        <span className="text-xs uppercase tracking-wide text-muted-foreground">2FA</span>
                        <span className="mt-1 block">
                          {selectedUserDetail.user.twoFactorEnabled ? "Enabled" : "Disabled"}
                        </span>
                      </p>
                      <p className="text-sm text-foreground">
                        <span className="text-xs uppercase tracking-wide text-muted-foreground">Last Login</span>
                        <span className="mt-1 block">
                          {formatRelativeTime(selectedUserDetail.user.lastLoginAt)}
                        </span>
                      </p>
                      <p className="text-sm text-foreground">
                        <span className="text-xs uppercase tracking-wide text-muted-foreground">Associations</span>
                        <span className="mt-1 block">{selectedUserDetail.user.tenantAssociationsCount}</span>
                      </p>
                    </div>
                  </Card>

                  <div id="user-profile-billing">
                  <Card title="Subscription">
                    <div className="grid gap-3 text-sm text-foreground md:grid-cols-2">
                      <p>
                        <span className="text-xs uppercase tracking-wide text-muted-foreground">Plan</span>
                        <span className="mt-1 block">{selectedUserDetail.subscription.plan || "None"}</span>
                      </p>
                      <p>
                        <span className="text-xs uppercase tracking-wide text-muted-foreground">State</span>
                        <span className="mt-1 block">{formatSubscriptionState(selectedUserDetail.subscription.state)}</span>
                      </p>
                      <p>
                        <span className="text-xs uppercase tracking-wide text-muted-foreground">Started At</span>
                        <span className="mt-1 block">{formatAbsoluteTime(selectedUserDetail.subscription.startedAt)}</span>
                      </p>
                      <p>
                        <span className="text-xs uppercase tracking-wide text-muted-foreground">Renewal Date</span>
                        <span className="mt-1 block">{formatAbsoluteTime(selectedUserDetail.subscription.renewalDate)}</span>
                      </p>
                      <p>
                        <span className="text-xs uppercase tracking-wide text-muted-foreground">Seat Usage</span>
                        <span className="mt-1 block">
                          {selectedUserDetail.subscription.seatUsage.used ?? "â€”"} /{" "}
                          {selectedUserDetail.subscription.seatUsage.limit ?? "Unlimited"}
                        </span>
                      </p>
                    </div>
                  </Card>
                  </div>

                  <Card title="Danger Zone">
                    <div className="space-y-3">
                      <div className="flex flex-wrap gap-2">
                        {drawerPolicy?.canChangeStatus ? (
                          <Button
                            variant="danger"
                            size="sm"
                            onClick={() =>
                              setStatusConfirm({
                                user: selectedUserDetail.user,
                                nextStatus:
                                  selectedUserDetail.user.status === "ACTIVE" ? "DISABLED" : "ACTIVE",
                              })
                            }
                          >
                            {selectedUserDetail.user.status === "ACTIVE" ? "Disable user" : "Enable user"}
                          </Button>
                        ) : null}
                        {drawerPolicy?.canCancelSubscription ? (
                          <Button
                            variant="danger"
                            size="sm"
                            onClick={() => setSubscriptionCancelConfirm(selectedUserDetail.user)}
                          >
                            Cancel subscription
                          </Button>
                        ) : null}
                      </div>
                      <div className="grid gap-2 md:grid-cols-[1fr_auto]">
                        <Input
                          label="Temporary password"
                          type="password"
                          value={passwordDraft}
                          onChange={(event) => setPasswordDraft(event.target.value)}
                          placeholder="Set a temporary password"
                        />
                        <div className="flex items-end">
                          <Button
                            size="sm"
                            onClick={submitPasswordReset}
                            loading={actionLoading}
                            disabled={!drawerPolicy?.canResetPassword}
                          >
                            Save password
                          </Button>
                        </div>
                      </div>
                    </div>
                  </Card>

                  <Card title="Recent Audit Events">
                    {selectedUserDetail.recentAuditEvents.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No audit events for this user yet.</p>
                    ) : (
                      <div className="space-y-2">
                        {selectedUserDetail.recentAuditEvents.map((event) => (
                          <div key={event.id} className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
                            <p className="text-sm font-semibold text-foreground">{formatAuditActionLabel(event.actionType)}</p>
                            <p className="text-xs text-muted-foreground">
                              {formatAbsoluteTime(event.createdAt)}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </Card>
                </>
              )}
            </div>
          </aside>
        </div>
      ) : null}

      <Modal open={Boolean(roleModal)} onClose={() => setRoleModal(null)} title="Change role">
        {roleModal ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Update role for <span className="font-semibold text-foreground">{roleModal.user.fullName}</span>.
            </p>
            <label className="text-sm text-muted-foreground">
              Role
              <select
                value={roleModal.nextRole}
                onChange={(event) =>
                  setRoleModal((prev) =>
                    prev
                      ? {
                          ...prev,
                          nextRole: event.target.value as IdentityAccessRole,
                        }
                      : prev
                  )
                }
                className="mt-1 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground"
              >
                {ROLE_OPTIONS.map((role) => (
                  <option key={role} value={role}>
                    {formatRole(role)}
                  </option>
                ))}
              </select>
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setRoleModal(null)}>
                Cancel
              </Button>
              <Button loading={actionLoading} onClick={() => submitRoleChange(roleModal.user.id, roleModal.nextRole)}>
                Save role
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal open={bulkRoleOpen} onClose={() => setBulkRoleOpen(false)} title="Bulk role update">
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Update role for {selectedUserIds.length} selected user(s).
          </p>
          <label className="text-sm text-muted-foreground">
            Role
            <select
              value={bulkRoleModal}
              onChange={(event) => setBulkRoleModal(event.target.value as IdentityAccessRole)}
              className="mt-1 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground"
            >
              {(actorRole === "SUPER_ADMIN" ? ROLE_OPTIONS : (["USER"] as IdentityAccessRole[])).map((role) => (
                <option key={role} value={role}>
                  {formatRole(role)}
                </option>
              ))}
            </select>
          </label>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setBulkRoleOpen(false)}>
              Cancel
            </Button>
            <Button loading={actionLoading} onClick={() => runBulkAction("change_role", bulkRoleModal)}>
              Apply
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmationModal
        open={Boolean(statusConfirm)}
        variant={statusConfirm?.nextStatus === "ACTIVE" ? "primary" : "danger"}
        title={statusConfirm?.nextStatus === "ACTIVE" ? "Enable account" : "Update account status"}
        description={
          statusConfirm
            ? statusConfirm.nextStatus === "ACTIVE"
              ? `Enable ${statusConfirm.user.fullName}?`
              : `Set ${statusConfirm.user.fullName} to ${statusConfirm.nextStatus.toLowerCase()}?`
            : ""
        }
        confirmLabel={statusConfirm?.nextStatus === "ACTIVE" ? "Enable user" : "Confirm"}
        onConfirm={() => {
          if (!statusConfirm) return;
          submitStatusChange(statusConfirm.user.id, statusConfirm.nextStatus);
        }}
        onCancel={() => setStatusConfirm(null)}
      />

      <ConfirmationModal
        open={Boolean(subscriptionCancelConfirm)}
        variant="danger"
        title="Cancel subscription"
        description={
          subscriptionCancelConfirm
            ? `Cancel active subscription for ${subscriptionCancelConfirm.fullName}?`
            : ""
        }
        confirmLabel="Cancel subscription"
        onConfirm={() => {
          if (!subscriptionCancelConfirm) return;
          submitSubscriptionCancel(subscriptionCancelConfirm);
        }}
        onCancel={() => setSubscriptionCancelConfirm(null)}
      />
    </div>
  );
}


