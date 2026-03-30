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

type InboxCompareColumn = {
  title: MarketingText;
  items: MarketingText[];
};

type InboxMetric = {
  value: string;
  label: MarketingText;
};

type InboxThread = {
  customer: string;
  channel: "Gmail" | "Outlook" | "WhatsApp";
  preview: MarketingText;
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
  inboxLabel: defineLocalizedText({
    en: "Unified Inbox",
    fr: "Boite de reception unifiee",
    de: "Vereinheitlichter Posteingang",
    es: "Bandeja unificada",
    pt: "Caixa de entrada unificada",
  }),
  inboxTitle: defineLocalizedText({
    en: "One inbox for every customer conversation.",
    fr: "Une seule boite pour chaque conversation client.",
    de: "Ein Posteingang fur jede Kundennachricht.",
    es: "Una sola bandeja para cada conversacion con clientes.",
    pt: "Uma unica caixa para cada conversa com clientes.",
  }),
  inboxDescription: defineLocalizedText({
    en: "Bring Gmail, Outlook, and WhatsApp into one workspace so your team can reply faster, stay aligned, and follow up without switching tabs.",
    fr: "Rassemblez Gmail, Outlook et WhatsApp dans un seul espace pour que votre equipe reponde plus vite, reste alignee et assure le suivi sans changer d onglet.",
    de: "Bringe Gmail, Outlook und WhatsApp in einen Workspace, damit dein Team schneller antwortet, abgestimmt bleibt und ohne Tab-Wechsel nachfasst.",
    es: "Reune Gmail, Outlook y WhatsApp en un solo espacio para que tu equipo responda mas rapido, se mantenga alineado y haga seguimiento sin cambiar de pestanas.",
    pt: "Junte Gmail, Outlook e WhatsApp num unico espaco para que a sua equipa responda mais rapido, fique alinhada e faca seguimento sem mudar de separador.",
  }),
  inboxCta: defineLocalizedText({
    en: "Start your unified inbox",
    fr: "Lancer votre boite unifiee",
    de: "Deinen Posteingang starten",
    es: "Lanza tu bandeja unificada",
    pt: "Inicie a sua caixa unificada",
  }),
  inboxPanelTitle: defineLocalizedText({
    en: "Live channels in one shared workspace",
    fr: "Canaux actifs dans un espace partage",
    de: "Aktive Kanale in einem gemeinsamen Workspace",
    es: "Canales activos en un espacio compartido",
    pt: "Canais ativos num espaco partilhado",
  }),
  inboxPanelBadge: defineLocalizedText({
    en: "Team ready",
    fr: "Equipe prete",
    de: "Team bereit",
    es: "Equipo listo",
    pt: "Equipa pronta",
  }),
  inboxFeedLabel: defineLocalizedText({
    en: "Inbox feed",
    fr: "Flux de la boite",
    de: "Posteingangs-Feed",
    es: "Flujo de bandeja",
    pt: "Fluxo da caixa",
  }),
  inboxComposeLabel: defineLocalizedText({
    en: "Reply from the right inbox",
    fr: "Repondre depuis la bonne boite",
    de: "Aus dem richtigen Postfach antworten",
    es: "Responder desde la bandeja correcta",
    pt: "Responder a partir da caixa certa",
  }),
  inboxComposeBadge: defineLocalizedText({
    en: "AI ready",
    fr: "IA prete",
    de: "KI bereit",
    es: "IA lista",
    pt: "IA pronta",
  }),
  inboxFromLabel: defineLocalizedText({
    en: "From",
    fr: "Depuis",
    de: "Von",
    es: "Desde",
    pt: "De",
  }),
  inboxCustomerLabel: defineLocalizedText({
    en: "Customer",
    fr: "Client",
    de: "Kunde",
    es: "Cliente",
    pt: "Cliente",
  }),
  inboxDraftPreview: defineLocalizedText({
    en: "Draft prepared. Review, edit, and send from the selected channel without losing thread history.",
    fr: "Brouillon prepare. Relisez, modifiez et envoyez depuis le canal choisi sans perdre l historique du fil.",
    de: "Entwurf vorbereitet. Prufe, bearbeite und sende aus dem gewahlten Kanal, ohne den Verlauf zu verlieren.",
    es: "Borrador preparado. Revisa, edita y envia desde el canal elegido sin perder el historial del hilo.",
    pt: "Rascunho preparado. Reveja, edite e envie a partir do canal escolhido sem perder o historico da conversa.",
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
    en: "Create an invoice or billing flow",
    fr: "Creer une facture ou un flux de facturation",
    de: "Erstelle eine Rechnung oder einen Abrechnungsablauf",
    es: "Crea una factura o un flujo de cobro",
    pt: "Crie uma fatura ou um fluxo de cobranca",
  }),
  defineLocalizedText({
    step: "02",
    en: "Automation sends it by email or WhatsApp from your workspace",
    fr: "L automatisation l envoie par email ou WhatsApp depuis votre espace",
    de: "Die Automatisierung sendet sie aus deinem Workspace per E-Mail oder WhatsApp",
    es: "La automatizacion lo envia por correo o WhatsApp desde tu espacio de trabajo",
    pt: "A automacao envia por email ou WhatsApp a partir do seu espaco",
  }),
  defineLocalizedText({
    step: "03",
    en: "Customer replies by Gmail, Outlook, or WhatsApp",
    fr: "Le client repond par Gmail, Outlook ou WhatsApp",
    de: "Kundin oder Kunde antwortet uber Gmail, Outlook oder WhatsApp",
    es: "El cliente responde por Gmail, Outlook o WhatsApp",
    pt: "O cliente responde por Gmail, Outlook ou WhatsApp",
  }),
  defineLocalizedText({
    step: "04",
    en: "The conversation lands in one unified inbox for your team",
    fr: "La conversation arrive dans une boite unifiee pour votre equipe",
    de: "Die Konversation landet in einem gemeinsamen Posteingang fur dein Team",
    es: "La conversacion llega a una bandeja unificada para tu equipo",
    pt: "A conversa chega a uma caixa unificada para a sua equipa",
  }),
  defineLocalizedText({
    step: "05",
    en: "Your team replies from one place with full customer context",
    fr: "Votre equipe repond depuis un seul endroit avec tout le contexte client",
    de: "Dein Team antwortet an einem Ort mit vollem Kundenkontext",
    es: "Tu equipo responde desde un solo lugar con todo el contexto del cliente",
    pt: "A sua equipa responde a partir de um so lugar com todo o contexto do cliente",
  }),
  defineLocalizedText({
    step: "06",
    en: "Customer pays via Paystack or Flutterwave",
    fr: "Paiement via Paystack ou Flutterwave",
    de: "Kundin oder Kunde bezahlt uber Paystack oder Flutterwave",
    es: "El cliente paga con Paystack o Flutterwave",
    pt: "O cliente paga com Paystack ou Flutterwave",
  }),
  defineLocalizedText({
    step: "07",
    en: "If unpaid, recurring follow-ups keep running automatically",
    fr: "En cas d impaye, les relances recurrentes continuent automatiquement",
    de: "Bei Nichtzahlung laufen wiederkehrende Nachfassaktionen automatisch weiter",
    es: "Si no se paga, los seguimientos recurrentes siguen funcionando automaticamente",
    pt: "Se nao houver pagamento, os seguimentos recorrentes continuam automaticamente",
  }),
  defineLocalizedText({
    step: "08",
    en: "Receipts, team logs, and reports update automatically",
    fr: "Les recus, journaux d equipe et rapports se mettent a jour automatiquement",
    de: "Belege, Team-Protokolle und Berichte werden automatisch aktualisiert",
    es: "Los recibos, registros del equipo y reportes se actualizan automaticamente",
    pt: "Os recibos, registos da equipa e relatorios atualizam-se automaticamente",
  }),
];

