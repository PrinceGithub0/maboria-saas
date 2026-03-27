import { LANGUAGE_LOCALES, getLocalizedText, type Language, type LocalizedText } from "@/lib/i18n";

export type AdminLocalizedText = Record<Language, string>;

const adminText = (en: string, fr: string, de: string, es: string, pt: string): AdminLocalizedText => ({ en, fr, de, es, pt });

const ADMIN_SERVER_MESSAGES: Array<{ match: RegExp; label: AdminLocalizedText }> = [
  {
    match: /unable to load/i,
    label: {
      en: "Unable to load admin data right now.",
      fr: "Impossible de charger les données d'administration pour le moment.",
      de: "Administrationsdaten können derzeit nicht geladen werden.",
      es: "No se pueden cargar los datos de administración en este momento.",
      pt: "Não foi possivel carregar os dados de administração neste momento.",
    },
  },
  {
    match: /request failed/i,
    label: {
      en: "The admin request failed.",
      fr: "La requête d'administration a échoué.",
      de: "Die Admin-Anfrage ist fehlgeschlagen.",
      es: "La solicitud de administración ha fallado.",
      pt: "O pedido de administração falhou.",
    },
  },
  {
    match: /action failed/i,
    label: {
      en: "The admin action could not be completed.",
      fr: "L'action d'administration n'a pas pu être terminée.",
      de: "Die Admin-Aktion konnte nicht abgeschlossen werden.",
      es: "No se pudo completar la acción de administración.",
      pt: "Não foi possivel concluir a ação de administração.",
    },
  },
  {
    match: /retry/i,
    label: {
      en: "The operation did not succeed. Please try again.",
      fr: "L'operation n'a pas reussi. Veuillez réessayer.",
      de: "Der Vorgang war nicht erfolgreich. Bitte versuche es erneut.",
      es: "La operación no se completo. Intentalo de nuevo.",
      pt: "A operacao não foi concluida. Tente novamente.",
    },
  },
];

