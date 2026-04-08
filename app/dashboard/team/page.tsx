"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { format, formatDistanceToNow } from "date-fns";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { TransientAlert } from "@/components/ui/transient-alert";
import { useLanguage } from "@/components/providers/language-provider";
import {
  getTeamActivityActionLabel,
  getTeamDateLocale,
  getTeamPlanLabel,
  getTeamRoleLabel,
  localizeTeamActivityMessage,
  localizeTeamServerMessage,
} from "@/lib/team/localization";
import { useTheme } from "@/components/providers/theme-provider";
import { CheckCircle2, Lock, MoreHorizontal, UserPlus, Users } from "lucide-react";

const fetcher = async (url: string) => {
  const res = await fetch(url, { cache: "no-store" });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const error = new Error(json?.error || "Failed to load team") as Error & { status?: number };
    error.status = res.status;
    throw error;
  }
  return json;
};

const TEAM_PLAN_CACHE_KEY = "team_plan_snapshot_v1";

type TeamMember = {
  id: string;
  role: string;
  joinedAt?: string | null;
  createdAt?: string | null;
  user?: {
    id: string;
    name?: string | null;
    email?: string | null;
    publicId?: string | null;
    role?: string | null;
  } | null;
};

type PendingInvite = {
  id: string;
  email: string;
  role: string;
  createdAt: string;
  expiresAt?: string | null;
};

type TeamActivity = {
  id: string;
  actionType: string;
  createdAt: string;
  message: string;
  metadata?: Record<string, unknown> | null;
  actor?: {
    id?: string | null;
    name?: string | null;
    email?: string | null;
  } | null;
  target?: {
    id?: string | null;
    name?: string | null;
    email?: string | null;
  } | null;
};

type TeamResponse = {
  members: TeamMember[];
  pendingInvites?: PendingInvite[];
  recentActivity?: TeamActivity[];
  seatLimit?: number | null;
  seatsUsed?: number;
  planLabel?: "starter" | "pro" | "growth" | "business" | "enterprise";
  currentRole?: string;
  permissions?: {
    canInvite?: boolean;
    canRemoveMember?: boolean;
    canPromoteMember?: boolean;
    canDemoteAdmin?: boolean;
    canManageSubscription?: boolean;
    canViewTeamOperations?: boolean;
  };
};

function initialsForMember(member: { name?: string | null; email?: string | null }) {
  const name = String(member.name || "").trim();
  if (name) {
    const parts = name.split(/\s+/).filter(Boolean);
    const firstInitial = parts[0]?.[0] || "";
    const lastInitial = parts.length > 1 ? parts[parts.length - 1]?.[0] || "" : parts[0]?.[1] || "";
    const initials = firstInitial + lastInitial;
    return initials.toUpperCase() || "TM";
  }
  const email = String(member.email || "").trim();
  const local = email.split("@")[0] || "tm";
  return (local.slice(0, 2) || "tm").toUpperCase();
}

function successMessage(message: string) {
  return { message, variant: "success" as const };
}

function errorMessage(message: string) {
  return { message, variant: "error" as const };
}

