import { enGB, fr, de, es, pt } from "date-fns/locale";
import { getLocalizedText, type Language, type LocalizedText } from "@/lib/i18n";

type TeamParticipant = {
  name?: string | null;
  email?: string | null;
} | null | undefined;

type TeamActivityLike = {
  actionType?: string | null;
  actor?: TeamParticipant;
  target?: TeamParticipant;
  metadata?: Record<string, unknown> | null;
};

const TEAM_ROLE_LABELS: Record<string, LocalizedText> = {
  owner: { en: "Owner", fr: "Proprietaire", de: "Inhaber", es: "Propietario", pt: "Proprietário" },
  admin: { en: "Admin", fr: "Admin", de: "Admin", es: "Administrador", pt: "Administrador" },
  billing_admin: {
    en: "Billing Admin",
    fr: "Admin facturation",
    de: "Abrechnungsadmin",
    es: "Admin de facturación",
    pt: "Admin de faturação",
  },
  member: { en: "Member", fr: "Membre", de: "Mitglied", es: "Miembro", pt: "Membro" },
};

const TEAM_ACTION_LABELS: Record<string, LocalizedText> = {
  INVITE_CREATED: {
    en: "Invite created",
    fr: "Invitation creee",
    de: "Einladung erstellt",
    es: "Invitacion creada",
    pt: "Convite criado",
  },
  INVITE_ACCEPTED: {
    en: "Invite accepted",
    fr: "Invitation acceptee",
    de: "Einladung angenommen",
    es: "Invitacion aceptada",
    pt: "Convite aceite",
  },
  INVITE_CANCELED: {
    en: "Invite canceled",
    fr: "Invitation annulee",
    de: "Einladung storniert",
    es: "Invitacion cancelada",
    pt: "Convite cancelado",
  },
  MEMBER_REMOVED: {
    en: "Member removed",
    fr: "Membre retire",
    de: "Mitglied entfernt",
    es: "Miembro eliminado",
    pt: "Membro removido",
  },
  MEMBER_PROMOTED_TO_ADMIN: {
    en: "Promoted to admin",
    fr: "Promu admin",
    de: "Zu Admin befordert",
    es: "Ascendido a administrador",
    pt: "Promovido a administrador",
  },
  ADMIN_DEMOTED_TO_MEMBER: {
    en: "Changed to member",
    fr: "Passe membre",
    de: "Zu Mitglied geändert",
    es: "Convertido en miembro",
    pt: "Alterado para membro",
  },
  MEMBER_PROMOTED_TO_BILLING_ADMIN: {
    en: "Billing admin assigned",
    fr: "Admin facturation attribue",
    de: "Abrechnungsadmin zugewiesen",
    es: "Admin de facturación asignado",
    pt: "Admin de faturação atribuido",
  },
  BILLING_ADMIN_CHANGED: {
    en: "Billing role changed",
    fr: "Role facturation modifie",
    de: "Abrechnungsrolle geändert",
    es: "Rol de facturación cambiado",
    pt: "Função de faturação alterada",
  },
  MEMBER_ROLE_CHANGED: {
    en: "Role changed",
    fr: "Role modifie",
    de: "Rolle geändert",
    es: "Rol cambiado",
    pt: "Função alterada",
  },
};

