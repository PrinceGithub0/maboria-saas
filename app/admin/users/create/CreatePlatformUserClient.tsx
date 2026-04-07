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
import { useLanguage } from "@/components/providers/language-provider";
import type {
  IdentityAccessRole,
  IdentityAccessStatus,
  IdentityCreateMetadataResponse,
  IdentityCreateUserResponse,
} from "@/lib/admin/users-types";
import type { CompleteLocalizedText } from "@/lib/i18n";

type TenantRole = "" | "OWNER" | "ADMIN" | "MEMBER" | "BILLING_ADMIN";

const text = (en: string, fr: string, de: string, es: string, pt: string): CompleteLocalizedText => ({ en, fr, de, es, pt });

const ROLE_LABELS: Record<IdentityAccessRole, CompleteLocalizedText> = {
  SUPER_ADMIN: text("Super Admin", "Super Admin", "Super-Admin", "Superadministrador", "Super Admin"),
  OPS_ADMIN: text("Ops Admin", "Admin Ops", "Ops-Admin", "Admin de operaciónes", "Admin de operações"),
  USER: text("Subscriber", "Abonne", "Abonnent", "Suscriptor", "Subscritor"),
};

const STATUS_LABELS: Record<IdentityAccessStatus, CompleteLocalizedText> = {
  ACTIVE: text("Active", "Actif", "Aktiv", "Activo", "Ativo"),
  DISABLED: text("Disabled", "D?sactiv?", "Deaktiviert", "Deshabilitado", "Desativado"),
  SUSPENDED: text("Suspended", "Suspendu", "Gesperrt", "Suspendido", "Suspenso"),
  PENDING: text("Pending", "En attente", "Ausstehend", "Pendiente", "Pendente"),
};

const TENANT_ROLE_LABELS: Record<Exclude<TenantRole, "">, CompleteLocalizedText> = {
  OWNER: text("Owner", "Proprietaire", "Inhaber", "Propietario", "Proprietário"),
  ADMIN: text("Ops Admin", "Admin Ops", "Ops-Admin", "Admin de operaciónes", "Admin de operações"),
  MEMBER: text("Member", "Membre", "Mitglied", "Miembro", "Membro"),
  BILLING_ADMIN: text("Billing Admin", "Admin facturation", "Abrechnungsadmin", "Admin de facturación", "Admin de faturação"),
};

const STATE_LABELS: Record<string, CompleteLocalizedText> = {
  ACTIVE: STATUS_LABELS.ACTIVE,
  DISABLED: STATUS_LABELS.DISABLED,
  SUSPENDED: STATUS_LABELS.SUSPENDED,
  PENDING: STATUS_LABELS.PENDING,
  PAST_DUE: text("Past Due", "En retard", "Ueberfaellig", "Vencido", "Em atraso"),
  CANCELED: text("Canceled", "Annule", "Gekuendigt", "Cancelado", "Cancelado"),
  TRIAL: text("Trial", "Essai", "Testphase", "Prueba", "Teste"),
  NONE: text("None", "Aucun", "Keine", "Ninguno", "Nenhum"),
};

const fetcher = async <T,>(url: string): Promise<T> => {
  const response = await fetch(url, { cache: "no-store" });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(String((payload as { error?: string }).error || `Request failed (${response.status})`));
  }
  return payload as T;
};

function toTitleLabel(value: string) {
  return value.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (m) => m.toUpperCase());
}

function resolveLabel(
  value: string,
  labels: Record<string, CompleteLocalizedText>,
  t: (value: CompleteLocalizedText) => string
) {
  return labels[value] ? t(labels[value]) : toTitleLabel(value);
}

