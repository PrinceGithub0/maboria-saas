"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useLanguage } from "@/components/providers/language-provider";
import { localizeServerMessage } from "@/lib/localization/server-messages";

const quickQuestions = [
  {
    q: {
      en: "How do I create automations?",
      fr: "Comment créer des automatisations ?",
      de: "Wie erstelle ich Automatisierungen?",
      es: "¿Cómo creo automatizaciones?",
      pt: "Como crio automatizações?",
    },
    a: {
      en: "Use the Automations area in your dashboard or the AI flow generator to set up workflows.",
      fr: "Utilisez l'espace Automatisations ou le générateur IA pour configurer les workflows.",
      de: "Nutze den Bereich Automatisierungen in deinem Dashboard oder den KI-Flow-Generator, um Workflows einzurichten.",
      es: "Usa el área de Automatizaciones en tu panel o el generador de flujos con IA para configurar flujos de trabajo.",
      pt: "Use a área de Automações no seu painel ou o gerador de fluxos com IA para configurar fluxos de trabalho.",
    },
  },
  {
    q: {
      en: "How does billing work?",
      fr: "Comment fonctionne la facturation ?",
      de: "Wie funktioniert die Abrechnung?",
      es: "¿Cómo funciona la facturación?",
      pt: "Como funciona a faturação?",
    },
    a: {
      en: "Plans renew based on your billing cycle. You can view invoices and subscription details in Billing.",
      fr: "Les plans se renouvellent selon votre cycle de facturation. Consultez Facturation pour les détails.",
      de: "Pläne werden gemäß deinem Abrechnungszyklus erneuert. Rechnungen und Abonnementdetails findest du unter Abrechnung.",
      es: "Los planes se renuevan según tu ciclo de facturación. Puedes ver facturas y detalles de la suscripción en Facturación.",
      pt: "Os planos renovam-se de acordo com o seu ciclo de faturação. Pode ver faturas e detalhes da subscrição em Faturação.",
    },
  },
  {
    q: {
      en: "Where can I see logs?",
      fr: "Où puis-je voir les journaux ?",
      de: "Wo kann ich Protokolle sehen?",
      es: "¿Dónde puedo ver los registros?",
      pt: "Onde posso ver os registos?",
    },
    a: {
      en: "Activity logs live in your dashboard, and admins can access deeper system logs from Admin tools.",
      fr: "Les journaux d'activité sont dans le tableau de bord, et les admins peuvent consulter les journaux système.",
      de: "Aktivitätsprotokolle findest du im Dashboard, und Admins können über die Admin-Werkzeuge tiefere Systemprotokolle einsehen.",
      es: "Los registros de actividad están en tu panel, y los administradores pueden acceder a registros del sistema más detallados desde las herramientas de administración.",
      pt: "Os registos de atividade estão no seu painel, e os administradores podem aceder a registos de sistema mais detalhados nas ferramentas de administração.",
    },
  },
];

const commonIssues = [
  {
    en: "Create your first invoice and share the payment link with a customer.",
    fr: "Créez votre première facture et partagez le lien de paiement.",
    de: "Erstelle deine erste Rechnung und teile den Zahlungslink mit einem Kunden.",
    es: "Crea tu primera factura y comparte el enlace de pago con un cliente.",
    pt: "Crie a sua primeira fatura e partilhe o link de pagamento com um cliente.",
  },
  {
    en: "Connect Paystack or Flutterwave to receive funds directly to your account.",
    fr: "Connectez Paystack ou Flutterwave pour recevoir les fonds sur votre compte.",
    de: "Verbinde Paystack oder Flutterwave, damit Gelder direkt auf dein Konto eingehen.",
    es: "Conecta Paystack o Flutterwave para recibir fondos directamente en tu cuenta.",
    pt: "Ligue Paystack ou Flutterwave para receber fundos diretamente na sua conta.",
  },
  {
    en: "Enable WhatsApp messaging and send a test reminder to verify delivery.",
    fr: "Activez WhatsApp et envoyez un rappel de test pour vérifier l'envoi.",
    de: "Aktiviere WhatsApp-Nachrichten und sende eine Testerinnerung, um die Zustellung zu prüfen.",
    es: "Activa la mensajería de WhatsApp y envía un recordatorio de prueba para verificar la entrega.",
    pt: "Ative as mensagens por WhatsApp e envie um lembrete de teste para verificar a entrega.",
  },
  {
    en: "Set up one automation to confirm payments and issue receipts.",
    fr: "Configurez une automatisation pour confirmer les paiements et émettre des reçus.",
    de: "Richte eine Automatisierung ein, um Zahlungen zu bestätigen und Belege auszustellen.",
    es: "Configura una automatización para confirmar pagos y emitir recibos.",
    pt: "Configure uma automatização para confirmar pagamentos e emitir recibos.",
  },
];