export default function TeamPage() {
  const { language, t } = useLanguage();
  const { theme, resolvedTheme } = useTheme();
  const forceLight = theme === "light" || resolvedTheme === "light";
  const { data, error, isLoading, mutate } = useSWR<TeamResponse>("/api/team", fetcher, {
    shouldRetryOnError: false,
  });
  const router = useRouter();
  const menuRef = useRef<HTMLDivElement | null>(null);
  const dateLocale = getTeamDateLocale(language);

  const members = Array.isArray(data?.members) ? data.members : [];
  const pendingInvites = Array.isArray(data?.pendingInvites) ? data.pendingInvites : [];
  const recentActivity = Array.isArray(data?.recentActivity) ? data.recentActivity : [];
  const permissions = data?.permissions || {};
  const canInvite = Boolean(permissions.canInvite);
  const canRemoveMember = Boolean(permissions.canRemoveMember);
  const canViewTeamOperations = Boolean(permissions.canViewTeamOperations);
  const currentOrgRole = String(data?.currentRole || "").toLowerCase();
  const seatLimit =
    typeof data?.seatLimit === "number" ? data.seatLimit : data?.seatLimit === null ? null : undefined;
  const planLabel = data?.planLabel;

  const [cachedPlanLabel, setCachedPlanLabel] = useState<
    "starter" | "pro" | "growth" | "business" | "enterprise" | null
  >(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("member");
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [showInvite, setShowInvite] = useState(false);
  const [status, setStatus] = useState<{
    message: string;
    variant: "info" | "success" | "warning" | "error";
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [rowActionId, setRowActionId] = useState<string | null>(null);
  const [roleSavingMemberId, setRoleSavingMemberId] = useState<string | null>(null);
  const [inviteActionId, setInviteActionId] = useState<string | null>(null);

  useLayoutEffect(() => {
    try {
      const raw = window.sessionStorage.getItem(TEAM_PLAN_CACHE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { planLabel?: string };
      const value = String(parsed?.planLabel || "").toLowerCase();
      if (value === "starter" || value === "pro" || value === "growth" || value === "business" || value === "enterprise") {
        setCachedPlanLabel(value);
      }
    } catch {
      // ignore cache issues
    }
  }, []);

  useEffect(() => {
    if (!planLabel) return;
    try {
      window.sessionStorage.setItem(TEAM_PLAN_CACHE_KEY, JSON.stringify({ planLabel }));
    } catch {
      // ignore cache write issues
    }
  }, [planLabel]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setRowActionId(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const visiblePlanLabel = planLabel ?? cachedPlanLabel ?? undefined;
  const canAssignBillingAdmin = currentOrgRole === "owner";
  const seatsUsed = typeof data?.seatsUsed === "number" ? data.seatsUsed : members.length;
  const seatLabel =
    seatLimit === null
      ? t(
          "Unlimited / Contract-based",
          "Illimite / Contrat",
          "Unbegrenzt / Vertragsbasiert",
          "Ilimitado / Seg?n contrato",
          "Ilimitado / Baseado em contrato"
        )
      : typeof seatLimit === "number"
        ? t(
            `${seatsUsed} of ${seatLimit} seats used`,
            `${seatsUsed} sur ${seatLimit} places utilisees`,
            `${seatsUsed} von ${seatLimit} Platzen belegt`,
            `${seatsUsed} de ${seatLimit} plazas usadas`,
            `${seatsUsed} de ${seatLimit} lugares usados`
          )
        : null;

  const inviteDisabled =
    isLoading ||
    !canInvite ||
    !visiblePlanLabel ||
    visiblePlanLabel === "starter" ||
    (typeof seatLimit === "number" && seatsUsed >= seatLimit) ||
    saving;
  const rowActionButtonClass = `rounded-xl border border-slate-300 bg-white px-2 py-2 text-slate-500 transition hover:border-slate-400 hover:bg-slate-50 hover:text-slate-700 dark:border-border/60 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-100 ${
    forceLight ? "!border-[#CBD5E1] !bg-white !text-[#64748B] hover:!border-[#94A3B8] hover:!bg-slate-50 hover:!text-[#334155]" : ""
  }`;
  const rowActionMenuClass = `absolute right-0 top-full z-20 mt-2 min-w-[160px] rounded-xl border border-slate-300 bg-white p-1 shadow-lg dark:border-border dark:bg-popover ${
    forceLight ? "!border-[#CBD5E1] !bg-white" : ""
  }`;
  const rowActionButtonStyle = forceLight
    ? ({ backgroundColor: "#FFFFFF", color: "#64748B", borderColor: "#CBD5E1" } as const)
    : undefined;
  const rowActionMenuStyle = forceLight
    ? ({ backgroundColor: "#FFFFFF", borderColor: "#CBD5E1" } as const)
    : undefined;

  const visibleMembers = members;
  const filteredMembers = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return visibleMembers.filter((member) => {
      const name = String(member.user?.name || "").toLowerCase();
      const emailValue = String(member.user?.email || "").toLowerCase();
      const publicId = String(member.user?.publicId || "").toLowerCase();
      const roleValue = String(member.role || "member").toLowerCase();
      const matchesQuery = !needle || [name, emailValue, publicId, roleValue].some((item) => item.includes(needle));
      const matchesRole = roleFilter === "all" || roleValue === roleFilter;
      return matchesQuery && matchesRole;
    });
  }, [query, roleFilter, visibleMembers]);

  const getEditableRoleOptions = (member: TeamMember) => {
    const memberRole = String(member.role || "member").toLowerCase();
    if (memberRole === "owner") return [] as string[];
    if (currentOrgRole === "owner") return ["member", "admin", "billing_admin"];
    if (currentOrgRole === "admin" && memberRole === "member") return ["member", "admin"];
    return [] as string[];
  };

  const handleInvite = async () => {
    if (!email.trim()) {
      setStatus({
        message: t(
          "Enter a valid email address.",
          "Entrez une adresse email valide.",
          "Gib eine gültige E-Mail-Adresse ein.",
          "Introduce una direcci?n de correo valida.",
          "Introduz um endereco de email valido."
        ),
        variant: "warning",
      });
      return;
    }
    setSaving(true);
    setStatus(null);
    try {
      const res = await fetch("/api/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), role }),
      });
      const payload = await res.json().catch(() => null);
      if (res.status === 401) {
        setStatus(
          errorMessage(
            localizeTeamServerMessage(
              payload?.error || "Please sign in first.",
              language,
              t(
                "Please sign in first.",
                "Veuillez d'abord vous connecter.",
                "Bitte melde dich zuerst an.",
                "Inicia sesión primero.",
                "Inicia sessão primeiro."
              )
            )
          )
        );
      } else if (res.status === 403) {
        setStatus(
          errorMessage(
            localizeTeamServerMessage(
              payload?.error,
              language,
              t(
                "Upgrade to Pro, Growth, Business, or Enterprise to add team members.",
                "Passez au plan Pro, Growth, Business ou Enterprise pour ajouter des membres.",
                "Wechsle zu Pro, Growth, Business oder Enterprise, um Teammitglieder hinzuzufügen.",
                "Actualiza a Pro, Growth, Business o Enterprise para anadir miembros al equipo.",
                "Atualiza para Pro, Growth, Business ou Enterprise para adicionar membros a equipa."
              )
            )
          )
        );
      } else if (!res.ok) {
        setStatus(
          errorMessage(
            localizeTeamServerMessage(
              payload?.error,
              language,
              t(
                "Invite failed. Please try again.",
                "L'invitation a échoué. Réessayez.",
                "Einladung fehlgeschlagen. Bitte versuche es erneut.",
                "La invitación ha fallado. Intentalo de nuevo.",
                "O convite falhou. Tenta novamente."
              )
            )
          )
        );
      } else if (payload?.alreadyMember) {
        setStatus({
          message: localizeTeamServerMessage(
            "That user is already on your team.",
            language,
            t(
              "That user is already on your team.",
              "Cet utilisateur fait déjà partie de votre équipe.",
              "Diese Person ist bereits in deinem Team.",
              "Ese usuario ya forma parte de tu equipo.",
              "Esse utilizador ja faz parte da tua equipa."
            )
          ),
          variant: "info",
        });
      } else if (payload?.invited) {
        setStatus(successMessage(t("Invitation sent.", "Invitation envoyée.", "Einladung gesendet.", "Invitacion enviada.", "Convite enviado.")));
        setEmail("");
        setRole("member");
        setShowInvite(false);
        await mutate();
      } else {
        setStatus(
          successMessage(
            t("Team member added.", "Membre ajoute.", "Teammitglied hinzugefugt.", "Miembro del equipo anadido.", "Membro da equipa adicionado.")
          )
        );
        setEmail("");
        setRole("member");
        setShowInvite(false);
        await mutate();
      }
    } catch (err: any) {
      setStatus(
        errorMessage(
          localizeTeamServerMessage(
            err?.message,
            language,
            t(
              "Invite failed. Please try again.",
              "L'invitation a échoué. Réessayez.",
              "Einladung fehlgeschlagen. Bitte versuche es erneut.",
              "La invitación ha fallado. Intentalo de nuevo.",
              "O convite falhou. Tenta novamente."
            )
          )
        )
      );
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async (memberId: string) => {
    setSaving(true);
    setStatus(null);
    try {
      const res = await fetch("/api/team", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        setStatus(
          errorMessage(
            localizeTeamServerMessage(
              payload?.error,
              language,
              t("Remove failed.", "La suppression a échoué.", "Entfernen fehlgeschlagen.", "La eliminacion ha fallado.", "A remocao falhou.")
            )
          )
        );
      } else {
        setStatus(successMessage(t("Member removed.", "Membre supprime.", "Mitglied entfernt.", "Miembro eliminado.", "Membro removido.")));
        setRowActionId(null);
        await mutate();
      }
    } catch (err: any) {
      setStatus(
        errorMessage(
          localizeTeamServerMessage(
            err?.message,
            language,
            t("Remove failed.", "La suppression a échoué.", "Entfernen fehlgeschlagen.", "La eliminacion ha fallado.", "A remocao falhou.")
          )
        )
      );
    } finally {
      setSaving(false);
    }
  };

  const handleRoleChange = async (member: TeamMember, nextRole: string) => {
    const currentRoleValue = String(member.role || "member").toLowerCase();
    if (nextRole === currentRoleValue) return;

    setRoleSavingMemberId(member.id);
    setStatus(null);
    try {
      const res = await fetch("/api/team", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId: member.id, role: nextRole }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        setStatus(
          errorMessage(
            localizeTeamServerMessage(
              payload?.error,
              language,
              t(
                "Role update failed.",
                "La mise ? jour du role a échoué.",
                "Rollenaktualisierung fehlgeschlagen.",
                "La actualización del rol ha fallado.",
                "A atualização do papel falhou."
              )
            )
          )
        );
        return;
      }
      setStatus(
        successMessage(
          t("Member role updated.", "Role du membre mis ? jour.", "Mitgliedsrolle aktualisiert.", "Rol del miembro actualizado.", "Papel do membro atualizado.")
        )
      );
      await mutate();
    } catch (err: any) {
      setStatus(
        errorMessage(
          localizeTeamServerMessage(
            err?.message,
            language,
            t(
              "Role update failed.",
              "La mise ? jour du role a échoué.",
              "Rollenaktualisierung fehlgeschlagen.",
              "La actualización del rol ha fallado.",
              "A atualização do papel falhou."
            )
          )
        )
      );
    } finally {
      setRoleSavingMemberId(null);
    }
  };

  const handleResendInvite = async (inviteId: string) => {
    setInviteActionId(inviteId);
    setStatus(null);
    try {
      const res = await fetch("/api/team", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "resend_invite", inviteId }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        setStatus(
          errorMessage(
            localizeTeamServerMessage(
              payload?.error,
              language,
              t("Resend failed.", "Le renvoi a échoué.", "Erneutes Senden fehlgeschlagen.", "El reenvio ha fallado.", "O reenvio falhou.")
            )
          )
        );
      } else {
        setStatus(successMessage(t("Invitation resent.", "Invitation renvoyée.", "Einladung erneut gesendet.", "Invitacion reenviada.", "Convite reenviado.")));
        await mutate();
      }
    } catch (err: any) {
      setStatus(
        errorMessage(
          localizeTeamServerMessage(
            err?.message,
            language,
            t("Resend failed.", "Le renvoi a échoué.", "Erneutes Senden fehlgeschlagen.", "El reenvio ha fallado.", "O reenvio falhou.")
          )
        )
      );
    } finally {
      setInviteActionId(null);
    }
  };

  const handleCancelInvite = async (inviteId: string) => {
    setInviteActionId(inviteId);
    setStatus(null);
    try {
      const res = await fetch("/api/team", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel_invite", inviteId }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        setStatus(
          errorMessage(
            localizeTeamServerMessage(
              payload?.error,
              language,
              t("Cancel failed.", "L annulation a échoué.", "Abbrechen fehlgeschlagen.", "La cancelación ha fallado.", "O cancelamento falhou.")
            )
          )
        );
      } else {
        setStatus(successMessage(t("Invitation canceled.", "Invitation annulee.", "Einladung storniert.", "Invitacion cancelada.", "Convite cancelado.")));
        await mutate();
      }
    } catch (err: any) {
      setStatus(
        errorMessage(
          localizeTeamServerMessage(
            err?.message,
            language,
            t("Cancel failed.", "L annulation a échoué.", "Abbrechen fehlgeschlagen.", "La cancelación ha fallado.", "O cancelamento falhou.")
          )
        )
      );
    } finally {
      setInviteActionId(null);
    }
  };

  const currentPlanTitle = visiblePlanLabel ? getTeamPlanLabel(visiblePlanLabel, language) : null;

  const hasTopTierPlan = visiblePlanLabel === "enterprise";

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-border/60 bg-card px-6 py-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-border/60 bg-muted/40 text-foreground">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">
                {t("Current plan", "Plan actuel", "Aktueller Plan", "Plan actual", "Plano atual")}
              </p>
              {currentPlanTitle ? <p className="mt-1 text-2xl font-semibold text-foreground">{currentPlanTitle}</p> : null}
              {seatLabel ? <p className="text-sm text-muted-foreground">{seatLabel}</p> : null}
            </div>
          </div>
          <Button
            className={hasTopTierPlan ? "bg-blue-600 text-white opacity-85" : "bg-blue-600 text-white hover:bg-blue-500"}
            onClick={() => {
              if (hasTopTierPlan) {
                setStatus({
                  message: t(
                    "You are on the best plan.",
                    "Vous etes sur le meilleur plan.",
                    "Du hast bereits den besten Plan.",
                    "Ya estas en el mejor plan.",
                    "Ja estas no melhor plano."
                  ),
                  variant: "info",
                });
                return;
              }
              router.push("/dashboard/subscription");
            }}
            variant="primary"
            title={
              hasTopTierPlan
                ? t(
                    "You are on the best plan.",
                    "Vous etes sur le meilleur plan.",
                    "Du hast bereits den besten Plan.",
                    "Ya estas en el mejor plan.",
                    "Ja estas no melhor plano."
                  )
                : undefined
            }
            size="sm"
          >
            {t("Upgrade", "Mettre a niveau", "Upgrade", "Mejorar", "Atualizar")}
          </Button>
        </div>
      </section>

      {status ? (
        <TransientAlert variant={status.variant} onDismiss={() => setStatus(null)}>
          {status.variant === "success" ? <CheckCircle2 className="mr-2 inline h-4 w-4" /> : null}
          {status.message}
        </TransientAlert>
      ) : null}
      {error ? (
        <Alert variant="error">
          {localizeTeamServerMessage(
            error.message,
            language,
            t(
              "Team information unavailable.",
              "Informations indisponibles.",
              "Teaminformationen nicht verfügbar.",
              "Información del equipo no disponible.",
              "Informações da equipa indisponiveis."
            )
          )}
        </Alert>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-6">
          <section className="rounded-3xl border border-border/60 bg-card px-6 py-6 shadow-sm">
            <div>
              <h1 className="text-2xl font-semibold text-foreground">
                {t("Team Members", "Membres de l équipe", "Teammitglieder", "Miembros del equipo", "Membros da equipa")}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {t(
                  "Manage your workspace access and member roles.",
                  "G?rez les accès et roles de votre espace de travail.",
                  "Verwalte den Workspace-Zugriff und die Rollen deines Teams.",
                  "Gestiona el acceso al espacio de trabajo y los roles del equipo.",
                  "Gere o acesso ao espa?o de trabalho e os papeis da equipa."
                )}
              </p>
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-3">
              <Button
                variant="primary"
                size="sm"
                onClick={() => setShowInvite((value) => !value)}
                disabled={inviteDisabled}
                className="h-10 rounded-xl bg-blue-600 px-4 text-white shadow-[0_10px_24px_rgba(37,99,235,0.22)] hover:bg-blue-500"
              >
                <UserPlus className="mr-2 h-4 w-4" />
                {t("Invite new member", "Inviter un membre", "Mitglied einladen", "Invitar a un miembro", "Convidar membro")}
              </Button>
              <input
                placeholder={t("Search", "Rechercher", "Suchen", "Buscar", "Pesquisar")}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="h-10 min-w-[220px] rounded-xl border border-border bg-background px-3 text-sm text-foreground outline-none transition focus:border-blue-500"
              />
              <select
                value={roleFilter}
                onChange={(event) => setRoleFilter(event.target.value)}
                className="h-10 rounded-xl border border-border bg-background px-3 text-sm text-foreground outline-none transition focus:border-blue-500"
              >
                <option value="all">{t("All roles", "Tous les rôles", "Alle Rollen", "Todos los roles", "Todos os papeis")}</option>
                <option value="owner">{getTeamRoleLabel("owner", language)}</option>
                <option value="admin">{getTeamRoleLabel("admin", language)}</option>
                <option value="billing_admin">{getTeamRoleLabel("billing_admin", language)}</option>
                <option value="member">{getTeamRoleLabel("member", language)}</option>
              </select>
            </div>

            {showInvite ? (
              <div className="mt-5 grid gap-4 rounded-2xl border border-border/60 bg-muted/30 p-4 sm:grid-cols-[minmax(0,1fr)_180px_auto] sm:items-end">
                <label className="grid gap-1 text-sm text-foreground">
                  <span>{t("Email", "Email", "E-Mail", "Correo electr?nico", "Email")}</span>
                  <input
                    placeholder="name@company.com"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    type="email"
                    required
                    disabled={inviteDisabled}
                    className="h-10 rounded-xl border border-border bg-background px-3 text-foreground outline-none transition focus:border-blue-500 disabled:opacity-60"
                  />
                </label>
                <label className="grid gap-1 text-sm text-foreground">
                  <span>{t("Role", "Role", "Rolle", "Rol", "Papel")}</span>
                  <select
                    value={role}
                    onChange={(event) => setRole(event.target.value)}
                    disabled={inviteDisabled}
                    className="h-10 rounded-xl border border-border bg-background px-3 text-foreground outline-none transition focus:border-blue-500"
                  >
                    <option value="member">{getTeamRoleLabel("member", language)}</option>
                    <option value="admin" disabled={currentOrgRole !== "owner"}>{getTeamRoleLabel("admin", language)}</option>
                    <option value="billing_admin" disabled={!canAssignBillingAdmin}>{getTeamRoleLabel("billing_admin", language)}</option>
                  </select>
                </label>
                <Button
                  onClick={handleInvite}
                  loading={saving}
                  disabled={inviteDisabled}
                  className="h-10 rounded-xl bg-blue-600 px-4 text-white shadow-[0_10px_24px_rgba(37,99,235,0.22)] hover:bg-blue-500"
                >
                  {t("Add member", "Ajouter", "Mitglied hinzufügen", "Anadir miembro", "Adicionar membro")}
                </Button>
              </div>
            ) : null}

            <div className="mt-6 rounded-2xl border border-border/60 bg-background">
              <div className="hidden grid-cols-[64px_minmax(0,2.4fr)_104px_150px_52px] gap-5 bg-muted/30 px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground 2xl:grid">
                <div>{t("Initials", "Initiales", "Initialen", "Iniciales", "Iniciais")}</div>
                <div>{t("Member", "Membre", "Mitglied", "Miembro", "Membro")}</div>
                <div className="text-center">{t("Joined", "Rejoint", "Beigêtreten", "Se unio", "Entrou")}</div>
                <div className="text-center">{t("Role", "Role", "Rolle", "Rol", "Papel")}</div>
                <div>{t("Actions", "Actions", "Aktionen", "Acciones", "Ações")}</div>
              </div>
              <div className="hidden grid-cols-[56px_minmax(0,2.2fr)_104px_136px_44px] gap-5 bg-muted/30 px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground xl:grid 2xl:hidden">
                <div>{t("Initials", "Initiales", "Initialen", "Iniciales", "Iniciais")}</div>
                <div>{t("Member", "Membre", "Mitglied", "Miembro", "Membro")}</div>
                <div className="text-center">{t("Joined", "Rejoint", "Beigêtreten", "Se unio", "Entrou")}</div>
                <div className="text-center">{t("Role", "Role", "Rolle", "Rol", "Papel")}</div>
                <div>{t("Actions", "Actions", "Aktionen", "Acciones", "Ações")}</div>
              </div>
              {filteredMembers.length === 0 && !isLoading ? (
                <div className="px-5 py-8 text-sm text-muted-foreground">
                  {query || roleFilter !== "all"
                    ? t("No team members found.", "Aucun membre trouvé.", "Keine Teammitglieder gefunden.", "No se encontraron miembros del equipo.", "Nenhum membro da equipa encontrado.")
                    : t("No members yet.", "Aucun membre pour le moment.", "Noch keine Mitglieder.", "Todavia no hay miembros.", "Ainda não ha membros.")}
                </div>
              ) : null}

              <div ref={menuRef}>
                {filteredMembers.map((member) => {
                  const memberName = member.user?.name || member.user?.email || "-";
                  const editableRoleOptions = getEditableRoleOptions(member);
                  const memberRole = String(member.role || "member").toLowerCase();
                  const joinedLabel = member.joinedAt || member.createdAt
                    ? format(new Date(member.joinedAt || member.createdAt || ""), "PPP", { locale: dateLocale })
                    : "-";
                  const canRemoveThisMember =
                    canRemoveMember && memberRole !== "owner" && !(currentOrgRole === "admin" && memberRole !== "member");
                  return (
                    <div key={member.id} className="border-t border-border/60 px-5 py-5 first:border-t-0">
                      <div className="hidden 2xl:grid 2xl:grid-cols-[64px_minmax(0,2.4fr)_104px_150px_52px] 2xl:items-center 2xl:gap-5">
                        <div>
                          <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-muted text-sm font-semibold text-foreground">
                            {initialsForMember({ name: member.user?.name, email: member.user?.email })}
                          </span>
                        </div>
                        <div className="min-w-0">
                          <p className="whitespace-normal break-words text-sm font-semibold leading-snug text-foreground">
                            {memberName}
                          </p>
                          <p className="mt-1 whitespace-normal break-words text-[11px] leading-5 text-muted-foreground">
                            {member.user?.email || "-"}
                          </p>
                        </div>
                        <div className="flex justify-center">
                          <p className="text-sm text-muted-foreground">{joinedLabel}</p>
                        </div>
                        <div className="flex justify-center">
                          {memberRole === "owner" ? (
                            <span className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-sm font-medium text-slate-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
                              <Lock className="h-4 w-4 text-amber-500 dark:text-amber-300" />
                              {getTeamRoleLabel("owner", language)}
                            </span>
                          ) : editableRoleOptions.length > 0 ? (
                            <select
                              value={memberRole}
                              onChange={(event) => handleRoleChange(member, event.target.value)}
                              disabled={roleSavingMemberId === member.id || saving}
                              className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground outline-none transition focus:border-blue-500 disabled:opacity-60"
                            >
                              {editableRoleOptions.map((option) => (
                                <option key={option} value={option}>{getTeamRoleLabel(option, language)}</option>
                              ))}
                            </select>
                          ) : (
                            <span className="text-sm text-foreground">{getTeamRoleLabel(memberRole, language)}</span>
                          )}
                        </div>
                        <div className="relative flex justify-end">
                          {memberRole === "owner" ? (
                            <button type="button" disabled className="rounded-xl border border-border/60 px-2 py-2 text-muted-foreground/50">
                              <MoreHorizontal className="h-4 w-4" />
                            </button>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() => setRowActionId((current) => (current === member.id ? null : member.id))}
                                className={rowActionButtonClass}
                                aria-expanded={rowActionId === member.id}
                                style={rowActionButtonStyle}
                              >
                                <MoreHorizontal className="h-4 w-4" />
                              </button>
                              {rowActionId === member.id ? (
                                <div className={rowActionMenuClass} style={rowActionMenuStyle}>
                                  <button
                                    type="button"
                                    onClick={() => handleRemove(member.id)}
                                    disabled={!canRemoveThisMember || saving}
                                    className="flex w-full rounded-lg px-3 py-2 text-left text-sm text-rose-600 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:text-muted-foreground"
                                  >
                                    {t("Remove member", "Retirer le membre", "Mitglied entfernen", "Eliminar miembro", "Remover membro")}
                                  </button>
                                </div>
                              ) : null}
                            </>
                          )}
                        </div>
                      </div>
                      <div className="hidden xl:grid xl:grid-cols-[56px_minmax(0,2.2fr)_104px_136px_44px] xl:items-center xl:gap-5 2xl:hidden">
                        <div>
                          <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-muted text-sm font-semibold text-foreground">
                            {initialsForMember({ name: member.user?.name, email: member.user?.email })}
                          </span>
                        </div>
                        <div className="min-w-0">
                          <p className="whitespace-normal break-words text-sm font-semibold leading-snug text-foreground">
                            {memberName}
                          </p>
                          <p className="mt-1 whitespace-normal break-words text-[11px] leading-5 text-muted-foreground">
                            {member.user?.email || "-"}
                          </p>
                        </div>
                        <div className="flex justify-center">
                          <p className="text-[13px] text-muted-foreground">{joinedLabel}</p>
                        </div>
                        <div className="flex min-w-0 justify-center">
                          {memberRole === "owner" ? (
                            <span className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-sm font-medium text-slate-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
                              <Lock className="h-4 w-4 text-amber-500 dark:text-amber-300" />
                              {getTeamRoleLabel("owner", language)}
                            </span>
                          ) : editableRoleOptions.length > 0 ? (
                            <select
                              value={memberRole}
                              onChange={(event) => handleRoleChange(member, event.target.value)}
                              disabled={roleSavingMemberId === member.id || saving}
                              className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground outline-none transition focus:border-blue-500 disabled:opacity-60"
                            >
                              {editableRoleOptions.map((option) => (
                                <option key={option} value={option}>{getTeamRoleLabel(option, language)}</option>
                              ))}
                            </select>
                          ) : (
                            <span className="text-sm text-foreground">{getTeamRoleLabel(memberRole, language)}</span>
                          )}
                        </div>
                        <div className="relative flex justify-end">
                          {memberRole === "owner" ? (
                            <button type="button" disabled className="rounded-xl border border-border/60 px-2 py-2 text-muted-foreground/50">
                              <MoreHorizontal className="h-4 w-4" />
                            </button>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() => setRowActionId((current) => (current === member.id ? null : member.id))}
                                className={rowActionButtonClass}
                                aria-expanded={rowActionId === member.id}
                                style={rowActionButtonStyle}
                              >
                                <MoreHorizontal className="h-4 w-4" />
                              </button>
                              {rowActionId === member.id ? (
                                <div className={rowActionMenuClass} style={rowActionMenuStyle}>
                                  <button
                                    type="button"
                                    onClick={() => handleRemove(member.id)}
                                    disabled={!canRemoveThisMember || saving}
                                    className="flex w-full rounded-lg px-3 py-2 text-left text-sm text-rose-600 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:text-muted-foreground"
                                  >
                                    {t("Remove member", "Retirer le membre", "Mitglied entfernen", "Eliminar miembro", "Remover membro")}
                                  </button>
                                </div>
                              ) : null}
                            </>
                          )}
                        </div>
                      </div>
                      <div className="space-y-4 xl:hidden">
                        <div className="flex items-start gap-4">
                          <span className="inline-flex h-11 w-11 flex-none items-center justify-center rounded-full bg-muted text-sm font-semibold text-foreground">
                            {initialsForMember({ name: member.user?.name, email: member.user?.email })}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-foreground">{memberName}</p>
                                <p className="mt-1 break-all text-sm text-muted-foreground">{member.user?.email || "-"}</p>
                              </div>
                              <div className="relative flex flex-none justify-end">
                                {memberRole === "owner" ? (
                                  <button type="button" disabled className="rounded-xl border border-border/60 px-2 py-2 text-muted-foreground/50">
                                    <MoreHorizontal className="h-4 w-4" />
                                  </button>
                                ) : (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => setRowActionId((current) => (current === member.id ? null : member.id))}
                                      className={rowActionButtonClass}
                                      aria-expanded={rowActionId === member.id}
                                      style={rowActionButtonStyle}
                                    >
                                      <MoreHorizontal className="h-4 w-4" />
                                    </button>
                                    {rowActionId === member.id ? (
                                      <div className={rowActionMenuClass} style={rowActionMenuStyle}>
                                        <button
                                          type="button"
                                          onClick={() => handleRemove(member.id)}
                                          disabled={!canRemoveThisMember || saving}
                                          className="flex w-full rounded-lg px-3 py-2 text-left text-sm text-rose-600 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:text-muted-foreground"
                                        >
                                          {t("Remove member", "Retirer le membre", "Mitglied entfernen", "Eliminar miembro", "Remover membro")}
                                        </button>
                                      </div>
                                    ) : null}
                                  </>
                                )}
                              </div>
                            </div>
                            <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                              <span>
                                <span className="font-medium text-foreground/80">{t("Joined", "Rejoint", "Beigêtreten", "Se unio", "Entrou")}:</span>{" "}
                                {joinedLabel}
                              </span>
                              <span className="hidden h-1 w-1 rounded-full bg-border sm:inline-block" />
                              <div className="min-w-[160px] flex-1 sm:flex-none">
                                {memberRole === "owner" ? (
                                  <span className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-sm font-medium text-slate-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
                                    <Lock className="h-4 w-4 text-amber-500 dark:text-amber-300" />
                                    {getTeamRoleLabel("owner", language)}
                                  </span>
                                ) : editableRoleOptions.length > 0 ? (
                                  <select
                                    value={memberRole}
                                    onChange={(event) => handleRoleChange(member, event.target.value)}
                                    disabled={roleSavingMemberId === member.id || saving}
                                    className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground outline-none transition focus:border-blue-500 disabled:opacity-60 sm:min-w-[180px]"
                                  >
                                    {editableRoleOptions.map((option) => (
                                      <option key={option} value={option}>{getTeamRoleLabel(option, language)}</option>
                                    ))}
                                  </select>
                                ) : (
                                  <span className="text-sm text-foreground">{getTeamRoleLabel(memberRole, language)}</span>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>

          {canViewTeamOperations ? (
          <section className="rounded-3xl border border-border/60 bg-card px-6 py-6 shadow-sm">
            <h2 className="text-xl font-semibold text-foreground">
              {t("Pending Invitations", "Invitations en attente", "Ausstehende Einladungen", "Invitaciones pendientes", "Convites pendentes")}
            </h2>
            <div className="mt-4 rounded-2xl border border-border/60">
              <div className="hidden grid-cols-[72px_minmax(200px,240px)_88px_176px] gap-4 bg-muted/30 px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground xl:grid">
                <div>{t("Initials", "Initiales", "Initialen", "Iniciales", "Iniciais")}</div>
                <div>{t("Email", "Email", "E-Mail", "Correo electr?nico", "Email")}</div>
                <div>{t("Role", "Role", "Rolle", "Rol", "Papel")}</div>
                <div>{t("Actions", "Actions", "Aktionen", "Acciones", "Ações")}</div>
              </div>
              {pendingInvites.length === 0 ? (
                <div className="px-5 py-8 text-sm text-muted-foreground">
                  {t("No pending invitations.", "Aucune invitation en attente.", "Keine ausstehenden Einladungen.", "No hay invitaciónes pendientes.", "Não há convites pendentes.")}
                </div>
              ) : (
                pendingInvites.map((invite) => (
                  <div key={invite.id} className="border-t border-border/60 px-5 py-4 first:border-t-0">
                    <div className="hidden xl:grid xl:grid-cols-[72px_minmax(200px,240px)_88px_176px] xl:items-center xl:gap-4">
                      <div>
                        <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-blue-50 text-sm font-semibold text-blue-700 dark:bg-blue-500/10 dark:text-blue-300">
                          {initialsForMember({ email: invite.email })}
                        </span>
                      </div>
                      <div className="min-w-0 pr-2 text-sm text-foreground">
                        <span className="block truncate">{invite.email}</span>
                      </div>
                      <div className="text-sm text-foreground">{getTeamRoleLabel(invite.role, language)}</div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => handleResendInvite(invite.id)}
                          disabled={!canInvite || inviteActionId === invite.id}
                          className="h-8 rounded-xl border border-border/70 bg-background px-2.5 font-medium shadow-sm"
                        >
                          {t("Resend", "Renvoyer", "Erneut senden", "Reenviar", "Reenviar")}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleCancelInvite(invite.id)}
                          disabled={!canInvite || inviteActionId === invite.id}
                          className="h-8 rounded-xl border border-rose-200 bg-rose-50 px-2.5 font-medium text-rose-700 hover:bg-rose-100 hover:text-rose-800 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300 dark:hover:bg-rose-500/15"
                        >
                          {t("Cancel", "Annuler", "Abbrechen", "Cancelar", "Cancelar")}
                        </Button>
                      </div>
                    </div>
                    <div className="space-y-3 xl:hidden">
                      <div className="flex items-start gap-4">
                        <span className="inline-flex h-11 w-11 flex-none items-center justify-center rounded-full bg-blue-50 text-sm font-semibold text-blue-700 dark:bg-blue-500/10 dark:text-blue-300">
                          {initialsForMember({ email: invite.email })}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="break-all text-sm font-medium text-foreground">{invite.email}</p>
                          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                            <span className="font-medium text-foreground/80">{t("Role", "Role", "Rolle", "Rol", "Papel")}:</span>
                            <span>{getTeamRoleLabel(invite.role, language)}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => handleResendInvite(invite.id)}
                          disabled={!canInvite || inviteActionId === invite.id}
                          className="h-9 rounded-xl border border-border/70 bg-background px-4 font-medium shadow-sm"
                        >
                          {t("Resend", "Renvoyer", "Erneut senden", "Reenviar", "Reenviar")}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleCancelInvite(invite.id)}
                          disabled={!canInvite || inviteActionId === invite.id}
                          className="h-9 rounded-xl border border-rose-200 bg-rose-50 px-4 font-medium text-rose-700 hover:bg-rose-100 hover:text-rose-800 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300 dark:hover:bg-rose-500/15"
                        >
                          {t("Cancel", "Annuler", "Abbrechen", "Cancelar", "Cancelar")}
                        </Button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
          ) : null}
        </div>

        <aside className="rounded-3xl border border-border/60 bg-card px-6 py-6 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xl font-semibold text-foreground">
              {t("Team Activity", "Activit? de l équipe", "Teamaktivität", "Actividad del equipo", "Atividade da equipa")}
            </h2>
            {canViewTeamOperations ? (
              <Link href="/dashboard/team/activity" className="text-sm font-medium text-blue-600 hover:text-blue-500">
                {t("View all", "Voir tout", "Alle anzeigen", "Ver todo", "Ver tudo")}
              </Link>
            ) : null}
          </div>
          <div className="mt-5 space-y-4">
            {!canViewTeamOperations ? (
              <p className="text-sm text-muted-foreground">
                {t(
                  "Activity details are available to workspace managers only.",
                  "Les d?tails d activité sont reserves aux gestionnaires de l'espace.",
                  "Aktivitätsdetails sind nur für Workspace-Manager sichtbar.",
                  "Los detalles de actividad solo est?n disponibles para gestores del espacio.",
                  "Os detalhes da atividade estão disponíveis apenas para gestores do espa?o."
                )}
              </p>
            ) : recentActivity.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t("No recent team activity.", "Aucune activité recente.", "Keine aktuelle Teamaktivität.", "No hay actividad reciente del equipo.", "Não há atividade recente da equipa.")}
              </p>
            ) : (
              recentActivity.map((entry) => (
                <div key={entry.id} className="border-b border-border/60 pb-4 last:border-b-0 last:pb-0">
                  <div className="inline-flex items-center rounded-full bg-blue-200 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-blue-900 dark:bg-blue-500/10 dark:text-blue-300">
                    {getTeamActivityActionLabel(entry.actionType, language)}
                  </div>
                  <p className="mt-3 text-sm font-medium text-foreground">{localizeTeamActivityMessage(entry, language)}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(entry.createdAt), { addSuffix: true, locale: dateLocale })}
                  </p>
                </div>
              ))
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