const ADMIN_ACTION_LABELS: Record<string, AdminLocalizedText> = {
  SUBSCRIPTION_UPDATED: adminText("Subscription updated", "Abonnement mis a jour", "Abonnement aktualisiert", "Suscripcion actualizada", "Subscricao atualizada"),
  SUBSCRIPTION_UPGRADED: adminText("Tenant upgraded plan", "Le locataire a mis a niveau son forfait", "Mandant hat Plan hochgestuft", "El tenant mejoro su plan", "O tenant atualizou o plano"),
  SUBSCRIPTION_DOWNGRADED: adminText("Tenant downgraded plan", "Le locataire a retrograde son forfait", "Mandant hat Plan herabgestuft", "El tenant redujo su plan", "O tenant reduziu o plano"),
  SUBSCRIPTION_DOWNGRADE_SCHEDULED: adminText("Subscription downgrade scheduled", "Retrogradation d'abonnement planifiee", "Abo-Herabstufung geplant", "Reduccion de suscripcion programada", "Downgrade da subscricao agendado"),
  SUBSCRIPTION_DOWNGRADE_CANCELED: adminText("Subscription downgrade canceled", "Retrogradation d'abonnement annulee", "Abo-Herabstufung abgebrochen", "Reduccion de suscripcion cancelada", "Downgrade da subscricao cancelado"),
  SUBSCRIPTION_DOWNGRADE_APPLIED: adminText("Subscription downgrade applied", "Retrogradation d'abonnement appliquee", "Abo-Herabstufung angewendet", "Reduccion de suscripcion aplicada", "Downgrade da subscricao aplicado"),
  SUBSCRIPTION_PENDING_DOWNGRADES_APPLIED: adminText("Pending downgrades job ran", "Le traitement des retrogradations en attente a ete execute", "Job fuer ausstehende Herabstufungen lief", "Se ejecuto el proceso de reducciones pendientes", "A tarefa de downgrades pendentes foi executada"),
  SUBSCRIPTION_DOWNGRADE_SKIPPED_PROVIDER_MANAGED: adminText("Provider-managed downgrade skipped", "Retrogradation geree par le fournisseur ignoree", "Anbieterverwaltete Herabstufung uebersprungen", "Se omitio la reduccion gestionada por el proveedor", "O downgrade gerido pelo fornecedor foi ignorado"),
  SUBSCRIPTION_CANCELED: adminText("Subscription canceled", "Abonnement annule", "Abonnement gekuendigt", "Suscripcion cancelada", "Subscricao cancelada"),
  SUBSCRIPTION_CANCEL_SCHEDULED: adminText("Subscription cancel scheduled", "Annulation d'abonnement planifiee", "Abo-Kuendigung geplant", "Cancelacion de suscripcion programada", "Cancelamento da subscricao agendado"),
  SUBSCRIPTION_RENEWAL_RESUMED: adminText("Subscription renewal resumed", "Renouvellement d'abonnement repris", "Abo-Verlaengerung fortgesetzt", "Se reanudo la renovacion de suscripcion", "A renovacao da subscricao foi retomada"),
  SUBSCRIPTION_RENEWAL_ATTEMPTED: adminText("Subscription renewal attempted", "Tentative de renouvellement d'abonnement", "Abo-Verlaengerung versucht", "Intento de renovacion de suscripcion", "Tentativa de renovacao da subscricao"),
  SUBSCRIPTION_RENEWALS_PROCESSED: adminText("Subscription renewals processed", "Renouvellements d'abonnement traites", "Abo-Verlaengerungen verarbeitet", "Renovaciones de suscripcion procesadas", "Renovacoes da subscricao processadas"),
  SUBSCRIPTION_PAST_DUE: adminText("Subscription past due", "Abonnement en retard de paiement", "Abonnement ueberfaellig", "Suscripcion vencida", "Subscricao em atraso"),
  SUBSCRIPTION_REVOKED: adminText("Subscription revoked", "Abonnement revoque", "Abonnement widerrufen", "Suscripcion revocada", "Subscricao revogada"),
  SUBSCRIPTION_BACKFILLED_FROM_ORG: adminText("Subscription backfilled from organization", "Abonnement recopie depuis l organisation", "Abonnement aus der Organisation uebernommen", "Suscripcion completada desde la organizacion", "Subscricao preenchida a partir da organizacao"),
  ADMIN_SUBSCRIPTION_CANCELED: adminText("Admin canceled subscription", "L administrateur a annule l abonnement", "Admin hat das Abonnement gekuendigt", "El administrador cancelo la suscripcion", "O administrador cancelou a subscricao"),
  IDENTITY_SUBSCRIPTION_CANCELED: adminText("Identity subscription canceled", "Abonnement d identite annule", "Identitaetsabonnement gekuendigt", "Suscripcion de identidad cancelada", "Subscricao de identidade cancelada"),
  USER_SIGNIN: adminText("User sign-in", "Connexion utilisateur", "Benutzeranmeldung", "Inicio de sesion del usuario", "Inicio de sessao do utilizador"),
  USER_SIGNOUT: adminText("User sign-out", "Deconnexion utilisateur", "Benutzerabmeldung", "Cierre de sesion del usuario", "Fim de sessao do utilizador"),
  INVITE_CREATED: adminText("Team invite created", "Invitation d equipe creee", "Team-Einladung erstellt", "Invitacion de equipo creada", "Convite de equipa criado"),
  INVITE_ACCEPTED: adminText("Team invite accepted", "Invitation d equipe acceptee", "Team-Einladung angenommen", "Invitacion de equipo aceptada", "Convite de equipa aceite"),
  INVITE_CANCELED: adminText("Team invite canceled", "Invitation d equipe annulee", "Team-Einladung storniert", "Invitacion de equipo cancelada", "Convite de equipa cancelado"),
  TEAM_INVITE_ACCEPT_FAILED: adminText("Team invite accept failed", "Echec de l acceptation de l invitation d equipe", "Annahme der Team-Einladung fehlgeschlagen", "Fallo al aceptar la invitacion de equipo", "Falha ao aceitar o convite de equipa"),
  USER_INVITED: adminText("User invited", "Utilisateur invite", "Benutzer eingeladen", "Usuario invitado", "Utilizador convidado"),
  MEMBER_REMOVED: adminText("Member removed", "Membre supprime", "Mitglied entfernt", "Miembro eliminado", "Membro removido"),
  MEMBER_PROMOTED_TO_ADMIN: adminText("Member promoted to admin", "Membre promu administrateur", "Mitglied zum Admin befoerdert", "Miembro ascendido a administrador", "Membro promovido a administrador"),
  ADMIN_DEMOTED_TO_MEMBER: adminText("Admin demoted to member", "Admin retrograde membre", "Admin zum Mitglied herabgestuft", "Administrador degradado a miembro", "Administrador rebaixado a membro"),
  MEMBER_PROMOTED_TO_BILLING_ADMIN: adminText("Member promoted to billing admin", "Membre promu administrateur de facturation", "Mitglied zum Abrechnungsadmin befoerdert", "Miembro ascendido a administrador de facturacion", "Membro promovido a administrador de faturacao"),
  BILLING_ADMIN_CHANGED: adminText("Billing admin changed", "Administrateur de facturation modifie", "Abrechnungsadmin geaendert", "Administrador de facturacion cambiado", "Administrador de faturacao alterado"),
  MEMBER_ROLE_CHANGED: adminText("Member role changed", "Role du membre modifie", "Mitgliederrolle geaendert", "Rol del miembro cambiado", "Papel do membro alterado"),
  TENANT_SUSPENDED: adminText("Tenant suspended", "Locataire suspendu", "Mandant gesperrt", "Tenant suspendido", "Tenant suspenso"),
  TENANT_REACTIVATED: adminText("Tenant reactivated", "Locataire reactive", "Mandant reaktiviert", "Tenant reactivado", "Tenant reativado"),
  "TENANT.SUSPENDED": adminText("Tenant suspended", "Locataire suspendu", "Mandant gesperrt", "Tenant suspendido", "Tenant suspenso"),
  "TENANT.REACTIVATED": adminText("Tenant reactivated", "Locataire reactive", "Mandant reaktiviert", "Tenant reactivado", "Tenant reativado"),
  BUSINESS_SETTINGS_UPDATED: adminText("Business settings updated", "Parametres entreprise mis a jour", "Unternehmenseinstellungen aktualisiert", "Configuracion empresarial actualizada", "Definicoes empresariais atualizadas"),
  PAYOUT_SETTINGS_UPDATED: adminText("Payout settings changed", "Parametres de versement modifies", "Auszahlungseinstellungen geaendert", "Configuracion de pagos cambiada", "Definicoes de pagamento alteradas"),
  PASSWORD_SETUP_SENT: adminText("Password setup sent", "Configuration du mot de passe envoyee", "Passwort-Einrichtung gesendet", "Configuracion de contrasena enviada", "Configuracao de palavra-passe enviada"),
  TEMP_PASSWORD_GENERATED: adminText("Temporary password generated", "Mot de passe temporaire genere", "Temporaeres Passwort generiert", "Contrasena temporal generada", "Palavra-passe temporaria gerada"),
  PRELAUNCH_EMAIL_SENT: adminText("Prelaunch email sent", "Email prelaunch envoye", "Prelaunch-E-Mail gesendet", "Correo de prelaunch enviado", "Email de prelaunch enviado"),
  PRELAUNCH_EMAIL_FAILED: adminText("Prelaunch email failed", "Echec de l email prelaunch", "Prelaunch-E-Mail fehlgeschlagen", "Fallo del correo de prelaunch", "Falha no email de prelaunch"),
  PRELAUNCH_CHECKS_RUN: adminText("Prelaunch checks run", "Verifications prelaunch executees", "Prelaunch-Pruefungen ausgefuehrt", "Comprobaciones de prelaunch ejecutadas", "Verificacoes de prelaunch executadas"),
  PRELAUNCH_LOG_CHECK: adminText("Prelaunch log check", "Verification du journal prelaunch", "Prelaunch-Protokollpruefung", "Comprobacion de registro de prelaunch", "Verificacao de registo de prelaunch"),
  WEBHOOK_PROCESSED: adminText("Webhook processed", "Webhook traite", "Webhook verarbeitet", "Webhook procesado", "Webhook processado"),
  WEBHOOK_FAILED: adminText("Webhook failed", "Webhook echoue", "Webhook fehlgeschlagen", "Webhook fallido", "Webhook falhou"),
  PAYSTACK_INVOICE: adminText("Paystack invoice event", "Evenement de facture Paystack", "Paystack-Rechnungsereignis", "Evento de factura de Paystack", "Evento de fatura da Paystack"),
  AI_CALL: adminText("AI call", "Appel IA", "KI-Aufruf", "Llamada de IA", "Chamada de IA"),
  AI_FEEDBACK: adminText("AI feedback", "Retour IA", "KI-Feedback", "Comentarios de IA", "Feedback de IA"),
  AI_INSIGHT: adminText("AI insight", "Analyse IA", "KI-Erkenntnis", "Insight de IA", "Insight de IA"),
  SUPPORT_TICKET_CREATED: adminText("Support ticket created", "Ticket de support cree", "Support-Ticket erstellt", "Ticket de soporte creado", "Ticket de suporte criado"),
  SUPPORT_ADMIN_REPLY_SENT: adminText("Support agent replied to ticket", "L agent de support a repondu au ticket", "Support-Mitarbeiter hat auf das Ticket geantwortet", "El agente de soporte respondio al ticket", "O agente de suporte respondeu ao ticket"),
  SUPPORT_SUBSCRIBER_REPLY_RECEIVED: adminText("Support subscriber reply received", "Reponse du client de support recue", "Antwort des Support-Kunden empfangen", "Respuesta del cliente de soporte recibida", "Resposta do cliente de suporte recebida"),
  AI_REQUEST: adminText("AI request", "Requete IA", "KI-Anfrage", "Solicitud de IA", "Pedido de IA"),
  AI_TOKENS: adminText("AI tokens", "Jetons IA", "KI-Token", "Tokens de IA", "Tokens de IA"),
  AUTOMATION_RUN_FAILED: adminText("Automation run failed", "Execution d automatisation echouee", "Automatisierungsausfuehrung fehlgeschlagen", "La ejecucion de automatizacion fallo", "A execucao da automacao falhou"),
  AUTOMATION_RUN_SUCCESS: adminText("Automation run succeeded", "Execution d automatisation reussie", "Automatisierungsausfuehrung erfolgreich", "La ejecucion de automatizacion tuvo exito", "A execucao da automacao teve sucesso"),
  AUTOMATION_RUN_SUCCEEDED: adminText("Automation run succeeded", "Execution d automatisation reussie", "Automatisierungsausfuehrung erfolgreich", "La ejecucion de automatizacion tuvo exito", "A execucao da automacao teve sucesso"),
  AUTOMATION_RUN_PENDING: adminText("Automation run pending", "Execution d automatisation en attente", "Automatisierungsausfuehrung ausstehend", "Ejecucion de automatizacion pendiente", "Execucao da automacao pendente"),
  AUTOMATION_RETRY_ATTEMPT: adminText("Automation retry attempt", "Nouvelle tentative d automatisation", "Automatisierungs-Neuversuch", "Reintento de automatizacion", "Nova tentativa de automacao"),
  AUTOMATION_FAILURE_RECORDED: adminText("Automation failure recorded", "Echec d automatisation enregistre", "Automatisierungsfehler erfasst", "Fallo de automatizacion registrado", "Falha de automacao registada"),
  AUTOMATION_RECOVERY_RETRYING: adminText("Automation recovery retrying", "Recuperation d automatisation en nouvelle tentative", "Automatisierungswiederherstellung versucht erneut", "La recuperacion de automatizacion esta reintentando", "A recuperacao da automacao esta a tentar novamente"),
  AUTOMATION_RECOVERED: adminText("Automation recovered", "Automatisation recuperee", "Automatisierung wiederhergestellt", "Automatizacion recuperada", "Automacao recuperada"),
  AUTOMATION_HEALTH_ALERT: adminText("Automation health alert", "Alerte de sante d automatisation", "Automatisierungswarnung", "Alerta de salud de automatizacion", "Alerta de saude da automacao"),
};

