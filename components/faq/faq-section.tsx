"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { useLanguage } from "@/components/providers/language-provider";
import { defineLocalizedText, getLocalizedText, type LocalizedText } from "@/lib/i18n";

type FaqItem = {
  question: LocalizedText;
  answer: LocalizedText;
};

type FaqSection = {
  id: string;
  title: LocalizedText;
  meta: LocalizedText;
  items: FaqItem[];
};

const text = (en: string, fr: string, de: string, es: string, pt: string) =>
  defineLocalizedText({ en, fr, de, es, pt });

const faqSections: FaqSection[] = [
  {
    id: "what",
    title: text("What Maboria Is", "Ce qu est Maboria", "Was Maboria ist", "Que es Maboria", "O que e a Maboria"),
    meta: text(
      "What Maboria does and who it's for",
      "Ce que fait Maboria et a qui cela s adresse",
      "Was Maboria macht und fuer wen es gedacht ist",
      "Que hace Maboria y para quien es",
      "O que a Maboria faz e para quem e"
    ),
    items: [
      {
        question: text("What is Maboria?", "Qu est-ce que Maboria ?", "Was ist Maboria?", "Que es Maboria?", "O que e a Maboria?"),
        answer: text(
          "Maboria is a revenue automation platform that helps businesses invoice customers, collect payments, send WhatsApp messages, automate follow-ups, generate receipts, and track operations from one dashboard.",
          "Maboria est une plateforme d automatisation des revenus qui aide les entreprises a facturer les clients, collecter les paiements, envoyer des messages WhatsApp, automatiser les relances, generer des recus et suivre les operations depuis un seul tableau de bord.",
          "Maboria ist eine Plattform fuer Umsatzautomatisierung, mit der Unternehmen Kunden Rechnungen stellen, Zahlungen einziehen, WhatsApp-Nachrichten senden, Nachfassaktionen automatisieren, Belege erstellen und Ablaeufe ueber ein einziges Dashboard verfolgen koennen.",
          "Maboria es una plataforma de automatización de ingresos que ayuda a las empresas a facturar a los clientes, cobrar pagos, enviar mensajes de WhatsApp, automatizar seguimientos, generar recibos y supervisar operaciónes desde un solo panel.",
          "A Maboria e uma plataforma de automatizacao de receitas que ajuda as empresas a faturar clientes, cobrar pagamentos, enviar mensagens no WhatsApp, automatizar acompanhamentos, gerar recibos e acompanhar operações a partir de um unico painel."
        ),
      },
      {
        question: text("Who is Maboria for?", "Pour qui est Maboria ?", "Fuer wen ist Maboria?", "Para quien es Maboria?", "Para quem e a Maboria?"),
        answer: text(
          "Maboria is for businesses that want predictable cash flow without manually chasing customers - founders, operators, and teams managing invoicing and collections.",
          "Maboria s adresse aux entreprises qui veulent une tresorerie previsible sans courir apres les clients manuellement : fondateurs, operateurs et équipes qui gèrent la facturation et les encaissements.",
          "Maboria ist fuer Unternehmen gedacht, die vorhersehbaren Cashflow wollen, ohne Kunden manuell hinterherzulaufen - Gruender, Operatoren und Teams, die Rechnungen und Einzuege verwalten.",
          "Maboria es para empresas que quieren un flujo de caja predecible sin perseguir manualmente a los clientes: fundadores, operadores y equipos que gestionan facturación y cobros.",
          "A Maboria e para empresas que querem fluxo de caixa previsivel sem perseguir clientes manualmente: fundadores, operadores e equipas que gerem faturação e cobrancas."
        ),
      },
    ],
  },
  {
    id: "payments",
    title: text("Payments & Trust", "Paiements et confiance", "Zahlungen und Vertrauen", "Pagos y confianza", "Pagamentos e confianca"),
    meta: text(
      "How money flows and who handles it",
      "Comment l argent circule et qui le gere",
      "Wie Geld fliesst und wer es abwickelt",
      "Como fluye el dinero y quien lo gestiona",
      "Como o dinheiro circula e quem o gere"
    ),
    items: [
      {
        question: text(
          "Does Maboria hold customer money?",
          "Maboria detient-elle l argent des clients ?",
          "Haelt Maboria Kundengelder?",
          "Maboria retiene el dinero de los clientes?",
          "A Maboria guarda o dinheiro dos clientes?"
        ),
        answer: text(
          "No. Maboria does not hold funds. Payments are processed by Paystack or Flutterwave and are paid directly into your connected business account or sub-account.",
          "Non. Maboria ne detient pas les fonds. Les paiements sont traites par Paystack ou Flutterwave et verses directement sur votre compte professionnel connecte ou votre sous-compte.",
          "Nein. Maboria haelt keine Gelder. Zahlungen werden von Paystack oder Flutterwave verarbeitet und direkt auf dein verbundenes Geschaeftskonto oder Unterkonto ausgezahlt.",
          "No. Maboria no retiene fondos. Los pagos son procesados por Paystack o Flutterwave y se abonan directamente en tu cuenta comercial conectada o subcuenta.",
          "Não. A Maboria não guarda fundos. Os pagamentos sao processados pela Paystack ou Flutterwave e enviados diretamente para a sua conta empresarial ligada ou subconta."
        ),
      },
      {
        question: text(
          "Is Maboria a wallet or payment processor?",
          "Maboria est-elle un portefeuille ou un processeur de paiement ?",
          "Ist Maboria eine Wallet oder ein Zahlungsabwickler?",
          "Maboria es una billetera o procesador de pagos?",
          "A Maboria e uma carteira ou um processador de pagamentos?"
        ),
        answer: text(
          "No. Maboria is not a wallet. It automates invoicing and operations. Payment processing and settlements are handled entirely by Paystack or Flutterwave.",
          "Non. Maboria n est pas un portefeuille. Elle automatise la facturation et les operations. Le traitement des paiements et les règlements sont entierement geres par Paystack ou Flutterwave.",
          "Nein. Maboria ist keine Wallet. Sie automatisiert Rechnungsstellung und Ablaeufe. Zahlungsabwicklung und Auszahlungen werden vollstaendig von Paystack oder Flutterwave uebernommen.",
          "No. Maboria no es una billetera. Automatiza la facturación y las operaciónes. El procesamiento de pagos y las liquidaciones son gestionados por completo por Paystack o Flutterwave.",
          "Não. A Maboria não e uma carteira. Ela automatiza a faturação e as operações. O processamento de pagamentos e as liquidacoes sao geridos inteiramente pela Paystack ou Flutterwave."
        ),
      },
      {
        question: text(
          "What happens when a customer pays an invoice?",
          "Que se passe-t-il lorsqu un client paie une facture ?",
          "Was passiert, wenn ein Kunde eine Rechnung bezahlt?",
          "Que pasa cuando un cliente paga una factura?",
          "O que acontece quando um cliente paga uma fatura?"
        ),
        answer: text(
          "Maboria detects the payment instantly, updates the invoice status, issues a receipt automatically (if enabled), and triggers any follow-ups or reports you've configured.",
          "Maboria detecte le paiement instantanement, met a jour le statut de la facture, emet automatiquement un recu (si active) et declenche les relances ou rapports que vous avez configures.",
          "Maboria erkennt die Zahlung sofort, aktualisiert den Rechnungsstatus, erstellt automatisch einen Beleg (falls aktiviert) und loest alle von dir konfigurierten Nachfassaktionen oder Berichte aus.",
          "Maboria detecta el pago al instante, actualiza el estado de la factura, emite un recibo automaticamente (si esta activado) y activa los seguimientos o informes que hayas configurado.",
          "A Maboria deteta o pagamento de imediato, atualiza o estado da fatura, emite automaticamente um recibo (se estiver ativado) e aciona os acompanhamentos ou relatórios que configurou."
        ),
      },
    ],
  },
  {
    id: "subaccounts",
    title: text(
      "Sub-Accounts & Payouts",
      "Sous-comptes et versements",
      "Unterkonten und Auszahlungen",
      "Subcuentas y pagos",
      "Subcontas e pagamentos"
    ),
    meta: text(
      "Where funds settle and why it matters",
      "Ou les fonds sont verses et pourquoi c est important",
      "Wo Gelder ausgezahlt werden und warum das wichtig ist",
      "Donde se liquidan los fondos y por que importa",
      "Onde os fundos sao liquidados e porque isso importa"
    ),
    items: [
      {
        question: text(
          "What is a sub-account in Maboria?",
          "Qu est-ce qu un sous-compte dans Maboria ?",
          "Was ist ein Unterkonto in Maboria?",
          "Que es una subcuenta en Maboria?",
          "O que e uma subconta na Maboria?"
        ),
        answer: text(
          "A sub-account is a payout destination connected through Paystack or Flutterwave. When customers pay, money goes directly into that account. Maboria does not store or delay funds.",
          "Un sous-compte est une destination de versement connectee via Paystack ou Flutterwave. Quand les clients paient, l argent va directement sur ce compte. Maboria ne stocke pas et ne retarde pas les fonds.",
          "Ein Unterkonto ist ein Auszahlungsziel, das ueber Paystack oder Flutterwave verbunden ist. Wenn Kunden zahlen, geht das Geld direkt auf dieses Konto. Maboria speichert oder verzoegert keine Gelder.",
          "Una subcuenta es un destino de pago conectado mediante Paystack o Flutterwave. Cuando los clientes pagan, el dinero va directamente a esa cuenta. Maboria no almacena ni retrasa fondos.",
          "Uma subconta e um destino de pagamento ligado pela Paystack ou Flutterwave. Quando os clientes pagam, o dinheiro vai diretamente para essa conta. A Maboria não armazena nem atrasa fundos."
        ),
      },
      {
        question: text(
          "Can payments go straight to my bank account?",
          "Les paiements peuvent-ils aller directement sur mon compte bancaire ?",
          "Koennen Zahlungen direkt auf mein Bankkonto gehen?",
          "Los pagos pueden ir directamente a mi cuenta bancaria?",
          "Os pagamentos podem ir diretamente para a minha conta bancaria?"
        ),
        answer: text(
          "Yes. Payments are settled directly to your connected business account or sub-account via the payment provider.",
          "Oui. Les paiements sont verses directement sur votre compte professionnel connecte ou votre sous-compte via le prestataire de paiement.",
          "Ja. Zahlungen werden ueber den Zahlungsanbieter direkt auf dein verbundenes Geschaeftskonto oder Unterkonto ausgezahlt.",
          "Si. Los pagos se liquidan directamente en tu cuenta comercial conectada o subcuenta a traves del proveedor de pagos.",
          "Sim. Os pagamentos sao liquidados diretamente na sua conta empresarial ligada ou subconta através do fornecedor de pagamentos."
        ),
      },
    ],
  },
  {
    id: "whatsapp",
    title: text(
      "WhatsApp Messaging",
      "Messagerie WhatsApp",
      "WhatsApp-Nachrichten",
      "Mensajeria de WhatsApp",
      "Mensagens no WhatsApp"
    ),
    meta: text(
      "Messaging inside Maboria and automation rules",
      "Messagerie dans Maboria et règles d automatisation",
      "Nachrichten in Maboria und Automatisierungsregeln",
      "Mensajeria dentro de Maboria y reglas de automatización",
      "Mensagens dentro da Maboria e regras de automatizacao"
    ),
    items: [
      {
        question: text(
          "Can I send WhatsApp messages from Maboria?",
          "Puis-je envoyer des messages WhatsApp depuis Maboria ?",
          "Kann ich WhatsApp-Nachrichten aus Maboria senden?",
          "Puedo enviar mensajes de WhatsApp desde Maboria?",
          "Posso enviar mensagens de WhatsApp a partir da Maboria?"
        ),
        answer: text(
          "Yes. You can send WhatsApp messages directly to customers from Maboria.",
          "Oui. Vous pouvez envoyer des messages WhatsApp directement aux clients depuis Maboria.",
          "Ja. Du kannst WhatsApp-Nachrichten direkt aus Maboria an Kunden senden.",
          "Si. Puedes enviar mensajes de WhatsApp directamente a los clientes desde Maboria.",
          "Sim. Pode enviar mensagens de WhatsApp diretamente para os clientes a partir da Maboria."
        ),
      },
      {
        question: text(
          "Can WhatsApp messages be automated?",
          "Les messages WhatsApp peuvent-ils être automatises ?",
          "Koennen WhatsApp-Nachrichten automatisiert werden?",
          "Se pueden automatizar los mensajes de WhatsApp?",
          "As mensagens de WhatsApp podem ser automatizadas?"
        ),
        answer: text(
          "Yes. You can automate WhatsApp reminders, payment confirmations, and follow-ups based on invoice status or payment events.",
          "Oui. Vous pouvez automatiser les rappels WhatsApp, les confirmations de paiement et les relances selon le statut de la facture ou les evenements de paiement.",
          "Ja. Du kannst WhatsApp-Erinnerungen, Zahlungsbestaetigungen und Nachfassaktionen basierend auf Rechnungsstatus oder Zahlungsereignissen automatisieren.",
          "Si. Puedes automatizar recordatorios de WhatsApp, confirmaciones de pago y seguimientos segun el estado de la factura o los eventos de pago.",
          "Sim. Pode automatizar lembretes no WhatsApp, confirmacoes de pagamento e acompanhamentos com base no estado da fatura ou nos eventos de pagamento."
        ),
      },
      {
        question: text(
          "Does Maboria have built-in email messaging?",
          "Maboria a-t-elle une messagerie email integree ?",
          "Hat Maboria integrierte E-Mail-Nachrichten?",
          "Maboria tiene mensajeria por correo integrada?",
          "A Maboria tem mensagens de email integradas?"
        ),
        answer: text(
          "Maboria's built-in communication channel is WhatsApp. Email notifications can be automated through integrations or workflows, but WhatsApp is the native channel inside the app.",
          "Le canal de communication integre de Maboria est WhatsApp. Les notifications email peuvent être automatisees via des integrations ou des workflows, mais WhatsApp est le canal natif dans l application.",
          "Der integrierte Kommunikationskanal von Maboria ist WhatsApp. E-Mail-Benachrichtigungen koennen ueber Integrationen oder Workflows automatisiert werden, aber WhatsApp ist der native Kanal in der App.",
          "El canal de comunicacion integrado de Maboria es WhatsApp. Las notificaciones por correo pueden automatizarse mediante integraciónes o flujos de trabajo, pero WhatsApp es el canal nativo dentro de la aplicación.",
          "O canal de comunicacao nativo da Maboria e o WhatsApp. As notificacoes por email podem ser automatizadas por integrações ou fluxos de trabalho, mas o WhatsApp e o canal nativo dentro da aplicacao."
        ),
      },
    ],
  },
  {
    id: "automation",
    title: text("Automation", "Automatisation", "Automatisierung", "Automatización", "Automatizacao"),
    meta: text(
      "What runs automatically once configured",
      "Ce qui s execute automatiquement une fois configure",
      "Was nach der Einrichtung automatisch laeuft",
      "Que se ejecuta automaticamente una vez configurado",
      "O que corre automaticamente depois de configurado"
    ),
    items: [
      {
        question: text(
          "What can I automate with Maboria?",
          "Que puis-je automatiser avec Maboria ?",
          "Was kann ich mit Maboria automatisieren?",
          "Que puedo automatizar con Maboria?",
          "O que posso automatizar com a Maboria?"
        ),
        answer: text(
          "You can automate invoice creation, payment receipts, WhatsApp reminders, overdue follow-ups, reports, and operational workflows.",
          "Vous pouvez automatiser la creation de factures, les recus de paiement, les rappels WhatsApp, les relances d impayes, les rapports et les workflows operationnels.",
          "Du kannst Rechnungserstellung, Zahlungsbelege, WhatsApp-Erinnerungen, ueberfaellige Nachfassaktionen, Berichte und operative Workflows automatisieren.",
          "Puedes automatizar la creacion de facturas, recibos de pago, recordatorios de WhatsApp, seguimientos por vencimiento, informes y flujos operativos.",
          "Pode automatizar a criacao de faturas, recibos de pagamento, lembretes no WhatsApp, acompanhamentos de atrasos, relatórios e fluxos operaciónais."
        ),
      },
      {
        question: text(
          "Do automations run automatically once set up?",
          "Les automatisations s executent-elles automatiquement une fois configurees ?",
          "Laufen Automatisierungen nach der Einrichtung automatisch?",
          "Las automatizaciones se ejecutan automaticamente una vez configuradas?",
          "As automatizacoes correm automaticamente depois de configuradas?"
        ),
        answer: text(
          "Yes. Once configured, automations run quietly in the background without manual action.",
          "Oui. Une fois configurees, les automatisations s executent discretement en arriere-plan sans action manuelle.",
          "Ja. Sobald sie eingerichtet sind, laufen Automatisierungen unauffaellig im Hintergrund ohne manuelle Aktion.",
          "Si. Una vez configuradas, las automatizaciones se ejecutan en segundo plano sin acción manual.",
          "Sim. Depois de configuradas, as automatizacoes correm em segundo plano sem ação manual."
        ),
      },
    ],
  },
  {
    id: "ai",
    title: text("AI Assistance", "Assistance IA", "KI-Unterstuetzung", "Asistencia con IA", "Assistencia com IA"),
    meta: text(
      "Where AI helps and where it doesn't",
      "Ou l IA aide et ou elle n aide pas",
      "Wo KI hilft und wo nicht",
      "Donde ayuda la IA y donde no",
      "Onde a IA ajuda e onde não"
    ),
    items: [
      {
        question: text(
          "What does AI do in Maboria?",
          "Que fait l IA dans Maboria ?",
          "Was macht KI in Maboria?",
          "Que hace la IA en Maboria?",
          "O que faz a IA na Maboria?"
        ),
        answer: text(
          "AI helps improve message wording, summarize activity, assist with automation setup, and reduce repetitive manual work.",
          "L IA aide a ameliorer la formulation des messages, resumer l activité, assister la configuration des automatisations et reduire le travail manuel repetitif.",
          "KI hilft dabei, Formulierungen zu verbessern, Aktivitaeten zusammenzufassen, bei der Einrichtung von Automatisierungen zu unterstuetzen und wiederholte manuelle Arbeit zu reduzieren.",
          "La IA ayuda a mejorar el texto de los mensajes, resumir la actividad, asistir en la configuración de automatizaciones y reducir el trabajo manual repetitivo.",
          "A IA ajuda a melhorar a redacao das mensagens, resumir a atividade, apoiar a configuração de automatizacoes e reduzir trabalho manual repetitivo."
        ),
      },
      {
        question: text(
          "Does AI act on its own?",
          "L IA agit-elle seule ?",
          "Handelt KI eigenstaendig?",
          "La IA actua por si sola?",
          "A IA age sozinha?"
        ),
        answer: text(
          "No. AI assists and suggests. Actions only run based on rules you configure.",
          "Non. L IA assiste et suggere. Les actions ne s executent qu en fonction des règles que vous configurez.",
          "Nein. KI unterstuetzt und schlaegt vor. Aktionen laufen nur auf Basis der Regeln, die du konfigurierst.",
          "No. La IA asiste y sugiere. Las acciones solo se ejecutan segun las reglas que configures.",
          "Não. A IA apoia e sugere. As ações so correm com base nas regras que configurar."
        ),
      },
    ],
  },
  {
    id: "teams",
    title: text(
      "Teams, Logs & Reports",
      "Equipes, journaux et rapports",
      "Teams, Protokolle und Berichte",
      "Equipos, registros e informes",
      "Equipas, registos e relatórios"
    ),
    meta: text(
      "Visibility, logs, and reporting",
      "Visibilite, journaux et rapports",
      "Transparenz, Protokolle und Berichte",
      "Visibilidad, registros e informes",
      "Visibilidade, registos e relatórios"
    ),
    items: [
      {
        question: text(
          "Can my team use Maboria together?",
          "Mon équipe peut-elle utiliser Maboria ensemble ?",
          "Kann mein Team Maboria gemeinsam nutzen?",
          "Puede mi equipo usar Maboria en conjunto?",
          "A minha equipa pode usar a Maboria em conjunto?"
        ),
        answer: text(
          "Yes. Pro, Growth, Business, and Enterprise plans can add team members and control access based on roles.",
          "Oui. Les plans Pro, Growth, Business et Enterprise peuvent ajouter des membres d equipe et controler l acces selon les roles.",
          "Ja. Mit Pro-, Growth-, Business- und Enterprise-Plänen kannst du Teammitglieder hinzufuegen und den Zugriff nach Rollen steuern.",
          "Si. Los planes Pro, Growth, Business y Enterprise pueden agregar miembros del equipo y controlar el acceso segun los roles.",
          "Sim. Os planos Pro, Growth, Business e Enterprise podem adicionar membros da equipa e controlar o acesso com base em funcoes."
        ),
      },
      {
        question: text(
          "Does Maboria keep activity logs?",
          "Maboria conserve-t-elle des journaux d activité ?",
          "Fuehrt Maboria Aktivitaetsprotokolle?",
          "Maboria guarda registros de actividad?",
          "A Maboria mantem registos de atividade?"
        ),
        answer: text(
          "Yes. Invoice activity, payment events, and automation execution are logged for visibility and tracking.",
          "Oui. L activité des factures, les evenements de paiement et l execution des automatisations sont journalises pour la visibilite et le suivi.",
          "Ja. Rechnungsaktivitaeten, Zahlungsereignisse und die Ausfuehrung von Automatisierungen werden fuer Transparenz und Nachverfolgung protokolliert.",
          "Si. La actividad de facturas, los eventos de pago y la ejecucion de automatizaciones se registran para visibilidad y seguimiento.",
          "Sim. A atividade das faturas, os eventos de pagamento e a execucao das automatizacoes sao registados para visibilidade e acompanhamento."
        ),
      },
      {
        question: text(
          "Can I export reports?",
          "Puis-je exporter des rapports ?",
          "Kann ich Berichte exportieren?",
          "Puedo exportar informes?",
          "Posso exportar relatórios?"
        ),
        answer: text(
          "Yes. You can download usage analytics and activity history as CSV files.",
          "Oui. Vous pouvez télécharger l analytique d usage et l'historique d activité sous forme de fichiers CSV.",
          "Ja. Du kannst Nutzungsanalysen und Aktivitaetsverlauf als CSV-Dateien herunterladen.",
          "Si. Puedes descargar analiticas de uso e historial de actividad como archivos CSV.",
          "Sim. Pode descarregar analises de utilização e histórico de atividade em ficheiros CSV."
        ),
      },
    ],
  },
  {
    id: "security",
    title: text(
      "Security & Reliability",
      "Sécurité et fiabilite",
      "Sicherheit und Zuverlaessigkeit",
      "Seguridad y fiabilidad",
      "Seguranca e fiabilidade"
    ),
    meta: text(
      "Reliability and governance for teams",
      "Fiabilite et gouvernance pour les équipes",
      "Zuverlaessigkeit und Governance fuer Teams",
      "Fiabilidad y gobierno para equipos",
      "Fiabilidade e governanca para equipas"
    ),
    items: [
      {
        question: text(
          "Is Maboria suitable for serious businesses?",
          "Maboria convient-elle aux entreprises serieuses ?",
          "Ist Maboria fuer anspruchsvolle Unternehmen geeignet?",
          "Maboria es adecuada para empresas serias?",
          "A Maboria e adequada para empresas exigentes?"
        ),
        answer: text(
          "Yes. Maboria includes role-based access, audit logs, and operational visibility designed for teams that need reliability and control.",
          "Oui. Maboria inclut un accès base sur les roles, des journaux d audit et une visibilite operationnelle concus pour les équipes qui ont besoin de fiabilite et de controle.",
          "Ja. Maboria bietet rollenbasierten Zugriff, Audit-Protokolle und operative Transparenz fuer Teams, die Zuverlaessigkeit und Kontrolle brauchen.",
          "Si. Maboria incluye acceso basado en roles, registros de auditoria y visibilidad operativa pensados para equipos que necesitan fiabilidad y control.",
          "Sim. A Maboria inclui acesso baseado em funções, registos de auditoria e visibilidade operaciónal pensados para equipas que precisam de fiabilidade e controlo."
        ),
      },
    ],
  },
  {
    id: "pricing",
    title: text("Pricing", "Tarification", "Preise", "Precios", "Precos"),
    meta: text(
      "Plan limits and upgrade behavior",
      "Limites des plans et fonctionnement des mises a niveau",
      "Tarifgrenzen und Upgrade-Verhalten",
      "Limites del plan y comportamiento de actualización",
      "Limites do plano e comportamento de upgrade"
    ),
    items: [
      {
        question: text(
          "What determines plan limits?",
          "Qu est-ce qui determine les limites du plan ?",
          "Wodurch werden Tarifgrenzen bestimmt?",
          "Que determina los limites del plan?",
          "O que determina os limites do plano?"
        ),
        answer: text(
          "Plans are based on invoice volume, WhatsApp message usage, AI usage, automations, and number of team members.",
          "Les plans sont bases sur le volume de factures, l utilisation des messages WhatsApp, l utilisation de l IA, les automatisations et le nombre de membres d équipe.",
          "Tarife basieren auf Rechnungsvolumen, WhatsApp-Nutzung, KI-Nutzung, Automatisierungen und der Anzahl der Teammitglieder.",
          "Los planes se basan en el volumen de facturas, el uso de mensajes de WhatsApp, el uso de IA, las automatizaciones y el numero de miembros del equipo.",
          "Os planos baseiam-se no volume de faturas, uso de mensagens WhatsApp, uso de IA, automatizacoes e numero de membros da equipa."
        ),
      },
      {
        question: text(
          "Can I upgrade later?",
          "Puis-je changer d offre plus tard ?",
          "Kann ich spaeter upgraden?",
          "Puedo actualizar mas adelante?",
          "Posso fazer upgrade mais tarde?"
        ),
        answer: text(
          "Yes. You can change plans as your business grows.",
          "Oui. Vous pouvez changer d offre a mesure que votre entreprise grandit.",
          "Ja. Du kannst den Tarif wechseln, wenn dein Unternehmen waechst.",
          "Si. Puedes cambiar de plan a medida que crece tu negocio.",
          "Sim. Pode mudar de plano a medida que o seu negocio cresce."
        ),
      },
    ],
  },
  {
    id: "support",
    title: text("Support", "Support", "Support", "Soporte", "Suporte"),
    meta: text(
      "How to reach the team",
      "Comment joindre l équipe",
      "Wie du das Team erreichst",
      "Como contactar con el equipo",
      "Como contactar a equipa"
    ),
    items: [
      {
        question: text(
          "Which email should I contact?",
          "Quelle adresse email dois-je contacter ?",
          "Welche E-Mail sollte ich kontaktieren?",
          "Que correo deberia contactar?",
          "Que email devo contactar?"
        ),
        answer: text(
          "Support -> support@maboria.com (app help and issues). Billing -> billing@maboria.com (subscriptions and payments). General -> info@maboria.com.",
          "Support -> support@maboria.com (aide et problemes de l application). Facturation -> billing@maboria.com (abonnements et paiements). General -> info@maboria.com.",
          "Support -> support@maboria.com (App-Hilfe und Probleme). Abrechnung -> billing@maboria.com (Abos und Zahlungen). Allgemein -> info@maboria.com.",
          "Soporte -> support@maboria.com (ayuda de la aplicación y problemas). Facturación -> billing@maboria.com (suscripciones y pagos). General -> info@maboria.com.",
          "Suporte -> support@maboria.com (ajuda na aplicacao e problemas). Faturação -> billing@maboria.com (subscricoes e pagamentos). Geral -> info@maboria.com."
        ),
      },
      {
        question: text(
          "When will you reply?",
          "Quand repondez-vous ?",
          "Wann antwortet ihr?",
          "Cuando responderan?",
          "Quando vao responder?"
        ),
        answer: text(
          "Usually within 24 hours.",
          "Generalement sous 24 heures.",
          "Normalerweise innerhalb von 24 Stunden.",
          "Normalmente en un plazo de 24 horas.",
          "Normalmente dentro de 24 horas."
        ),
      },
    ],
  },
];