export default function SupportPage() {
  const { language, t } = useLanguage();
  const [status, setStatus] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [form, setForm] = useState({ email: "", subject: "", message: "" });
  const [errors, setErrors] = useState<{ subject?: string; message?: string }>({});

  const submit = async () => {
    setStatus(null);
    const subject = form.subject.trim();
    const message = form.message.trim();
    const nextErrors: { subject?: string; message?: string } = {};
    if (subject.length < 5)
      nextErrors.subject = t(
        "Subject must be at least 5 characters.",
        "Le sujet doit comporter au moins 5 caractères.",
        "Der Betreff muss mindestens 5 Zeichen lang sein.",
        "El asunto debe tener al menos 5 caracteres.",
        "O assunto deve ter pelo menos 5 caracteres."
      );
    if (message.length < 10)
      nextErrors.message = t(
        "Message must be at least 10 characters.",
        "Le message doit comporter au moins 10 caractères.",
        "Die Nachricht muss mindestens 10 Zeichen lang sein.",
        "El mensaje debe tener al menos 10 caracteres.",
        "A mensagem deve ter pelo menos 10 caracteres."
      );
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      setStatus(
        t(
          "Please fix the highlighted fields.",
          "Corrigez les champs en surbrillance.",
          "Bitte korrigiere die markierten Felder.",
          "Corrige los campos resaltados.",
          "Corrija os campos destacados."
        )
      );
      return;
    }
    setErrors({});
    if (sending) return;
    setSending(true);
    try {
      const res = await fetch("/api/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: subject, message: `${message}\n\nFrom: ${form.email || "N/A"}` }),
      });
      const data = await res.json();
      if (res.status === 401) {
        setStatus(
          t(
            "Please sign in to submit a support ticket.",
            "Veuillez vous connecter pour envoyer un ticket.",
            "Bitte melde dich an, um ein Support-Ticket zu senden.",
            "Inicia sesión para enviar un ticket de soporte.",
            "Inicie sessão para enviar um ticket de suporte."
          )
        );
      } else if (!res.ok) {
        setStatus(
          localizeServerMessage(
            data.error,
            language,
            t(
              `Could not submit ticket (status ${res.status}).`,
              `Envoi impossible (statut ${res.status}).`,
              `Ticket konnte nicht gesendet werden (Status ${res.status}).`,
              `No se pudo enviar el ticket (estado ${res.status}).`,
              `Não foi possível enviar o ticket (estado ${res.status}).`
            )
          )
        );
      } else {
        if (data.emailError) {
          setStatus(
            t(
              `Ticket submitted, but email could not be sent: ${data.emailError}`,
              `Ticket envoyé, mais l'email n'a pas pu être envoyé : ${data.emailError}`,
              `Ticket gesendet, aber die E-Mail konnte nicht versendet werden: ${data.emailError}`,
              `Ticket enviado, pero no se pudo enviar el correo: ${data.emailError}`,
              `Ticket enviado, mas não foi possível enviar o email: ${data.emailError}`
            )
          );
        } else {
          setStatus(
            t(
              "Ticket submitted. We'll respond to your email.",
              "Ticket envoyé. Nous répondrons par email.",
              "Ticket gesendet. Wir antworten per E-Mail.",
              "Ticket enviado. Responderemos a tu correo.",
              "Ticket enviado. Responderemos por email."
            )
          );
        }
        setForm({ email: "", subject: "", message: "" });
        setErrors({});
      }
    } catch {
      setStatus(
        t(
          "Could not submit ticket. Please try again.",
          "Envoi impossible. Veuillez réessayer.",
          "Ticket konnte nicht gesendet werden. Bitte versuche es erneut.",
          "No se pudo enviar el ticket. Inténtalo de nuevo.",
          "Não foi possível enviar o ticket. Tente novamente."
        )
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-14 px-6 py-14 text-foreground max-md:mx-0 max-md:w-full max-md:max-w-none">
      <section className="space-y-2">
        <p className="text-xs uppercase tracking-[0.24em] text-indigo-600 dark:text-indigo-300">
          {t("Support", "Support", "Support", "Soporte", "Suporte")}
        </p>
        <h1 className="text-3xl font-semibold md:text-4xl">
          {t("Support", "Support", "Support", "Soporte", "Suporte")}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t(
            "Get help, ask questions, or reach the Maboria team directly.",
            "Obtenez de l'aide, posez des questions ou contactez l'équipe Maboria.",
            "Erhalte Hilfe, stelle Fragen oder kontaktiere das Maboria-Team direkt.",
            "Recibe ayuda, haz preguntas o contacta directamente con el equipo de Maboria.",
            "Obtenha ajuda, faça perguntas ou contacte diretamente a equipa da Maboria."
          )}
        </p>
      </section>

      <section className="grid gap-10 md:grid-cols-3">
        <div className="space-y-4">
          <div>
            <p className="text-sm font-semibold text-foreground">
              {t("Quick questions", "Questions rapides", "Schnelle Fragen", "Preguntas rápidas", "Perguntas rápidas")}
            </p>
            <p className="text-sm text-muted-foreground">
              {t(
                "Answers to the most common questions about Maboria.",
                "Réponses aux questions les plus courantes sur Maboria.",
                "Antworten auf die häufigsten Fragen zu Maboria.",
                "Respuestas a las preguntas más comunes sobre Maboria.",
                "Respostas às perguntas mais comuns sobre a Maboria."
              )}
            </p>
          </div>
          <div className="space-y-4">
            {quickQuestions.map((item) => (
              <div key={item.q.en} className="space-y-1">
                <p className="text-sm font-semibold text-indigo-600 dark:text-indigo-300">
                  {t(item.q)}
                </p>
                <p className="text-sm text-foreground">{t(item.a)}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-4 md:border-l md:border-border/40 md:pl-8">
          <div>
            <p className="text-sm font-semibold text-foreground">
              {t("Getting started", "Bien démarrer", "Erste Schritte", "Primeros pasos", "Primeiros passos")}
            </p>
            <p className="text-sm text-muted-foreground">
              {t(
                "A quick checklist to get value on day one.",
                "Une liste rapide pour obtenir de la valeur dès le premier jour.",
                "Eine kurze Checkliste, um ab dem ersten Tag Nutzen zu erhalten.",
                "Una lista rápida para obtener valor desde el primer día.",
                "Uma lista rápida para obter valor desde o primeiro dia."
              )}
            </p>
          </div>
          <div className="space-y-3">
            {commonIssues.map((item) => (
              <p key={item.en} className="text-sm text-foreground">
                {t(item)}
              </p>
            ))}
          </div>
        </div>

        <div className="space-y-4 md:border-l md:border-border/40 md:pl-8">
          <div>
            <p className="text-sm font-semibold text-foreground">
              {t("Account access", "Accès au compte", "Kontozugriff", "Acceso a la cuenta", "Acesso à conta")}
            </p>
            <p className="text-sm text-muted-foreground">
              {t(
                "Guidance on sign-in, roles, and account permissions.",
                "Conseils sur la connexion, les rôles et les permissions.",
                "Hinweise zu Anmeldung, Rollen und Kontoberechtigungen.",
                "Orientación sobre inicio de sesión, roles y permisos de la cuenta.",
                "Orientações sobre início de sessão, funções e permissões da conta."
              )}
            </p>
          </div>
          <div className="space-y-3 text-sm text-foreground">
            <p>
              {t(
                "Update password or enable 2FA from Settings > Security.",
                "Mettez à jour le mot de passe ou activez la 2FA dans Paramètres > Sécurité.",
                "Aktualisiere dein Passwort oder aktiviere 2FA unter Einstellungen > Sicherheit.",
                "Actualiza la contraseña o activa 2FA en Configuración > Seguridad.",
                "Atualize a palavra-passe ou ative 2FA em Definições > Segurança."
              )}
            </p>
            <p>
              {t(
                "Manage team roles and access levels in Team settings.",
                "Gérez les rôles et niveaux d'accès dans les paramètres de l'équipe.",
                "Verwalte Teamrollen und Zugriffsstufen in den Team-Einstellungen.",
                "Gestiona los roles del equipo y los niveles de acceso en la configuración del equipo.",
                "Gira as funções da equipa e os níveis de acesso nas definições da equipa."
              )}
            </p>
            <p>
              {t(
                "Check authorized devices and active sessions.",
                "Vérifiez les appareils autorisés et les sessions actives.",
                "Prüfe autorisierte Geräte und aktive Sitzungen.",
                "Revisa los dispositivos autorizados y las sesiones activas.",
                "Verifique os dispositivos autorizados e as sessões ativas."
              )}
            </p>
            <p>
              {t(
                "For sensitive changes, contact support and we will assist directly.",
                "Pour les changements sensibles, contactez le support et nous vous aiderons directement.",
                "Kontaktiere bei sensiblen Änderungen den Support, und wir helfen dir direkt.",
                "Para cambios sensibles, contacta con soporte y te ayudaremos directamente.",
                "Para alterações sensíveis, contacte o suporte e ajudaremos diretamente."
              )}
            </p>
          </div>
        </div>
      </section>

      <section className="space-y-6">
        <div className="space-y-2">
          <h2 className="text-2xl font-semibold">
            {t(
              "Contact the Maboria team",
              "Contacter l'équipe Maboria",
              "Kontaktiere das Maboria-Team",
              "Contacta con el equipo de Maboria",
              "Contacte a equipa da Maboria"
            )}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t(
              "Have a question or need help? Send us a message - we read every request.",
              "Une question ou besoin d'aide ? Envoyez-nous un message, nous lisons chaque demande.",
              "Hast du eine Frage oder brauchst Hilfe? Sende uns eine Nachricht - wir lesen jede Anfrage.",
              "¿Tienes una pregunta o necesitas ayuda? Envíanos un mensaje; leemos cada solicitud.",
              "Tem uma pergunta ou precisa de ajuda? Envie-nos uma mensagem - lemos todos os pedidos."
            )}
          </p>
        </div>

        {status && <p className="text-sm text-foreground">{status}</p>}

        <div className="grid gap-4 md:grid-cols-2">
          <Input
            label={t("Email", "Email", "E-Mail", "Correo electrónico", "Email")}
            placeholder={t(
              "you@company.com",
              "vous@entreprise.com",
              "du@unternehmen.com",
              "tu@empresa.com",
              "voce@empresa.com"
            )}
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
          />
          <Input
            label={t("Subject", "Sujet", "Betreff", "Asunto", "Assunto")}
            placeholder={t(
              "Billing, automation, WhatsApp, account access...",
              "Facturation, automatisation, WhatsApp, accès compte...",
              "Abrechnung, Automatisierung, WhatsApp, Kontozugriff...",
              "Facturación, automatización, WhatsApp, acceso a la cuenta...",
              "Faturação, automatização, WhatsApp, acesso à conta..."
            )}
            value={form.subject}
            onChange={(e) => {
              setForm((f) => ({ ...f, subject: e.target.value }));
              if (errors.subject) setErrors((prev) => ({ ...prev, subject: undefined }));
            }}
            minLength={5}
            required
            error={errors.subject}
          />
          <div className="md:col-span-2">
            <Textarea
              placeholder={t(
                "Tell us what is going on. Include any relevant details.",
                "Expliquez la situation et ajoutez les détails utiles.",
                "Erzähle uns, was los ist. Füge alle relevanten Details hinzu.",
                "Dinos qué está pasando. Incluye cualquier detalle relevante.",
                "Diga-nos o que se passa. Inclua todos os detalhes relevantes."
              )}
              value={form.message}
              onChange={(e) => {
                setForm((f) => ({ ...f, message: e.target.value }));
                if (errors.message) setErrors((prev) => ({ ...prev, message: undefined }));
                const el = e.currentTarget;
                el.style.height = "auto";
                el.style.height = `${Math.max(el.scrollHeight, 200)}px`;
              }}
              minLength={10}
              required
              error={errors.message}
              className="min-h-[200px] resize-none"
            />
          </div>
          <div className="md:col-span-2">
            <Button onClick={submit} loading={sending} className="w-full sm:w-auto">
              {t("Send message", "Envoyer le message", "Nachricht senden", "Enviar mensaje", "Enviar mensagem")}
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}