const ADMIN_LOG_MESSAGE_LABELS: Record<string, AdminLocalizedText> = {
  "system flag updated": adminText("System flag updated", "Indicateur systeme mis a jour", "System-Flag aktualisiert", "Indicador del sistema actualizado", "Indicador do sistema atualizado"),
  "subscription upgraded": adminText("Subscription upgraded", "Abonnement ameliore", "Abonnement hochgestuft", "Suscripcion mejorada", "Subscricao melhorada"),
  "subscription downgraded": adminText("Subscription downgraded", "Abonnement retrograde", "Abonnement herabgestuft", "Suscripcion degradada", "Subscricao reduzida"),
  "subscription upgraded plan": adminText("Subscription plan upgraded", "Forfait d'abonnement mis a niveau", "Abo-Plan hochgestuft", "Plan de suscripcion mejorado", "Plano de subscricao atualizado"),
  "subscription payment failed": adminText("Subscription payment failed", "Le paiement de l'abonnement a echoue", "Abo-Zahlung fehlgeschlagen", "El pago de la suscripcion fallo", "O pagamento da subscricao falhou"),
  "user login succeeded": adminText("User login succeeded", "Connexion utilisateur reussie", "Benutzeranmeldung erfolgreich", "Inicio de sesion del usuario correcto", "Inicio de sessao do utilizador com sucesso"),
  "user login failed": adminText("User login failed", "Echec de connexion utilisateur", "Benutzeranmeldung fehlgeschlagen", "Fallo el inicio de sesion del usuario", "Falha no inicio de sessao do utilizador"),
  "invite created": adminText("Invite created", "Invitation creee", "Einladung erstellt", "Invitacion creada", "Convite criado"),
  "team invite created": adminText("Team invite created", "Invitation d equipe creee", "Team-Einladung erstellt", "Invitacion de equipo creada", "Convite de equipa criado"),
  "invite accepted": adminText("Invite accepted", "Invitation acceptee", "Einladung angenommen", "Invitacion aceptada", "Convite aceite"),
  "team invite accepted": adminText("Team invite accepted", "Invitation d equipe acceptee", "Team-Einladung angenommen", "Invitacion de equipo aceptada", "Convite de equipa aceite"),
  "invite canceled": adminText("Invite canceled", "Invitation annulee", "Einladung storniert", "Invitacion cancelada", "Convite cancelado"),
  "team invite canceled": adminText("Team invite canceled", "Invitation d equipe annulee", "Team-Einladung storniert", "Invitacion de equipo cancelada", "Convite de equipa cancelado"),
  "team invite accept failed": adminText("Team invite accept failed", "Echec de l acceptation de l invitation d equipe", "Annahme der Team-Einladung fehlgeschlagen", "Fallo al aceptar la invitacion de equipo", "Falha ao aceitar o convite de equipa"),
  "user invited": adminText("User invited", "Utilisateur invite", "Benutzer eingeladen", "Usuario invitado", "Utilizador convidado"),
  "tenant suspended": adminText("Tenant suspended", "Locataire suspendu", "Mandant gesperrt", "Tenant suspendido", "Tenant suspenso"),
  "tenant reactivated": adminText("Tenant reactivated", "Locataire reactive", "Mandant reaktiviert", "Tenant reactivado", "Tenant reativado"),
  "webhook processed": adminText("Webhook processed", "Webhook traite", "Webhook verarbeitet", "Webhook procesado", "Webhook processado"),
  "paystack invoice": adminText("Paystack invoice event", "Evenement de facture Paystack", "Paystack-Rechnungsereignis", "Evento de factura de Paystack", "Evento de fatura da Paystack"),
  "invoice payment attempt created": adminText("Invoice payment attempt created", "Tentative de paiement de facture creee", "Rechnungszahlungsversuch erstellt", "Intento de pago de factura creado", "Tentativa de pagamento da fatura criada"),
  "invoice payment succeeded": adminText("Invoice payment succeeded", "Paiement de facture reussi", "Rechnungszahlung erfolgreich", "Pago de factura correcto", "Pagamento da fatura com sucesso"),
  "invoice marked as paid": adminText("Invoice marked as paid", "Facture marquee comme payee", "Rechnung als bezahlt markiert", "Factura marcada como pagada", "Fatura marcada como paga"),
  "invoice refund recorded": adminText("Invoice refund recorded", "Remboursement de facture enregistre", "Rechnungsruckerstattung erfasst", "Reembolso de factura registrado", "Reembolso da fatura registado"),
  "support ticket created": adminText("Support ticket created", "Ticket de support cree", "Support-Ticket erstellt", "Ticket de soporte creado", "Ticket de suporte criado"),
  "support agent replied to ticket": adminText("Support agent replied to ticket", "L agent de support a repondu au ticket", "Support-Mitarbeiter hat auf das Ticket geantwortet", "El agente de soporte respondio al ticket", "O agente de suporte respondeu ao ticket"),
  "inbox message received": adminText("Inbox message received", "Message de boite de reception recu", "Posteingangsnachricht empfangen", "Mensaje de bandeja de entrada recibido", "Mensagem da caixa de entrada recebida"),
  "inbox message sent": adminText("Inbox message sent", "Message de boite de reception envoye", "Posteingangsnachricht gesendet", "Mensaje de bandeja de entrada enviado", "Mensagem da caixa de entrada enviada"),
  "paystack payment failed": adminText("Paystack payment failed", "Le paiement Paystack a echoue", "Paystack-Zahlung fehlgeschlagen", "El pago de Paystack fallo", "O pagamento Paystack falhou"),
  "flutterwave payment failed": adminText("Flutterwave payment failed", "Le paiement Flutterwave a echoue", "Flutterwave-Zahlung fehlgeschlagen", "El pago de Flutterwave fallo", "O pagamento Flutterwave falhou"),
};