export function FAQSection() {
  const { language } = useLanguage();
  const t = (text: LocalizedText) => getLocalizedText(text, language);
  const [query, setQuery] = useState("");
  const highlightMatch = (text: string, needle: string) => {
    const q = needle.trim();
    if (!q) return text;
    const lower = text.toLowerCase();
    const lowerNeedle = q.toLowerCase();
    const parts: Array<string | { match: string }> = [];
    let start = 0;
    let index = lower.indexOf(lowerNeedle);
    while (index !== -1) {
      if (index > start) parts.push(text.slice(start, index));
      parts.push({ match: text.slice(index, index + q.length) });
      start = index + q.length;
      index = lower.indexOf(lowerNeedle, start);
    }
    if (start < text.length) parts.push(text.slice(start));
    return parts.map((part, i) =>
      typeof part === "string" ? (
        <span key={`text-${i}`}>{part}</span>
      ) : (
        <span key={`match-${i}`} className="faq-highlight">
          {part.match}
        </span>
      )
    );
  };
  const filteredSections = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return faqSections;
    return faqSections
      .map((section) => {
        const items = section.items.filter((item) => {
          const question = getLocalizedText(item.question, language).toLowerCase();
          const answer = getLocalizedText(item.answer, language).toLowerCase();
          return question.includes(q) || answer.includes(q);
        });
        return { ...section, items };
      })
      .filter((section) => section.items.length > 0);
  }, [language, query]);

  return (
    <section className="faq-container">
      <div className="flex flex-col items-center gap-5">
        <div className="space-y-2 text-center">
          <p className="faq-section-title">{t(text("FAQ", "FAQ", "FAQ", "FAQ", "FAQ"))}</p>
          <h1 className="faq-title">
            {t(
              text(
                "Frequently Asked Questions",
                "Questions frequentes",
                "Haeufig gestellte Fragen",
                "Preguntas frecuentes",
                "Perguntas frequentes"
              )
            )}
          </h1>
          <p className="faq-updated">
            {t(
              text(
                "Clear answers about payments, automation, WhatsApp messaging, AI assistance, and how Maboria works.",
                "Des réponses claires sur les paiements, l automatisation, la messagerie WhatsApp, l assistance IA et le fonctionnement de Maboria.",
                "Klare Antworten zu Zahlungen, Automatisierung, WhatsApp-Nachrichten, KI-Unterstuetzung und dazu, wie Maboria funktioniert.",
                "Respuestas claras sobre pagos, automatización, mensajeria de WhatsApp, asistencia con IA y como funciona Maboria.",
                "Respostas claras sobre pagamentos, automatizacao, mensagens no WhatsApp, assistencia com IA e como a Maboria funciona."
              )
            )}
          </p>
        </div>

        <div className="relative w-full md:max-w-sm mx-auto">
          <Search className="absolute left-6 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t(
              text(
                "Search questions...",
                "Rechercher des questions...",
                "Fragen suchen...",
                "Buscar preguntas...",
                "Pesquisar perguntas..."
              )
            )}
            className="faq-search"
            aria-label={t(
              text(
                "Search questions...",
                "Rechercher des questions...",
                "Fragen suchen...",
                "Buscar preguntas...",
                "Pesquisar perguntas..."
              )
            )}
            style={{ paddingLeft: "3.75rem", paddingRight: "1rem" }}
          />
        </div>
      </div>

      <div className="mt-10 space-y-10 text-left">
        {filteredSections.length === 0 ? (
          <div className="text-sm text-muted-foreground">
            {t(
              text(
                "No matching questions yet.",
                "Aucune question correspondante pour le moment.",
                "Noch keine passenden Fragen gefunden.",
                "Aún no hay preguntas coincidentes.",
                "Ainda não existem perguntas correspondentes."
              )
            )}
          </div>
        ) : (
          filteredSections.map((section) => (
            <div key={section.id}>
              <p className="faq-section-title">{getLocalizedText(section.title, language)}</p>
              <p className="text-sm text-muted-foreground">{getLocalizedText(section.meta, language)}</p>
              <div className="mt-4 space-y-5">
                {section.items.map((item) => (
                  <div key={item.question.en} className="space-y-2">
                    <p className="faq-question">
                      {highlightMatch(getLocalizedText(item.question, language), query)}
                    </p>
                    <p className="faq-answer">
                      {highlightMatch(getLocalizedText(item.answer, language), query)}
                    </p>
                    <div className="faq-divider" />
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      <div className="mt-12 text-center">
        <p className="text-lg font-semibold text-foreground">
          {t(
            text(
              "Still have questions?",
              "Vous avez encore des questions ?",
              "Noch Fragen?",
              "Aún tienes preguntas?",
              "Ainda tem perguntas?"
            )
          )}
        </p>
        <div className="mt-4 flex justify-center">
          <a
            href="/signup"
            className="rounded-full bg-indigo-600 px-6 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500"
          >
            {t(text("Get started", "Commencer", "Loslegen", "Empezar", "Comecar"))}
          </a>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          {t(
            text(
              "Last updated: Feb 2026",
              "Derniere mise a jour : fev 2026",
              "Zuletzt aktualisiert: Feb 2026",
              "Ultima actualizacion: feb 2026",
              "Ultima atualizacao: fev 2026"
            )
          )}
        </p>
      </div>
    </section>
  );
}