export default function CreatePlatformUserPage() {
  const router = useRouter();
  const { t } = useLanguage();
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
          throw new Error(t("You are not allowed to assign Super Admin.", "Vous n'etes pas autorise a attribuer le role Super Admin.", "Sie duerfen keinen Super-Admin zuweisen.", "No tienes permiso para asignar Super Admin.", "Não tem permissao para atribuir Super Admin."));
        }
        if (failure.code === "STEP_UP_REQUIRED") {
          setStepUpOpen(true);
          throw new Error(t("Step-up verification is required.", "Une verification renforcee est requise.", "Eine erneute Verifizierung ist erforderlich.", "Se requiere verificacion reforzada.", "E necessária verificacao reforcada."));
        }
        if (failure.code === "STEP_UP_INVALID_OR_EXPIRED") {
          setStepUpOpen(true);
          throw new Error(t("Step-up token expired. Verify again.", "Le jeton de verification renforcee a expire. V?rifiez a nouveau.", "Das Verifizierungstoken ist abgelaufen. Bitte erneut bestaetigen.", "El token de verificacion reforzada ha caducado. Verifica de nuevo.", "O token de verificacao reforcada expirou. Verifique novamente."));
        }
        if (failure.code === "EMAIL_ALREADY_EXISTS") {
          throw new Error(t("This email already exists.", "Cet e-mail existe déjà.", "Diese E-Mail-Adresse existiert bereits.", "Este correo ya existe.", "Este e-mail ja existe."));
        }
        throw new Error(String(failure.error || t("Unable to create user.", "Impossible de creer l'utilisateur.", "Benutzer konnte nicht erstellt werden.", "No se pudo crear el usuario.", "Não foi poss?vel criar o utilizador.")));
      }

      const created = payload as IdentityCreateUserResponse;
      setSetupEmailSent(created.setupEmailSent);
      if (created.tempPassword) {
        setCreatedTempPassword(created.tempPassword);
      } else {
        setFeedback({
          variant: created.setupEmailSent ? "success" : "info",
          message: created.setupEmailSent
            ? t("User created and setup email sent.", "Utilisateur cr?e et e-mail de configuration envoy?.", "Benutzer erstellt und Einrichtungs-E-Mail gesendet.", "Usuario creado y correo de configuración enviado.", "Utilizador criado e e-mail de configuração enviado.")
            : t("User created, but setup email failed. Use 'Resend setup email' from the user actions.", "Utilisateur cr?e, mais l'e-mail de configuration a échoué. Utilisez 'Renvoyer l'e-mail de configuration' depuis les actions utilisateur.", "Benutzer wurde erstellt, aber die Einrichtungs-E-Mail ist fehlgeschlagen. Verwenden Sie 'Einrichtungs-E-Mail erneut senden' in den Benutzeraktionen.", "Se creo el usuario, pero fallo el correo de configuración. Usa 'Reenviar correo de configuración' desde las acciones del usuario.", "O utilizador foi criado, mas o e-mail de configuração falhou. Utilize 'Reenviar e-mail de configuração' nas ações do utilizador."),
        });
        window.setTimeout(() => router.push("/admin/users"), 1200);
      }
    } catch (submitError) {
      setFeedback({
        variant: "error",
        message: submitError instanceof Error ? submitError.message : t("Unable to create user.", "Impossible de creer l'utilisateur.", "Benutzer konnte nicht erstellt werden.", "No se pudo crear el usuario.", "Não foi poss?vel criar o utilizador."),
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
        message: t("Tenant role is required when tenant workspace is selected.", "Le role locataire est requis lorsqu'un espace de travail locataire est selectionne.", "Eine Mandantenrolle ist erforderlich, wenn ein Mandantenarbeitsbereich ausgewaehlt ist.", "Se requiere el rol del tenant cuando se selecciona un espacio de trabajo del tenant.", "A função do tenant e obrigatoria quando um espa?o de trabalho do tenant e selecionado."),
      });
      return;
    }

    if (role === "SUPER_ADMIN") {
      if (!superAdminAcknowledge) {
        setFeedback({
          variant: "error",
          message: t("Acknowledgment is required for Super Admin provisioning.", "Une confirmation est requise pour le provisionnement Super Admin.", "Eine Bestaetigung ist fuer die Bereitstellung als Super-Admin erforderlich.", "Se requiere confirmaci?n para aprovisionar Super Admin.", "A confirma??o e obrigatoria para o provisionamento de Super Admin."),
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
      setFeedback({ variant: "error", message: t("Enter your current password for verification.", "Saisissez votre mot de passe actuel pour verification.", "Geben Sie zur Verifizierung Ihr aktuelles Passwort ein.", "Introduce tu contrase?a actual para verificar.", "Introduza a sua palavra-passe atual para verificacao.") });
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
        throw new Error(payload.error || t("Step-up verification failed.", "La verification renforcee a échoué.", "Die erneute Verifizierung ist fehlgeschlagen.", "La verificacion reforzada fallo.", "A verificacao reforcada falhou."));
      }
      setStepUpOpen(false);
      setStepUpPassword("");
      await submit(true, payload.stepUpToken);
    } catch (stepUpError) {
      setFeedback({
        variant: "error",
        message: stepUpError instanceof Error ? stepUpError.message : t("Step-up verification failed.", "La verification renforcee a échoué.", "Die erneute Verifizierung ist fehlgeschlagen.", "La verificacion reforzada fallo.", "A verificacao reforcada falhou."),
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
            <p className="text-xs uppercase tracking-[0.2em] text-indigo-600 dark:text-indigo-300">{t("Ops Admin", "Admin Ops", "Ops-Admin", "Admin de operaciónes", "Admin de operações")}</p>
            <h1 className="text-3xl font-semibold text-foreground">{t("Create Platform User", "Creer un utilisateur plateforme", "Plattformbenutzer erstellen", "Crear usuario de plataforma", "Criar utilizador da plataforma")}</h1>
            <p className="text-sm text-muted-foreground">
              {t("Provision a new identity within the system.", "Provisionnez une nouvelle identite dans le systeme.", "Stellen Sie eine neue Identitaet im System bereit.", "Aprovisiona una nueva identidad dentro del sistema.", "Provisione uma nova identidade no sistema.")}
            </p>
          </div>
          <Button variant="secondary" onClick={() => router.push("/admin/users")}>
            <ArrowLeft className="h-4 w-4" />
            {t("Back to Users", "Retour aux utilisateurs", "Zurueck zu Benutzern", "Volver a usuarios", "Voltar aos utilizadores")}
          </Button>
        </div>
      </section>

      {feedback ? <Alert variant={feedback.variant}>{feedback.message}</Alert> : null}
      {error ? <Alert variant="error">{t("Unable to load provisioning metadata.", "Impossible de charger les metadonnees de provisionnement.", "Bereitstellungsmetadaten konnten nicht geladen werden.", "No se pudieron cargar los metadatos de aprovisionamiento.", "Não foi poss?vel carregar os metadados de provisionamento.")}</Alert> : null}

      <Card title={t("Identity", "Identite", "Identitaet", "Identidad", "Identidade")}>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">{t("Loading provisioning metadata...", "Chargement des metadonnees de provisionnement...", "Bereitstellungsmetadaten werden geladen...", "Cargando metadatos de aprovisionamiento...", "A carregar metadados de provisionamento...")}</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            <Input
              label={t("Full Name", "Nom complet", "Vollstaendiger Name", "Nombre completo", "Nome completo")}
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              placeholder={t("Enter full name", "Saisissez le nom complet", "Vollstaendigen Namen eingeben", "Introduce el nombre completo", "Introduza o nome completo")}
            />
            <Input
              label={t("Email", "E-mail", "E-Mail", "Correo", "E-mail")}
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder={t("user@domain.com", "user@domain.com", "user@domain.com", "user@domain.com", "user@domain.com")}
            />
            <div className="md:col-span-2">
              {checkingEmail ? (
                <p className="text-xs text-muted-foreground">{t("Checking email availability...", "Verification de la disponibilite de l'e-mail...", "E-Mail-Verfuegbarkeit wird geprueft...", "Comprobando disponibilidad del correo...", "A verificar disponibilidade do e-mail...")}</p>
              ) : emailExists ? (
                <p className="text-xs font-medium text-rose-700 dark:text-rose-300">
                  {t("This email is already in use.", "Cet e-mail est déjà utilis?.", "Diese E-Mail-Adresse wird bereits verwendet.", "Este correo ya esta en uso.", "Este e-mail ja esta em uso.")}
                </p>
              ) : email.trim() ? (
                <p className="text-xs text-emerald-700 dark:text-emerald-300">{t("Email is available.", "L'e-mail est disponible.", "E-Mail ist verfuegbar.", "El correo esta disponible.", "O e-mail esta disponível.")}</p>
              ) : null}
            </div>
          </div>
        )}
      </Card>

      <Card title={t("Role", "Role", "Rolle", "Rol", "Função")}>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="text-sm text-muted-foreground">
            {t("Global Role", "Role global", "Globale Rolle", "Rol global", "Função global")}
            <select
              value={role}
              onChange={(event) => setRole(event.target.value as IdentityAccessRole)}
              className="mt-1 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground"
            >
              {data?.roleOptions.map((item) => (
                <option key={item} value={item}>
                  {resolveLabel(item, ROLE_LABELS, t)}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm text-muted-foreground">
            {t("Account Status", "Statut du compte", "Kontostatus", "Estado de la cuenta", "Estado da conta")}
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value as IdentityAccessStatus)}
              disabled={sendSetupEmail}
              className="mt-1 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground disabled:opacity-60"
            >
              {data?.statusOptions.map((item) => (
                <option key={item} value={item}>
                  {resolveLabel(item, STATUS_LABELS, t)}
                </option>
              ))}
            </select>
          </label>
        </div>
        {role === "SUPER_ADMIN" ? (
          <div className="mt-3 space-y-2">
            <p className="text-sm font-medium text-rose-700 dark:text-rose-300">
              {t("Creating a super admin grants full platform control.", "Creer un super admin accorde un controle total de la plateforme.", "Das Erstellen eines Super-Admins gewaehert volle Plattformkontrolle.", "Crear un super admin otorga control total de la plataforma.", "Criar um super admin concede controlo total da plataforma.")}
            </p>
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={superAdminAcknowledge}
                onChange={(event) => setSuperAdminAcknowledge(event.target.checked)}
              />
              {t("I understand this grants unrestricted platform access.", "Je comprends que cela accorde un accès sans restriction a la plateforme.", "Ich verstehe, dass dies uneingeschraenkten Plattformzugriff gewaehert.", "Entiendo que esto otorga acceso sin restricciones a la plataforma.", "Compreendo que isto concede acesso irrestrito a plataforma.")}
            </label>
          </div>
        ) : null}
      </Card>

      <Card title={t("Tenant (Optional)", "Locataire (optionnel)", "Mandant (optional)", "Tenant (opcional)", "Tenant (opcional)")}>
        <div className="grid gap-3 md:grid-cols-2">
          <Input
            label={t("Search Tenant", "Rechercher un locataire", "Mandanten suchen", "Buscar tenant", "Pesquisar tenant")}
            value={tenantQuery}
            onChange={(event) => handleTenantQueryChange(event.target.value)}
            placeholder={t("Search workspace by name or tenant ID", "Rechercher un espace de travail par nom ou ID locataire", "Arbeitsbereich nach Namen oder Mandanten-ID suchen", "Buscar espacio de trabajo por nombre o ID del tenant", "Pesquisar area de trabalho por nome ou ID do tenant")}
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
            {t("Tenant Workspace", "Espace de travail locataire", "Mandantenarbeitsbereich", "Espacio de trabajo del tenant", "Espa?o de trabalho do tenant")}
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
              <option value="">{t("No tenant attachment", "Aucun rattachement locataire", "Keine Mandantenzuordnung", "Sin vinculacion a tenant", "Sem associacao a tenant")}</option>
              {filteredTenants.map((tenant) => (
                <option key={tenant.id} value={tenant.id}>
                  {tenant.name}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm text-muted-foreground">
            {t("Tenant Role", "Role locataire", "Mandantenrolle", "Rol del tenant", "Função do tenant")}
            <select
              value={tenantRole}
              onChange={(event) => setTenantRole(event.target.value as TenantRole)}
              disabled={!canAttachTenant || !tenantId}
              className="mt-1 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground disabled:opacity-60"
            >
              <option value="">{t("Select role", "Selectionner un role", "Rolle auswaehlen", "Seleccionar rol", "Selecionar função")}</option>
              <option value="MEMBER">{t(TENANT_ROLE_LABELS.MEMBER)}</option>
              <option value="OPS_ADMIN">{t("Ops Admin", "Admin Ops", "Ops-Admin", "Admin de operaciónes", "Admin de operações")}</option>
              <option value="BILLING_ADMIN">{t(TENANT_ROLE_LABELS.BILLING_ADMIN)}</option>
              <option value="OWNER">{t(TENANT_ROLE_LABELS.OWNER)}</option>
            </select>
          </label>
        </div>
        {!canAttachTenant ? (
          <p className="mt-2 text-xs font-medium text-rose-700 dark:text-rose-300">
            {t("Platform Ops Admins cannot be attached to a tenant workspace.", "Les administrateurs Ops plateforme ne peuvent pas être rattaches a un espace de travail locataire.", "Plattform-Ops-Admins koennen keinem Mandantenarbeitsbereich zugeordnet werden.", "Los administradores de operaciónes de plataforma no pueden vincularse a un espacio de trabajo del tenant.", "Os administradores de operações da plataforma não podem ser associados a um espa?o de trabalho do tenant.")}
          </p>
        ) : null}
        {tenantQuery.trim() && filteredTenants.length === 0 ? (
          <p className="mt-2 text-xs text-muted-foreground">
            {t("No tenant matches your search.", "Aucun locataire ne correspond a votre recherche.", "Kein Mandant entspricht Ihrer Suche.", "Ningun tenant coincide con tu busqueda.", "Nenhum tenant corresponde a sua pesquisa.")}
          </p>
        ) : null}

        {selectedTenant ? (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            <Badge variant="default">{selectedTenant.name}</Badge>
            <Badge variant={selectedTenant.accessStatus === "ACTIVE" ? "success" : "warning"}>
              {t("Access:", "Accès :", "Zugang:", "Acceso:", "Acesso:")} {resolveLabel(selectedTenant.accessStatus, STATE_LABELS, t)}
            </Badge>
            <Badge variant={selectedTenant.subscriptionStatus === "ACTIVE" ? "success" : "warning"}>
              {t("Subscription:", "Abonnement :", "Abonnement:", "Suscripción:", "Subscrição:")} {resolveLabel(selectedTenant.subscriptionStatus || "NONE", STATE_LABELS, t)}
            </Badge>
            <Badge variant="country">
              {t("Seats:", "Places :", "Sitze:", "Plazas:", "Lugares:")} {selectedTenant.seatsUsed}/{selectedTenant.seatLimit ?? t("Unlimited", "Illimit\u00e9", "Unbegrenzt", "Ilimitado", "Ilimitado")}
            </Badge>
          </div>
        ) : null}
      </Card>

      <Card title={t("Security", "Sécurité", "Sicherheit", "Seguridad", "Seguran?a")}>
        <div className="space-y-3">
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={sendSetupEmail}
              onChange={(event) => setSendSetupEmail(event.target.checked)}
              disabled={status === "DISABLED"}
            />
            {t("Send password setup email (recommended)", "Envoyer l'e-mail de configuration du mot de passe (recommande)", "E-Mail zur Passworteinrichtung senden (empfohlen)", "Enviar correo de configuración de contrase?a (recomendado)", "Enviar e-mail de configuração da palavra-passe (recomendado)")}
          </label>
          <p className="text-xs text-muted-foreground">
            {t("If enabled, account status is set to", "Si active, le statut du compte est defini sur", "Wenn aktiviert, wird der Kontostatus auf", "Si esta habilitado, el estado de la cuenta se establece en", "Se ativado, o estado da conta e definido como")} <strong>{t(STATUS_LABELS.PENDING)}</strong> {t("until password setup is completed. If disabled, a temporary password is generated once and must be changed on first login.", "jusqu'a ce que la configuration du mot de passe soit terminée. Si d?sactiv?, un mot de passe temporaire est genere une fois et doit être change lors de la premiere connexion.", "gesetzt, bis die Passworteinrichtung abgeschlossen ist. Wenn deaktiviert, wird einmalig ein temporaeres Passwort generiert, das beim ersten Login geaendert werden muss.", "hasta que se complete la configuración de la contrase?a. Si se deshabilita, se genera una contrase?a temporal una vez y debe cambiarse en el primer inicio de sesión.", "at? que a configuração da palavra-passe esteja conclu?da. Se desativado, e gerada uma palavra-passe temporaria uma vez e deve ser alterada no primeiro inicio de sessão.")}
          </p>
          {!sendSetupEmail ? (
            <p className="text-sm font-medium text-rose-700 dark:text-rose-300">
              {t("Temporary password mode is enabled. Keep generated credentials secure.", "Le mode mot de passe temporaire est active. Conservez les identifiants generes en sécurité.", "Der Modus fuer temporaere Passwoerter ist aktiviert. Bewahren Sie die generierten Zugangsdaten sicher auf.", "El modo de contrase?a temporal esta habilitado. Manten seguras las credenciales generadas.", "O modo de palavra-passe temporaria esta ativado. Mantenha as credenciais geradas em seguran?a.")}
            </p>
          ) : null}
          {status === "DISABLED" ? (
            <p className="text-xs text-muted-foreground">{t("Disabled users cannot receive setup email.", "Les utilisateurs desactives ne peuvent pas recevoir d'e-mail de configuration.", "Deaktivierte Benutzer koennen keine Einrichtungs-E-Mail erhalten.", "Los usuarios deshabilitados no pueden recibir correo de configuración.", "Utilizadores desativados não podem receber e-mail de configuração.")}</p>
          ) : null}
        </div>
      </Card>

      <section className="flex items-center justify-end gap-2">
        <Button variant="secondary" onClick={() => router.push("/admin/users")}>
          {t("Cancel", "Annuler", "Abbrechen", "Cancelar", "Cancelar")}
        </Button>
        <Button onClick={handleCreateClick} disabled={disableSubmit} loading={submitting}>
          <UserPlus className="h-4 w-4" />
          {t("Create User", "Creer l'utilisateur", "Benutzer erstellen", "Crear usuario", "Criar utilizador")}
        </Button>
      </section>

      <ConfirmationModal
        open={superAdminConfirmOpen}
        variant="danger"
        title={t("Grant Super Admin Role", "Accorder le role Super Admin", "Super-Admin-Rolle vergeben", "Otorgar rol de Super Admin", "Conceder função de Super Admin")}
        description={t("This user will have full platform control. This action is audited.", "Cet utilisateur aura un controle total de la plateforme. Cette action est journalisee.", "Dieser Benutzer erhaelt volle Plattformkontrolle. Diese Aktion wird protokolliert.", "Este usuario tendra control total de la plataforma. Esta acción se audita.", "Este utilizador tera controlo total da plataforma. Esta ação e auditada.")}
        confirmLabel={t("Confirm & Create", "Confirmer et creer", "Bestaetigen und erstellen", "Confirmar y crear", "Confirmar e criar")}
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
        title={t("Step-up Verification", "Verification renforcee", "Erneute Verifizierung", "Verificacion reforzada", "Verificacao reforcada")}
      >
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {t("Re-enter your current password to authorize Super Admin creation.", "Saisissez a nouveau votre mot de passe actuel pour autoriser la cr?ation d'un Super Admin.", "Geben Sie Ihr aktuelles Passwort erneut ein, um die Erstellung eines Super-Admins zu autorisieren.", "Vuelve a introducir tu contrase?a actual para autorizar la creacion de Super Admin.", "Volte a introduzir a sua palavra-passe atual para autorizar a criacao de Super Admin.")}
          </p>
          <Input
            label={t("Current Password", "Mot de passe actuel", "Aktuelles Passwort", "Contrase?a actual", "Palavra-passe atual")}
            type="password"
            value={stepUpPassword}
            onChange={(event) => setStepUpPassword(event.target.value)}
            placeholder={t("Enter your password", "Saisissez votre mot de passe", "Passwort eingeben", "Introduce tu contrase?a", "Introduza a sua palavra-passe")}
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setStepUpOpen(false)}>
              {t("Cancel", "Annuler", "Abbrechen", "Cancelar", "Cancelar")}
            </Button>
            <Button onClick={() => void startStepUp()} loading={stepUpLoading}>
              {t("Verify & Continue", "Verifier et continuer", "Pruefen und fortfahren", "Verificar y continuar", "Verificar e continuar")}
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
                <h2 className="text-lg font-semibold text-foreground">{t("Temporary Password Generated", "Mot de passe temporaire genere", "Temporaeres Passwort erstellt", "Contrase?a temporal generada", "Palavra-passe temporaria gerada")}</h2>
                <p className="text-sm text-muted-foreground">
                  {t("Copy this password now. It will not be shown again.", "Copiez ce mot de passe maintenant. Il ne sera plus affiche.", "Kopieren Sie dieses Passwort jetzt. Es wird nicht erneut angezeigt.", "Copia esta contrase?a ahora. No se mostrara de nuevo.", "Copie esta palavra-passe agora. Não sera mostrada novamente.")}
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
                  setFeedback({ variant: "success", message: t("Temporary password copied.", "Mot de passe temporaire copie.", "Temporaeres Passwort kopiert.", "Contrase?a temporal copiada.", "Palavra-passe temporaria copiada.") });
                }}
              >
                <Copy className="h-4 w-4" />
                {t("Copy", "Copier", "Kopieren", "Copiar", "Copiar")}
              </Button>
              <Button onClick={() => router.push("/admin/users")}>
                {t("Continue", "Continuer", "Weiter", "Continuar", "Continuar")}
              </Button>
            </div>
            {setupEmailSent === false ? (
              <p className="mt-3 text-xs text-amber-700 dark:text-amber-300">
                {t("Setup email was not sent. Resend from user actions if needed.", "L'e-mail de configuration n'a pas \u00e9t\u00e9 envoy\u00e9. Renvoyez-le depuis les actions utilisateur si n\u00e9cessaire.", "Die Einrichtungs-E-Mail wurde nicht gesendet. Senden Sie sie bei Bedarf ueber die Benutzeraktionen erneut.", "No se envio el correo de configuraci\u00f3n. Reenvialo desde las acciones del usuario si es necesario.", "O e-mail de configura\u00e7\u00e3o n\u00e3o foi enviado. Reenvie-o a partir das a\u00e7\u00f5es do utilizador se necess\u00e1rio.")}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

    </div>
  );
}