const inboxComparison: InboxCompareColumn[] = [
  {
    title: defineLocalizedText({
      en: "Before Maboria",
      fr: "Avant Maboria",
      de: "Vor Maboria",
      es: "Antes de Maboria",
      pt: "Antes da Maboria",
    }),
    items: [
      defineLocalizedText({
        en: "Tabs everywhere across Gmail, Outlook, and WhatsApp",
        fr: "Des onglets partout entre Gmail, Outlook et WhatsApp",
        de: "Zu viele Tabs in Gmail, Outlook und WhatsApp",
        es: "Pestanas por todas partes entre Gmail, Outlook y WhatsApp",
        pt: "Separadores por todo o lado entre Gmail, Outlook e WhatsApp",
      }),
      defineLocalizedText({
        en: "Manual follow-ups and lost thread context",
        fr: "Relances manuelles et contexte perdu",
        de: "Manuelle Nachfassaktionen und verlorener Kontext",
        es: "Seguimientos manuales y contexto perdido",
        pt: "Seguimentos manuais e contexto perdido",
      }),
      defineLocalizedText({
        en: "Team replies from the wrong place or too late",
        fr: "L equipe repond depuis le mauvais endroit ou trop tard",
        de: "Das Team antwortet vom falschen Ort oder zu spat",
        es: "El equipo responde desde el lugar equivocado o demasiado tarde",
        pt: "A equipa responde do lugar errado ou tarde demais",
      }),
    ],
  },
  {
    title: defineLocalizedText({
      en: "With Maboria",
      fr: "Avec Maboria",
      de: "Mit Maboria",
      es: "Con Maboria",
      pt: "Com a Maboria",
    }),
    items: [
      defineLocalizedText({
        en: "Gmail, Outlook, and WhatsApp in one queue",
        fr: "Gmail, Outlook et WhatsApp dans une seule file",
        de: "Gmail, Outlook und WhatsApp in einer Queue",
        es: "Gmail, Outlook y WhatsApp en una sola cola",
        pt: "Gmail, Outlook e WhatsApp numa unica fila",
      }),
      defineLocalizedText({
        en: "The right sender, AI draft, and follow-up history stay together",
        fr: "Le bon expediteur, le brouillon IA et l historique de suivi restent ensemble",
        de: "Richtiger Absender, KI-Entwurf und Nachfassverlauf bleiben zusammen",
        es: "El remitente correcto, el borrador de IA y el historial de seguimiento permanecen juntos",
        pt: "O remetente certo, o rascunho de IA e o historico de seguimento ficam juntos",
      }),
      defineLocalizedText({
        en: "Your team works faster from one shared workspace",
        fr: "Votre equipe travaille plus vite depuis un espace partage",
        de: "Dein Team arbeitet schneller aus einem gemeinsamen Workspace",
        es: "Tu equipo trabaja mas rapido desde un espacio compartido",
        pt: "A sua equipa trabalha mais depressa a partir de um espaco partilhado",
      }),
    ],
  },
];

