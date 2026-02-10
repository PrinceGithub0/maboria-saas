"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Table } from "@/components/ui/table";
import { useLanguage } from "@/components/providers/language-provider";
import { Lock, Users, UserPlus } from "lucide-react";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

type TeamMember = {
  id: string;
  role: string;
  user?: {
    id: string;
    name?: string | null;
    email?: string | null;
    publicId?: string | null;
    role?: string | null;
  } | null;
};

export default function TeamPage() {
  const { language } = useLanguage();
  const t = (en: string, fr: string) => (language === "fr" ? fr : en);
  const { data, error, isLoading, mutate } = useSWR("/api/team", fetcher);
  const router = useRouter();
  const members: TeamMember[] = Array.isArray(data?.members) ? data.members : [];
  const seatLimit =
    typeof data?.seatLimit === "number" ? data.seatLimit : data?.seatLimit === null ? null : undefined;
  const planLabel = (data?.planLabel || "starter") as "starter" | "pro" | "growth" | "business" | "enterprise";
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

  const canLoad = !error && !data?.error;
  const seatsUsed = members.length;
  const seatLabel =
    seatLimit === null
      ? t("Unlimited / Contract-based", "Illimite / Contrat")
      : typeof seatLimit === "number"
        ? t(`${seatsUsed} of ${seatLimit} seats used`, `${seatsUsed} sur ${seatLimit} places utilisees`)
        : t("Plan includes team seats", "Votre plan inclut des places");
  const planCopy = {
    starter: t("Upgrade to add team members", "Passez au plan superieur pour ajouter des membres"),
    pro: t("Upgrade for more seats", "Passez au plan superieur pour plus de places"),
    growth: t("Built for growing teams", "Concu pour les equipes en croissance"),
    business: t("Governance ready", "Gouvernance prete"),
    enterprise: t("Contact account manager", "Contactez votre responsable de compte"),
  } as const;
  const inviteDisabled =
    planLabel === "starter" ||
    (typeof seatLimit === "number" && seatsUsed >= seatLimit) ||
    saving;

  const handleInvite = async () => {
    if (!email.trim()) {
      setStatus({ message: t("Enter a valid email address.", "Entrez un email valide."), variant: "warning" });
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
      const payload = await res.json();
      if (res.status === 401) {
        setStatus({ message: t("Please sign in first.", "Veuillez vous connecter."), variant: "error" });
      } else if (res.status === 403) {
        setStatus({
          message:
            payload?.error ||
            t(
              "Upgrade to Pro, Growth, Business, or Enterprise to add team members.",
              "Passez au plan Pro, Growth, Business ou Enterprise pour ajouter des membres."
            ),
          variant: "error",
        });
      } else if (!res.ok) {
        setStatus({
          message: payload?.error || t("Invite failed. Please try again.", "Invitation echouee. Reessayez."),
          variant: "error",
        });
      } else if (payload?.alreadyMember) {
        setStatus({
          message: t("That user is already on your team.", "Cet utilisateur est deja dans votre equipe."),
          variant: "info",
        });
      } else if (payload?.invited) {
        setStatus({
          message: t("Invitation sent. They can join after signing up.", "Invitation envoyee. Ils rejoindront apres inscription."),
          variant: "success",
        });
        setEmail("");
        setRole("member");
      } else {
        setStatus({ message: t("Team member added.", "Membre ajoute."), variant: "success" });
        setEmail("");
        setRole("member");
        mutate();
      }
    } catch (err: any) {
      setStatus({
        message: t(`Invite failed. ${err?.message || ""}`, `Invitation echouee. ${err?.message || ""}`),
        variant: "error",
      });
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
      const payload = await res.json();
      if (!res.ok) {
        setStatus({
          message: payload?.error || t("Remove failed.", "Suppression echouee."),
          variant: "error",
        });
      } else {
        setStatus({ message: t("Member removed.", "Membre supprime."), variant: "success" });
        mutate();
      }
    } catch (err: any) {
      setStatus({
        message: t(`Remove failed. ${err?.message || ""}`, `Suppression echouee. ${err?.message || ""}`),
        variant: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  const ownerOnly = members.filter((member) => member.role === "owner");
  const visibleMembers = planLabel === "starter" ? ownerOnly : members;
  const filteredMembers = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return visibleMembers.filter((member) => {
      const name = (member.user?.name || "").toLowerCase();
      const emailValue = (member.user?.email || "").toLowerCase();
      const publicId = (member.user?.publicId || "").toLowerCase();
      const roleValue = (member.role || "member").toLowerCase();
      const matchesQuery =
        !needle ||
        name.includes(needle) ||
        emailValue.includes(needle) ||
        publicId.includes(needle) ||
        roleValue.includes(needle);
      const matchesRole = roleFilter === "all" || roleValue === roleFilter;
      return matchesQuery && matchesRole;
    });
  }, [visibleMembers, query, roleFilter]);

  const columns = [
    {
      key: "name",
      label: t("Name", "Nom"),
      render: (member: TeamMember) => member.user?.name || member.user?.email || "---",
    },
    {
      key: "email",
      label: t("Email", "Email"),
      render: (member: TeamMember) => member.user?.email || "---",
    },
    {
      key: "userId",
      label: t("User ID", "ID utilisateur"),
      render: (member: TeamMember) => member.user?.publicId || "---",
    },
    {
      key: "role",
      label: t("Role", "Role"),
      render: (member: TeamMember) => {
        const value = member.role || "member";
        const label = value.charAt(0).toUpperCase() + value.slice(1);
        return value === "owner" ? (
          <span className="inline-flex items-center gap-2">
            <span>{label}</span>
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-200/80 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
              <Lock className="h-3 w-3" />
            </span>
          </span>
        ) : (
          label
        );
      },
    },
    {
      key: "actions",
      label: t("Actions", "Actions"),
      render: (member: TeamMember) => (
        <Button
          variant="ghost"
          size="sm"
          disabled={saving || member.role === "owner"}
          onClick={() => handleRemove(member.id)}
          className="text-rose-600/70 hover:text-rose-700 disabled:text-slate-300"
        >
          {t("Remove", "Retirer")}
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6 max-md:space-y-6">
      <section className="rounded-[28px] border border-border/40 bg-white px-6 py-6 shadow-[0_20px_48px_rgba(15,23,42,0.08)] dark:bg-card">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-border/60 bg-indigo-50 text-indigo-700 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-200">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">
                {t("Current plan", "Plan actuel")}
              </p>
              <p className="text-2xl font-semibold text-foreground">
                {planLabel === "starter"
                  ? t("Starter", "Starter")
                  : planLabel === "pro"
                    ? t("Pro", "Pro")
                    : planLabel === "business"
                      ? t("Business", "Business")
                      : planLabel === "enterprise"
                        ? t("Enterprise", "Enterprise")
                        : t("Growth", "Growth")}
              </p>
              <p className="text-sm text-muted-foreground">{seatLabel}</p>
            </div>
          </div>
          {planLabel === "business" || planLabel === "enterprise" ? (
            <Button
              className="px-6"
              title={t("You are on the best plan", "Vous avez le meilleur plan")}
              aria-label={t("You are on the best plan", "Vous avez le meilleur plan")}
              onClick={(event) => event.preventDefault()}
            >
              {t("Upgrade", "Mettre a niveau")}
            </Button>
          ) : (
            <Button className="px-6" onClick={() => router.push("/dashboard/subscription")}>
              {t("Upgrade", "Mettre a niveau")}
            </Button>
          )}
        </div>
      </section>

      {status && <Alert variant={status.variant}>{status.message}</Alert>}
      {data?.error && !status ? (
        <Alert variant="error">
          {data?.error ||
            t(
              "Team access is restricted to Pro, Growth, Business, and Enterprise plans.",
              "Acces equipe reserve aux plans Pro, Growth, Business et Enterprise."
            )}
        </Alert>
      ) : null}

      <section className="rounded-[28px] border border-border/40 bg-background px-6 py-6 shadow-[0_20px_48px_rgba(15,23,42,0.08)]">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-indigo-600 dark:text-indigo-300">
              {t("Team", "Equipe")}
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-foreground">
              {t("Team members", "Membres")}
            </h2>
          </div>
          <div className="text-xs text-muted-foreground">{seatLabel}</div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <Button
            variant="primary"
            size="sm"
            onClick={() => setShowInvite((value) => !value)}
            disabled={planLabel === "starter" || inviteDisabled}
            className="px-4 bg-indigo-600 text-white shadow-[0_10px_24px_rgba(79,70,229,0.28)] hover:bg-indigo-500"
          >
            <UserPlus className="mr-2 h-4 w-4" />
            {t("Invite new member", "Inviter")}
          </Button>
          <Input
            placeholder={t("Search", "Rechercher")}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="h-9 w-44"
          />
          <select
            value={roleFilter}
            onChange={(event) => setRoleFilter(event.target.value)}
            className="h-9 rounded-lg border border-input bg-background px-3 text-sm text-foreground"
          >
            <option value="all">{t("All roles", "Tous les roles")}</option>
            <option value="owner">{t("Owner", "Owner")}</option>
            <option value="admin">{t("Admin", "Admin")}</option>
            <option value="member">{t("Member", "Membre")}</option>
          </select>
          {planLabel === "starter" ? (
            <span className="text-xs text-muted-foreground">{planCopy.starter}</span>
          ) : typeof seatLimit === "number" && seatsUsed >= seatLimit ? (
            <span className="text-xs text-muted-foreground">{planCopy.pro}</span>
          ) : null}
        </div>

        {showInvite && planLabel !== "starter" ? (
          <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_180px_auto] sm:items-end">
            <Input
              label={t("Email", "Email")}
              placeholder="name@company.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              type="email"
              required
              disabled={inviteDisabled}
            />
            <div className="flex flex-col gap-1 text-sm">
              <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                {t("Role", "Role")}
              </span>
              <select
                value={role}
                onChange={(event) => setRole(event.target.value)}
                className="h-10 rounded-lg border border-input bg-background px-3 text-sm text-foreground"
                disabled={inviteDisabled}
              >
                <option value="member">{t("Member", "Membre")}</option>
                <option value="admin">{t("Admin", "Admin")}</option>
              </select>
            </div>
            <Button onClick={handleInvite} loading={saving} className="w-full sm:w-auto" disabled={inviteDisabled}>
              <UserPlus className="mr-2 h-4 w-4" />
              {t("Add member", "Ajouter")}
            </Button>
          </div>
        ) : null}

        <div className="mt-4 rounded-2xl border border-border/60 bg-background">
          {isLoading && <p className="px-4 py-3 text-sm text-muted-foreground">{t("Loading...", "Chargement...")}</p>}
          {!isLoading && canLoad && filteredMembers.length === 0 ? (
            <p className="px-4 py-3 text-sm text-muted-foreground">
              {query || roleFilter !== "all"
                ? t("No team members found.", "Aucun membre trouve.")
                : t("No members yet.", "Aucun membre pour le moment.")}
            </p>
          ) : null}
          {!isLoading && filteredMembers.length > 0 ? (
            <Table columns={columns as any} data={filteredMembers} keyExtractor={(row) => row.id} />
          ) : null}
        </div>
      </section>
    </div>
  );
}