function normalizeAdminAction(value: unknown) {
  return String(value || "").trim().toUpperCase();
}

function normalizeAdminLogMessage(value: unknown) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/[.!?]+$/, "")
    .trim();
}

export function formatAdminDate(value: Date | string | null | undefined, language: Language) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(LANGUAGE_LOCALES[language], {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

export function formatAdminDateTime(value: Date | string | null | undefined, language: Language) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(LANGUAGE_LOCALES[language], {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

export function formatAdminNumber(value: number, language: Language) {
  if (!Number.isFinite(value)) return "0";
  return new Intl.NumberFormat(LANGUAGE_LOCALES[language]).format(value);
}

export function formatAdminRelativeTime(
  value: Date | string | number | null | undefined,
  language: Language,
  fallback?: LocalizedText
) {
  const date =
    value instanceof Date ? value : typeof value === "number" ? new Date(value) : value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) {
    return fallback ? getLocalizedText(fallback, language) : "";
  }
  const diffMs = date.getTime() - Date.now();
  const diffMinutes = Math.round(diffMs / 60000);
  const absMinutes = Math.abs(diffMinutes);
  const formatter = new Intl.RelativeTimeFormat(LANGUAGE_LOCALES[language], { numeric: "auto" });
  if (absMinutes < 1) {
    const justNowLabel: AdminLocalizedText = {
      en: "just now",
      fr: "à l'instant",
      de: "gerade eben",
      es: "justo ahora",
      pt: "agora mesmo",
    };
    return getLocalizedText(justNowLabel, language);
  }
  if (absMinutes < 60) return formatter.format(diffMinutes, "minute");
  const diffHours = Math.round(diffMinutes / 60);
  const absHours = Math.abs(diffHours);
  if (absHours < 24) return formatter.format(diffHours, "hour");
  const diffDays = Math.round(diffHours / 24);
  return formatter.format(diffDays, "day");
}

export function localizeAdminServerMessage(message: unknown, language: Language, fallback?: string | null) {
  const raw = String(message || "").trim();
  if (!raw) return fallback || "";
  const match = ADMIN_SERVER_MESSAGES.find((entry) => entry.match.test(raw));
  if (match) return getLocalizedText(match.label, language);
  return fallback || raw;
}

export function localizeAdminSeverity(
  value: string | null | undefined,
  language: Language
) {
  const normalized = String(value || "").trim().toUpperCase();
  if (normalized === "CRITICAL") {
    const criticalLabel: AdminLocalizedText = {
      en: "Critical",
      fr: "Critique",
      de: "Kritisch",
      es: "Critico",
      pt: "Critico",
    };
    return getLocalizedText(criticalLabel, language);
  }
  if (normalized === "WARNING" || normalized === "WARN") {
    const warningLabel: AdminLocalizedText = {
      en: "Warning",
      fr: "Alerte",
      de: "Warnung",
      es: "Aviso",
      pt: "Aviso",
    };
    return getLocalizedText(warningLabel, language);
  }
  const infoLabel: AdminLocalizedText = {
    en: "Info",
    fr: "Info",
    de: "Info",
    es: "Info",
    pt: "Info",
  };
  return getLocalizedText(infoLabel, language);
}

export function localizeAdminStatus(value: string | null | undefined, language: Language) {
  const normalized = String(value || "").trim().toUpperCase();
  const map: Record<string, AdminLocalizedText> = {
    ACTIVE: { en: "Active", fr: "Actif", de: "Aktiv", es: "Activo", pt: "Ativo" },
    DISABLED: { en: "Disabled", fr: "Desactive", de: "Deaktiviert", es: "Desactivado", pt: "Desativado" },
    SUSPENDED: { en: "Suspended", fr: "Suspendu", de: "Gesperrt", es: "Suspendido", pt: "Suspenso" },
    PENDING: { en: "Pending", fr: "En attente", de: "Ausstehend", es: "Pendiente", pt: "Pendente" },
    RESOLVED: { en: "Resolved", fr: "Résolue", de: "Geloest", es: "Resuelta", pt: "Resolvida" },
    OPEN: { en: "Open", fr: "Ouvert", de: "Offen", es: "Abierto", pt: "Aberto" },
    FAILED: { en: "Failed", fr: "échoué", de: "Fehlgeschlagen", es: "Fallido", pt: "Falhou" },
    RETRYING: { en: "Retrying", fr: "Nouvelle tentative", de: "Wird erneut versucht", es: "Reintentando", pt: "A tentar novamente" },
    UNREAD: { en: "Unread", fr: "Non lu", de: "Ungelesen", es: "No leido", pt: "Não lida" },
    READ: { en: "Read", fr: "Lu", de: "Gelesen", es: "Leida", pt: "Lida" },
    ACKNOWLEDGED: { en: "Acknowledged", fr: "Pris en compte", de: "Bestätigt", es: "Reconocida", pt: "Confirmada" },
    SNOOZED: { en: "Snoozed", fr: "Reporte", de: "Zurückgestellt", es: "Pospuesta", pt: "Adiada" },
  };
  return getLocalizedText(map[normalized] || { en: normalized || "-" }, language);
}

export function localizeAdminSource(value: string | null | undefined, language: Language) {
  const normalized = String(value || "").trim().toUpperCase();
  const map: Record<string, AdminLocalizedText> = {
    AUTH: adminText("Auth", "Auth", "Auth", "Auth", "Auth"),
    BILLING: adminText("Billing", "Facturation", "Abrechnung", "Facturacion", "Faturacao"),
    AUTOMATION: adminText("Automation", "Automatisation", "Automatisierung", "Automatizacion", "Automacao"),
    INBOX: adminText("Inbox", "Boite de reception", "Posteingang", "Bandeja de entrada", "Caixa de entrada"),
    SUPPORT: adminText("Support", "Support", "Support", "Soporte", "Suporte"),
    SYSTEM: adminText("System", "Systeme", "System", "Sistema", "Sistema"),
    WEBHOOKS: adminText("Webhooks", "Webhooks", "Webhooks", "Webhooks", "Webhooks"),
    SECURITY: adminText("Security", "Securite", "Sicherheit", "Seguridad", "Seguranca"),
    INFRASTRUCTURE: adminText("Infrastructure", "Infrastructure", "Infrastruktur", "Infraestructura", "Infraestrutura"),
    CORE: adminText("Core", "Noyau", "Kern", "Nucleo", "Nucleo"),
    AUDIT: adminText("Audit logs", "Journaux d'audit", "Audit-Protokolle", "Registros de auditoria", "Registos de auditoria"),
    SYSTEM_FLAG: adminText("System flag audits", "Audits des drapeaux systeme", "System-Flag-Audits", "Auditorias de indicadores del sistema", "Auditorias de indicadores do sistema"),
  };
  return getLocalizedText(map[normalized] || { en: normalized || "-" }, language);
}

export function localizeAdminProvider(value: string | null | undefined, language: Language) {
  const normalized = String(value || "").trim().toUpperCase();
  const map: Record<string, AdminLocalizedText> = {
    CREDENTIALS: adminText("Password", "Mot de passe", "Passwort", "Contrasena", "Palavra-passe"),
    PASSWORD: adminText("Password", "Mot de passe", "Passwort", "Contrasena", "Palavra-passe"),
    GOOGLE: adminText("Google", "Google", "Google", "Google", "Google"),
    SSO: adminText("SSO", "SSO", "SSO", "SSO", "SSO"),
    PAYSTACK: adminText("Paystack", "Paystack", "Paystack", "Paystack", "Paystack"),
    FLUTTERWAVE: adminText("Flutterwave", "Flutterwave", "Flutterwave", "Flutterwave", "Flutterwave"),
    STRIPE: adminText("Stripe", "Stripe", "Stripe", "Stripe", "Stripe"),
  };
  return getLocalizedText(map[normalized] || { en: String(value || "-") || "-" }, language);
}

export function formatAdminIdentifierLabel(value: string | null | undefined) {
  const raw = String(value || "").trim();
  if (!raw) return "-";
  return raw
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function localizeAdminActionLabel(
  value: string | null | undefined,
  language: Language,
  fallback?: string | null
) {
  const normalized = normalizeAdminAction(value);
  const label = ADMIN_ACTION_LABELS[normalized];
  if (label) return getLocalizedText(label, language);
  return fallback || String(value || "").trim() || "";
}

export function localizeAdminLogMessage(
  message: unknown,
  language: Language,
  fallback?: string | null
) {
  const normalized = normalizeAdminLogMessage(message);
  if (!normalized) return fallback || "";

  const directLabel = ADMIN_LOG_MESSAGE_LABELS[normalized];
  if (directLabel) return getLocalizedText(directLabel, language);

  const actionLabel = ADMIN_ACTION_LABELS[normalized.toUpperCase().replace(/\s+/g, "_")];
  if (actionLabel) return getLocalizedText(actionLabel, language);

  const webhookMessage = normalized.match(/^webhook (retried|failed) for (.+)$/i);
  if (webhookMessage) {
    const [, state, provider] = webhookMessage;
    return getLocalizedText(
      state === "retried"
        ? adminText(`Webhook retried for ${provider}`, `Webhook retente pour ${provider}`, `Webhook fur ${provider} erneut versucht`, `Webhook reintentado para ${provider}`, `Webhook repetido para ${provider}`)
        : adminText(`Webhook failed for ${provider}`, `Webhook echoue pour ${provider}`, `Webhook fur ${provider} fehlgeschlagen`, `Webhook fallido para ${provider}`, `Webhook falhou para ${provider}`),
      language
    );
  }

  const automationStarted = normalized.match(/^automation (.+) started$/i);
  if (automationStarted) {
    const flowTitle = automationStarted[1];
    return getLocalizedText(
      adminText(`Automation ${flowTitle} started`, `Automatisation ${flowTitle} demarree`, `Automatisierung ${flowTitle} gestartet`, `Automatizacion ${flowTitle} iniciada`, `Automacao ${flowTitle} iniciada`),
      language
    );
  }

  const automationFailed = normalized.match(/^automation (.+) failed$/i);
  if (automationFailed) {
    const flowTitle = automationFailed[1];
    return getLocalizedText(
      adminText(`Automation ${flowTitle} failed`, `Automatisation ${flowTitle} echouee`, `Automatisierung ${flowTitle} fehlgeschlagen`, `Automatizacion ${flowTitle} fallo`, `Automacao ${flowTitle} falhou`),
      language
    );
  }

  const automationSucceeded = normalized.match(/^automation (.+) succeeded$/i);
  if (automationSucceeded) {
    const flowTitle = automationSucceeded[1];
    return getLocalizedText(
      adminText(`Automation ${flowTitle} succeeded`, `Automatisation ${flowTitle} reussie`, `Automatisierung ${flowTitle} erfolgreich`, `Automatizacion ${flowTitle} completada`, `Automacao ${flowTitle} concluida`),
      language
    );
  }

  const automationPaused = normalized.match(/^automation (.+) was paused due to abnormal activity$/i);
  if (automationPaused) {
    const flowTitle = automationPaused[1];
    return getLocalizedText(
      adminText(`Automation ${flowTitle} was paused due to abnormal activity`, `Automatisation ${flowTitle} mise en pause pour activite anormale`, `Automatisierung ${flowTitle} wurde wegen ungewohnlicher Aktivitat pausiert`, `La automatizacion ${flowTitle} se puso en pausa por actividad anormal`, `A automacao ${flowTitle} foi pausada devido a atividade anormal`),
      language
    );
  }

  const repeatedFailures = normalized.match(/^repeated (.+) failures detected for automation (.+)\. check provider health$/i);
  if (repeatedFailures) {
    const [, stepType, flowTitle] = repeatedFailures;
    return getLocalizedText(
      adminText(`Repeated ${stepType} failures detected for automation ${flowTitle}. Check provider health.`, `Echecs repetes de ${stepType} detectes pour l automatisation ${flowTitle}. Verifiez le fournisseur.`, `Wiederholte ${stepType}-Fehler fur die Automatisierung ${flowTitle} erkannt. Anbieterzustand prufen.`, `Se detectaron fallos repetidos de ${stepType} en la automatizacion ${flowTitle}. Revisa el proveedor.`, `Foram detetadas falhas repetidas de ${stepType} na automacao ${flowTitle}. Verifique o fornecedor.`),
      language
    );
  }

  const failureRate = normalized.match(/^failure rate is ([\d.]+)% in the last (\d+) minutes$/i);
  if (failureRate) {
    const [, rate, minutes] = failureRate;
    return getLocalizedText(
      adminText(`Failure rate is ${rate}% in the last ${minutes} minutes.`, `Le taux d echec est de ${rate}% au cours des ${minutes} dernieres minutes.`, `Die Fehlerrate betragt ${rate}% in den letzten ${minutes} Minuten.`, `La tasa de fallos es del ${rate}% en los ultimos ${minutes} minutos.`, `A taxa de falhas e de ${rate}% nos ultimos ${minutes} minutos.`),
      language
    );
  }

  const duePendingRuns = normalized.match(/^(\d+) pending runs are due for execution$/i);
  if (duePendingRuns) {
    const [, count] = duePendingRuns;
    return getLocalizedText(
      adminText(`${count} pending runs are due for execution.`, `${count} executions en attente doivent etre lancees.`, `${count} ausstehende Ausfuhrungen sind zur Verarbeitung fallig.`, `${count} ejecuciones pendientes deben procesarse.`, `${count} execucoes pendentes devem ser processadas.`),
      language
    );
  }

  const staleRunningRuns = normalized.match(/^(\d+) runs have stayed in running status beyond threshold$/i);
  if (staleRunningRuns) {
    const [, count] = staleRunningRuns;
    return getLocalizedText(
      adminText(`${count} runs have stayed in RUNNING status beyond threshold.`, `${count} executions sont restees en statut RUNNING au dela du seuil.`, `${count} Ausfuhrungen sind uber den Schwellenwert hinaus im Status RUNNING geblieben.`, `${count} ejecuciones permanecieron en estado RUNNING mas alla del umbral.`, `${count} execucoes permaneceram no estado RUNNING alem do limite.`),
      language
    );
  }

  const providerFailures = normalized.match(/^(\d+) provider retry exhausted events recorded in the last (\d+) minutes$/i);
  if (providerFailures) {
    const [, count, minutes] = providerFailures;
    return getLocalizedText(
      adminText(`${count} provider retry-exhausted events recorded in the last ${minutes} minutes.`, `${count} evenements d echec apres tentatives ont ete enregistres au cours des ${minutes} dernieres minutes.`, `${count} Provider-Ereignisse mit ausgeschopften Wiederholungen wurden in den letzten ${minutes} Minuten erfasst.`, `Se registraron ${count} eventos del proveedor con reintentos agotados en los ultimos ${minutes} minutos.`, `Foram registados ${count} eventos do fornecedor com tentativas esgotadas nos ultimos ${minutes} minutos.`),
      language
    );
  }

  const pendingRuns = normalized.match(/^(\d+) runs are currently pending$/i);
  if (pendingRuns) {
    const [, count] = pendingRuns;
    return getLocalizedText(
      adminText(`${count} runs are currently pending.`, `${count} executions sont actuellement en attente.`, `${count} Ausfuhrungen sind derzeit ausstehend.`, `${count} ejecuciones estan pendientes actualmente.`, `${count} execucoes estao pendentes neste momento.`),
      language
    );
  }

  const cleaned = normalized.replace(/[_-]+/g, " ").trim();
  return fallback || (cleaned ? cleaned.charAt(0).toUpperCase() + cleaned.slice(1) : "");
}
