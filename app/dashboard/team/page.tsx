"use client";

import { useState } from "react";
import useSWR from "swr";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Table } from "@/components/ui/table";
import { useLanguage } from "@/components/providers/language-provider";
import { Badge } from "@/components/ui/badge";
import { Crown, ShieldCheck, Sparkles, Users, UserPlus, Zap } from "lucide-react";

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
  const members: TeamMember[] = Array.isArray(data?.members) ? data.members : [];
  const seatLimit =
    typeof data?.seatLimit === "number" ? data.seatLimit : data?.seatLimit === null ? null : undefined;
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("member");
  const [status, setStatus] = useState<{
    message: string;
    variant: "info" | "success" | "warning" | "error";
  } | null>(null);
  const [saving, setSaving] = useState(false);

  const businessName = data?.business?.name || t("Your workspace", "Votre espace");
  const canLoad = !error && !data?.error;
  const seatLabel =
    seatLimit === null
      ? t("Unlimited seats on your plan", "Places illimitees sur votre plan")
      : typeof seatLimit === "number"
        ? t(`Up to ${seatLimit} seats on your plan`, `Jusqu a ${seatLimit} places sur votre plan`)
        : t("Plan includes team seats", "Votre plan inclut des places");
  const teamSignals = [
    {
      title: t("Clear ownership", "Ownership clair"),
      body: t("Defined roles for smooth delivery and QA.", "Roles definis pour delivery et QA."),
    },
    {
      title: t("Secure collaboration", "Collaboration securisee"),
      body: t("Role-based access and audit trails.", "Acces par role et audit trails."),
    },
    {
      title: t("Flexible coverage", "Couverture flexible"),
      body: t("Scale support as your team grows.", "Support evolutif avec votre equipe."),
    },
    {
      title: t("Shared visibility", "Visibilite partagee"),
      body: t("Weekly updates and transparent KPIs.", "Updates hebdo et KPIs transparents."),
    },
  ];
  const roles = [
    { title: t("Owner", "Owner"), body: t("Full access, billing, and governance.", "Acces total, facturation, gouvernance.") },
    { title: t("Admin", "Admin"), body: t("Manage members and workflows.", "Gere membres et workflows.") },
    { title: t("Member", "Membre"), body: t("Execute tasks with scoped permissions.", "Execute avec permissions limitees.") },
  ];

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
        return value.charAt(0).toUpperCase() + value.slice(1);
      },
    },
    {
      key: "actions",
      label: t("Actions", "Actions"),
      render: (member: TeamMember) => (
        <Button variant="outline" size="sm" disabled={saving} onClick={() => handleRemove(member.id)}>
          {t("Remove", "Retirer")}
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6 max-md:space-y-7">
      <div className="rounded-3xl border border-border/60 bg-muted/40 p-6 shadow-[0_24px_60px_rgba(15,23,42,0.12)]">
        <div className="flex flex-wrap items-center gap-3 text-xs uppercase tracking-[0.2em] text-indigo-600 dark:text-indigo-300">
          <Users className="h-4 w-4" />
          {t("Team", "Equipe")}
        </div>
        <div className="mt-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-semibold text-foreground">{t("Team members", "Membres de l equipe")}</h1>
            <p className="text-sm text-muted-foreground">
              {t(
                "Invite teammates, set roles, and keep collaboration smooth as you scale.",
                "Invitez des coequipiers, definissez les roles et collaborez en douceur."
              )}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="success">{t("Team-ready", "Equipe prete")}</Badge>
            <Badge variant="country">{t("Secure by default", "Securise par defaut")}</Badge>
            <Badge variant="warning">{seatLabel}</Badge>
          </div>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {teamSignals.map((signal) => (
            <div key={signal.title} className="rounded-2xl border border-border/60 bg-background px-4 py-3">
              <p className="text-sm font-semibold text-foreground">{signal.title}</p>
              <p className="mt-2 text-xs text-muted-foreground">{signal.body}</p>
            </div>
          ))}
        </div>
      </div>

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

      <Card
        title={t("Invite a team member", "Inviter un membre")}
        actions={
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Crown className="h-4 w-4 text-amber-500" />
            <span>{seatLabel}</span>
          </div>
        }
      >
        <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-[1fr_180px_auto] sm:items-end">
              <Input
                label={t("Email", "Email")}
                placeholder="name@company.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                type="email"
                required
              />
              <div className="flex flex-col gap-1 text-sm">
                <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                  {t("Role", "Role")}
                </span>
                <select
                  value={role}
                  onChange={(event) => setRole(event.target.value)}
                  className="h-10 rounded-lg border border-input bg-background px-3 text-sm text-foreground"
                >
                  <option value="member">{t("Member", "Membre")}</option>
                  <option value="admin">{t("Admin", "Admin")}</option>
                </select>
              </div>
              <Button onClick={handleInvite} loading={saving} className="w-full sm:w-auto">
                <UserPlus className="mr-2 h-4 w-4" />
                {t("Add member", "Ajouter")}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {t(
                "Members must already have a Maboria account.",
                "Les membres doivent deja avoir un compte Maboria."
              )}
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {roles.map((roleItem) => (
              <div key={roleItem.title} className="rounded-2xl border border-border/60 bg-muted/40 p-4">
                <p className="text-sm font-semibold text-foreground">{roleItem.title}</p>
                <p className="mt-2 text-xs text-muted-foreground">{roleItem.body}</p>
              </div>
            ))}
          </div>
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-[1.2fr_0.8fr]">
        <Card title={t("Workspace", "Espace")}>
          <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            <span className="text-xs uppercase tracking-[0.2em] text-slate-500">{t("Name", "Nom")}</span>
            <span className="font-semibold text-foreground">{businessName}</span>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-border/60 bg-muted/40 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <ShieldCheck className="h-4 w-4 text-emerald-500" />
                {t("Governance ready", "Gouvernance prete")}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {t(
                  "Role-based access, audit trails, and secure onboarding.",
                  "Acces par role, audit trails, onboarding securise."
                )}
              </p>
            </div>
            <div className="rounded-2xl border border-border/60 bg-muted/40 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Zap className="h-4 w-4 text-indigo-500" />
                {t("Delivery rhythm", "Rythme delivery")}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {t(
                  "Weekly milestones, QBRs, and performance reporting.",
                  "Jalons hebdo, QBRs, reporting performance."
                )}
              </p>
            </div>
          </div>
        </Card>
        <Card title={t("Team operating model", "Modele d operation equipe")}>
          <div className="space-y-3 text-sm text-muted-foreground">
            <div className="flex items-start gap-3 rounded-2xl border border-border/60 bg-muted/40 p-4">
              <Sparkles className="mt-1 h-4 w-4 text-indigo-500" />
              <div>
                <p className="text-sm font-semibold text-foreground">{t("Onboarding", "Onboarding")}</p>
                <p className="text-xs text-muted-foreground">
                  {t(
                    "Access setup, workspace standards, and first-week delivery plan.",
                    "Acces, standards, et plan delivery semaine 1."
                  )}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-2xl border border-border/60 bg-muted/40 p-4">
              <Users className="mt-1 h-4 w-4 text-emerald-500" />
              <div>
                <p className="text-sm font-semibold text-foreground">{t("Weekly cadence", "Cadence hebdo")}</p>
                <p className="text-xs text-muted-foreground">
                  {t("KPIs, deliverables, and executive-ready updates.", "KPIs, livrables, et updates executives.")}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-2xl border border-border/60 bg-muted/40 p-4">
              <ShieldCheck className="mt-1 h-4 w-4 text-amber-500" />
              <div>
                <p className="text-sm font-semibold text-foreground">{t("Governance", "Gouvernance")}</p>
                <p className="text-xs text-muted-foreground">
                  {t("Decision logs, auditability, and access reviews.", "Decision logs, auditabilite, et revues acces.")}
                </p>
              </div>
            </div>
          </div>
        </Card>
      </div>

      <Card title={t("Members", "Membres")}>
        {isLoading && <p className="text-sm text-muted-foreground">{t("Loading...", "Chargement...")}</p>}
        {!isLoading && canLoad && members.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("No members yet.", "Aucun membre pour le moment.")}</p>
        ) : null}
        {!isLoading && members.length > 0 ? (
          <Table columns={columns as any} data={members} keyExtractor={(row) => row.id} />
        ) : null}
      </Card>
    </div>
  );
}
