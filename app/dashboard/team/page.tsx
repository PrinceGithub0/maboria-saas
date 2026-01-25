"use client";

import { useState } from "react";
import useSWR from "swr";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Table } from "@/components/ui/table";
import { useLanguage } from "@/components/providers/language-provider";

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
  const [status, setStatus] = useState<{ message: string; variant: "info" | "success" | "warning" | "error" } | null>(null);
  const [saving, setSaving] = useState(false);

  const businessName = data?.business?.name || t("Your workspace", "Votre espace");
  const canLoad = !error && !data?.error;

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
      render: (member: TeamMember) => member.user?.name || member.user?.email || "—",
    },
    {
      key: "email",
      label: t("Email", "Email"),
      render: (member: TeamMember) => member.user?.email || "—",
    },
    {
      key: "userId",
      label: t("User ID", "ID utilisateur"),
      render: (member: TeamMember) => member.user?.publicId || "—",
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
        <Button
          variant="outline"
          size="sm"
          disabled={saving}
          onClick={() => handleRemove(member.id)}
        >
          {t("Remove", "Retirer")}
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6 max-md:space-y-7">
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-indigo-600 dark:text-indigo-300">
          {t("Team", "Equipe")}
        </p>
        <h1 className="text-3xl font-semibold text-foreground">
          {t("Team members", "Membres de l equipe")}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t(
            "Invite existing users to collaborate in your workspace.",
            "Invitez des utilisateurs existants pour collaborer dans votre espace."
          )}
        </p>
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
          <span className="text-xs text-muted-foreground">
            {seatLimit === null
              ? t("Unlimited seats on Enterprise", "Places illimitees sur Enterprise")
              : typeof seatLimit === "number"
              ? t(
                  `Limit: ${seatLimit} seats on your plan`,
                  `Limite: ${seatLimit} places sur votre plan`
                )
              : t("Limit: 3 seats on Pro", "Limite: 3 places sur Pro")}
          </span>
        }
      >
        <div className="grid gap-4 sm:grid-cols-[1fr_160px_auto] sm:items-end">
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
            {t("Add member", "Ajouter")}
          </Button>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          {t(
            "Members must already have a Maboria account.",
            "Les membres doivent deja avoir un compte Maboria."
          )}
        </p>
      </Card>

      <Card title={t("Workspace", "Espace")}>
        <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
          <span className="text-xs uppercase tracking-[0.2em] text-slate-500">{t("Name", "Nom")}</span>
          <span className="font-semibold text-foreground">{businessName}</span>
        </div>
      </Card>

      <Card title={t("Members", "Membres")}>
        {isLoading && <p className="text-sm text-muted-foreground">{t("Loading...", "Chargement...")}</p>}
        {!isLoading && canLoad && members.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("No members yet.", "Aucun membre pour le moment.")}</p>
        ) : null}
        {!isLoading && members.length > 0 ? (
          <Table
            columns={columns as any}
            data={members}
            keyExtractor={(row) => row.id}
          />
        ) : null}
      </Card>
    </div>
  );
}