const TEAM_SERVER_MESSAGES: Record<string, LocalizedText> = {
  Unauthorized: { en: "Unauthorized", fr: "Non autorise", de: "Nicht autorisiert", es: "No autorizado", pt: "Não autorizado" },
  "Failed to load team": {
    en: "Failed to load team.",
    fr: "Impossible de charger l équipe.",
    de: "Team konnte nicht geladen werden.",
    es: "No se pudo cargar el equipo.",
    pt: "Não foi poss?vel carregar a equipa.",
  },
  "Failed to load team activity": {
    en: "Failed to load team activity.",
    fr: "Impossible de charger l activité de l équipe.",
    de: "Teamaktivität konnte nicht geladen werden.",
    es: "No se pudo cargar la actividad del equipo.",
    pt: "Não foi poss?vel carregar a atividade da equipa.",
  },
  "Only owners can assign Billing Admin.": {
    en: "Only owners can assign Billing Admin.",
    fr: "Seuls les proprietaires peuvent attribuer le role Admin facturation.",
    de: "Nur Inhaber können den Abrechnungsadmin zuweisen.",
    es: "Solo los propietarios pueden asignar el rol de admin de facturación.",
    pt: "Apenas os proprietarios podem atribuir o papel de admin de faturação.",
  },
  "Admins can invite members only.": {
    en: "Admins can invite members only.",
    fr: "Les admins peuvent inviter uniquement des membres.",
    de: "Admins können nur Mitglieder einladen.",
    es: "Los administradores solo pueden invitar miembros.",
    pt: "Os administradores so podem convidar membros.",
  },
  "Team seat limit reached.": {
    en: "Team seat limit reached.",
    fr: "La limite de places de l équipe est atteinte.",
    de: "Das Team-Sitzlimit ist erreicht.",
    es: "Se alcanzo el limite de plazas del equipo.",
    pt: "O limite de lugares da equipa foi atingido.",
  },
  "Platform roles cannot be attached to a tenant.": {
    en: "Platform roles cannot be attached to a workspace.",
    fr: "Les roles de plateforme ne peuvent pas être rattaches a un espace de travail.",
    de: "Plattformrollen können keinem Workspace zugewiesen werden.",
    es: "Los roles de plataforma no pueden vincularse a un espacio de trabajo.",
    pt: "Os papeis da plataforma não podem ser associados a um espa?o de trabalho.",
  },
  "Invalid request payload.": {
    en: "Invalid request payload.",
    fr: "Requête invalide.",
    de: "Ungültige Anfrage.",
    es: "Solicitud no valida.",
    pt: "Pedido invalido.",
  },
  "Invite failed.": {
    en: "Invite failed.",
    fr: "L'invitation a échoué.",
    de: "Einladung fehlgeschlagen.",
    es: "La invitacion ha fallado.",
    pt: "O convite falhou.",
  },
  "Pending invite not found.": {
    en: "Pending invite not found.",
    fr: "Invitation en attente introuvable.",
    de: "Ausstehende Einladung nicht gefunden.",
    es: "No se encontro la invitacion pendiente.",
    pt: "Convite pendente não encontrado.",
  },
  "Member not found.": {
    en: "Member not found.",
    fr: "Membre introuvable.",
    de: "Mitglied nicht gefunden.",
    es: "Miembro no encontrado.",
    pt: "Membro não encontrado.",
  },
  "You do not have permission to resend invites.": {
    en: "You do not have permission to resend invites.",
    fr: "Vous n'avez pas l autorisation de renvoyer des invitations.",
    de: "Du hast keine Berechtigung, Einladungen erneut zu senden.",
    es: "No tienes permiso para reenviar invitaciones.",
    pt: "Não tens permissao para reenviar convites.",
  },
  "You do not have permission for this role change.": {
    en: "You do not have permission for this role change.",
    fr: "Vous n'avez pas l autorisation pour ce changement de role.",
    de: "Du hast keine Berechtigung für diese Rollenänderung.",
    es: "No tienes permiso para este cambio de rol.",
    pt: "Não tens permissao para esta alteração de papel.",
  },
  "Update failed.": {
    en: "Update failed.",
    fr: "La mise ? jour a ?chou?.",
    de: "Aktualisierung fehlgeschlagen.",
    es: "La actualización ha fallado.",
    pt: "A atualiza??o falhou.",
  },
  "Owner cannot be removed.": {
    en: "Owner cannot be removed.",
    fr: "Le proprietaire ne peut pas être retire.",
    de: "Der Inhaber kann nicht entfernt werden.",
    es: "No se puede eliminar al propietario.",
    pt: "O proprietário não pode ser removido.",
  },
  "Admins can remove members only.": {
    en: "Admins can remove members only.",
    fr: "Les admins peuvent retirer uniquement des membres.",
    de: "Admins können nur Mitglieder entfernen.",
    es: "Los administradores solo pueden eliminar miembros.",
    pt: "Os administradores so podem remover membros.",
  },
  "Remove failed.": {
    en: "Remove failed.",
    fr: "La suppression a échoué.",
    de: "Entfernen fehlgeschlagen.",
    es: "La eliminacion ha fallado.",
    pt: "A remocao falhou.",
  },
  "You do not have permission to view team activity.": {
    en: "You do not have permission to view team activity.",
    fr: "Vous n'avez pas l autorisation de voir l activité de l équipe.",
    de: "Du hast keine Berechtigung, die Teamaktivität anzusehen.",
    es: "No tienes permiso para ver la actividad del equipo.",
    pt: "Não tens permissao para ver a atividade da equipa.",
  },
  "Team information unavailable.": {
    en: "Team information unavailable.",
    fr: "Informations de l équipe indisponibles.",
    de: "Teaminformationen nicht verfügbar.",
    es: "Información del equipo no disponible.",
    pt: "Informações da equipa indisponiveis.",
  },
  "Activity history unavailable.": {
    en: "Activity history unavailable.",
    fr: "Historique d activité indisponible.",
    de: "Aktivitätsverlauf nicht verfügbar.",
    es: "Historial de actividad no disponible.",
    pt: "Histórico de atividade indispon?vel.",
  },
  "Please sign in first.": {
    en: "Please sign in first.",
    fr: "Veuillez d'abord vous connecter.",
    de: "Bitte melde dich zuerst an.",
    es: "Inicia sesión primero.",
    pt: "Inicia sessão primeiro.",
  },
  "That user is already on your team.": {
    en: "That user is already on your team.",
    fr: "Cet utilisateur fait déjà partie de votre équipe.",
    de: "Diese Person ist bereits in deinem Team.",
    es: "Ese usuario ya forma parte de tu equipo.",
    pt: "Esse utilizador ja faz parte da tua equipa.",
  },
};

