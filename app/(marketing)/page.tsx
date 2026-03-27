"use client";

import Link from "next/link";
import Image from "next/image";
import { CheckCircle2, CreditCard, Info, Linkedin, Mail, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { pricingTableDualCurrency } from "@/lib/pricing";
import { PricingSection } from "@/components/pricing/pricing-section";
import { MarketingCta } from "@/components/ui/marketing-cta";
import { MarketingHeaderActions } from "@/components/ui/marketing-header-actions";
import { PaystackLogo } from "@/components/ui/paystack-logo";
import { LangText } from "@/components/ui/lang-text";
import { defineLocalizedText, type CompleteLocalizedText } from "@/lib/i18n";

const plans = pricingTableDualCurrency();

type MarketingText = CompleteLocalizedText;

type WorkflowStep = MarketingText & {
  step: string;
};

type FeatureGroup = {
  title: MarketingText;
  items: MarketingText[];
};

const marketingCopy = {
  automationCloud: defineLocalizedText({
    en: "Automation Cloud",
    fr: "Cloud automation",
    de: "Automatisierungs-Cloud",
    es: "Nube de automatización",
    pt: "Nuvem de automação",
  }),
  heroTitle: defineLocalizedText({
    en: "Automate how your business runs - and how it gets paid.",
    fr: "Automatisez le fonctionnement de votre entreprise - et ses paiements.",
    de: "Automatisiere, wie dein Unternehmen arbeitet - und wie es bezahlt wird.",
    es: "Automatiza como funciona tu negocio y como cobra.",
    pt: "Automatize como o seu negocio funciona e como recebe.",
  }),
  heroDescription: defineLocalizedText({
    en: "Maboria is a revenue and operations automation platform that handles invoicing, payment collection, receipts, WhatsApp and email communication inside your logged-in workspace, AI-assisted workflows, reporting, and team visibility - while payments go directly into your own account, not ours.",
    fr: "Maboria est une plateforme d automatisation du revenu et des operations qui gere la facturation, la collecte, les recus, WhatsApp et email dans votre espace connecte, les workflows assists par IA, les rapports et la visibilite équipe - pendant que les paiements vont directement sur votre compte, pas le notre.",
    de: "Maboria ist eine Plattform zur Automatisierung von Umsatz und Betrieb, die Rechnungsstellung, Zahlungseinzug, Belege, WhatsApp- und E-Mail-Kommunikation in deinem angemeldeten Workspace, KI-gestutzte Workflows, Berichte und Team-Transparenz abwickelt - wahrend Zahlungen direkt auf dein eigenes Konto gehen, nicht auf unseres.",
    es: "Maboria es una plataforma de automatización de ingresos y operaciónes que gestiona facturación, cobro de pagos, recibos, comunicacion por WhatsApp y correo dentro de tu espacio conectado, flujos asistidos por IA, reportes y visibilidad del equipo, mientras los pagos van directamente a tu propia cuenta, no a la nuestra.",
    pt: "A Maboria e uma plataforma de automação de receitas e operações que trata de faturação, cobranca de pagamentos, recibos, comunicacao por WhatsApp e email dentro do seu espaco iniciado, fluxos assistidos por IA, relatórios e visibilidade para a equipa, enquanto os pagamentos entram diretamente na sua propria conta, não na nossa.",
  }),
  paymentsPoweredBy: defineLocalizedText({
    en: "Payments powered by Paystack and Flutterwave.",
    fr: "Paiements fournis par Paystack et Flutterwave.",
    de: "Zahlungen werden von Paystack und Flutterwave bereitgestellt.",
    es: "Pagos impulsados por Paystack y Flutterwave.",
    pt: "Pagamentos fornecidos pela Paystack e pela Flutterwave.",
  }),
  collectionsOverview: defineLocalizedText({
    en: "Collections overview",
    fr: "Aperçu recouvrement",
    de: "Inkasso-überblick",
    es: "Resumen de cobros",
    pt: "Visao geral de cobrancas",
  }),
  paymentDetected: defineLocalizedText({
    en: "Payment detected",
    fr: "Paiement detecte",
    de: "Zahlung erkannt",
    es: "Pago detectado",
    pt: "Pagamento detetado",
  }),
  receiptIssued: defineLocalizedText({
    en: "Receipt issued",
    fr: "Recu emis",
    de: "Beleg erstellt",
    es: "Recibo emitido",
    pt: "Recibo emitido",
  }),
  automated: defineLocalizedText({
    en: "Automated",
    fr: "Automatique",
    de: "Automatisch",
    es: "Automatico",
    pt: "Automatico",
  }),
  aiImprovedMessage: defineLocalizedText({
    en: "AI improved message",
    fr: "Message ameliore par IA",
    de: "KI hat Nachricht verbessert",
    es: "La IA mejoro el mensaje",
    pt: "A IA melhorou a mensagem",
  }),
  activityLog: defineLocalizedText({
    en: "Activity log",
    fr: "Historique",
    de: "Aktivitätsprotokoll",
    es: "Registro de actividad",
    pt: "Registo de atividade",
  }),
  languagesLabel: defineLocalizedText({
    en: "Languages",
    fr: "Langues",
    de: "Sprachen",
    es: "Idiomas",
    pt: "Idiomas",
  }),
  languagesTitle: defineLocalizedText({
    en: "Use Maboria in multiple languages.",
    fr: "Utilisez Maboria en plusieurs langues.",
    de: "Nutze Maboria in mehreren Sprachen.",
    es: "Usa Maboria en varios idiomas.",
    pt: "Use a Maboria em varios idiomas.",
  }),
  languagesDescription: defineLocalizedText({
    en: "The product interface supports English, French, German, Spanish, and Portuguese. Switch languages from the header once you sign in.",
    fr: "L interface du produit prend en charge l anglais, le francais, l allemand, l espagnol et le portugais. Changez de langue depuis l en-tete apres connexion.",
    de: "Die Produktoberflache unterstutzt Englisch, Franzosisch, Deutsch, Spanisch und Portugiesisch. Wechsle die Sprache in der Kopfzeile, sobald du angemeldet bist.",
    es: "La interfaz del producto admite ingles, frances, aleman, espanol y portugues. Cambia el idioma desde el encabezado cuando inicies sesión.",
    pt: "A interface do produto suporta ingles, frances, alemao, espanhol e portugues. Mude o idioma no cabecalho depois de iniciar sessão.",
  }),
  trustLabel: defineLocalizedText({
    en: "Trust",
    fr: "Confiance",
    de: "Vertrauen",
    es: "Confianza",
    pt: "Confianca",
  }),
  trustTitle: defineLocalizedText({
    en: "Payments go straight to you - we do not hold your money.",
    fr: "Les paiements vont directement a vous - nous ne gardons pas vos fonds.",
    de: "Zahlungen gehen direkt an dich - wir verwahren dein Geld nicht.",
    es: "Los pagos van directamente a ti: no retenemos tu dinero.",
    pt: "Os pagamentos vao diretamente para si - nos não guardamos o seu dinheiro.",
  }),
  trustDescription: defineLocalizedText({
    en: "Maboria does not store or hold customer funds. Payments are processed by Paystack or Flutterwave and settled directly into your connected business account or sub-account. Maboria only detects payment status and triggers automations.",
    fr: "Maboria ne stocke pas les fonds clients. Les paiements sont traites par Paystack ou Flutterwave et verses sur votre compte. Maboria detecte le statut et declenche l automation.",
    de: "Maboria speichert oder verwahrt keine Kundengelder. Zahlungen werden von Paystack oder Flutterwave verarbeitet und direkt auf dein verbundenes Geschäftskonto oder Unterkonto ausgezahlt. Maboria erkennt nur den Zahlungsstatus und lost Automatisierungen aus.",
    es: "Maboria no almacena ni retiene fondos de clientes. Los pagos son procesados por Paystack o Flutterwave y liquidados directamente en tu cuenta empresarial conectada o subcuenta. Maboria solo detecta el estado del pago y activa automatizaciones.",
    pt: "A Maboria não armazena nem guarda fundos de clientes. Os pagamentos sao processados pela Paystack ou pela Flutterwave e liquidados diretamente na sua conta empresarial ligada ou subconta. A Maboria apenas deteta o estado do pagamento e ativa automações.",
  }),
  subaccountsLabel: defineLocalizedText({
    en: "Sub-accounts",
    fr: "Sous-comptes",
    de: "Unterkonten",
    es: "Subcuentas",
    pt: "Subcontas",
  }),
  subaccountsTitle: defineLocalizedText({
    en: "Collect payments with sub-accounts - without stress.",
    fr: "Collectez avec des sous-comptes - sans stress.",
    de: "Ziehe Zahlungen mit Unterkonten ein - ohne Stress.",
    es: "Cobra pagos con subcuentas, sin estres.",
    pt: "Receba pagamentos com subcontas, sem stress.",
  }),
  subaccountsDescription: defineLocalizedText({
    en: "Create sub-accounts for collections, sign in to your workspace, send invoices, and let customers pay once. Funds land directly in your connected account, while Maboria automatically confirms payment, issues receipts, updates records, and notifies your team.",
    fr: "Creez des sous-comptes, connectez-vous a votre espace, envoyez des factures, et laissez vos clients payer. Les fonds arrivent sur votre compte pendant que Maboria confirme, emet les recus, met a jour et notifie l équipe.",
    de: "Erstelle Unterkonten für Einzuge, melde dich in deinem Workspace an, sende Rechnungen und lass Kundinnen und Kunden einmal zahlen. Das Geld landet direkt auf deinem verbundenen Konto, wahrend Maboria die Zahlung automatisch bestatigt, Belege ausstellt, Datensatze aktualisiert und dein Team benachrichtigt.",
    es: "Crea subcuentas para cobros, inicia sesión en tu espacio de trabajo, envia facturas y déjà que los clientes paguen una sola vez. Los fondos llegan directamente a tu cuenta conectada, mientras Maboria confirma el pago, emite recibos, actualiza registros y notifica a tu equipo automaticamente.",
    pt: "Crie subcontas para cobrancas, inicie sessão no seu espaco de trabalho, envie faturas e deixe os clientes pagar uma vez. Os fundos entram diretamente na sua conta ligada, enquanto a Maboria confirma o pagamento, emite recibos, atualiza registos e notifica a sua equipa automaticamente.",
  }),
  workflowLabel: defineLocalizedText({
    en: "Workflow",
    fr: "Flux",
    de: "Ablauf",
    es: "Flujo",
    pt: "Fluxo",
  }),
  workflowTitle: defineLocalizedText({
    en: "What happens when you use Maboria",
    fr: "Ce qui se passe avec Maboria",
    de: "Was passiert, wenn du Maboria verwendest",
    es: "Que ocurre cuando usas Maboria",
    pt: "O que acontece quando usa a Maboria",
  }),
  featuresTitle: defineLocalizedText({
    en: "Everything you can automate - end to end.",
    fr: "Tout ce que vous pouvez automatiser.",
    de: "Alles, was du Ende zu Ende automatisieren kannst.",
    es: "Todo lo que puedes automatizar, de principio a fin.",
    pt: "Tudo o que pode automatizar, de ponta a ponta.",
  }),
  coverageLabel: defineLocalizedText({
    en: "Coverage",
    fr: "Couverture",
    de: "Abdeckung",
    es: "Cobertura",
    pt: "Cobertura",
  }),
  coverageTitle: defineLocalizedText({
    en: "Payment coverage that scales globally.",
    fr: "Couverture paiement a l echelle mondiale.",
    de: "Zahlungsabdeckung, die global skaliert.",
    es: "Cobertura de pagos que escala globalmente.",
    pt: "Cobertura de pagamentos que escala globalmente.",
  }),
  coverageDescription: defineLocalizedText({
    en: "Availability depends on provider and country.",
    fr: "La disponibilite depend du prestataire et du pays.",
    de: "Die Verfügbarkeit hangt vom Anbieter und Land ab.",
    es: "La disponibilidad depende del proveedor y del pais.",
    pt: "A disponibilidade depende do fornecedor e do pais.",
  }),
  pricingTitle: defineLocalizedText({
    en: "Choose how much of your operations you want to automate.",
    fr: "Choisissez combien automatiser.",
    de: "Wähle, wie viel deiner Ablaufe du automatisieren mochtest.",
    es: "Elige cuanto de tus operaciónes quieres automatizar.",
    pt: "Escolha quanto das suas operações quer automatizar.",
  }),
  ctaTitle: defineLocalizedText({
    en: "Build predictable revenue - without manual work.",
    fr: "Construisez un revenu previsible - sans travail manuel.",
    de: "Baue planbare Umsatze auf - ohne manuelle Arbeit.",
    es: "Crea ingresos previsibles sin trabajo manual.",
    pt: "Crie receita previsivel sem trabalho manual.",
  }),
  quickStartTitle: defineLocalizedText({
    en: "Get started in 2 minutes",
    fr: "Demarrage en 2 minutes",
    de: "In 2 Minuten loslegen",
    es: "Empieza en 2 minutos",
    pt: "Comece em 2 minutos",
  }),
  quickStartDescription: defineLocalizedText({
    en: "Create your workspace and launch your first automation.",
    fr: "Creez votre espace et lancez votre premiere automatisation.",
    de: "Erstelle deinen Workspace und starte deine erste Automatisierung.",
    es: "Crea tu espacio de trabajo y lanza tu primera automatización.",
    pt: "Crie o seu espaco de trabalho e lance a sua primeira automação.",
  }),
  footerHeading: defineLocalizedText({
    en: "Maboria Automation Cloud",
    fr: "Maboria Automation Cloud",
    de: "Maboria Automatisierungs-Cloud",
    es: "Maboria Nube de automatización",
    pt: "Maboria Nuvem de automação",
  }),
  allRightsReserved: defineLocalizedText({
    en: "All rights reserved.",
    fr: "Tous droits reserves.",
    de: "Alle Rechte vorbehalten.",
    es: "Todos los derechos reservados.",
    pt: "Todos os direitos reservados.",
  }),
};

const trustBullets: MarketingText[] = [
  defineLocalizedText({
    en: "No wallets",
    fr: "Pas de portefeuille",
    de: "Keine Wallets",
    es: "Sin carteras",
    pt: "Sem carteiras",
  }),
  defineLocalizedText({
    en: "No holding funds",
    fr: "Pas de fonds detenus",
    de: "Keine Verwährung von Geldern",
    es: "Sin retención de fondos",
    pt: "Sem retenção de fundos",
  }),
  defineLocalizedText({
    en: "No custody risk",
    fr: "Aucun risque de garde",
    de: "Kein Verwährungsrisiko",
    es: "Sin riesgo de custodia",
    pt: "Sem risco de custodia",
  }),
  defineLocalizedText({
    en: "Automated confirmation + receipts",
    fr: "Confirmation et recus automatiques",
    de: "Automatische Bestätigung und Belege",
    es: "Confirmacion y recibos automaticos",
    pt: "Confirmacao e recibos automaticos",
  }),
];

const workflowSteps: WorkflowStep[] = [
  defineLocalizedText({
    step: "01",
    en: "Create invoice",
    fr: "Creer une facture",
    de: "Rechnung erstellen",
    es: "Crear factura",
    pt: "Criar fatura",
  }),
  defineLocalizedText({
    step: "02",
    en: "Sign in to your workspace, then send by email or WhatsApp",
    fr: "Connectez-vous a votre espace, puis envoyez par email ou WhatsApp",
    de: "Melde dich in deinem Workspace an und sende dann per E-Mail oder WhatsApp",
    es: "Inicia sesión en tu espacio de trabajo y luego envia por correo o WhatsApp",
    pt: "Inicie sessão no seu espaco de trabalho e depois envie por email ou WhatsApp",
  }),
  defineLocalizedText({
    step: "03",
    en: "Customer pays via Paystack or Flutterwave",
    fr: "Paiement via Paystack ou Flutterwave",
    de: "Kundin oder Kunde bezahlt über Paystack oder Flutterwave",
    es: "El cliente paga con Paystack o Flutterwave",
    pt: "O cliente paga com Paystack ou Flutterwave",
  }),
  defineLocalizedText({
    step: "04",
    en: "Payment detected instantly",
    fr: "Paiement detecte instantanement",
    de: "Zahlung wird sofort erkannt",
    es: "Pago detectado al instante",
    pt: "Pagamento detetado instantaneamente",
  }),
  defineLocalizedText({
    step: "05",
    en: "Receipt issued automatically",
    fr: "Recu emis automatiquement",
    de: "Beleg wird automatisch erstellt",
    es: "Recibo emitido automaticamente",
    pt: "Recibo emitido automaticamente",
  }),
  defineLocalizedText({
    step: "06",
    en: "Follow-ups triggered if unpaid",
    fr: "Relances en cas d impaye",
    de: "Nachfassaktionen werden bei Nichtzahlung ausgelöst",
    es: "Seguimientos activados si no se paga",
    pt: "Seguimentos ativados se não houver pagamento",
  }),
  defineLocalizedText({
    step: "07",
    en: "Activity logged for your team",
    fr: "Activit? journalisee pour l équipe",
    de: "Aktivität wird für dein Team protokolliert",
    es: "Actividad registrada para tu equipo",
    pt: "Atividade registada para a sua equipa",
  }),
  defineLocalizedText({
    step: "08",
    en: "Reports generated automatically",
    fr: "Rapports generes automatiquement",
    de: "Berichte werden automatisch erstellt",
    es: "Reportes generados automaticamente",
    pt: "Relatórios gerados automaticamente",
  }),
];

const featureGroups: FeatureGroup[] = [
  {
    title: defineLocalizedText({
      en: "Automation",
      fr: "Automatisation",
      de: "Automatisierung",
      es: "Automatización",
      pt: "Automação",
    }),
    items: [
      defineLocalizedText({
        en: "Automate invoice creation",
        fr: "Automatiser la creation de factures",
        de: "Rechnungserstellung automatisieren",
        es: "Automatiza la creacion de facturas",
        pt: "Automatize a criacao de faturas",
      }),
      defineLocalizedText({
        en: "Automate email sending after login",
        fr: "Automatiser l envoi d emails apres connexion",
        de: "E-Mail-Versand nach der Anmeldung automatisieren",
        es: "Automatiza el envio de correos tras iniciar sesión",
        pt: "Automatize o envio de emails após iniciar sessão",
      }),
      defineLocalizedText({
        en: "Automate WhatsApp messaging after login",
        fr: "Automatiser les messages WhatsApp apres connexion",
        de: "WhatsApp-Nachrichten nach der Anmeldung automatisieren",
        es: "Automatiza los mensajes de WhatsApp tras iniciar sesión",
        pt: "Automatize as mensagens de WhatsApp após iniciar sessão",
      }),
      defineLocalizedText({
        en: "Automate receipts",
        fr: "Automatiser les recus",
        de: "Belege automatisieren",
        es: "Automatiza los recibos",
        pt: "Automatize os recibos",
      }),
      defineLocalizedText({
        en: "Automate follow-ups and escalation",
        fr: "Automatiser les relances",
        de: "Nachfassaktionen und Eskalationen automatisieren",
        es: "Automatiza seguimientos y escalaciones",
        pt: "Automatize seguimentos e escalacoes",
      }),
      defineLocalizedText({
        en: "Automate reports and summaries",
        fr: "Automatiser les rapports",
        de: "Berichte und Zusammenfassungen automatisieren",
        es: "Automatiza reportes y resumenes",
        pt: "Automatize relatórios e resumos",
      }),
    ],
  },
  {
    title: defineLocalizedText({
      en: "Unified Inbox",
      fr: "Boite de reception unifiee",
      de: "Vereinheitlichter Posteingang",
      es: "Bandeja unificada",
      pt: "Caixa de entrada unificada",
    }),
    items: [
      defineLocalizedText({
        en: "Manage email and WhatsApp conversations in one inbox after you sign in",
        fr: "Gerer les conversations email et WhatsApp dans une seule boite apres connexion",
        de: "Verwalte E-Mail- und WhatsApp-Konversationen nach der Anmeldung in einem Posteingang",
        es: "Gestiona conversaciones de correo y WhatsApp en una sola bandeja tras iniciar sesión",
        pt: "Gira conversas de email e WhatsApp numa unica caixa de entrada após iniciar sessão",
      }),
      defineLocalizedText({
        en: "Send email and WhatsApp messages directly from your logged-in workspace",
        fr: "Envoyer des messages email et WhatsApp depuis votre espace connecte",
        de: "Sende E-Mails und WhatsApp-Nachrichten direkt aus deinem angemeldeten Workspace",
        es: "Envia correos y mensajes de WhatsApp directamente desde tu espacio conectado",
        pt: "Envie emails e mensagens de WhatsApp diretamente do seu espaco iniciado",
      }),
      defineLocalizedText({
        en: "Trigger inbox follow-ups based on payment status and workflow events.",
        fr: "Declencher des relances de boite de reception selon le statut de paiement et les evenements du workflow.",
        de: "Lose Posteingang-Nachfassaktionen anhand von Zahlungsstatus und Workflow-Ereignissen aus.",
        es: "Activa seguimientos de bandeja segun el estado del pago y los eventos del flujo.",
        pt: "Ative seguimentos da caixa de entrada com base no estado do pagamento e nos eventos do fluxo.",
      }),
      defineLocalizedText({
        en: "No switching tools",
        fr: "Pas de changement d outil",
        de: "Kein Tool-Wechsel",
        es: "Sin cambiar de herramienta",
        pt: "Sem mudar de ferramenta",
      }),
    ],
  },
  {
    title: defineLocalizedText({
      en: "AI (Specific and useful)",
      fr: "IA (precise et utile)",
      de: "KI (konkret und nutzlich)",
      es: "IA (especifica y util)",
      pt: "IA (especifica e util)",
    }),
    items: [
      defineLocalizedText({
        en: "AI improves message tone before sending",
        fr: "L IA ajuste le ton avant envoi",
        de: "KI verbessert den Nachrichtenton vor dem Senden",
        es: "La IA mejora el tono del mensaje antes de enviarlo",
        pt: "A IA melhora o tom da mensagem antes do envio",
      }),
      defineLocalizedText({
        en: "AI assists workflow setup",
        fr: "L IA aide a configurer les workflows",
        de: "KI unterstutzt beim Einrichten von Workflows",
        es: "La IA ayuda a configurar flujos de trabajo",
        pt: "A IA ajuda a configurar fluxos de trabalho",
      }),
      defineLocalizedText({
        en: "AI generates summaries and insights",
        fr: "L IA genere des resumes",
        de: "KI erstellt Zusammenfassungen und Erkenntnisse",
        es: "La IA genera resumenes e información util",
        pt: "A IA gera resumos e informações uteis",
      }),
      defineLocalizedText({
        en: "AI reduces repetitive work (you stay in control)",
        fr: "L IA reduit le travail repetitif (vous gardez le controle)",
        de: "KI reduziert repetitive Arbeit (du behaltst die Kontrolle)",
        es: "La IA reduce el trabajo repetitivo (tu mantienes el control)",
        pt: "A IA reduz o trabalho repetitivo (mantem o controlo)",
      }),
    ],
  },
  {
    title: defineLocalizedText({
      en: "Teams + Logs + Visibility",
      fr: "Equipes + logs + visibilite",
      de: "Teams + Protokolle + Transparenz",
      es: "Equipos + registros + visibilidad",
      pt: "Equipas + registos + visibilidade",
    }),
    items: [
      defineLocalizedText({
        en: "Roles and permissions",
        fr: "Roles et permissions",
        de: "Rollen und Berechtigungen",
        es: "Roles y permisos",
        pt: "Funções e permissoes",
      }),
      defineLocalizedText({
        en: "Activity logs (invoice, payment, automation)",
        fr: "Journaux d activité",
        de: "Aktivitätsprotokolle (Rechnung, Zahlung, Automatisierung)",
        es: "Registros de actividad (factura, pago, automatización)",
        pt: "Registos de atividade (fatura, pagamento, automação)",
      }),
      defineLocalizedText({
        en: "Usage analytics",
        fr: "Analytique d usage",
        de: "Nutzungsanalysen",
        es: "Analitica de uso",
        pt: "Analitica de utilização",
      }),
      defineLocalizedText({
        en: "Download CSV report history",
        fr: "Historique CSV telechargeable",
        de: "CSV-Berichtsverlauf herunterladen",
        es: "Descargar historial de reportes CSV",
        pt: "Descarregar histórico de relatórios CSV",
      }),
    ],
  },
];

const coverageItems: MarketingText[] = [
  defineLocalizedText({
    en: "Cards (local & international)",
    fr: "Cartes (locales et internationales)",
    de: "Karten (lokal und international)",
    es: "Tarjetas (locales e internacionales)",
    pt: "Cartoes (locais e internacionais)",
  }),
  defineLocalizedText({
    en: "Bank transfers",
    fr: "Virements bancaires",
    de: "Banküberweisungen",
    es: "Transferencias bancarias",
    pt: "Transferencias bancarias",
  }),
  defineLocalizedText({
    en: "Mobile money (where supported)",
    fr: "Mobile money (selon pays)",
    de: "Mobile Money (wo unterstutzt)",
    es: "Dinero movil (donde este disponible)",
    pt: "Dinheiro movel (onde suportado)",
  }),
  defineLocalizedText({
    en: "Multi-currency billing and automatic conversion",
    fr: "Multi-devise et conversion automatique",
    de: "Abrechnung in mehreren Währungen und automatische Umrechnung",
    es: "Facturación multidivisa y conversion automatica",
    pt: "Faturação multimoeda e conversao automatica",
  }),
];

const supportedLanguages = [
  { flag: "🇬🇧", label: defineLocalizedText({ en: "English", fr: "Anglais", de: "Englisch", es: "Ingles", pt: "Ingles" }) },
  { flag: "🇫🇷", label: defineLocalizedText({ en: "French", fr: "Francais", de: "Franzosisch", es: "Frances", pt: "Frances" }) },
  { flag: "🇩🇪", label: defineLocalizedText({ en: "German", fr: "Allemand", de: "Deutsch", es: "Aleman", pt: "Alemao" }) },
  { flag: "🇪🇸", label: defineLocalizedText({ en: "Spanish", fr: "Espagnol", de: "Spanisch", es: "Espanol", pt: "Espanhol" }) },
  { flag: "🇵🇹", label: defineLocalizedText({ en: "Portuguese", fr: "Portugais", de: "Portugiesisch", es: "Portugues", pt: "Portugues" }) },
];

export default function LandingPage() {
  const logoSrc = "/branding/Maboria%20Company%20logo.png";
  return (
    <div className="relative min-h-screen bg-gradient-to-br from-background via-muted/40 to-background text-foreground max-md:overflow-x-hidden">
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -left-24 top-24 h-56 w-56 rounded-full bg-indigo-500/10 blur-[90px]" />
        <div className="absolute right-0 top-0 h-72 w-72 rounded-full bg-slate-500/10 blur-[110px]" />
      </div>
      <div className="fixed inset-x-0 top-0 z-50 border-b border-border bg-background/90 px-4 py-3 backdrop-blur md:hidden">
        <div className="flex w-full max-w-none items-center justify-between">
          <div className="flex items-center gap-3">
            <details className="relative [&>summary::-webkit-details-marker]:hidden">
              <summary className="list-none rounded-lg border border-border bg-card/80 p-2 text-slate-950 dark:text-foreground">
                <Menu className="h-5 w-5" />
              </summary>
              <div className="absolute left-0 top-12 w-44 rounded-xl border border-border bg-card p-2 shadow-lg">
                <a href="#features" className="block rounded-lg px-3 py-2 text-sm hover:bg-muted/60">
                  <LangText en="Features" fr="Fonctionnalites" />
                </a>
                <a href="#pricing" className="block rounded-lg px-3 py-2 text-sm hover:bg-muted/60">
                  <LangText en="Pricing" fr="Tarifs" />
                </a>
                <a href="#languages" className="block rounded-lg px-3 py-2 text-sm hover:bg-muted/60">
                  <LangText {...marketingCopy.languagesLabel} />
                </a>
                <Link href="/login" className="block rounded-lg px-3 py-2 text-sm hover:bg-muted/60">
                  <LangText en="Login" fr="Connexion" />
                </Link>
                <Link href="/signup" className="block rounded-lg px-3 py-2 text-sm hover:bg-muted/60">
                  <LangText en="Get started" fr="Commencer" />
                </Link>
              </div>
            </details>
              <Link href="/" className="flex items-center gap-2">
                <div className="relative h-8 w-8 overflow-hidden rounded-xl border border-border bg-card">
                  <Image src={logoSrc} alt="Maboria" fill sizes="32px" className="object-contain p-0 scale-110" priority />
                </div>
                <span className="text-sm font-semibold text-foreground">Maboria</span>
            </Link>
          </div>
          <Link href="/login">
            <Button size="sm">
              <LangText en="Sign in" fr="Se connecter" />
            </Button>
          </Link>
        </div>
      </div>

      <header className="sticky top-0 z-50 mx-auto hidden max-w-6xl items-center justify-between overflow-visible border-b border-border bg-background/85 px-6 py-4 backdrop-blur md:flex pointer-events-auto">
          <Link href="/" className="flex items-center gap-3">
            <div className="relative h-10 w-10 overflow-hidden rounded-2xl border border-border bg-card">
              <Image src={logoSrc} alt="Maboria" fill sizes="40px" className="object-contain p-0 scale-110" priority />
            </div>
          <div className="leading-tight">
            <p className="text-xs uppercase tracking-[0.25em] text-indigo-800 dark:text-indigo-300">Maboria</p>
            <p className="text-lg font-semibold text-foreground">
              <LangText {...marketingCopy.automationCloud} />
            </p>
          </div>
        </Link>
        <nav className="hidden items-center gap-6 text-sm font-medium text-muted-foreground md:flex">
          <a href="#features" className="transition hover:text-foreground">
            <LangText en="Features" fr="Fonctionnalites" />
          </a>
          <a href="#pricing" className="transition hover:text-foreground">
            <LangText en="Pricing" fr="Tarifs" />
          </a>
          <a href="#languages" className="transition hover:text-foreground">
            <LangText {...marketingCopy.languagesLabel} />
          </a>
        </nav>
        <div className="relative z-50 hidden items-center gap-3 sm:flex">
          <MarketingHeaderActions />
          <MarketingCta variant="header" />
        </div>
      </header>

      <main className="relative z-10 pointer-events-auto mx-auto max-w-6xl px-6 pb-16 pt-24 md:pt-10">
        <section className="grid gap-12 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <div className="space-y-6">
            <p className="text-xs uppercase tracking-[0.3em] text-indigo-800 dark:text-indigo-300">
              <LangText en="Maboria" fr="Maboria" />
            </p>
            <h1 className="text-4xl font-semibold leading-[1.05] tracking-tight text-foreground md:text-6xl">
              <LangText {...marketingCopy.heroTitle} />
            </h1>
            <p className="text-lg text-slate-900 dark:text-slate-300">
              <LangText {...marketingCopy.heroDescription} />
            </p>
            <MarketingCta variant="hero" />
            <div className="flex flex-col gap-2 text-xs text-slate-900 dark:text-slate-300">
              <div className="flex flex-wrap items-center gap-3">
                <PaystackLogo className="payment-logo-color h-6 w-auto" />
                <Image
                  src="/payment-logos/flutterwave.png"
                  alt="Flutterwave"
                  width={144}
                  height={40}
                  className="payment-logo-color h-9 w-auto"
                />
              </div>
              <span>
                <LangText {...marketingCopy.paymentsPoweredBy} />
              </span>
            </div>
          </div>
          <div className="relative">
            <div className="absolute -right-10 -top-10 hidden h-28 w-28 rounded-full bg-indigo-500/20 blur-3xl lg:block" />
            <div
              className="relative overflow-hidden rounded-[28px] border border-slate-200 bg-slate-50 p-6 text-slate-900 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.25)] dark:border-slate-700 dark:bg-slate-900/88 dark:text-slate-100 dark:shadow-[0_24px_48px_-28px_rgba(2,6,23,0.55)]"
            >
              <div className="flex items-center justify-between text-xs text-slate-900 dark:text-slate-100">
                <span>
                  <LangText {...marketingCopy.collectionsOverview} />
                </span>
                <span className="rounded-full bg-emerald-200 px-2 py-0.5 text-[10px] font-semibold text-emerald-900 ring-1 ring-emerald-300 dark:bg-emerald-400/12 dark:text-emerald-300 dark:ring-emerald-400/30">
                  <LangText en="Live" fr="Actif" />
                </span>
              </div>
              <div className="mt-6 grid gap-4">
                <div className="grid gap-2">
                  <div className="h-2 w-32 rounded-full border border-slate-200 bg-slate-400/70 shadow-[inset_0_0_0_1px_rgba(15,23,42,0.04)] dark:border-slate-700 dark:bg-slate-700" />
                  <div className="h-2 w-48 rounded-full border border-slate-200 bg-slate-400/70 shadow-[inset_0_0_0_1px_rgba(15,23,42,0.04)] dark:border-slate-700 dark:bg-slate-700" />
                </div>
                <div className="grid gap-3">
                  <div className="flex items-center justify-between text-xs font-semibold text-slate-900 dark:text-slate-100">
                    <span>
                      <LangText {...marketingCopy.paymentDetected} />
                    </span>
                    <span className="font-semibold">$12,480</span>
                  </div>
                  <div className="h-3 w-full rounded-full bg-slate-300/80 dark:bg-slate-800">
                    <div className="h-3 w-4/5 rounded-full bg-indigo-600 dark:bg-indigo-500" />
                  </div>
                </div>
                <div className="grid gap-2 text-xs text-slate-900 dark:text-slate-100">
                  <div className="flex items-center justify-between">
                    <span>
                      <LangText {...marketingCopy.receiptIssued} />
                    </span>
                    <span className="font-semibold">
                      <LangText {...marketingCopy.automated} />
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>
                      <LangText {...marketingCopy.aiImprovedMessage} />
                    </span>
                    <span className="font-semibold">
                      <LangText en="Ready" fr="Pret" />
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>
                      <LangText {...marketingCopy.activityLog} />
                    </span>
                    <span className="font-semibold">
                      <LangText en="Live" fr="Actif" />
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="languages" className="mt-14 scroll-mt-24 border-t border-border pt-8">
          <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
            <div className="space-y-3">
              <p className="text-xs uppercase tracking-[0.25em] text-indigo-800 dark:text-indigo-300">
                <LangText {...marketingCopy.languagesLabel} />
              </p>
              <h2 className="text-2xl font-semibold text-foreground">
                <LangText {...marketingCopy.languagesTitle} />
              </h2>
              <p className="text-sm text-slate-900 dark:text-slate-300">
                <LangText {...marketingCopy.languagesDescription} />
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {supportedLanguages.map((language) => (
                <div
                  key={language.label.en}
                  className="flex items-center gap-3 px-1 py-2 text-sm"
                >
                  <span className="text-xl leading-none" aria-hidden="true">
                    {language.flag}
                  </span>
                  <span className="font-medium text-slate-900 dark:text-slate-100">
                    <LangText {...language.label} />
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mt-14 border-t border-border pt-8">
          <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
            <div className="space-y-3">
              <p className="text-xs uppercase tracking-[0.25em] text-indigo-800 dark:text-indigo-300">
                <LangText {...marketingCopy.trustLabel} />
              </p>
              <h2 className="text-2xl font-semibold text-foreground">
                <LangText {...marketingCopy.trustTitle} />
              </h2>
              <p className="text-sm text-slate-900 dark:text-slate-300">
                <LangText {...marketingCopy.trustDescription} />
              </p>
            </div>
            <div className="space-y-3 text-sm text-slate-900 dark:text-slate-300">
              {trustBullets.map((item) => (
                <div key={item.en} className="flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600 dark:text-emerald-300" />
                  <LangText {...item} />
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mt-14 border-t border-border pt-8">
          <div className="space-y-3">
            <p className="text-xs uppercase tracking-[0.25em] text-indigo-800 dark:text-indigo-300">
              <LangText {...marketingCopy.subaccountsLabel} />
            </p>
            <h2 className="text-2xl font-semibold text-foreground">
              <LangText {...marketingCopy.subaccountsTitle} />
            </h2>
            <p className="text-sm text-slate-900 dark:text-slate-300">
              <LangText {...marketingCopy.subaccountsDescription} />
            </p>
          </div>
        </section>

        <section className="mt-14 border-t border-border pt-8">
          <div className="space-y-3">
            <p className="text-xs uppercase tracking-[0.25em] text-indigo-800 dark:text-indigo-300">
              <LangText {...marketingCopy.workflowLabel} />
            </p>
            <h2 className="text-2xl font-semibold text-foreground">
              <LangText {...marketingCopy.workflowTitle} />
            </h2>
          </div>
          <div className="mt-6 space-y-4">
            {workflowSteps.map((step) => (
              <div key={step.step} className="flex items-start gap-4">
                <div className="flex h-8 w-8 items-center justify-center rounded-full border border-border text-xs font-semibold text-indigo-700 dark:text-indigo-200">
                  {step.step}
                </div>
                <div className="border-l border-border pl-4 text-sm text-slate-900 dark:text-slate-300">
                  <LangText {...step} />
                </div>
              </div>
            ))}
          </div>
        </section>

        <section id="features" className="mt-14 border-t border-border pt-8">
          <div className="space-y-3">
            <p className="text-xs uppercase tracking-[0.25em] text-indigo-800 dark:text-indigo-300">
              <LangText en="Features" fr="Fonctionnalites" />
            </p>
            <h2 className="text-2xl font-semibold text-foreground">
              <LangText {...marketingCopy.featuresTitle} />
            </h2>
          </div>
          <div className="mt-6 grid gap-8 md:grid-cols-2">
            {featureGroups.map((group) => (
              <div key={group.title.en} className="space-y-3">
                <h3 className="text-base font-semibold text-foreground">
                  <LangText {...group.title} />
                </h3>
                <ul className="space-y-2 text-sm text-slate-900 dark:text-slate-300">
                  {group.items.map((item) => (
                    <li key={item.en} className="flex items-start gap-2">
                      <span className="mt-2 h-1.5 w-1.5 rounded-full bg-indigo-500/70" />
                      <LangText {...item} />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-14 border-t border-border pt-8">
          <div className="space-y-3">
            <p className="text-xs uppercase tracking-[0.25em] text-indigo-800 dark:text-indigo-300">
              <LangText {...marketingCopy.coverageLabel} />
            </p>
            <h2 className="text-2xl font-semibold text-foreground">
              <LangText {...marketingCopy.coverageTitle} />
            </h2>
            <p className="text-sm text-slate-900 dark:text-slate-300">
              <LangText {...marketingCopy.coverageDescription} />
            </p>
          </div>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {coverageItems.map((item) => (
              <div key={item.en} className="flex items-start gap-3 text-sm text-slate-900 dark:text-slate-300">
                <span className="mt-1 h-1.5 w-1.5 rounded-full bg-indigo-500/70" />
                <LangText {...item} />
              </div>
            ))}
          </div>
        </section>

        <section id="pricing" className="mt-14 border-t border-border pt-8">
          <div className="mb-6 flex flex-col gap-2">
            <p className="text-xs uppercase tracking-[0.25em] text-indigo-800 dark:text-indigo-300">
              <LangText en="Pricing" fr="Tarifs" />
            </p>
            <h2 className="text-2xl font-semibold text-foreground">
              <LangText {...marketingCopy.pricingTitle} />
            </h2>
          </div>
          <PricingSection plans={plans} />
        </section>

        <section className="mt-14 border-t border-border pt-8 text-center">
          <h2 className="text-2xl font-semibold text-foreground">
            <LangText {...marketingCopy.ctaTitle} />
          </h2>
          <div className="mt-6 flex justify-center">
            <Link href="/signup">
              <Button size="md">
                <LangText en="Get started" fr="Commencer" />
              </Button>
            </Link>
          </div>
        </section>

        <section className="mt-8 md:hidden">
          <div className="rounded-2xl border border-border bg-card/70 px-4 py-4 text-center">
            <p className="text-sm font-semibold text-foreground">
              <LangText {...marketingCopy.quickStartTitle} />
            </p>
            <p className="mt-1 text-xs text-slate-900 dark:text-slate-300">
              <LangText {...marketingCopy.quickStartDescription} />
            </p>
            <MarketingCta variant="mobileCard" />
          </div>
        </section>
      </main>

      <footer className="border-t border-border bg-background/80 px-4 py-8 backdrop-blur md:px-6">
        <div className="mx-auto w-full max-w-6xl">
          <div className="grid grid-cols-1 gap-8 text-sm text-slate-600 max-md:max-w-none md:grid-cols-2 lg:grid-cols-4 dark:text-slate-300">
            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-foreground">
                <LangText {...marketingCopy.footerHeading} />
              </h3>
              <p className="text-sm leading-relaxed text-slate-500 dark:text-slate-400">
                <LangText {...marketingCopy.ctaTitle} />
              </p>
            </section>

            <section className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                <LangText en="Product" fr="Produit" />
              </h3>
              <nav className="flex flex-col gap-2">
                <Link href="/features" className="transition-colors duration-150 hover:text-indigo-600 dark:hover:text-indigo-300">
                  <LangText en="Features" fr="Fonctionnalites" />
                </Link>
                <Link href="/pricing" className="transition-colors duration-150 hover:text-indigo-600 dark:hover:text-indigo-300">
                  <LangText en="Pricing" fr="Tarifs" />
                </Link>
                <Link href="/faq" className="transition-colors duration-150 hover:text-indigo-600 dark:hover:text-indigo-300">
                  <LangText en="FAQ" fr="FAQ" />
                </Link>
              </nav>
            </section>

            <section className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                <LangText en="Company" fr="Entreprise" />
              </h3>
              <nav className="flex flex-col gap-2">
                <Link href="/terms" className="transition-colors duration-150 hover:text-indigo-600 dark:hover:text-indigo-300">
                  <LangText en="Terms" fr="Conditions" />
                </Link>
                <Link href="/privacy" className="transition-colors duration-150 hover:text-indigo-600 dark:hover:text-indigo-300">
                  <LangText en="Privacy" fr="Confidentialité" />
                </Link>
              </nav>
            </section>

            <section className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                <LangText en="Contact" fr="Contact" />
              </h3>
              <div className="flex flex-col gap-2">
                <a
                  href="mailto:support@mail.maboria.com"
                  className="flex items-center gap-2 hover:text-blue-600 transition-colors"
                >
                  <Mail size={18} />
                  support@mail.maboria.com
                </a>
                <a
                  href="mailto:billing@maboria.com"
                  className="flex items-center gap-2 hover:text-blue-600 transition-colors"
                >
                  <CreditCard size={18} />
                  billing@maboria.com
                </a>
                <a
                  href="mailto:info@maboria.com"
                  className="flex items-center gap-2 hover:text-blue-600 transition-colors"
                >
                  <Info size={18} />
                  info@maboria.com
                </a>
                <a
                  href="https://www.linkedin.com/in/maboria-inc-2157a13b2"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 hover:text-blue-600 transition-colors"
                >
                  <Linkedin size={18} />
                  LinkedIn
                </a>
              </div>
            </section>
          </div>

          <div className="mt-8 border-t border-border/70 pt-4 text-center text-xs text-slate-500 dark:text-slate-400">
            {"\u00A9"} {new Date().getFullYear()} Maboria Inc.{" "}
            <LangText {...marketingCopy.allRightsReserved} />
          </div>
        </div>
      </footer>
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 px-4 py-3 backdrop-blur md:hidden">
        <MarketingCta variant="mobileBar" />
      </div>
    </div>
  );
}