const inboxChannels = [
  { name: "Gmail", src: "/brand/Gmail_2020.svg" },
  { name: "Outlook", src: "/brand/outlook.svg" },
  { name: "WhatsApp", src: "/brand/whatsapp-svgrepo-com.svg" },
];

const inboxChannelMap = Object.fromEntries(inboxChannels.map((channel) => [channel.name, channel.src])) as Record<InboxThread["channel"], string>;

const inboxMetrics: InboxMetric[] = [
  {
    value: "2",
    label: defineLocalizedText({
      en: "email inboxes connected",
      fr: "boites email connectees",
      de: "verbundene E-Mail-Postfacher",
      es: "bandejas de correo conectadas",
      pt: "caixas de email ligadas",
    }),
  },
  {
    value: "1",
    label: defineLocalizedText({
      en: "WhatsApp line live",
      fr: "ligne WhatsApp active",
      de: "aktive WhatsApp-Leitung",
      es: "linea de WhatsApp activa",
      pt: "linha WhatsApp ativa",
    }),
  },
  {
    value: "1",
    label: defineLocalizedText({
      en: "shared team queue",
      fr: "file partagee d equipe",
      de: "gemeinsame Team-Queue",
      es: "cola compartida del equipo",
      pt: "fila partilhada da equipa",
    }),
  },
];