function participantLabel(participant: TeamParticipant, fallback: LocalizedText, language: Language) {
  return participant?.name || participant?.email || getLocalizedText(fallback, language);
}

export function getTeamDateLocale(language: Language) {
  switch (language) {
    case "fr":
      return fr;
    case "de":
      return de;
    case "es":
      return es;
    case "pt":
      return pt;
    default:
      return enGB;
  }
}

export function getTeamRoleLabel(role: string | null | undefined, language: Language) {
  const normalized = String(role || "member").trim().toLowerCase();
  const label =
    TEAM_ROLE_LABELS[normalized] || {
      en: normalized ? normalized.charAt(0).toUpperCase() + normalized.slice(1) : "Member",
      fr: normalized ? normalized.charAt(0).toUpperCase() + normalized.slice(1) : "Membre",
      de: normalized ? normalized.charAt(0).toUpperCase() + normalized.slice(1) : "Mitglied",
      es: normalized ? normalized.charAt(0).toUpperCase() + normalized.slice(1) : "Miembro",
      pt: normalized ? normalized.charAt(0).toUpperCase() + normalized.slice(1) : "Membro",
    };
  return getLocalizedText(label, language);
}

export function getTeamPlanLabel(plan: string | null | undefined, language: Language) {
  const normalized = String(plan || "").toLowerCase();
  switch (normalized) {
    case "starter":
      return getLocalizedText({ en: "Starter", fr: "Starter", de: "Starter", es: "Starter", pt: "Starter" }, language);
    case "pro":
      return getLocalizedText({ en: "Pro", fr: "Pro", de: "Pro", es: "Pro", pt: "Pro" }, language);
    case "growth":
      return getLocalizedText({ en: "Growth", fr: "Growth", de: "Growth", es: "Growth", pt: "Growth" }, language);
    case "business":
      return getLocalizedText({ en: "Business", fr: "Business", de: "Business", es: "Business", pt: "Business" }, language);
    case "enterprise":
      return getLocalizedText({ en: "Enterprise", fr: "Enterprise", de: "Enterprise", es: "Enterprise", pt: "Enterprise" }, language);
    default:
      return "";
  }
}

export function getTeamActivityActionLabel(actionType: string | null | undefined, language: Language) {
  const normalized = String(actionType || "").trim().toUpperCase();
  return getLocalizedText(
    TEAM_ACTION_LABELS[normalized] || {
      en: "Team update",
      fr: "Mise ? jour de l équipe",
      de: "Team-Aktualisierung",
      es: "Actualización del equipo",
      pt: "Atualiza??o da equipa",
    },
    language
  );
}

export function localizeTeamServerMessage(message: unknown, language: Language, fallback?: string | null) {
  const normalized = String(message || "").trim();
  if (!normalized) return fallback || "";
  const translated = TEAM_SERVER_MESSAGES[normalized];
  if (translated) return getLocalizedText(translated, language);
  return fallback || normalized;
}

