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
import { useLanguage } from "@/components/providers/language-provider";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmationModal } from "@/components/ui/ConfirmationModal";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Skeleton } from "@/components/ui/skeleton";
import { localizeAdminServerMessage } from "@/lib/admin/localization";
import type {
  IdentityAccessRole,
  IdentityAccessStatus,
  IdentityFilter,
  IdentityListItem,
  IdentityListResponse,
  IdentitySummary,
  IdentityUserDetailResponse,
} from "@/lib/admin/users-types";
import { LANGUAGE_LOCALES, type CompleteLocalizedText } from "@/lib/i18n";

const text = (en: string, fr: string, de: string, es: string, pt: string): CompleteLocalizedText => ({ en, fr, de, es, pt });

const FILTERS: Array<{ key: IdentityFilter; label: CompleteLocalizedText }> = [
  { key: "all", label: text("All", "Tous", "Alle", "Todos", "Todos") },
  { key: "super_admins", label: text("Super Admins", "Super admins", "Super-Admins", "Superadministradores", "Super administradores") },
  { key: "admins", label: text("Admins", "Admins", "Admins", "Administradores", "Administradores") },
  { key: "subscribers", label: text("Subscribers", "Abonnes", "Abonnenten", "Suscriptores", "Subscritores") },
  { key: "no_plan", label: text("No Plan", "Aucun forfait", "Kein Tarif", "Sin plan", "Sem plano") },
  { key: "disabled", label: text("Disabled", "Desactives", "Deaktiviert", "Desactivados", "Desativados") },
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

function formatRole(role: IdentityAccessRole, t: ReturnType<typeof useLanguage>["t"]) {
  if (role === "SUPER_ADMIN") return t(text("Super Admin", "Super admin", "Super-Admin", "Superadministrador", "Super administrador"));
  if (role === "OPS_ADMIN") return t(text("Admin", "Admin", "Admin", "Administrador", "Administrador"));
  return t(text("Subscriber", "Abonne", "Abonnent", "Suscriptor", "Subscritor"));
}

function roleBadgeVariant(role: IdentityAccessRole) {
  if (role === "SUPER_ADMIN") return "roleSuperAdmin" as const;
  if (role === "OPS_ADMIN") return "roleAdmin" as const;
  return "roleUser" as const;
}

function formatSubscriptionState(state: IdentityListItem["subscriptionState"], t: ReturnType<typeof useLanguage>["t"]) {
  if (state === "PAST_DUE") return t(text("Past Due", "Impaye", "überfällig", "Vencido", "Em atraso"));
  if (state === "CANCELED") return t(text("Canceled", "Annule", "Gekundigt", "Cancelado", "Cancelado"));
  if (state === "TRIAL") return t(text("Trial", "Essai", "Testphase", "Prueba", "Periodo experimental"));
  if (state === "ACTIVE") return t(text("Active", "Actif", "Aktiv", "Activo", "Ativo"));
  return t(text("None", "Aucun", "Keine", "Ninguno", "Nenhum"));
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

function formatStatus(status: IdentityAccessStatus, t: ReturnType<typeof useLanguage>["t"]) {
  if (status === "ACTIVE") return t(text("Active", "Actif", "Aktiv", "Activo", "Ativo"));
  if (status === "PENDING") return t(text("Pending", "En attente", "Ausstehend", "Pendiente", "Pendente"));
  if (status === "SUSPENDED") return t(text("Suspended", "Suspendu", "Gesperrt", "Suspendido", "Suspenso"));
  return t(text("Disabled", "Desactive", "Deaktiviert", "Desactivado", "Desativado"));
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

function formatAbsoluteTime(value: string | null | undefined, locale: string, t: ReturnType<typeof useLanguage>["t"]) {
  if (!value) return t(text("Never", "Jamais", "Nie", "Nunca", "Nunca"));
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return t(text("Never", "Jamais", "Nie", "Nunca", "Nunca"));
  return date.toLocaleString(locale);
}

function formatRelativeTime(value: string | null | undefined, locale: string, t: ReturnType<typeof useLanguage>["t"]) {
  if (!value) return t(text("Never", "Jamais", "Nie", "Nunca", "Nunca"));
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return t(text("Never", "Jamais", "Nie", "Nunca", "Nunca"));
  const now = Date.now();
  const diffMs = date.getTime() - now;
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const diffMinutes = Math.round(diffMs / 60000);
  if (Math.abs(diffMinutes) < 1) return t(text("just now", "à l'instant", "gerade eben", "ahora mismo", "mesmo agora"));
  if (Math.abs(diffMinutes) < 60) return rtf.format(diffMinutes, "minute");
  const diffHours = Math.round(diffMinutes / 60);
  if (Math.abs(diffHours) < 24) return rtf.format(diffHours, "hour");
  const diffDays = Math.round(diffHours / 24);
  return rtf.format(diffDays, "day");
}

function formatAuditActionLabel(value: string | null | undefined, t: ReturnType<typeof useLanguage>["t"]) {
  const normalized = String(value || "").trim();
  if (!normalized || normalized === "AUDIT_EVENT" || normalized === "UNKNOWN_ACTION") {
    return t(text("Audit event", "Evenement d'audit", "Audit-Ereignis", "Evento de auditoria", "Evento de auditoria"));
  }

  return normalized
    .replace(/[._]+/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function toCsv(rows: IdentityListItem[], header: string[]) {
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
  const { language, t } = useLanguage();
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
  const locale = LANGUAGE_LOCALES[language];

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
        message:
          actionError instanceof Error
            ? localizeAdminServerMessage(
                actionError.message,
                language,
                t(text("Action failed.", "L'action a echoue.", "Aktion fehlgeschlagen.", "La accion fallo.", "A acao falhou."))
              )
            : t(text("Action failed.", "L'action a echoue.", "Aktion fehlgeschlagen.", "La accion fallo.", "A acao falhou.")),
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
        throw new Error(String((payload as { error?: string }).error || t(text("Unable to update role.", "Impossible de mettre a jour le role.", "Rolle konnte nicht aktualisiert werden.", "No se puede actualizar el rol.", "Não foi possivel atualizar a função."))));
      }
      setFeedback({
        variant: "success",
        message: t(text("Role updated successfully.", "Role mis ? jour avec succes.", "Rolle erfolgreich aktualisiert.", "Rol actualizado correctamente.", "Função atualizada com sucesso.")),
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
        throw new Error(String((payload as { error?: string }).error || t(text("Unable to update status.", "Impossible de mettre a jour le statut.", "Status konnte nicht aktualisiert werden.", "No se puede actualizar el estado.", "Não foi possivel atualizar o estado."))));
      }
      setFeedback({
        variant: "success",
        message: t(text("Status updated successfully.", "Statut mis ? jour avec succes.", "Status erfolgreich aktualisiert.", "Estado actualizado correctamente.", "Estado atualizado com sucesso.")),
      });
      setStatusConfirm(null);
      setActiveMenuUserId(null);
    });
  };

  const submitPasswordReset = async () => {
    if (!selectedUserDetail) return;
    if (!passwordDraft.trim()) {
      setFeedback({ variant: "error", message: t(text("Enter a temporary password first.", "Saisis d'abord un mot de passe temporaire.", "Gib zuerst ein temporeres Passwort ein.", "Introduce primero una contrasena temporal.", "Introduza primeiro uma palavra-passe temporaria.")) });
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
        throw new Error(String((payload as { error?: string }).error || t(text("Unable to reset password.", "Impossible de reinitialiser le mot de passe.", "Passwort konnte nicht zurückgesetzt werden.", "No se puede restablecer la contrasena.", "Não foi possivel repor a palavra-passe."))));
      }
      setFeedback({
        variant: "success",
        message: t(text("Temporary password saved.", "Mot de passe temporaire enregistre.", "Temporres Passwort gespeichert.", "Contrasena temporal guardada.", "Palavra-passe temporaria guardada.")),
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
        throw new Error(String((payload as { error?: string }).error || t(text("Unable to cancel subscription.", "Impossible d'annuler l'abonnement.", "Abonnement konnte nicht gekundigt werden.", "No se puede cancelar la suscripción.", "Não foi possivel cancelar a subscrição."))));
      }
      const count = Number((payload as { count?: number }).count || 0);
      setFeedback({
        variant: "success",
        message:
          count > 0
            ? t(
                text(
                  `${count} subscription(s) canceled.`,
                  `${count} abonnement(s) annule(s).`,
                  `${count} Abonnement(s) gekundigt.`,
                  `${count} suscripcion(es) cancelada(s).`,
                  `${count} subscricao(oes) cancelada(s).`
                )
              )
            : t(text("No active subscription found.", "Aucun abonnement actif trouve.", "Kein aktives Abonnement gefunden.", "No se encontro ninguna suscripción activa.", "Nenhuma subscrição ativa encontrada.")),
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
        throw new Error(String((payload as { error?: string }).error || t(text("Unable to resend setup email.", "Impossible de renvoyer l'e-mail de configuration.", "Einrichtungs-E-Mail konnte nicht erneut gesendet werden.", "No se puede reenviar el correo de configuración.", "Não foi possivel reenviar o email de configuração."))));
      }
      setFeedback({
        variant: "success",
        message: t(text("Setup email resent.", "E-mail de configuration renvoye.", "Einrichtungs-E-Mail erneut gesendet.", "Correo de configuración reenviado.", "Email de configuração reenviado.")),
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
        throw new Error(String((payload as { error?: string }).error || t(text("Bulk action failed.", "L'action group ee a échoué.", "Massenaktion fehlgeschlagen.", "La acción masiva fallo.", "A ação em massa falhou."))));
      }
      const changed = Number((payload as { changed?: number }).changed || 0);
      const skipped = Number((payload as { skipped?: number }).skipped || 0);
      setFeedback({
        variant: changed > 0 ? "success" : "info",
        message: t(
          text(
            `Bulk action completed. Changed: ${changed}. Skipped: ${skipped}.`,
            `Action group ee terminee. Modifies : ${changed}. Ignores : ${skipped}.`,
            `Massenaktion abgeschlossen. Geandert: ${changed}. Ubersprungen: ${skipped}.`,
            `Accion masiva completada. Cambiados: ${changed}. Omitidos: ${skipped}.`,
            `Acao em massa concluida. Alterados: ${changed}. Ignorados: ${skipped}.`
          )
        ),
      });
      setSelectedUserIds([]);
      setBulkRoleOpen(false);
      setActiveMenuUserId(null);
    });
  };

  const exportSelected = () => {
    if (!selectedRows.length) {
      setFeedback({ variant: "info", message: t(text("Select at least one user to export.", "Sélectionnez au moins un utilisateur a exporter.", "Wähle mindestens einen Benutzer zum Exportieren aus.", "Selecciona al menos un usuario para exportar.", "Selecione pelo menos um utilizador para exportar.")) });
      return;
    }
    triggerCsvDownload(
      "identity-access-users.csv",
      toCsv(selectedRows, [
        t(text("ID", "ID", "ID", "ID", "ID")),
        t(text("Name", "Nom", "Name", "Nombre", "Nome")),
        t(text("Email", "E-mail", "E-Mail", "Correo", "Email")),
        t(text("User ID", "ID utilisateur", "Benutzer-ID", "ID de usuario", "ID do utilizador")),
        t(text("Role", "Role", "Rolle", "Rol", "Função")),
        t(text("Status", "Statut", "Status", "Estado", "Estado")),
        t(text("Subscription plan", "Forfait", "Tarif", "Plan de suscripción", "Plano de subscrição")),
        t(text("Subscription state", "Etat de l'abonnement", "Abonnementstatus", "Estado de la suscripción", "Estado da subscrição")),
        t(text("Last login", "Derniere connexion", "Letzte Anmeldung", "Ultimo acceso", "Ultimo inicio de sessão")),
        t(text("Created at", "Cree le", "Erstellt am", "Creado el", "Criado em")),
      ])
    );
    setFeedback({ variant: "success", message: t(text("CSV exported.", "CSV exporte.", "CSV exportiert.", "CSV exportado.", "CSV exportado.")) });
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
            <p className="text-xs uppercase tracking-[0.2em] text-indigo-600 dark:text-indigo-300">{t(text("Admin", "Admin", "Admin", "Admin", "Admin"))}</p>
            <h1 className="text-3xl font-semibold text-foreground">{t(text("Identity & Access", "Identite et accès", "Identitat und Zugriff", "Identidad y acceso", "Identidade e acesso"))}</h1>
            <p className="text-sm text-muted-foreground">
              {t(
                text(
                  "Manage platform users, roles, and subscription authority.",
                  "Gerez les utilisateurs de la plateforme, les roles et les autorisations d'abonnement.",
                  "Verwalte Plattformbenutzer, Rollen und Abonnementberechtigungen.",
                  "Gestiona los usuarios de la plataforma, los roles y los permisos de suscripción.",
                  "Gira os utilizadores da plataforma, as funções e as permissoes de subscrição."
                )
              )}
            </p>
          </div>
          <Button
            onClick={() => router.push("/admin/users/create")}
            className="h-10"
          >
            <UserPlus className="h-4 w-4" />
            {t(text("Create / Invite User", "Creer / inviter un utilisateur", "Benutzer erstellen / einladen", "Crear / invitar usuario", "Criar / convidar utilizador"))}
          </Button>
        </div>
      </section>

      {feedback ? (
        <Alert variant={feedback.variant}>
          {feedback.variant === "error"
            ? localizeAdminServerMessage(
                feedback.message,
                language,
                t(text("Action failed.", "L'action a echoue.", "Aktion fehlgeschlagen.", "La accion fallo.", "A acao falhou."))
              )
            : feedback.message}
        </Alert>
      ) : null}
      {error ? (
        <Alert variant="error">
          {localizeAdminServerMessage(
            error.message,
            language,
            t(
              text(
                "Unable to load users right now.",
                "Impossible de charger les utilisateurs pour le moment.",
                "Benutzer koennen derzeit nicht geladen werden.",
                "No se pueden cargar los usuarios en este momento.",
                "Nao foi possivel carregar os utilizadores neste momento."
              )
            )
          )}
        </Alert>
      ) : null}

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
                label={t(text("Total Users", "Utilisateurs totaux", "Benutzer gesamt", "Usuarios totales", "Total de utilizadores"))}
                value={String(summaryView.totalUsers)}
                subtext={t(text(`+${summaryView.totalUsersDelta} this month`, `+${summaryView.totalUsersDelta} ce mois-ci`, `+${summaryView.totalUsersDelta} in diesem Monat`, `+${summaryView.totalUsersDelta} este mes`, `+${summaryView.totalUsersDelta} este mes`))}
              />
            </div>
            <div className="border-b border-border/60 border-r-border/60 md:border-b-0 md:border-r">
              <KpiItem
                label={t(text("Admin Ratio", "Ratio admins", "Admin-Anteil", "Proporcion de admins", "Racio de administradores"))}
                value={`${summaryView.adminCount} / ${summaryView.totalUsers}`}
                subtext={t(text(`${adminRatioPercent}% access exposure level`, `${adminRatioPercent}% niveau d'exposition d'acces`, `${adminRatioPercent}% Zugriffsrisiko`, `${adminRatioPercent}% nivel de exposicion de acceso`, `${adminRatioPercent}% nivel de exposicao de acesso`))}
              />
            </div>
            <div className="border-b border-border/60 border-r-border/60 md:border-b-0 md:border-r">
              <KpiItem
                label={t(text("Active Subscribers", "Abonnes actifs", "Aktive Abonnenten", "Suscriptores activos", "Subscritores ativos"))}
                value={String(summaryView.activeSubscribers)}
                subtext={t(text("Revenue generating accounts", "Comptes generateurs de revenus", "Umsatzbringende Konten", "Cuentas que generan ingresos", "Contas geradoras de receita"))}
              />
            </div>
            <div className="border-b border-border/60 border-r-border/60 md:border-b-0 md:border-r">
              <KpiItem
                label={t(text("Disabled Accounts", "Comptes desactives", "Deaktivierte Konten", "Cuentas desactivadas", "Contas desativadas"))}
                value={String(summaryView.disabledAccounts)}
                subtext={t(text("Requires manual review", "Necessite une verification manuelle", "Erfordert manuelle Prufung", "Requiere revision manual", "Requer revisao manual"))}
              />
            </div>
            <KpiItem
              label={t(text("Users Without Active Plan", "Utilisateurs sans forfait actif", "Benutzer ohne aktiven Tarif", "Usuarios sin plan activo", "Utilizadores sem plano ativo"))}
              value={String(summaryView.usersWithoutActivePlan)}
              subtext={t(text("No active subscription", "Aucun abonnement actif", "Kein aktives Abonnement", "Sin suscripción activa", "Sem subscrição ativa"))}
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
                placeholder={t(text("Search by name, email, or user ID", "Rechercher par nom, e-mail ou ID utilisateur", "Nach Name, E-Mail oder Benutzer-ID suchen", "Buscar por nombre, correo o ID de usuario", "Pesquisar por nome, email ou ID de utilizador"))}
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
                {t(tab.label)}
              </Button>
            ))}
          </div>
        </div>
      </Card>

      <Card title={t(text("Platform users", "Utilisateurs de la plateforme", "Plattformbenutzer", "Usuarios de la plataforma", "Utilizadores da plataforma"))}>
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 10 }).map((_, index) => (
              <Skeleton key={index} className="h-12 rounded-lg" />
            ))}
          </div>
        ) : users.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">
            {t(text("No users matched your current filters.", "Aucun utilisateur ne correspond a vos filtres actuels.", "Keine Benutzer entsprechen den aktuellen Filtern.", "Ningun usuario coincide con los filtros actuales.", "Nenhum utilizador corresponde aos filtros atuais."))}
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
                  <th className="px-4 py-3 text-left font-semibold">{t(text("User", "Utilisateur", "Benutzer", "Usuario", "Utilizador"))}</th>
                  <th className="px-4 py-3 text-center font-semibold">{t(text("Role", "Role", "Rolle", "Rol", "Função"))}</th>
                  <th className="px-4 py-3 text-center font-semibold">{t(text("Plan", "Forfait", "Tarif", "Plan", "Plano"))}</th>
                  <th className="px-4 py-3 text-center font-semibold">{t(text("Subscription", "Abonnement", "Abonnement", "Suscripción", "Subscrição"))}</th>
                  <th className="px-4 py-3 text-center font-semibold">{t(text("Last Login", "Derniere connexion", "Letzte Anmeldung", "Ultimo acceso", "Ultimo inicio de sessão"))}</th>
                  <th className="px-4 py-3 text-center font-semibold">{t(text("Status", "Statut", "Status", "Estado", "Estado"))}</th>
                  <th className="px-4 py-3 text-center font-semibold">{t(text("Actions", "Actions", "Aktionen", "Acciones", "Ações"))}</th>
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
                        {formatRole(user.role, t)}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-center text-sm text-foreground">{user.subscriptionPlan || t(text("None", "Aucun", "Keine", "Ninguno", "Nenhum"))}</td>
                    <td className="px-4 py-3 text-center">
                      <Badge
                        variant={subscriptionBadgeVariant(user.subscriptionState)}
                        className={subscriptionBadgeClass(user.subscriptionState)}
                        style={subscriptionBadgeStyle(user.subscriptionState)}
                      >
                        {formatSubscriptionState(user.subscriptionState, t)}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-center text-sm text-foreground">
                      <span title={formatAbsoluteTime(user.lastLoginAt, locale, t)}>{formatRelativeTime(user.lastLoginAt, locale, t)}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Badge variant={statusBadgeVariant(user.status)}>{formatStatus(user.status, t)}</Badge>
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
                            {t(text("View", "Voir", "Ansehen", "Ver", "Ver"))}
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
                              {t(text("View Profile", "Voir le profil", "Profil ansehen", "Ver perfil", "Ver perfil"))}
                            </button>
                            <button
                              type="button"
                              className="w-full rounded-lg px-3 py-2 text-left text-sm text-foreground hover:bg-muted"
                              onClick={() => {
                                router.push(`/admin/users/${encodeURIComponent(user.id)}/activity`);
                                setActiveMenuUserId(null);
                              }}
                            >
                              {t(text("Activity Timeline", "Chronologie d'activité", "Aktivitätsverlauf", "Cronologia de actividad", "Cronologia de atividade"))}
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
                                {t(text("Change Role", "Changer le role", "Rolle andern", "Cambiar rol", "Alterar função"))}
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
                                {user.status === "ACTIVE"
                                  ? t(text("Disable", "Desactiver", "Deaktivieren", "Desactivar", "Desativar"))
                                  : t(text("Enable", "Activer", "Aktivieren", "Activar", "Ativar"))}
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
                                {t(text("Reset Password", "Reinitialiser le mot de passe", "Passwort zurücksetzen", "Restablecer contrasena", "Repor palavra-passe"))}
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
                                {t(text("Resend Setup Email", "Renvoyer l'e-mail de configuration", "Einrichtungs-E-Mail erneut senden", "Reenviar correo de configuración", "Reenviar email de configuração"))}
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
                                {t(text("Cancel Subscription", "Annuler l'abonnement", "Abonnement kundigen", "Cancelar suscripción", "Cancelar subscrição"))}
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
            {t(text(`Page ${currentPage}`, `Page ${currentPage}`, `Seite ${currentPage}`, `Pagina ${currentPage}`, `Pagina ${currentPage}`))}
            {pagination?.mode === "offset" && pagination?.totalPages
              ? t(text(` of ${pagination.totalPages}`, ` sur ${pagination.totalPages}`, ` von ${pagination.totalPages}`, ` de ${pagination.totalPages}`, ` de ${pagination.totalPages}`))
              : ""}
            {" • "}
            {t(
              text(
                `${pagination?.totalItems ?? users.length} users`,
                `${pagination?.totalItems ?? users.length} utilisateurs`,
                `${pagination?.totalItems ?? users.length} Benutzer`,
                `${pagination?.totalItems ?? users.length} usuarios`,
                `${pagination?.totalItems ?? users.length} utilizadores`
              )
            )}
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
              {t(text("Previous", "Precedent", "Zurück", "Anterior", "Anterior"))}
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
              {t(text("Next", "Suivant", "Weiter", "Siguiente", "Seguinte"))}
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </Card>

      {selectedUserIds.length > 0 ? (
        <section className="sticky bottom-4 z-20 rounded-2xl border border-border bg-card px-4 py-3 shadow-xl">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-foreground">
              {t(
                text(
                  `${selectedUserIds.length} selected`,
                  `${selectedUserIds.length} selectionnes`,
                  `${selectedUserIds.length} ausgewahlt`,
                  `${selectedUserIds.length} seleccionados`,
                  `${selectedUserIds.length} selecionados`
                )
              )}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => runBulkAction("disable")}
                disabled={!canBulkDisable}
              >
                <UserMinus className="h-4 w-4" />
                {t(text("Disable", "Desactiver", "Deaktivieren", "Desactivar", "Desativar"))}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setBulkRoleOpen(true)}
                disabled={!canBulkRoleChange}
              >
                <UserCog className="h-4 w-4" />
                {t(text("Change Role", "Changer le role", "Rolle andern", "Cambiar rol", "Alterar função"))}
              </Button>
              <Button size="sm" variant="secondary" onClick={exportSelected}>
                {t(text("Export", "Exporter", "Exportieren", "Exportar", "Exportar"))}
              </Button>
              {actorRole === "SUPER_ADMIN" ? (
                <Button size="sm" variant="danger" onClick={() => runBulkAction("delete")}>
                  {t(text("Delete", "Supprimer", "Loschen", "Eliminar", "Eliminar"))}
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
            aria-label={t(text("Close profile drawer", "Fermer le panneau du profil", "Profilbereich schliessen", "Cerrar panel del perfil", "Fechar painel do perfil"))}
          />
          <aside className="relative ml-auto flex h-full w-full max-w-2xl flex-col border-l border-border bg-background shadow-2xl">
            <div className="border-b border-border p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{t(text("Identity & Access", "Identite et accès", "Identitat und Zugriff", "Identidad y acceso", "Identidade e acesso"))}</p>
                  <h2 className="mt-1 text-xl font-semibold text-foreground">{t(text("User Profile", "Profil utilisateur", "Benutzerprofil", "Perfil de usuario", "Perfil do utilizador"))}</h2>
                </div>
                <Button size="sm" variant="secondary" onClick={() => setSelectedUserId(null)}>
                  {t(text("Close", "Fermer", "Schliessen", "Cerrar", "Fechar"))}
                </Button>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Button size="sm" variant="secondary" onClick={() => scrollDrawerSection("profile")}>
                  {t(text("Profile", "Profil", "Profil", "Perfil", "Perfil"))}
                </Button>
                <Button size="sm" variant="secondary" onClick={() => scrollDrawerSection("billing")}>
                  {t(text("Billing", "Facturation", "Abrechnung", "Facturación", "Faturação"))}
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    if (!selectedUserId) return;
                    router.push(`/admin/users/${encodeURIComponent(selectedUserId)}/activity`);
                  }}
                >
                  {t(text("Activity Timeline", "Chronologie d'activité", "Aktivitätsverlauf", "Cronologia de actividad", "Cronologia de atividade"))}
                </Button>
              </div>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto p-5">
              {detailError ? (
                <Alert variant="error">
                  {localizeAdminServerMessage(
                    detailError.message,
                    language,
                    t(
                      text(
                        "Unable to load user detail right now.",
                        "Impossible de charger le detail de l'utilisateur pour le moment.",
                        "Benutzerdetails koennen derzeit nicht geladen werden.",
                        "No se puede cargar el detalle del usuario en este momento.",
                        "Nao foi possivel carregar o detalhe do utilizador neste momento."
                      )
                    )
                  )}
                </Alert>
              ) : null}
              {detailLoading || !selectedUserDetail ? (
                <div className="space-y-3">
                  <Skeleton className="h-28 rounded-xl" />
                  <Skeleton className="h-28 rounded-xl" />
                  <Skeleton className="h-28 rounded-xl" />
                </div>
              ) : (
                <>
                  <div id="user-profile-profile">
                  <Card title={t(text("Profile", "Profil", "Profil", "Perfil", "Perfil"))}>
                    <div className="grid gap-3 text-sm text-foreground md:grid-cols-2">
                      <p>
                        <span className="text-xs uppercase tracking-wide text-muted-foreground">{t(text("Name", "Nom", "Name", "Nombre", "Nome"))}</span>
                        <span className="mt-1 block font-semibold">{selectedUserDetail.user.fullName}</span>
                      </p>
                      <p>
                        <span className="text-xs uppercase tracking-wide text-muted-foreground">{t(text("Email", "E-mail", "E-Mail", "Correo", "Email"))}</span>
                        <span className="mt-1 block">{selectedUserDetail.user.email}</span>
                      </p>
                      <p>
                        <span className="text-xs uppercase tracking-wide text-muted-foreground">{t(text("User ID", "ID utilisateur", "Benutzer-ID", "ID de usuario", "ID do utilizador"))}</span>
                        <span className="mt-1 block font-mono text-xs">
                          {selectedUserDetail.user.userId || selectedUserDetail.user.id}
                        </span>
                      </p>
                      <p>
                        <span className="text-xs uppercase tracking-wide text-muted-foreground">{t(text("Created", "Cree", "Erstellt", "Creado", "Criado"))}</span>
                        <span className="mt-1 block">{formatAbsoluteTime(selectedUserDetail.user.createdAt, locale, t)}</span>
                      </p>
                    </div>
                  </Card>
                  </div>

                  <Card title={t(text("Authority", "Autorite", "Berechtigungen", "Autoridad", "Permissoes"))}>
                    <div className="grid gap-3 md:grid-cols-2">
                      <label className="text-xs text-muted-foreground">
                        {t(text("Role", "Role", "Rolle", "Rol", "Função"))}
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
                              {formatRole(role, t)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="text-xs text-muted-foreground">
                        {t(text("Status", "Statut", "Status", "Estado", "Estado"))}
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
                              {formatStatus(status, t)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <p className="text-sm text-foreground">
                        <span className="text-xs uppercase tracking-wide text-muted-foreground">{t(text("Auth Provider", "Fournisseur d'authentification", "Authentifizierungsanbieter", "Proveedor de autenticacion", "Fornecedor de autenticação"))}</span>
                        <span className="mt-1 block">{selectedUserDetail.user.authProvider}</span>
                      </p>
                      <p className="text-sm text-foreground">
                        <span className="text-xs uppercase tracking-wide text-muted-foreground">{t(text("2FA", "2FA", "2FA", "2FA", "2FA"))}</span>
                        <span className="mt-1 block">
                          {selectedUserDetail.user.twoFactorEnabled
                            ? t(text("Enabled", "Active", "Aktiviert", "Activado", "Ativado"))
                            : t(text("Disabled", "Desactive", "Deaktiviert", "Desactivado", "Desativado"))}
                        </span>
                      </p>
                      <p className="text-sm text-foreground">
                        <span className="text-xs uppercase tracking-wide text-muted-foreground">{t(text("Last Login", "Derniere connexion", "Letzte Anmeldung", "Ultimo acceso", "Ultimo inicio de sessão"))}</span>
                        <span className="mt-1 block">
                          {formatRelativeTime(selectedUserDetail.user.lastLoginAt, locale, t)}
                        </span>
                      </p>
                      <p className="text-sm text-foreground">
                        <span className="text-xs uppercase tracking-wide text-muted-foreground">{t(text("Associations", "Associations", "Zuordnungen", "Asociaciones", "Associacoes"))}</span>
                        <span className="mt-1 block">{selectedUserDetail.user.tenantAssociationsCount}</span>
                      </p>
                    </div>
                  </Card>

                  <div id="user-profile-billing">
                  <Card title={t(text("Subscription", "Abonnement", "Abonnement", "Suscripción", "Subscrição"))}>
                    <div className="grid gap-3 text-sm text-foreground md:grid-cols-2">
                      <p>
                        <span className="text-xs uppercase tracking-wide text-muted-foreground">{t(text("Plan", "Forfait", "Tarif", "Plan", "Plano"))}</span>
                        <span className="mt-1 block">{selectedUserDetail.subscription.plan || t(text("None", "Aucun", "Keine", "Ninguno", "Nenhum"))}</span>
                      </p>
                      <p>
                        <span className="text-xs uppercase tracking-wide text-muted-foreground">{t(text("State", "Etat", "Status", "Estado", "Estado"))}</span>
                        <span className="mt-1 block">{formatSubscriptionState(selectedUserDetail.subscription.state, t)}</span>
                      </p>
                      <p>
                        <span className="text-xs uppercase tracking-wide text-muted-foreground">{t(text("Started At", "Commence le", "Gestartet am", "Iniciado el", "Iniciado em"))}</span>
                        <span className="mt-1 block">{formatAbsoluteTime(selectedUserDetail.subscription.startedAt, locale, t)}</span>
                      </p>
                      <p>
                        <span className="text-xs uppercase tracking-wide text-muted-foreground">{t(text("Renewal Date", "Date de renouvellement", "Verlängerungsdatum", "Fecha de renovacion", "Data de renovacao"))}</span>
                        <span className="mt-1 block">{formatAbsoluteTime(selectedUserDetail.subscription.renewalDate, locale, t)}</span>
                      </p>
                      <p>
                        <span className="text-xs uppercase tracking-wide text-muted-foreground">{t(text("Seat Usage", "Utilisation des licences", "Sitzplatznutzung", "Uso de plazas", "Utilização de lugares"))}</span>
                        <span className="mt-1 block">
                          {selectedUserDetail.subscription.seatUsage.used ?? "-"} /{" "}
                          {selectedUserDetail.subscription.seatUsage.limit ?? t(text("Unlimited", "Illimite", "Unbegrenzt", "Ilimitado", "Ilimitado"))}
                        </span>
                      </p>
                    </div>
                  </Card>
                  </div>

                  <Card title={t(text("Danger Zone", "Zone de danger", "Gefahrenbereich", "Zona de riesgo", "Zona de perigo"))}>
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
                            {selectedUserDetail.user.status === "ACTIVE"
                              ? t(text("Disable user", "Desactiver l'utilisateur", "Benutzer deaktivieren", "Desactivar usuario", "Desativar utilizador"))
                              : t(text("Enable user", "Activer l'utilisateur", "Benutzer aktivieren", "Activar usuario", "Ativar utilizador"))}
                          </Button>
                        ) : null}
                        {drawerPolicy?.canCancelSubscription ? (
                          <Button
                            variant="danger"
                            size="sm"
                            onClick={() => setSubscriptionCancelConfirm(selectedUserDetail.user)}
                          >
                            {t(text("Cancel subscription", "Annuler l'abonnement", "Abonnement kundigen", "Cancelar suscripción", "Cancelar subscrição"))}
                          </Button>
                        ) : null}
                      </div>
                      <div className="grid gap-2 md:grid-cols-[1fr_auto]">
                        <Input
                          label={t(text("Temporary password", "Mot de passe temporaire", "Temporres Passwort", "Contrasena temporal", "Palavra-passe temporaria"))}
                          type="password"
                          value={passwordDraft}
                          onChange={(event) => setPasswordDraft(event.target.value)}
                          placeholder={t(text("Set a temporary password", "Definir un mot de passe temporaire", "Temporres Passwort festlegen", "Establecer una contrasena temporal", "Definir uma palavra-passe temporaria"))}
                        />
                        <div className="flex items-end">
                          <Button
                            size="sm"
                            onClick={submitPasswordReset}
                            loading={actionLoading}
                            disabled={!drawerPolicy?.canResetPassword}
                          >
                            {t(text("Save password", "Enregistrer le mot de passe", "Passwort speichern", "Guardar contrasena", "Guardar palavra-passe"))}
                          </Button>
                        </div>
                      </div>
                    </div>
                  </Card>

                  <Card title={t(text("Recent Audit Events", "Evenements d'audit recents", "Letzte Audit-Ereignisse", "Eventos de auditoria recientes", "Eventos de auditoria recentes"))}>
                    {selectedUserDetail.recentAuditEvents.length === 0 ? (
                      <p className="text-sm text-muted-foreground">{t(text("No audit events for this user yet.", "Aucun evenement d'audit pour cet utilisateur pour le moment.", "Noch keine Audit-Ereignisse für diesen Benutzer.", "Todavia no hay eventos de auditoria para este usuario.", "Ainda não existem eventos de auditoria para este utilizador."))}</p>
                    ) : (
                      <div className="space-y-2">
                        {selectedUserDetail.recentAuditEvents.map((event) => (
                          <div key={event.id} className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
                            <p className="text-sm font-semibold text-foreground">{formatAuditActionLabel(event.actionType, t)}</p>
                            <p className="text-xs text-muted-foreground">
                              {formatAbsoluteTime(event.createdAt, locale, t)}
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

      <Modal open={Boolean(roleModal)} onClose={() => setRoleModal(null)} title={t(text("Change role", "Changer le role", "Rolle andern", "Cambiar rol", "Alterar função"))}>
        {roleModal ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {t(text("Update role for", "Mettre a jour le role de", "Rolle aktualisieren für", "Actualizar rol de", "Atualizar função de"))}{" "}
              <span className="font-semibold text-foreground">{roleModal.user.fullName}</span>.
            </p>
            <label className="text-sm text-muted-foreground">
              {t(text("Role", "Role", "Rolle", "Rol", "Função"))}
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
                    {formatRole(role, t)}
                  </option>
                ))}
              </select>
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setRoleModal(null)}>
                {t(text("Cancel", "Annuler", "Abbrechen", "Cancelar", "Cancelar"))}
              </Button>
              <Button loading={actionLoading} onClick={() => submitRoleChange(roleModal.user.id, roleModal.nextRole)}>
                {t(text("Save role", "Enregistrer le role", "Rolle speichern", "Guardar rol", "Guardar função"))}
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal open={bulkRoleOpen} onClose={() => setBulkRoleOpen(false)} title={t(text("Bulk role update", "Mise ? jour group ee des roles", "Massenaktualisierung der Rollen", "Actualización masiva de roles", "Atualizacao em massa de funções"))}>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {t(
              text(
                `Update role for ${selectedUserIds.length} selected user(s).`,
                `Mettre a jour le role de ${selectedUserIds.length} utilisateur(s) selectionne(s).`,
                `Rolle fur ${selectedUserIds.length} ausgewahlte(n) Benutzer aktualisieren.`,
                `Actualizar rol para ${selectedUserIds.length} usuario(s) seleccionado(s).`,
                `Atualizar a funcao de ${selectedUserIds.length} utilizador(es) selecionado(s).`
              )
            )}
          </p>
          <label className="text-sm text-muted-foreground">
            {t(text("Role", "Role", "Rolle", "Rol", "Função"))}
            <select
              value={bulkRoleModal}
              onChange={(event) => setBulkRoleModal(event.target.value as IdentityAccessRole)}
              className="mt-1 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground"
            >
              {(actorRole === "SUPER_ADMIN" ? ROLE_OPTIONS : (["USER"] as IdentityAccessRole[])).map((role) => (
                <option key={role} value={role}>
                  {formatRole(role, t)}
                </option>
              ))}
            </select>
          </label>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setBulkRoleOpen(false)}>
              {t(text("Cancel", "Annuler", "Abbrechen", "Cancelar", "Cancelar"))}
            </Button>
            <Button loading={actionLoading} onClick={() => runBulkAction("change_role", bulkRoleModal)}>
              {t(text("Apply", "Appliquer", "Anwenden", "Aplicar", "Aplicar"))}
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmationModal
        open={Boolean(statusConfirm)}
        variant={statusConfirm?.nextStatus === "ACTIVE" ? "primary" : "danger"}
        title={
          statusConfirm?.nextStatus === "ACTIVE"
            ? t(text("Enable account", "Activer le compte", "Konto aktivieren", "Activar cuenta", "Ativar conta"))
            : t(text("Update account status", "Mettre a jour le statut du compte", "Kontostatus aktualisieren", "Actualizar estado de la cuenta", "Atualizar estado da conta"))
        }
        description={
          statusConfirm
            ? statusConfirm.nextStatus === "ACTIVE"
              ? t(text(`Enable ${statusConfirm.user.fullName}?`, `Activer ${statusConfirm.user.fullName} ?`, `${statusConfirm.user.fullName} aktivieren?`, `Activar a ${statusConfirm.user.fullName}?`, `Ativar ${statusConfirm.user.fullName}?`))
              : t(
                  text(
                    `Set ${statusConfirm.user.fullName} to ${formatStatus(statusConfirm.nextStatus, t).toLowerCase()}?`,
                    `Definir ${statusConfirm.user.fullName} comme ${formatStatus(statusConfirm.nextStatus, t).toLowerCase()} ?`,
                    `${statusConfirm.user.fullName} auf ${formatStatus(statusConfirm.nextStatus, t).toLowerCase()} setzen?`,
                    `Establecer ${statusConfirm.user.fullName} como ${formatStatus(statusConfirm.nextStatus, t).toLowerCase()}?`,
                    `Definir ${statusConfirm.user.fullName} como ${formatStatus(statusConfirm.nextStatus, t).toLowerCase()}?`
                  )
                )
            : ""
        }
        confirmLabel={
          statusConfirm?.nextStatus === "ACTIVE"
            ? t(text("Enable user", "Activer l'utilisateur", "Benutzer aktivieren", "Activar usuario", "Ativar utilizador"))
            : t(text("Confirm", "Confirmer", "Bestätigen", "Confirmar", "Confirmar"))
        }
        onConfirm={() => {
          if (!statusConfirm) return;
          submitStatusChange(statusConfirm.user.id, statusConfirm.nextStatus);
        }}
        onCancel={() => setStatusConfirm(null)}
      />

      <ConfirmationModal
        open={Boolean(subscriptionCancelConfirm)}
        variant="danger"
        title={t(text("Cancel subscription", "Annuler l'abonnement", "Abonnement kundigen", "Cancelar suscripción", "Cancelar subscrição"))}
        description={
          subscriptionCancelConfirm
            ? t(
                text(
                  `Cancel active subscription for ${subscriptionCancelConfirm.fullName}?`,
                  `Annuler l'abonnement actif de ${subscriptionCancelConfirm.fullName} ?`,
                  `Aktives Abonnement fur ${subscriptionCancelConfirm.fullName} kundigen?`,
                  `Cancelar la suscripcion activa de ${subscriptionCancelConfirm.fullName}?`,
                  `Cancelar a subscricao ativa de ${subscriptionCancelConfirm.fullName}?`
                )
              )
            : ""
        }
        confirmLabel={t(text("Cancel subscription", "Annuler l'abonnement", "Abonnement kundigen", "Cancelar suscripción", "Cancelar subscrição"))}
        onConfirm={() => {
          if (!subscriptionCancelConfirm) return;
          submitSubscriptionCancel(subscriptionCancelConfirm);
        }}
        onCancel={() => setSubscriptionCancelConfirm(null)}
      />
    </div>
  );
}