const inboxThreads: InboxThread[] = [
  {
    customer: "Clinique Noura",
    channel: "Gmail",
    preview: defineLocalizedText({
      en: "Invoice paid. Receipt sent and follow-up closed.",
      fr: "Facture payee. Recu envoye et suivi cloture.",
      de: "Rechnung bezahlt. Beleg gesendet und Nachverfolgung abgeschlossen.",
      es: "Factura pagada. Recibo enviado y seguimiento cerrado.",
      pt: "Fatura paga. Recibo enviado e seguimento fechado.",
    }),
  },
  {
    customer: "Atelier Solis",
    channel: "Outlook",
    preview: defineLocalizedText({
      en: "Customer asked for an updated invoice. Reply draft ready.",
      fr: "Le client a demande une facture mise a jour. Brouillon de reponse pret.",
      de: "Kunde hat nach einer aktualisierten Rechnung gefragt. Antwortentwurf ist bereit.",
      es: "El cliente pidio una factura actualizada. Borrador de respuesta listo.",
      pt: "O cliente pediu uma fatura atualizada. Rascunho de resposta pronto.",
    }),
  },
  {
    customer: "Casa Amari",
    channel: "WhatsApp",
    preview: defineLocalizedText({
      en: "Payment reminder queued for tomorrow morning.",
      fr: "Rappel de paiement planifie pour demain matin.",
      de: "Zahlungserinnerung fur morgen fruh eingeplant.",
      es: "Recordatorio de pago programado para manana por la manana.",
      pt: "Lembrete de pagamento agendado para amanha de manha.",
    }),
  },
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
        en: "Connect multiple Gmail and Outlook inboxes in one workspace",
        fr: "Connecter plusieurs boites Gmail et Outlook dans un seul espace",
        de: "Verbinde mehrere Gmail- und Outlook-Postfacher in einem Workspace",
        es: "Conecta multiples bandejas de Gmail y Outlook en un solo espacio",
        pt: "Ligue varias caixas Gmail e Outlook num unico espaco",
      }),
      defineLocalizedText({
        en: "Handle email and WhatsApp side by side in one shared queue",
        fr: "Traiter email et WhatsApp cote a cote dans une file partagee",
        de: "Bearbeite E-Mail und WhatsApp Seite an Seite in einer gemeinsamen Queue",
        es: "Gestiona correo y WhatsApp lado a lado en una cola compartida",
        pt: "Trate email e WhatsApp lado a lado numa fila partilhada",
      }),
      defineLocalizedText({
        en: "Reply from the exact inbox you choose before sending",
        fr: "Repondre depuis la boite exacte choisie avant l envoi",
        de: "Antworte vor dem Senden aus dem genau gewahlten Postfach",
        es: "Responde desde la bandeja exacta que elijas antes de enviar",
        pt: "Responda a partir da caixa exata que escolher antes de enviar",
      }),
      defineLocalizedText({
        en: "Keep assignments, AI drafts, and follow-up history in the same thread",
        fr: "Garder les attributions, brouillons IA et suivis dans le meme fil",
        de: "Halte Zuweisungen, KI-Entwurfe und Nachfassverlauf im selben Thread",
        es: "Mantiene asignaciones, borradores de IA e historial de seguimiento en el mismo hilo",
        pt: "Mantenha atribuicoes, rascunhos de IA e historico de seguimento na mesma conversa",
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
                <a href="#inbox" className="block rounded-lg px-3 py-2 text-sm hover:bg-muted/60">
                  <LangText {...marketingCopy.inboxLabel} />
                </a>
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
          <a href="#inbox" className="transition hover:text-foreground">
            <LangText {...marketingCopy.inboxLabel} />
          </a>
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

        <section id="inbox" className="mt-14 scroll-mt-24 border-t border-border pt-8">
          <div className="grid gap-8 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
            <div className="space-y-5">
              <div className="space-y-3">
                <p className="text-xs uppercase tracking-[0.25em] text-indigo-800 dark:text-indigo-300">
                  <LangText {...marketingCopy.inboxLabel} />
                </p>
                <h2 className="text-2xl font-semibold text-foreground md:text-3xl">
                  <LangText {...marketingCopy.inboxTitle} />
                </h2>
                <p className="text-sm leading-6 text-slate-900 dark:text-slate-300">
                  <LangText {...marketingCopy.inboxDescription} />
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-4">
                {inboxChannels.map((channel) => (
                  <div
                    key={channel.name}
                    className="flex items-center gap-2 text-sm font-medium text-slate-900 dark:text-slate-100"
                  >
                    <Image src={channel.src} alt={channel.name} width={20} height={20} className="h-5 w-5" />
                    <span>{channel.name}</span>
                  </div>
                ))}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {inboxComparison.map((column, index) => (
                  <div
                    key={column.title.en}
                    className={`rounded-2xl border p-4 ${
                      index === 0
                        ? "border-slate-200 bg-white/70 dark:border-slate-700 dark:bg-slate-900/60"
                        : "border-indigo-200 bg-indigo-50/80 dark:border-indigo-500/20 dark:bg-indigo-500/10"
                    }`}
                  >
                    <p className="text-sm font-semibold text-foreground">
                      <LangText {...column.title} />
                    </p>
                    <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-900 dark:text-slate-300">
                      {column.items.map((item) => (
                        <li key={item.en} className="flex items-start gap-2">
                          <span className="mt-2 h-1.5 w-1.5 rounded-full bg-indigo-500/70" />
                          <LangText {...item} />
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Link href="/signup">
                  <Button size="md">
                    <LangText {...marketingCopy.inboxCta} />
                  </Button>
                </Link>
              </div>
            </div>

            <div className="relative">
              <div className="absolute -left-8 -top-6 hidden h-24 w-24 rounded-full bg-indigo-500/15 blur-3xl lg:block" />
              <div className="relative overflow-hidden rounded-[30px] border border-slate-200 bg-white/85 p-5 shadow-[0_24px_56px_-32px_rgba(15,23,42,0.35)] dark:border-slate-700 dark:bg-slate-950/85">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
                      <LangText {...marketingCopy.inboxLabel} />
                    </p>
                    <h3 className="mt-1 text-lg font-semibold text-foreground">
                      <LangText {...marketingCopy.inboxPanelTitle} />
                    </h3>
                  </div>
                  <span className="rounded-full border border-emerald-300 bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
                    <LangText {...marketingCopy.inboxPanelBadge} />
                  </span>
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-3">
                  {inboxMetrics.map((metric) => (
                    <div
                      key={metric.label.en}
                      className="rounded-2xl border border-slate-200 bg-slate-50/90 p-4 dark:border-slate-800 dark:bg-slate-900/80"
                    >
                      <p className="text-2xl font-semibold text-foreground">{metric.value}</p>
                      <p className="mt-1 text-xs uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                        <LangText {...metric.label} />
                      </p>
                    </div>
                  ))}
                </div>

                <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-900/70">
                  <div className="mb-3">
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
                      <LangText {...marketingCopy.inboxFeedLabel} />
                    </p>
                  </div>
                  <div className="space-y-3">
                    {inboxThreads.map((thread) => {
                      const channelLogo = inboxChannelMap[thread.channel];

                      return (
                        <div
                          key={thread.customer}
                          className="flex items-start justify-between gap-3 rounded-2xl border border-slate-200 bg-white/95 p-3 dark:border-slate-800 dark:bg-slate-950/90"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-foreground">{thread.customer}</p>
                            <p className="mt-1 text-sm leading-6 text-slate-900 dark:text-slate-300">
                              <LangText {...thread.preview} />
                            </p>
                          </div>
                          <Image src={channelLogo} alt={thread.channel} width={24} height={24} className="mt-0.5 h-6 w-6 shrink-0" />
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="mt-5 rounded-2xl border border-indigo-200 bg-indigo-50/85 p-4 dark:border-indigo-500/20 dark:bg-indigo-500/10">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-foreground">
                      <LangText {...marketingCopy.inboxComposeLabel} />
                    </p>
                    <span className="rounded-full border border-indigo-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-indigo-700 dark:border-indigo-400/30 dark:bg-slate-950 dark:text-indigo-300">
                      <LangText {...marketingCopy.inboxComposeBadge} />
                    </span>
                  </div>
                  <div className="mt-3 grid gap-2 text-sm text-slate-900 dark:text-slate-200">
                    <div className="flex items-center justify-between gap-3 rounded-xl border border-indigo-100 bg-white/80 px-3 py-2 dark:border-indigo-400/10 dark:bg-slate-950/70">
                      <span className="text-slate-500 dark:text-slate-400">
                        <LangText {...marketingCopy.inboxFromLabel} />
                      </span>
                      <span className="font-medium text-foreground">ops@company.com</span>
                    </div>
                    <div className="flex items-center justify-between gap-3 rounded-xl border border-indigo-100 bg-white/80 px-3 py-2 dark:border-indigo-400/10 dark:bg-slate-950/70">
                      <span className="text-slate-500 dark:text-slate-400">
                        <LangText {...marketingCopy.inboxCustomerLabel} />
                      </span>
                      <span className="font-medium text-foreground">
                        <LangText
                          en="Atelier Solis"
                          fr="Atelier Solis"
                          de="Atelier Solis"
                          es="Atelier Solis"
                          pt="Atelier Solis"
                        />
                      </span>
                    </div>
                    <p className="rounded-xl border border-indigo-100 bg-white/80 px-3 py-3 leading-6 dark:border-indigo-400/10 dark:bg-slate-950/70">
                      <LangText {...marketingCopy.inboxDraftPreview} />
                    </p>
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
                  href="mailto:support@maboria.com"
                  className="flex items-center gap-2 hover:text-blue-600 transition-colors"
                >
                  <Mail size={18} />
                  support@maboria.com
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