export function localizeTeamActivityMessage(entry: TeamActivityLike, language: Language) {
  const actionType = String(entry.actionType || "").trim().toUpperCase();
  const actor = participantLabel(entry.actor, { en: "Someone", fr: "Quelqu un", de: "Jemand", es: "Alguien", pt: "Alguem" }, language);
  const targetParticipant =
    entry.target?.name || entry.target?.email
      ? entry.target
      : {
          name: typeof entry.metadata?.name === "string" ? entry.metadata.name : null,
          email: typeof entry.metadata?.email === "string" ? entry.metadata.email : null,
        };
  const target = participantLabel(
    targetParticipant,
    { en: "a teammate", fr: "un collegue", de: "ein Teammitglied", es: "un companero", pt: "um colega" },
    language
  );
  const toRole = getTeamRoleLabel(typeof entry.metadata?.toRole === "string" ? entry.metadata.toRole : "member", language);

  switch (actionType) {
    case "INVITE_CREATED":
      return getLocalizedText(
        {
          en: `${actor} invited ${target}`,
          fr: `${actor} a invite ${target}`,
          de: `${actor} hat ${target} eingeladen`,
          es: `${actor} invito a ${target}`,
          pt: `${actor} convidou ${target}`,
        },
        language
      );
    case "INVITE_ACCEPTED":
      return getLocalizedText(
        {
          en: `${target} joined the workspace`,
          fr: `${target} a rejoint l espace de travail`,
          de: `${target} ist dem Workspace beigetreten`,
          es: `${target} se unio al espacio de trabajo`,
          pt: `${target} entrou no espaco de trabalho`,
        },
        language
      );
    case "INVITE_CANCELED":
      return getLocalizedText(
        {
          en: `${actor} canceled ${target}'s invitation`,
          fr: `${actor} a annule l invitation de ${target}`,
          de: `${actor} hat die Einladung von ${target} storniert`,
          es: `${actor} cancelo la invitacion de ${target}`,
          pt: `${actor} cancelou o convite de ${target}`,
        },
        language
      );
    case "MEMBER_REMOVED":
      return getLocalizedText(
        {
          en: `${actor} removed ${target}`,
          fr: `${actor} a retire ${target}`,
          de: `${actor} hat ${target} entfernt`,
          es: `${actor} elimino a ${target}`,
          pt: `${actor} removeu ${target}`,
        },
        language
      );
    case "MEMBER_PROMOTED_TO_ADMIN":
      return getLocalizedText(
        {
          en: `${actor} changed ${target} role to ${getTeamRoleLabel("admin", language)}`,
          fr: `${actor} a change le role de ${target} en ${getTeamRoleLabel("admin", language)}`,
          de: `${actor} hat die Rolle von ${target} zu ${getTeamRoleLabel("admin", language)} geandert`,
          es: `${actor} cambio el rol de ${target} a ${getTeamRoleLabel("admin", language)}`,
          pt: `${actor} alterou o papel de ${target} para ${getTeamRoleLabel("admin", language)}`,
        },
        language
      );
    case "ADMIN_DEMOTED_TO_MEMBER":
      return getLocalizedText(
        {
          en: `${actor} changed ${target} role to ${getTeamRoleLabel("member", language)}`,
          fr: `${actor} a change le role de ${target} en ${getTeamRoleLabel("member", language)}`,
          de: `${actor} hat die Rolle von ${target} zu ${getTeamRoleLabel("member", language)} geandert`,
          es: `${actor} cambio el rol de ${target} a ${getTeamRoleLabel("member", language)}`,
          pt: `${actor} alterou o papel de ${target} para ${getTeamRoleLabel("member", language)}`,
        },
        language
      );
    case "MEMBER_PROMOTED_TO_BILLING_ADMIN":
      return getLocalizedText(
        {
          en: `${actor} changed ${target} role to ${getTeamRoleLabel("billing_admin", language)}`,
          fr: `${actor} a change le role de ${target} en ${getTeamRoleLabel("billing_admin", language)}`,
          de: `${actor} hat die Rolle von ${target} zu ${getTeamRoleLabel("billing_admin", language)} geandert`,
          es: `${actor} cambio el rol de ${target} a ${getTeamRoleLabel("billing_admin", language)}`,
          pt: `${actor} alterou o papel de ${target} para ${getTeamRoleLabel("billing_admin", language)}`,
        },
        language
      );
    case "BILLING_ADMIN_CHANGED":
    case "MEMBER_ROLE_CHANGED":
      return getLocalizedText(
        {
          en: `${actor} changed ${target} role to ${toRole}`,
          fr: `${actor} a change le role de ${target} en ${toRole}`,
          de: `${actor} hat die Rolle von ${target} zu ${toRole} geandert`,
          es: `${actor} cambio el rol de ${target} a ${toRole}`,
          pt: `${actor} alterou o papel de ${target} para ${toRole}`,
        },
        language
      );
    default:
      return getLocalizedText(
        {
          en: `${actor} updated team access`,
          fr: `${actor} a mis a jour les acces de l equipe`,
          de: `${actor} hat den Teamzugriff aktualisiert`,
          es: `${actor} actualizo el acceso del equipo`,
          pt: `${actor} atualizou o acesso da equipa`,
        },
        language
      );
  }
}
