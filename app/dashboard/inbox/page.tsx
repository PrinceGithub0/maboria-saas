'use client';

import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import useSWR from 'swr';
import {
  CheckCircle2,
  ChevronRight,
  Filter,
  Inbox,
  LogOut,
  Paperclip,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Tag,
  UserCircle2,
} from 'lucide-react';
import { WhatsAppEmbeddedSignupCard } from '@/components/inbox/whatsapp-embedded-signup-card';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { PhoneInput } from '@/components/ui/phone-input';
import { Textarea } from '@/components/ui/textarea';
import { TransientAlert } from '@/components/ui/transient-alert';
import { useLanguage } from '@/components/providers/language-provider';
import { LANGUAGE_LOCALES } from '@/lib/i18n';
import { sanitizeInboundEmailDisplayText } from '@/lib/inbox/message-format';
import { formatDateTimeDMY } from '@/lib/date';

type ConversationStatus = 'OPEN' | 'WAITING_ON_CUSTOMER' | 'SNOOZED' | 'RESOLVED';
type ConversationTab = 'ALL' | ConversationStatus;
type AssigneeFilter = 'all' | 'mine' | 'unassigned';
type ChannelBrand = 'GMAIL' | 'OUTLOOK' | 'WHATSAPP';
type ComposeTargetMode = 'EXISTING' | 'NEW';
type RecentActivityItem = { id: string; brand: ChannelBrand; title: string; preview: string; time: string };

type Agent = {
  id: string;
  name: string | null;
  email: string;
  role: string;
};

type ConversationListItem = {
  id: string;
  status: ConversationStatus;
  inbox: { id: string; name: string; type: 'EMAIL' | 'WHATSAPP'; status: string };
  contact: { id: string; name: string; email: string; phone: string | null; status: string };
  assignedUser: { id: string; name: string | null; email: string } | null;
  tags: Array<{ id: string; label: string }>;
  unreadCount: number;
  lastMessageAt: string | null;
  snoozedUntil: string | null;
  waitingSince: string | null;
  lastInboundAt: string | null;
  lastOutboundAt: string | null;
  resolvedAt: string | null;
  lastMessage: {
    id: string;
    direction: string;
    content: string;
    createdAt: string;
    deliveryStatus: string;
  } | null;
};

type ConversationListPayload = { items: ConversationListItem[] };

type ConversationDetail = {
  id: string;
  status: ConversationStatus;
  unreadCount: number;
  snoozedUntil: string | null;
  waitingSince: string | null;
  lastInboundAt: string | null;
  lastOutboundAt: string | null;
  lastCustomerReplyAt: string | null;
  resolvedAt: string | null;
  inbox: { id: string; name: string; type: 'EMAIL' | 'WHATSAPP'; status: string };
  contact: {
    id: string;
    name: string;
    email: string;
    phone: string | null;
    status: string;
    createdAt: string;
    updatedAt: string;
  };
  assignedUser: { id: string; name: string | null; email: string } | null;
  tags: Array<{ id: string; label: string }>;
  messages: Array<{
    id: string;
    direction: 'INBOUND' | 'OUTBOUND' | 'INTERNAL' | 'SYSTEM';
    channel: 'EMAIL' | 'WHATSAPP';
    subject?: string | null;
    senderIdentifier: string | null;
    content: string;
    attachments?: Array<{ name?: string; type?: string; size?: number; dataUrl?: string }>;
    deliveryStatus: string;
    createdAt: string;
  }>;
  notes: Array<{
    id: string;
    content: string;
    createdAt: string;
    canDelete?: boolean;
    author: { id: string; name: string | null; email: string };
  }>;
  canViewBillingInsights: boolean;
  customerInsights: {
    recentInvoices: Array<{
      id: string;
      invoiceNumber: string;
      total: string;
      currency: string;
      status: string;
      generatedAt: string;
    }>;
    recentPayments: Array<{
      id: string;
      amount: string;
      currency: string;
      status: string;
      reference: string;
      createdAt: string;
    }>;
    overdueInvoices: Array<{
      id: string;
      invoiceNumber: string;
      total: string;
      currency: string;
      status: string;
      generatedAt: string;
    }>;
  } | null;
};

type CannedReply = { id: string; title: string; content: string };

type InboxSetupItem = {
  id: string;
  name: string;
  type: 'EMAIL' | 'WHATSAPP';
  status: string;
  connection:
    | {
        mode: 'oauth';
        connectedMailboxId: string;
        provider: 'GMAIL' | 'OUTLOOK';
        status: string;
        emailAddress: string;
        displayName: string | null;
        updatedAt: string;
      }
    | {
        mode: 'smtp';
        host: string;
        username: string;
        from: string;
        configured: true;
      }
    | {
        mode: 'whatsapp_api';
        configured: true;
        phoneNumberId: string;
        displayPhoneNumber?: string | null;
        verifiedName?: string | null;
        qualityRating?: string | null;
        apiVersion: string;
        hasVerifyToken: boolean;
        hasAppSecret: boolean;
      }
    | {
        mode: 'none';
        configured: false;
      };
};

type InboxSetupPayload = {
  items: InboxSetupItem[];
  oauthProviders?: {
    gmail?: { configured: boolean };
    outlook?: { configured: boolean };
  };
};

type CustomerOption = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  status: string;
};

type CustomerListPayload = {
  items: CustomerOption[];
};

const LEGACY_IMPORTED_EMAIL_DOMAINS = ['inbox.maboria.local', 'placeholder.maboria.local'];

const fetcher = async (url: string) => {
  const response = await fetch(url);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error || 'Request failed');
  return data;
};

const statusPillClasses: Record<ConversationStatus, string> = {
  OPEN: 'border-rose-200 bg-rose-50 text-rose-700',
  WAITING_ON_CUSTOMER: 'border-sky-200 bg-sky-50 text-sky-700',
  SNOOZED: 'border-violet-200 bg-violet-50 text-violet-700',
  RESOLVED: 'border-slate-200 bg-slate-100 text-slate-700',
};

const directionBubble = {
  INBOUND:
    'border border-slate-200 bg-white text-slate-900 dark:border-slate-700/80 dark:bg-[linear-gradient(180deg,rgba(248,250,252,0.96),rgba(241,245,249,0.92))] dark:text-slate-950',
  OUTBOUND:
    'border border-indigo-200 bg-[linear-gradient(180deg,rgba(255,255,255,1),rgba(238,242,255,0.96))] text-slate-950 dark:border-indigo-400/30 dark:bg-[linear-gradient(180deg,rgba(55,48,163,0.34),rgba(30,41,59,0.82))] dark:text-slate-100',
  INTERNAL:
    'border border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-400/30 dark:bg-amber-400/12 dark:text-amber-100',
  SYSTEM:
    'border border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800/90 dark:text-slate-200',
} as const;

function isLegacyImportedEmail(value: string | null | undefined) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase();
  return LEGACY_IMPORTED_EMAIL_DOMAINS.some((domain) => normalized.endsWith(`@${domain}`));
}

function getConversationDisplayEmail(value: string | null | undefined) {
  return isLegacyImportedEmail(value) ? null : String(value || '').trim() || null;
}

function getConversationDisplayPhone(value: string | null | undefined) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  if (!digits) return raw;
  if (raw.startsWith('+')) return `+${digits}`;
  if (raw.startsWith('00') && digits.startsWith('00')) return `+${digits.slice(2)}`;
  return `+${digits}`;
}

function isLikelyEmailAddress(value: string | null | undefined) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

function getConversationPrimaryLabel(
  contact: ConversationListItem['contact'] | ConversationDetail['contact'] | undefined,
  fallback = 'Customer'
) {
  if (!contact) return fallback;
  return (
    contact.name ||
    getConversationDisplayPhone(contact.phone) ||
    getConversationDisplayEmail(contact.email) ||
    fallback
  );
}

function getConversationSecondaryLabel(
  contact: ConversationListItem['contact'] | ConversationDetail['contact'] | undefined,
  fallback = 'Imported legacy conversation'
) {
  if (!contact) return '';
  return (
    getConversationDisplayPhone(contact.phone) || getConversationDisplayEmail(contact.email) || fallback
  );
}

function getConversationInitials(
  contact: ConversationListItem['contact'] | ConversationDetail['contact'] | undefined
) {
  const label = getConversationPrimaryLabel(contact).trim().replace(/^[^A-Za-z0-9]+/, '');
  if (!label) return 'CU';
  const parts = label.split(/\s+/).filter(Boolean);
  return (
    parts
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() || '')
      .join('') || label.slice(0, 2).toUpperCase()
  );
}

function formatRecentActivityPreview(value: string | null | undefined, fallback: string) {
  const cleaned = sanitizeInboundEmailDisplayText(String(value || ''))
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) return fallback;
  if (cleaned.length <= 140) return cleaned;
  return `${cleaned.slice(0, 137).trimEnd()}...`;
}

function formatConversationMessageContent(value: string | null | undefined) {
  return sanitizeInboundEmailDisplayText(String(value || ''));
}

function isEmailChannelConnected(setup: InboxSetupItem | null) {
  if (!setup || setup.type !== 'EMAIL' || setup.status !== 'ACTIVE') return false;
  if (setup.connection.mode === 'oauth') return setup.connection.status === 'ACTIVE';
  return setup.connection.mode === 'smtp';
}

function isWhatsAppChannelConnected(setup: InboxSetupItem | null) {
  return Boolean(
    setup &&
    setup.type === 'WHATSAPP' &&
    setup.status === 'ACTIVE' &&
    setup.connection.mode === 'whatsapp_api'
  );
}

function isConfiguredClientValue(value: string | undefined) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase();
  if (!normalized) return false;
  if (
    normalized.includes('your_') ||
    normalized.includes('_here') ||
    normalized.includes('example') ||
    normalized.includes('changeme') ||
    normalized.includes('replace_me')
  ) {
    return false;
  }
  return true;
}

function GmailLogo({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <Image
      src="/brand/gmail.svg"
      alt=""
      aria-hidden="true"
      width={20}
      height={20}
      className={className}
    />
  );
}

function OutlookLogo({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <Image
      src="/brand/outlook.svg"
      alt=""
      aria-hidden="true"
      width={20}
      height={20}
      className={className}
    />
  );
}

function WhatsAppLogo({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <Image
      src="/brand/whatsapp-svgrepo-com.svg"
      alt=""
      aria-hidden="true"
      width={24}
      height={24}
      className={className}
    />
  );
}

function getEmailProviderBrand(
  setup: InboxSetupItem | null
): Extract<ChannelBrand, 'GMAIL' | 'OUTLOOK'> {
  return setup?.connection.mode === 'oauth' && setup.connection.provider === 'OUTLOOK'
    ? 'OUTLOOK'
    : 'GMAIL';
}

function getInitials(value: string | null | undefined, fallback = 'MB') {
  const label = String(value || '').trim();
  if (!label) return fallback;
  const parts = label.split(/\s+/).filter(Boolean);
  return (
    parts
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() || '')
      .join('') || label.slice(0, 2).toUpperCase()
  );
}

function ChannelGlyph({
  brand,
  className = 'h-4 w-4',
}: {
  brand: ChannelBrand;
  className?: string;
}) {
  if (brand === 'OUTLOOK') return <OutlookLogo className={className} />;
  if (brand === 'WHATSAPP') return <WhatsAppLogo className={className} />;
  return <GmailLogo className={className} />;
}

function ChannelConnectCard({
  icon,
  title,
  description,
  accentClassName,
  disabled = false,
  badge,
  children,
  onClick,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  accentClassName: string;
  disabled?: boolean;
  badge?: string;
  children?: ReactNode;
  onClick?: () => void;
}) {
  const cardClasses = `relative flex min-h-[260px] h-full flex-col items-center overflow-hidden rounded-[22px] border px-6 pb-6 pt-6 text-center transition ${
    disabled
      ? 'cursor-not-allowed border-slate-200 bg-slate-50/90 shadow-none dark:border-slate-800 dark:bg-slate-900/80'
      : 'border-slate-200 bg-white shadow-[0_16px_40px_rgba(15,23,42,0.08)] hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-[0_22px_48px_rgba(15,23,42,0.12)] dark:border-slate-800 dark:bg-slate-900 dark:shadow-[0_18px_48px_rgba(2,6,23,0.32)] dark:hover:border-slate-700 dark:hover:bg-slate-900'
  }`;
  const inner = (
    <>
      {badge ? (
        <span className="absolute right-4 top-4 rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
          {badge}
        </span>
      ) : null}
      <div className={`flex h-14 w-14 items-center justify-center rounded-[18px] ${accentClassName}`}>
        {icon}
      </div>
      <div className="mt-4 flex w-full flex-1 flex-col items-center">
        <h3 className="whitespace-nowrap text-center text-[14px] font-semibold leading-5 text-slate-950 dark:text-slate-50 sm:text-[15px]">
          {title}
        </h3>
        <p className="mt-3 text-center text-sm leading-6 text-slate-500 dark:text-slate-400">
          {description}
        </p>
      </div>
      {children}
    </>
  );

  if (onClick && !disabled) {
    return (
      <button type="button" onClick={onClick} className={cardClasses}>
        {inner}
      </button>
    );
  }

  return (
    <div className={cardClasses}>
      {inner}
    </div>
  );
}

function RecentActivityPanel({
  items,
  emptyMessage,
  showViewAll = false,
  footer,
}: {
  items: RecentActivityItem[];
  emptyMessage: string;
  showViewAll?: boolean;
  footer?: ReactNode;
}) {
  const { t } = useLanguage();

  return (
    <div className="rounded-[28px] border border-slate-200 bg-[linear-gradient(180deg,rgba(255,255,255,1),rgba(248,250,252,0.96))] p-4 shadow-[0_12px_28px_rgba(15,23,42,0.06)] dark:border-slate-800 dark:bg-[linear-gradient(180deg,rgba(2,6,23,0.98),rgba(15,23,42,0.96))] dark:shadow-[0_18px_40px_rgba(2,6,23,0.4)] sm:p-5">
      <div className="flex items-start justify-between gap-2.5">
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold tracking-tight text-slate-950 dark:text-slate-50 sm:text-[17px]">
            {t('Recent Activity', 'Activite recente', 'Neueste Aktivitat', 'Actividad reciente', 'Atividade recente')}
          </p>
          <p className="mt-0.5 max-w-[14rem] text-[12px] leading-5 text-slate-500 dark:text-slate-400 sm:text-[13px]">
            {t(
              'Latest across channels',
              'Dernieres activites sur tous les canaux',
              'Neueste Aktivitat uber alle Kanale',
              'Ultima actividad en todos los canales',
              'Atividade mais recente em todos os canais'
            )}
          </p>
        </div>
        {showViewAll ? (
          <span className="inline-flex items-center gap-1 text-sm font-semibold text-indigo-600 dark:text-indigo-300">
            {t('View all', 'Voir tout', 'Alle ansehen', 'Ver todo', 'Ver tudo')}
            <ChevronRight className="h-4 w-4" />
          </span>
        ) : (
          <span className="inline-flex shrink-0 items-center rounded-full border border-slate-200 bg-white px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
            {items.length} {t('items', 'elements', 'Eintrage', 'elementos', 'itens')}
          </span>
        )}
      </div>
      {items.length ? (
        <div className={`mt-3 ${showViewAll ? 'space-y-0' : 'space-y-2.5'}`}>
          {items.map((item) => (
            <div
              key={item.id}
              className={`grid grid-cols-[36px_minmax(0,1fr)] items-start gap-3 ${
                showViewAll
                  ? 'border-b border-slate-100 px-1 py-3 last:border-b-0 dark:border-slate-800'
                  : 'rounded-[18px] border border-slate-200/90 bg-white/92 px-3 py-2.5 shadow-[0_8px_20px_rgba(15,23,42,0.04)] dark:border-slate-800 dark:bg-slate-900/88 dark:shadow-none'
              }`}
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,1),rgba(248,250,252,0.92))] shadow-[0_6px_18px_rgba(15,23,42,0.06)] dark:border-slate-700 dark:bg-slate-900 dark:shadow-none">
                <ChannelGlyph brand={item.brand} className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <div className="min-w-0 space-y-0.5">
                  <p
                    className="text-[14px] font-semibold leading-5 text-slate-950 dark:text-slate-100"
                    style={{
                      display: '-webkit-box',
                      WebkitBoxOrient: 'vertical',
                      WebkitLineClamp: 2,
                      overflow: 'hidden',
                    }}
                  >
                    {item.title}
                  </p>
                  <span className="block text-[10px] font-medium uppercase tracking-[0.12em] text-slate-400 dark:text-slate-500">
                    {item.time}
                  </span>
                </div>
                <p
                  className="mt-1 break-words text-[13px] leading-[1.45] text-slate-700 dark:text-slate-300"
                  style={{
                    display: '-webkit-box',
                    WebkitBoxOrient: 'vertical',
                    WebkitLineClamp: 2,
                    overflow: 'hidden',
                  }}
                >
                  {item.preview}
                </p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-5 rounded-[24px] border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
          {emptyMessage}
        </div>
      )}
      {footer ? <div className="mt-5 border-t border-slate-100 pt-5 dark:border-slate-800">{footer}</div> : null}
    </div>
  );
}

function formatCompactStat(value: number) {
  if (!Number.isFinite(value)) return '0';
  if (Math.abs(value) < 1000) return String(Math.trunc(value));
  const formatted = new Intl.NumberFormat('en', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value);
  return formatted.replace(/([A-Z])$/, (_, suffix: string) => suffix.toUpperCase());
}

function WorkspaceStatsCard({
  channelsConnected,
  messageCount,
}: {
  channelsConnected: number;
  messageCount: number;
}) {
  const { t } = useLanguage();

  return (
    <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_12px_28px_rgba(15,23,42,0.06)] dark:border-slate-800 dark:bg-slate-950 dark:shadow-[0_18px_40px_rgba(2,6,23,0.4)]">
      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400 dark:text-slate-500">
        {t('Workspace Stats', 'Statistiques de l espace de travail', 'Workspace-Statistiken', 'Estadisticas del espacio de trabajo', 'Estatisticas do espaco de trabalho')}
      </p>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="grid min-h-[148px] grid-rows-[72px_auto] rounded-[22px] bg-slate-50 p-4 dark:bg-slate-900">
          <p className="flex items-start text-[clamp(2.5rem,4vw,3.35rem)] font-semibold leading-none tracking-tight tabular-nums text-indigo-600 dark:text-indigo-400">
            {formatCompactStat(channelsConnected)}
          </p>
          <p className="text-xs leading-6 text-slate-500 dark:text-slate-400">
            {t('Channels connected', 'Canaux connectes', 'Verbundene Kanale', 'Canales conectados', 'Canais conectados')}
          </p>
        </div>
        <div className="grid min-h-[148px] grid-rows-[72px_auto] rounded-[22px] bg-slate-50 p-4 dark:bg-slate-900">
          <p className="flex items-start text-[clamp(2.5rem,4vw,3.35rem)] font-semibold leading-none tracking-tight tabular-nums text-emerald-600 dark:text-emerald-400">
            {formatCompactStat(messageCount)}
          </p>
          <p className="text-xs leading-6 text-slate-500 dark:text-slate-400">
            {t('Messages in inbox', 'Messages dans la boite de reception', 'Nachrichten im Posteingang', 'Mensajes en la bandeja de entrada', 'Mensagens na caixa de entrada')}
          </p>
        </div>
      </div>
    </div>
  );
}

function OnboardingRightPanel() {
  const { t } = useLanguage();
  const demoItems: RecentActivityItem[] = [
    {
      id: 'mock-whatsapp',
      brand: 'WHATSAPP',
      title: t('John', 'John', 'John', 'John', 'John'),
      preview: t(
        'Hey, I have a quick question',
        'Bonjour, j ai une question rapide',
        'Hallo, ich habe eine kurze Frage',
        'Hola, tengo una pregunta rapida',
        'Ola, tenho uma pergunta rapida'
      ),
      time: '2h ago',
    },
    {
      id: 'mock-gmail',
      brand: 'GMAIL',
      title: t('Amazon', 'Amazon', 'Amazon', 'Amazon', 'Amazon'),
      preview: t(
        'Your order has shipped',
        'Votre commande a ete expediee',
        'Ihre Bestellung wurde versendet',
        'Tu pedido ha sido enviado',
        'A sua encomenda foi enviada'
      ),
      time: '5h ago',
    },
    {
      id: 'mock-outlook',
      brand: 'OUTLOOK',
      title: t('HR Department', 'Service RH', 'Personalabteilung', 'Departamento de RR. HH.', 'Departamento de RH'),
      preview: t(
        'Your interview is scheduled for next Wednesday',
        'Votre entretien est prevu pour mercredi prochain',
        'Ihr Gesprach ist fur kommenden Mittwoch geplant',
        'Tu entrevista esta programada para el proximo miercoles',
        'A sua entrevista esta marcada para a proxima quarta-feira'
      ),
      time: '8h ago',
    },
  ];

  return (
    <div className="rounded-[28px] border border-slate-200 bg-white p-7 shadow-[0_18px_45px_rgba(15,23,42,0.08)] dark:border-slate-800 dark:bg-slate-900 dark:shadow-[0_18px_48px_rgba(2,6,23,0.34)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[20px] font-semibold tracking-tight text-slate-950 dark:text-slate-50">
            {t('Recent Activity', 'Activite recente', 'Neueste Aktivitat', 'Actividad reciente', 'Atividade recente')}
          </p>
          <p className="mt-2 text-[15px] font-semibold text-slate-950 dark:text-slate-100">
            {t(
              'Latest across channels',
              'Dernieres activites sur tous les canaux',
              'Neueste Aktivitat uber alle Kanale',
              'Ultima actividad en todos los canales',
              'Atividade mais recente em todos os canais'
            )}
          </p>
        </div>
        <span className="inline-flex items-center gap-1 pt-1 text-[15px] font-semibold text-indigo-600">
          {t('View all', 'Voir tout', 'Alle ansehen', 'Ver todo', 'Ver tudo')}
          <ChevronRight className="h-4 w-4" />
        </span>
      </div>

      <div className="mt-8">
        {demoItems.map((item, index) => (
          <div
            key={item.id}
            className={`flex items-start gap-4 py-5 ${index < demoItems.length - 1 ? 'border-b border-slate-100 dark:border-slate-800' : ''}`}
          >
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[20px] border border-slate-200 bg-white shadow-[0_8px_20px_rgba(15,23,42,0.08)] dark:border-slate-700 dark:bg-slate-950 dark:shadow-none">
              <ChannelGlyph brand={item.brand} className="h-8 w-8" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-3">
                <p className="truncate text-[15px] font-semibold text-slate-950 dark:text-slate-100">{item.title}</p>
                <span className="shrink-0 text-[13px] text-slate-500 dark:text-slate-400">{item.time}</span>
              </div>
              <p className="mt-1 text-[15px] leading-7 text-slate-700 dark:text-slate-300">{item.preview}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 border-t border-slate-100 pt-6 dark:border-slate-800">
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-[22px] bg-slate-50 px-7 py-6 dark:bg-slate-950">
            <p className="text-5xl font-semibold tracking-tight text-indigo-700">0</p>
            <p className="mt-2 text-[12px] leading-5 text-slate-600 dark:text-slate-400">
              {t('Channels connected', 'Canaux connectes', 'Verbundene Kanale', 'Canales conectados', 'Canais conectados')}
            </p>
          </div>
          <div className="rounded-[22px] bg-slate-50 px-7 py-6 dark:bg-slate-950">
            <p className="text-5xl font-semibold tracking-tight text-emerald-600">0</p>
            <p className="mt-2 text-[12px] leading-5 text-slate-600 dark:text-slate-400">
              {t('Messages in inbox', 'Messages dans la boite de reception', 'Nachrichten im Posteingang', 'Mensajes en la bandeja de entrada', 'Mensagens na caixa de entrada')}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function InboxPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { language, t } = useLanguage();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<ConversationTab>('ALL');
  const [assignee, setAssignee] = useState<AssigneeFilter>('all');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [connectChannelsOpen, setConnectChannelsOpen] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeTargetMode, setComposeTargetMode] = useState<ComposeTargetMode>('EXISTING');
  const [composeCustomerQuery, setComposeCustomerQuery] = useState('');
  const [composeDebouncedCustomerQuery, setComposeDebouncedCustomerQuery] = useState('');
  const [composeSelectedCustomer, setComposeSelectedCustomer] = useState<CustomerOption | null>(null);
  const [composeNewContactName, setComposeNewContactName] = useState('');
  const [composeNewContactEmail, setComposeNewContactEmail] = useState('');
  const [composeNewContactPhone, setComposeNewContactPhone] = useState('');
  const [composeChannel, setComposeChannel] = useState<'EMAIL' | 'WHATSAPP'>('EMAIL');
  const [composeInboxId, setComposeInboxId] = useState<string>('');
  const [composeSubject, setComposeSubject] = useState('');
  const [composeMessage, setComposeMessage] = useState('');
  const [composeSending, setComposeSending] = useState(false);
  const [messageDraft, setMessageDraft] = useState('');
  const [noteDraft, setNoteDraft] = useState('');
  const [deletingNoteId, setDeletingNoteId] = useState<string | null>(null);
  const [tagDraft, setTagDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [retryingMessageId, setRetryingMessageId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [disconnectingInboxId, setDisconnectingInboxId] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [attachments, setAttachments] = useState<
    Array<{ name: string; type: string; size?: number; dataUrl?: string }>
  >([]);
  const [flash, setFlash] = useState<{
    kind: 'success' | 'error' | 'warning';
    message: string;
  } | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState(() => new Date().toISOString());
  const mailboxSyncRef = useRef({ running: false, lastStartedAt: 0 });

  const params = new URLSearchParams();
  params.set('status', status);
  params.set('assignee', assignee);
  if (query.trim()) params.set('search', query.trim());

  const {
    data: conversationsPayload,
    error: listError,
    mutate: mutateConversations,
    isLoading: listLoading,
  } = useSWR<ConversationListPayload>(
    `/api/inbox/unified/conversations?${params.toString()}`,
    fetcher,
    { revalidateOnFocus: false }
  );

  const conversations = useMemo(
    () => conversationsPayload?.items ?? [],
    [conversationsPayload?.items]
  );

  const {
    data: detail,
    error: detailError,
    mutate: mutateDetail,
    isLoading: detailLoading,
  } = useSWR<ConversationDetail>(
    activeId ? `/api/inbox/unified/conversations/${activeId}` : null,
    fetcher,
    { revalidateOnFocus: false }
  );

  const { data: agentsPayload } = useSWR<{ items: Agent[] }>('/api/inbox/unified/agents', fetcher, {
    revalidateOnFocus: false,
  });
  const agents = agentsPayload?.items ?? [];

  const { data: cannedRepliesPayload } = useSWR<{ items?: CannedReply[] } | CannedReply[]>(
    '/api/inbox/unified/canned-replies',
    fetcher,
    {
      revalidateOnFocus: false,
      shouldRetryOnError: false,
    }
  );
  const cannedReplies = Array.isArray(cannedRepliesPayload)
    ? cannedRepliesPayload
    : Array.isArray(cannedRepliesPayload?.items)
      ? cannedRepliesPayload.items
      : [];

  const {
    data: inboxSetupPayload,
    error: inboxSetupError,
    mutate: mutateInboxes,
    isLoading: inboxSetupLoading,
  } = useSWR<InboxSetupPayload>(
    '/api/inbox/unified/inboxes',
    fetcher,
    {
      revalidateOnFocus: false,
      shouldRetryOnError: false,
    }
  );

  const { data: me } = useSWR<{ name?: string | null; email?: string | null }>(
    '/api/user/me',
    fetcher,
    {
      revalidateOnFocus: false,
      shouldRetryOnError: false,
    }
  );
  const { data: session } = useSession();
  const customerSearchKey = composeOpen && composeTargetMode === 'EXISTING'
    ? `/api/customers?q=${encodeURIComponent(composeDebouncedCustomerQuery)}&take=8&skip=0`
    : null;
  const {
    data: composeCustomersPayload,
    error: composeCustomersError,
  } = useSWR<CustomerListPayload>(customerSearchKey, fetcher, {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  });

  const runMailboxSync = useCallback(
    async (force = false) => {
      if (mailboxSyncRef.current.running) return;
      const now = Date.now();
      if (!force && now - mailboxSyncRef.current.lastStartedAt < 25_000) return;

      mailboxSyncRef.current.running = true;
      mailboxSyncRef.current.lastStartedAt = now;
      try {
        const response = await fetch('/api/inbox/unified/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(force ? { force: true } : {}),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) return;

        if (Number(data?.imported || 0) > 0 || force) {
          await Promise.all([
            mutateConversations(),
            mutateInboxes(),
            activeId ? mutateDetail() : Promise.resolve(),
          ]);
        }
      } catch {
        return;
      } finally {
        mailboxSyncRef.current.running = false;
      }
    },
    [activeId, mutateConversations, mutateDetail, mutateInboxes]
  );

  const inboxSetupItems = inboxSetupPayload?.items ?? [];
  const emailSetups = inboxSetupItems.filter((item) => item.type === 'EMAIL');
  const activeEmailSetups = emailSetups.filter((item) => isEmailChannelConnected(item));
  const emailInboxById = useMemo(
    () => new Map(emailSetups.map((item) => [item.id, item])),
    [emailSetups]
  );
  const whatsappSetup = inboxSetupItems.find((item) => item.type === 'WHATSAPP') || null;
  const gmailOauthConfigured = inboxSetupPayload?.oauthProviders?.gmail?.configured;
  const outlookOauthConfigured = inboxSetupPayload?.oauthProviders?.outlook?.configured;
  const whatsappConnectAvailable =
    isConfiguredClientValue(process.env.NEXT_PUBLIC_META_APP_ID) &&
    isConfiguredClientValue(process.env.NEXT_PUBLIC_META_WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID);
  const emailChannelConnected = activeEmailSetups.length > 0;
  const whatsappChannelConnected = isWhatsAppChannelConnected(whatsappSetup);
  const hasConnectedChannel = emailChannelConnected || whatsappChannelConnected;
  const hasResolvedInboxState = Boolean(inboxSetupPayload) || Boolean(inboxSetupError);
  const isOnboardingState = hasResolvedInboxState && !hasConnectedChannel;
  const showOnboardingState = isOnboardingState;
  const isConnectedState = !showOnboardingState && hasConnectedChannel;
  const providerAvailabilityLoading = inboxSetupLoading && !inboxSetupPayload?.oauthProviders;
  const liveChannelCount = activeEmailSetups.length + Number(whatsappChannelConnected);
  const userDisplayName = String(
    me?.name || session?.user?.name || me?.email || session?.user?.email || 'Maboria User'
  );
  const userDisplayEmail = String(me?.email || session?.user?.email || '');
  const userInitials = getInitials(userDisplayName, 'MB');
  const activeChannelConnected = detail
    ? detail.inbox.type === 'EMAIL'
      ? isEmailChannelConnected(emailInboxById.get(detail.inbox.id) || null)
      : whatsappChannelConnected
    : false;

  const getBrandLabel = useCallback((brand: ChannelBrand) => {
    if (brand === 'OUTLOOK') return 'Outlook';
    if (brand === 'WHATSAPP') return 'WhatsApp';
    return 'Gmail';
  }, []);

  const getInboxBrand = useCallback(
    (input: { inboxId?: string | null; channel: 'EMAIL' | 'WHATSAPP' }): ChannelBrand => {
      if (input.channel === 'WHATSAPP') return 'WHATSAPP';
      return getEmailProviderBrand(emailInboxById.get(String(input.inboxId || '')) || null);
    },
    [emailInboxById]
  );

  const getConversationBrand = useCallback(
    (channel: 'EMAIL' | 'WHATSAPP', inboxId?: string | null): ChannelBrand =>
      getInboxBrand({ channel, inboxId }),
    [getInboxBrand]
  );

  const localizeInboxStatus = useCallback((value: ConversationStatus) => {
    if (value === 'OPEN') return t('Needs reply', 'Reponse requise', 'Antwort erforderlich', 'Necesita respuesta', 'Precisa de resposta');
    if (value === 'WAITING_ON_CUSTOMER') return t('Waiting', 'En attente', 'Wartend', 'En espera', 'Em espera');
    if (value === 'SNOOZED') return t('Snoozed', 'Reporte', 'Zuruckgestellt', 'Pospuesto', 'Adiado');
    return t('Resolved', 'Resolue', 'Gelost', 'Resuelto', 'Resolvido');
  }, [t]);

  const getChannelLabel = useCallback(
    (value: 'EMAIL' | 'WHATSAPP', inboxId?: string | null) =>
      getBrandLabel(getConversationBrand(value, inboxId)),
    [getBrandLabel, getConversationBrand]
  );

  const formatInboxDateTime = useCallback(
    (value?: string | Date | null) => {
      const date = value instanceof Date ? value : value ? new Date(value) : null;
      if (!date) return '';
      try {
        return new Intl.DateTimeFormat(LANGUAGE_LOCALES[language], {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        }).format(date);
      } catch {
        return formatDateTimeDMY(date);
      }
    },
    [language]
  );

  const formatConversationListTime = useCallback(
    (value?: string | null) => {
      if (!value) return '';
      const date = new Date(value);
      const now = new Date();
      const sameDay = date.toDateString() === now.toDateString();
      try {
        if (sameDay) {
          return new Intl.DateTimeFormat(LANGUAGE_LOCALES[language], {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
          }).format(date);
        }
        const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
        if (diffDays < 7) {
          return new Intl.DateTimeFormat(LANGUAGE_LOCALES[language], { weekday: 'short' }).format(
            date
          );
        }
        return new Intl.DateTimeFormat(LANGUAGE_LOCALES[language], {
          month: 'short',
          day: 'numeric',
        }).format(date);
      } catch {
        return formatDateTimeDMY(date);
      }
    },
    [language]
  );

  const formatRelativeTime = useCallback((value?: string | null) => {
    if (!value) return '';
    const date = new Date(value);
    const diffMinutes = Math.max(1, Math.round((Date.now() - date.getTime()) / 60000));
    const formatter = new Intl.RelativeTimeFormat(LANGUAGE_LOCALES[language], { numeric: 'auto' });
    if (diffMinutes < 60) return formatter.format(-diffMinutes, 'minute');
    const diffHours = Math.round(diffMinutes / 60);
    if (diffHours < 24) return formatter.format(-diffHours, 'hour');
    const diffDays = Math.round(diffHours / 24);
    return formatter.format(-diffDays, 'day');
  }, [language]);

  const formatConversationStatusDetail = useCallback(
    (input: {
      status: ConversationStatus;
      snoozedUntil?: string | null;
      waitingSince?: string | null;
      resolvedAt?: string | null;
    }) => {
      if (input.status === 'SNOOZED' && input.snoozedUntil)
        return `${t('Until', 'Jusqu au', 'Bis', 'Hasta', 'Ate')} ${formatInboxDateTime(input.snoozedUntil)}`;
      if (input.status === 'WAITING_ON_CUSTOMER' && input.waitingSince)
        return `${t('Waiting since', 'En attente depuis', 'Wartet seit', 'Esperando desde', 'A aguardar desde')} ${formatInboxDateTime(input.waitingSince)}`;
      if (input.status === 'RESOLVED' && input.resolvedAt)
        return `${t('Resolved', 'Resolue', 'Gelost', 'Resuelto', 'Resolvido')} ${formatInboxDateTime(input.resolvedAt)}`;
      return null;
    },
    [formatInboxDateTime, t]
  );

  const localizeInboxError = useCallback((value: string, fallback?: string) => {
    const normalized = String(value || '').trim();
    if (!normalized)
      return (
        fallback ||
        t(
          'Unable to load inbox right now.',
          'Impossible de charger la boite de reception pour le moment.',
          'Der Posteingang kann derzeit nicht geladen werden.',
          'No se puede cargar la bandeja de entrada en este momento.',
          'Nao foi possivel carregar a caixa de entrada agora.'
        )
      );
    const mappings: Record<string, string> = {
      Unauthorized: t(
        'Please sign in and try again.',
        'Connectez-vous puis reessayez.',
        'Bitte melden Sie sich an und versuchen Sie es erneut.',
        'Inicia sesion y vuelve a intentarlo.',
        'Inicie sessao e tente novamente.'
      ),
      'Request failed': t(
        'Unable to load inbox right now.',
        'Impossible de charger la boite de reception pour le moment.',
        'Der Posteingang kann derzeit nicht geladen werden.',
        'No se puede cargar la bandeja de entrada en este momento.',
        'Nao foi possivel carregar a caixa de entrada agora.'
      ),
      'Failed to fetch': t(
        'Network error. Please try again.',
        'Erreur reseau. Reessayez.',
        'Netzwerkfehler. Bitte versuchen Sie es erneut.',
        'Error de red. Intentalo de nuevo.',
        'Erro de rede. Tente novamente.'
      ),
    };
    return mappings[normalized] || fallback || normalized;
  }, [t]);

  const getDeliveryStatusLabel = useCallback((value: string) => {
    const normalized = String(value || '')
      .trim()
      .toUpperCase();
    if (normalized === 'SENT') return t('Sent', 'Envoye', 'Gesendet', 'Enviado', 'Enviado');
    if (normalized === 'DELIVERED') return t('Delivered', 'Livre', 'Zugestellt', 'Entregado', 'Entregue');
    if (normalized === 'FAILED') return t('Failed', 'Echec', 'Fehlgeschlagen', 'Fallido', 'Falhou');
    if (normalized === 'QUEUED') return t('Queued', 'En file d attente', 'In Warteschlange', 'En cola', 'Em fila');
    if (normalized === 'READ') return t('Read', 'Lu', 'Gelesen', 'Leido', 'Lido');
    return normalized.toLowerCase();
  }, [t]);

  const getPrimaryLabel = useCallback(
    (contact: ConversationListItem['contact'] | ConversationDetail['contact'] | undefined) =>
      getConversationPrimaryLabel(
        contact,
        t('Customer', 'Client', 'Kunde', 'Cliente', 'Cliente')
      ),
    [t]
  );

  const getSecondaryLabel = useCallback(
    (contact: ConversationListItem['contact'] | ConversationDetail['contact'] | undefined) =>
      getConversationSecondaryLabel(
        contact,
        t(
          'Imported legacy conversation',
          'Conversation historique importee',
          'Importierte Altkonversation',
          'Conversacion historica importada',
          'Conversa historica importada'
        )
      ),
    [t]
  );

  const getChannelReconnectReason = useCallback((channelLabel: string) => {
    return `${channelLabel} ${t(
      'is not connected for this workspace. Historical messages stay visible, but reconnect the channel before replying.',
      'n est pas connecte a cet espace de travail. Les messages historiques restent visibles, mais reconnectez le canal avant de repondre.',
      'ist fur diesen Workspace nicht verbunden. Historische Nachrichten bleiben sichtbar, aber verbinden Sie den Kanal vor dem Antworten erneut.',
      'no esta conectado para este espacio de trabajo. Los mensajes historicos siguen visibles, pero vuelve a conectar el canal antes de responder.',
      'nao esta conectado a este espaco de trabalho. As mensagens historicas continuam visiveis, mas volte a ligar o canal antes de responder.'
    )}`;
  }, [t]);

  const activeChannelLabel = detail
    ? getChannelLabel(detail.inbox.type, detail.inbox.id)
    : t('Channel', 'Canal', 'Kanal', 'Canal', 'Canal');
  const activeReplyDisabledReason = !detail
    ? t(
        'Select a conversation to reply.',
        'Selectionnez une conversation pour repondre.',
        'Wahlen Sie eine Konversation aus, um zu antworten.',
        'Selecciona una conversacion para responder.',
        'Selecione uma conversa para responder.'
      )
    : !activeChannelConnected
      ? getChannelReconnectReason(activeChannelLabel)
      : detail.inbox.type === 'EMAIL' && !getConversationDisplayEmail(detail.contact.email)
        ? t(
            'This customer does not have an email address on file.',
            'Ce client n a pas d adresse e-mail enregistree.',
            'Fur diesen Kunden ist keine E-Mail-Adresse hinterlegt.',
            'Este cliente no tiene una direccion de correo registrada.',
            'Este cliente nao tem um endereco de email registado.'
          )
        : detail.inbox.type === 'WHATSAPP' && !detail.contact.phone
          ? t(
              'This customer does not have a phone number on file for WhatsApp.',
              'Ce client n a pas de numero de telephone enregistre pour WhatsApp.',
              'Fur diesen Kunden ist keine Telefonnummer fur WhatsApp hinterlegt.',
              'Este cliente no tiene un numero de telefono registrado para WhatsApp.',
              'Este cliente nao tem um numero de telefone registado para o WhatsApp.'
            )
          : null;

  const totalUnreadCount = useMemo(
    () => conversations.reduce((sum, conversation) => sum + conversation.unreadCount, 0),
    [conversations]
  );

  const activityItems = useMemo<RecentActivityItem[]>(() => {
    const emptyPreview = t(
      'No messages yet.',
      'Aucun message pour le moment.',
      'Noch keine Nachrichten.',
      'Aun no hay mensajes.',
      'Ainda nao ha mensagens.'
    );

    if (conversations.length > 0) {
      return conversations.slice(0, 3).map((conversation) => ({
        id: conversation.id,
        brand: getConversationBrand(conversation.inbox.type, conversation.inbox.id),
        title: getPrimaryLabel(conversation.contact),
        preview: formatRecentActivityPreview(conversation.lastMessage?.content, emptyPreview),
        time: formatRelativeTime(
          conversation.lastMessageAt || conversation.lastMessage?.createdAt || undefined
        ),
      }));
    }
    return [
      {
        id: 'fallback-whatsapp',
        brand: 'WHATSAPP' as const,
        title: t('John', 'John', 'John', 'John', 'John'),
        preview: t(
          'Hey, I have a quick question',
          'Bonjour, j ai une question rapide',
          'Hallo, ich habe eine kurze Frage',
          'Hola, tengo una pregunta rapida',
          'Ola, tenho uma pergunta rapida'
        ),
        time: formatRelativeTime(new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()),
      },
      {
        id: 'fallback-gmail',
        brand: 'GMAIL' as const,
        title: t('Amazon', 'Amazon', 'Amazon', 'Amazon', 'Amazon'),
        preview: t(
          'Your order has shipped',
          'Votre commande a ete expediee',
          'Ihre Bestellung wurde versendet',
          'Tu pedido ha sido enviado',
          'A sua encomenda foi enviada'
        ),
        time: formatRelativeTime(new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString()),
      },
      {
        id: 'fallback-outlook',
        brand: 'OUTLOOK' as const,
        title: t('HR', 'RH', 'HR', 'RR. HH.', 'RH'),
        preview: t(
          'Your interview is scheduled',
          'Votre entretien est programme',
          'Ihr Gesprach ist geplant',
          'Tu entrevista esta programada',
          'A sua entrevista esta marcada'
        ),
        time: formatRelativeTime(new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString()),
      },
    ];
  }, [conversations, formatRelativeTime, getConversationBrand, getPrimaryLabel, t]);

  const connectedRecentActivityItems = useMemo(
    () => (conversations.length > 0 ? activityItems : []),
    [activityItems, conversations.length]
  );
  const composeCustomers = composeCustomersPayload?.items ?? [];

  const connectedChannelItems = useMemo(
    () =>
      [
        ...activeEmailSetups.map((setup) => {
          const brand = getEmailProviderBrand(setup);
          const emailAddress =
            setup.connection.mode === 'oauth'
              ? setup.connection.emailAddress
              : setup.connection.mode === 'smtp'
                ? setup.connection.from
                : '';
          return {
            id: setup.id,
            inboxId: setup.id,
            setup,
            brand,
            label: `${getBrandLabel(brand)}${emailAddress ? ` | ${emailAddress}` : ''} ${t(
              'connected',
              'connecte',
              'verbunden',
              'conectado',
              'conectado'
            )}`,
          };
        }),
        whatsappChannelConnected
          ? {
              id: 'whatsapp',
              inboxId: whatsappSetup?.id || '',
              setup: whatsappSetup,
              brand: 'WHATSAPP' as const,
              label: `WhatsApp ${t('connected', 'connecte', 'verbunden', 'conectado', 'conectado')}`,
            }
          : null,
      ].filter(Boolean) as Array<{
        id: string;
        inboxId: string;
        setup: InboxSetupItem | null;
        brand: ChannelBrand;
        label: string;
      }>,
    [activeEmailSetups, getBrandLabel, t, whatsappChannelConnected, whatsappSetup]
  );

  useEffect(() => {
    if (!activeId && conversations.length) setActiveId(conversations[0].id);
    if (activeId && conversations.length && !conversations.some((item) => item.id === activeId)) {
      setActiveId(conversations[0].id);
    }
  }, [activeId, conversations]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setComposeDebouncedCustomerQuery(composeCustomerQuery.trim());
    }, 200);
    return () => window.clearTimeout(timer);
  }, [composeCustomerQuery]);

  useEffect(() => {
    if (!composeOpen) return;
    if (composeChannel === 'EMAIL' && activeEmailSetups.length > 0) {
      if (!composeInboxId || !activeEmailSetups.some((item) => item.id === composeInboxId)) {
        setComposeInboxId(activeEmailSetups[0]?.id || '');
      }
      return;
    }
    if (composeChannel === 'WHATSAPP' && whatsappChannelConnected) return;
    if (activeEmailSetups.length > 0) {
      setComposeChannel('EMAIL');
      setComposeInboxId(activeEmailSetups[0]?.id || '');
      return;
    }
    if (whatsappChannelConnected) {
      setComposeChannel('WHATSAPP');
    }
  }, [activeEmailSetups, composeChannel, composeInboxId, composeOpen, whatsappChannelConnected]);

  useEffect(() => {
    const clearMailboxStatusParams = () => {
      if (typeof window === 'undefined') return;
      const url = new URL(window.location.href);
      let changed = false;
      ['mailbox_connected', 'mailbox_error', 'mailbox_error_detail'].forEach((key) => {
        if (url.searchParams.has(key)) {
          url.searchParams.delete(key);
          changed = true;
        }
      });
      if (!changed) return;
      const nextUrl = `${url.pathname}${url.search}${url.hash}`;
      window.history.replaceState(window.history.state, '', nextUrl);
      router.replace(`${pathname}${url.search}${url.hash}`, { scroll: false });
    };

    const mailboxConnected = searchParams.get('mailbox_connected');
    const mailboxProvider = String(searchParams.get('mailbox_provider') || '').trim().toUpperCase();
    const mailboxError = searchParams.get('mailbox_error');
    const mailboxErrorDetail = searchParams.get('mailbox_error_detail');
    if (mailboxConnected === '1') {
      setFlash({
        kind: 'success',
        message:
          mailboxProvider === 'OUTLOOK'
            ? t(
                'Outlook mailbox connected successfully.',
                'Boite Outlook connectee avec succes.',
                'Outlook-Postfach erfolgreich verbunden.',
                'Buzon de Outlook conectado correctamente.',
                'Caixa Outlook ligada com sucesso.'
              )
            : mailboxProvider === 'GMAIL'
              ? t(
                  'Gmail mailbox connected successfully.',
                  'Boite Gmail connectee avec succes.',
                  'Gmail-Postfach erfolgreich verbunden.',
                  'Buzon de Gmail conectado correctamente.',
                  'Caixa Gmail ligada com sucesso.'
                )
              : t(
                  'Email channel connected successfully.',
                  'Canal email connecte avec succes.',
                  'E-Mail-Kanal erfolgreich verbunden.',
                  'Canal de correo conectado correctamente.',
                  'Canal de email ligado com sucesso.'
                ),
      });
      clearMailboxStatusParams();
      return;
    }
    if (mailboxError)
      setFlash({
        kind: 'error',
        message: (() => {
          const baseMessage =
            {
            oauth_state_missing: t(
              'The mailbox connection could not be completed because the temporary OAuth state was missing. Start the connection again and finish it in the same browser window.',
              'La connexion a la boite mail n a pas pu aboutir car l etat OAuth temporaire etait manquant. Relancez la connexion et terminez-la dans la meme fenetre du navigateur.',
              'Die Mailbox-Verbindung konnte nicht abgeschlossen werden, weil der temporare OAuth-Status fehlte. Starten Sie die Verbindung erneut und schliessen Sie sie im selben Browserfenster ab.',
              'La conexion del buzon no pudo completarse porque faltaba el estado temporal de OAuth. Inicia la conexion de nuevo y terminala en la misma ventana del navegador.',
              'A ligacao da caixa de correio nao pode ser concluida porque faltava o estado OAuth temporario. Inicie a ligacao novamente e conclua-a na mesma janela do navegador.'
            ),
            oauth_state_invalid: t(
              'The mailbox connection returned with an invalid OAuth state. Start the connection again from this browser session.',
              'La connexion a la boite mail est revenue avec un etat OAuth invalide. Relancez la connexion depuis cette session du navigateur.',
              'Die Mailbox-Verbindung ist mit einem ungultigen OAuth-Status zuruckgekehrt. Starten Sie die Verbindung in dieser Browsersitzung erneut.',
              'La conexion del buzon regreso con un estado OAuth invalido. Inicia la conexion de nuevo desde esta sesion del navegador.',
              'A ligacao da caixa de correio regressou com um estado OAuth invalido. Inicie a ligacao novamente nesta sessao do navegador.'
            ),
            oauth_state_mismatch: t(
              'The mailbox connection no longer matches your current workspace or session. Sign in again and retry.',
              'La connexion a la boite mail ne correspond plus a votre espace de travail ou a votre session actuelle. Reconnectez-vous puis reessayez.',
              'Die Mailbox-Verbindung passt nicht mehr zu Ihrem aktuellen Workspace oder Ihrer Sitzung. Melden Sie sich erneut an und versuchen Sie es noch einmal.',
              'La conexion del buzon ya no coincide con tu espacio de trabajo o sesion actual. Vuelve a iniciar sesion y reintenta.',
              'A ligacao da caixa de correio ja nao corresponde ao seu espaco de trabalho ou sessao atual. Inicie sessao novamente e tente outra vez.'
            ),
            access_denied: t(
              'The mailbox connection was cancelled or denied by the provider.',
              'La connexion a la boite mail a ete annulee ou refusee par le fournisseur.',
              'Die Mailbox-Verbindung wurde vom Anbieter abgebrochen oder verweigert.',
              'La conexion del buzon fue cancelada o denegada por el proveedor.',
              'A ligacao da caixa de correio foi cancelada ou recusada pelo fornecedor.'
            ),
            unauthorized: t(
              'Please sign in again before connecting a mailbox.',
              'Reconnectez-vous avant de connecter une boite mail.',
              'Bitte melden Sie sich erneut an, bevor Sie eine Mailbox verbinden.',
              'Vuelve a iniciar sesion antes de conectar un buzon.',
              'Inicie sessao novamente antes de ligar uma caixa de correio.'
            ),
            oauth_state_expired: t(
              'The mailbox connection expired. Start it again.',
              'La connexion a la boite mail a expire. Relancez-la.',
              'Die Mailbox-Verbindung ist abgelaufen. Starten Sie sie erneut.',
              'La conexion del buzon caduco. Iniciala de nuevo.',
              'A ligacao da caixa de correio expirou. Inicie-a novamente.'
            ),
            oauth_code_missing: t(
              'The mailbox provider returned without an authorization code. Start the connection again.',
              'Le fournisseur de boite mail est revenu sans code d autorisation. Relancez la connexion.',
              'Der Mailbox-Anbieter ist ohne Autorisierungscode zuruckgekehrt. Starten Sie die Verbindung erneut.',
              'El proveedor del buzon regreso sin codigo de autorizacion. Inicia la conexion de nuevo.',
              'O fornecedor da caixa de correio regressou sem codigo de autorizacao. Inicie a ligacao novamente.'
            ),
            invalid_client: t(
              'The mailbox provider rejected this app configuration.',
              'Le fournisseur de boite mail a refuse cette configuration applicative.',
              'Der Mailbox-Anbieter hat diese App-Konfiguration abgelehnt.',
              'El proveedor del buzon rechazo esta configuracion de la aplicacion.',
              'O fornecedor da caixa de correio rejeitou esta configuracao da aplicacao.'
            ),
            mailbox_oauth_callback_failed: t(
              'The mailbox provider callback failed while exchanging tokens or reading the mailbox profile.',
              'Le rappel du fournisseur de boite mail a echoue lors de l echange des jetons ou de la lecture du profil.',
              'Der Callback des Mailbox-Anbieters ist beim Token-Austausch oder beim Lesen des Profils fehlgeschlagen.',
              'La devolucion del proveedor del buzon fallo al intercambiar tokens o leer el perfil del buzon.',
              'O callback do fornecedor da caixa de correio falhou ao trocar tokens ou ler o perfil da caixa de correio.'
            ),
          }[mailboxError] ||
          `${t(
            'Mailbox connection failed.',
            'La connexion a la boite mail a echoue.',
            'Die Mailbox-Verbindung ist fehlgeschlagen.',
            'La conexion del buzon fallo.',
            'A ligacao da caixa de correio falhou.'
          )} (${mailboxError})`;

          const detail = String(mailboxErrorDetail || '').trim();
          if (!detail) return baseMessage;
          return `${baseMessage} ${t('Details:', 'Details :', 'Details:', 'Detalles:', 'Detalhes:')} ${detail}`;
        })(),
      });
    if (mailboxError) clearMailboxStatusParams();
  }, [pathname, router, searchParams, t]);

  useEffect(() => {
    const timer = setInterval(async () => {
      try {
        const response = await fetch(
          `/api/inbox/unified/updates?since=${encodeURIComponent(lastSyncAt)}`
        );
        const data = await response.json().catch(() => ({}));
        if (response.ok && data?.now) {
          setLastSyncAt(String(data.now));
        } else {
          setLastSyncAt(new Date().toISOString());
        }
        mutateConversations();
        if (activeId) mutateDetail();
      } catch {
        setLastSyncAt(new Date().toISOString());
      }
    }, 6000);
    return () => clearInterval(timer);
  }, [activeId, lastSyncAt, mutateConversations, mutateDetail]);

  useEffect(() => {
    void runMailboxSync();
    const timer = setInterval(() => {
      void runMailboxSync();
    }, 30_000);
    return () => clearInterval(timer);
  }, [runMailboxSync]);

  const gmailConnectHref =
    '/api/mailboxes/connected/oauth/start?provider=GMAIL&bindUnifiedInbox=1&returnTo=/dashboard/inbox';
  const outlookConnectHref =
    '/api/mailboxes/connected/oauth/start?provider=OUTLOOK&bindUnifiedInbox=1&returnTo=/dashboard/inbox';

  const startMailboxConnect = (href: string, enabled: boolean) => {
    if (!enabled || typeof window === 'undefined') return;
    window.location.assign(href);
  };

  const disconnectInbox = async (setup: InboxSetupItem | null) => {
    if (!setup?.id) return;
    setDisconnectingInboxId(setup.id);
    setFlash(null);
    try {
      const response = await fetch('/api/inbox/unified/inboxes', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: setup.id,
          action: 'disconnect',
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          localizeInboxError(
            data?.error,
            t(
              'Unable to disconnect this channel.',
              'Impossible de deconnecter ce canal.',
              'Dieser Kanal kann nicht getrennt werden.',
              'No se puede desconectar este canal.',
              'Nao foi possivel desligar este canal.'
            )
          )
        );
      }
      await mutateInboxes();
      setFlash({
        kind: 'success',
        message:
          setup.type === 'WHATSAPP'
            ? t(
                'WhatsApp disconnected.',
                'WhatsApp deconnecte.',
                'WhatsApp getrennt.',
                'WhatsApp desconectado.',
                'WhatsApp desligado.'
              )
            : t(
                'Mailbox disconnected.',
                'Boite mail deconnectee.',
                'Mailbox getrennt.',
                'Buzon desconectado.',
                'Caixa de correio desligada.'
              ),
      });
    } catch (error: any) {
      setFlash({
        kind: 'error',
        message: localizeInboxError(
          error?.message,
          t(
            'Unable to disconnect this channel.',
            'Impossible de deconnecter ce canal.',
            'Dieser Kanal kann nicht getrennt werden.',
            'No se puede desconectar este canal.',
            'Nao foi possivel desligar este canal.'
          )
        ),
      });
    } finally {
      setDisconnectingInboxId(null);
    }
  };

  const resetComposeState = useCallback(() => {
    setComposeOpen(false);
    setComposeTargetMode('EXISTING');
    setComposeCustomerQuery('');
    setComposeDebouncedCustomerQuery('');
    setComposeSelectedCustomer(null);
    setComposeNewContactName('');
    setComposeNewContactEmail('');
    setComposeNewContactPhone('');
    setComposeInboxId('');
    setComposeSubject('');
    setComposeMessage('');
    setComposeSending(false);
  }, []);

  const openCompose = useCallback(() => {
    setFlash(null);
    setComposeOpen(true);
    setComposeTargetMode('EXISTING');
    setComposeCustomerQuery('');
    setComposeDebouncedCustomerQuery('');
    setComposeNewContactName('');
    setComposeNewContactEmail('');
    setComposeNewContactPhone('');
    setComposeInboxId('');
    setComposeSubject('');
    setComposeMessage('');
    if (detail?.contact) {
      setComposeSelectedCustomer({
        id: detail.contact.id,
        name: detail.contact.name,
        email: detail.contact.email,
        phone: detail.contact.phone,
        status: detail.contact.status,
      });
      if (detail.inbox.type === 'EMAIL' && emailChannelConnected) {
        setComposeChannel('EMAIL');
        setComposeInboxId(detail.inbox.id);
        return;
      }
      if (detail.inbox.type === 'WHATSAPP' && whatsappChannelConnected) {
        setComposeChannel('WHATSAPP');
        return;
      }
    } else {
      setComposeSelectedCustomer(null);
    }
    if (activeEmailSetups.length > 0) {
      setComposeChannel('EMAIL');
      setComposeInboxId(activeEmailSetups[0]?.id || '');
      return;
    }
    if (whatsappChannelConnected) {
      setComposeChannel('WHATSAPP');
    }
  }, [activeEmailSetups, detail, emailChannelConnected, whatsappChannelConnected]);

  const handlePatchConversation = async (payload: Record<string, unknown>) => {
    if (!activeId) return;
    setSaving(true);
    setFlash(null);
    try {
      const response = await fetch(`/api/inbox/unified/conversations/${activeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(
          localizeInboxError(
            data?.error,
            t(
              'Unable to update conversation.',
              'Impossible de mettre a jour la conversation.',
              'Konversation kann nicht aktualisiert werden.',
              'No se puede actualizar la conversacion.',
              'Nao foi possivel atualizar a conversa.'
            )
          )
        );
      await Promise.all([mutateDetail(), mutateConversations()]);
      setFlash({
        kind: 'success',
        message: t(
          'Conversation updated.',
          'Conversation mise a jour.',
          'Konversation aktualisiert.',
          'Conversacion actualizada.',
          'Conversa atualizada.'
        ),
      });
    } catch (error: any) {
      setFlash({
        kind: 'error',
        message: localizeInboxError(
          error?.message,
          t(
            'Unable to update conversation.',
            'Impossible de mettre a jour la conversation.',
            'Konversation kann nicht aktualisiert werden.',
            'No se puede actualizar la conversacion.',
            'Nao foi possivel atualizar a conversa.'
          )
        ),
      });
    } finally {
      setSaving(false);
    }
  };

  const addNote = async () => {
    if (!activeId) return;
    const content = noteDraft.trim();
    if (!content) return;
    setFlash(null);
    try {
      const response = await fetch(`/api/inbox/unified/conversations/${activeId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(
          localizeInboxError(
            data?.error,
            t(
              'Unable to add note.',
              'Impossible d ajouter une note.',
              'Notiz kann nicht hinzugefugt werden.',
              'No se puede agregar la nota.',
              'Nao foi possivel adicionar a nota.'
            )
          )
        );
      setNoteDraft('');
      await mutateDetail();
    } catch (error: any) {
      setFlash({
        kind: 'error',
        message: localizeInboxError(
          error?.message,
          t(
            'Unable to add note.',
            'Impossible d ajouter une note.',
            'Notiz kann nicht hinzugefugt werden.',
            'No se puede agregar la nota.',
            'Nao foi possivel adicionar a nota.'
          )
        ),
      });
    }
  };

  const deleteNote = async (noteId: string) => {
    if (!activeId || deletingNoteId) return;
    setFlash(null);
    setDeletingNoteId(noteId);
    try {
      const response = await fetch(`/api/inbox/unified/conversations/${activeId}/notes/${noteId}`, {
        method: 'DELETE',
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          localizeInboxError(
            data?.error,
            t(
              'Unable to delete note.',
              'Impossible de supprimer la note.',
              'Notiz kann nicht geloscht werden.',
              'No se puede eliminar la nota.',
              'Nao foi possivel eliminar a nota.'
            )
          )
        );
      }
      await mutateDetail();
    } catch (error: any) {
      setFlash({
        kind: 'error',
        message: localizeInboxError(
          error?.message,
          t(
            'Unable to delete note.',
            'Impossible de supprimer la note.',
            'Notiz kann nicht geloscht werden.',
            'No se puede eliminar la nota.',
            'Nao foi possivel eliminar a nota.'
          )
        ),
      });
    } finally {
      setDeletingNoteId(null);
    }
  };

  const handleFileAttach = async (files: FileList | null) => {
    if (!files) return;
    const next: Array<{ name: string; type: string; size?: number; dataUrl?: string }> = [];
    for (const file of Array.from(files)) {
      const reader = new FileReader();
      const dataUrl = await new Promise<string | undefined>((resolve) => {
        reader.onload = () => resolve(reader.result?.toString());
        reader.onerror = () => resolve(undefined);
        reader.readAsDataURL(file);
      });
      next.push({ name: file.name, type: file.type, size: file.size, dataUrl });
    }
    setAttachments((prev) => [...prev, ...next]);
  };

  const sendMessage = async () => {
    if (!activeId) return;
    const content = messageDraft.trim();
    if (!content) return;
    setSending(true);
    setFlash(null);
    try {
      const response = await fetch(`/api/inbox/unified/conversations/${activeId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content,
          direction: 'OUTBOUND',
          channel: detail?.inbox.type,
          attachments,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(
          localizeInboxError(
            data?.error,
            t(
              'Unable to send message.',
              'Impossible d envoyer le message.',
              'Nachricht kann nicht gesendet werden.',
              'No se puede enviar el mensaje.',
              'Nao foi possivel enviar a mensagem.'
            )
          )
        );
      setMessageDraft('');
      setAttachments([]);
      await Promise.all([mutateDetail(), mutateConversations()]);
    } catch (error: any) {
      setFlash({
        kind: 'error',
        message: localizeInboxError(
          error?.message,
          t(
            'Unable to send message.',
            'Impossible d envoyer le message.',
            'Nachricht kann nicht gesendet werden.',
            'No se puede enviar el mensaje.',
            'Nao foi possivel enviar a mensagem.'
          )
        ),
      });
    } finally {
      setSending(false);
    }
  };

  const retryFailedMessage = async (messageId: string) => {
    if (!activeId || !messageId) return;
    setRetryingMessageId(messageId);
    setFlash(null);
    try {
      const response = await fetch(
        `/api/inbox/unified/conversations/${activeId}/messages/${messageId}/retry`,
        {
          method: 'POST',
        }
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          localizeInboxError(
            data?.error,
            t(
              'Unable to retry this message.',
              'Impossible de renvoyer ce message.',
              'Diese Nachricht kann nicht erneut gesendet werden.',
              'No se puede reenviar este mensaje.',
              'Nao foi possivel reenviar esta mensagem.'
            )
          )
        );
      }
      await Promise.all([mutateDetail(), mutateConversations()]);
      setFlash({
        kind: 'success',
        message: t(
          'Message resent.',
          'Message renvoye.',
          'Nachricht erneut gesendet.',
          'Mensaje reenviado.',
          'Mensagem reenviada.'
        ),
      });
    } catch (error: any) {
      setFlash({
        kind: 'error',
        message: localizeInboxError(
          error?.message,
          t(
            'Unable to retry this message.',
            'Impossible de renvoyer ce message.',
            'Diese Nachricht kann nicht erneut gesendet werden.',
            'No se puede reenviar este mensaje.',
            'Nao foi possivel reenviar esta mensagem.'
          )
        ),
      });
    } finally {
      setRetryingMessageId(null);
    }
  };

  const composeEmailAddress = getConversationDisplayEmail(composeSelectedCustomer?.email);
  const composePhone = String(composeSelectedCustomer?.phone || '').trim() || null;
  const composeDisplayPhone = getConversationDisplayPhone(composePhone);
  const composeDraftName =
    composeTargetMode === 'EXISTING'
      ? String(composeSelectedCustomer?.name || '').trim() ||
        composeEmailAddress ||
        composeDisplayPhone ||
        ''
      : String(composeNewContactName || '').trim() ||
        String(composeNewContactEmail || '').trim() ||
        getConversationDisplayPhone(composeNewContactPhone) ||
        '';
  const composeDraftEmail =
    composeTargetMode === 'EXISTING'
      ? composeEmailAddress
      : String(composeNewContactEmail || '')
          .trim()
          .toLowerCase() || null;
  const composeDraftPhone =
    composeTargetMode === 'EXISTING'
      ? composePhone
      : String(composeNewContactPhone || '').trim() || null;
  const composeDisplayDraftPhone = getConversationDisplayPhone(composeDraftPhone);
  const composeNewPrimaryLabel =
    String(composeNewContactName || '').trim() ||
    composeDraftEmail ||
    composeDisplayDraftPhone ||
    '';
  const composeNewSecondaryLabel =
    String(composeNewContactName || '').trim()
      ? composeChannel === 'EMAIL'
        ? composeDraftEmail || composeDisplayDraftPhone
        : composeDisplayDraftPhone || composeDraftEmail
      : composeChannel === 'EMAIL'
        ? composeDisplayDraftPhone
        : composeDraftEmail;
  const selectedComposeEmailInbox =
    composeChannel === 'EMAIL'
      ? activeEmailSetups.find((item) => item.id === composeInboxId) || activeEmailSetups[0] || null
      : null;
  const composeChannelLabel =
    composeChannel === 'EMAIL'
      ? selectedComposeEmailInbox
        ? getBrandLabel(getEmailProviderBrand(selectedComposeEmailInbox))
        : t('Email', 'Email', 'E-Mail', 'Correo', 'Email')
      : 'WhatsApp';
  const composeChannelReady =
    composeChannel === 'EMAIL' ? Boolean(selectedComposeEmailInbox) : whatsappChannelConnected;
  const composeDisabledReason =
    composeTargetMode === 'EXISTING' && !composeSelectedCustomer
    ? t(
        'Select a customer before sending.',
        'Selectionnez un client avant l envoi.',
        'Wahlen Sie vor dem Senden einen Kunden aus.',
        'Selecciona un cliente antes de enviar.',
        'Selecione um cliente antes de enviar.'
      )
    : composeTargetMode === 'NEW' && composeChannel === 'EMAIL' && !composeDraftEmail
      ? t(
          'Add an email address before sending.',
          'Ajoutez une adresse e-mail avant l envoi.',
          'Fugen Sie vor dem Senden eine E-Mail-Adresse hinzu.',
          'Agrega una direccion de correo antes de enviar.',
          'Adicione um endereco de email antes de enviar.'
        )
      : composeTargetMode === 'NEW' && composeChannel === 'EMAIL' && !isLikelyEmailAddress(composeDraftEmail)
        ? t(
            'Enter a valid email address.',
            'Saisissez une adresse e-mail valide.',
            'Geben Sie eine gultige E-Mail-Adresse ein.',
            'Introduce una direccion de correo valida.',
            'Introduza um endereco de email valido.'
          )
        : composeTargetMode === 'NEW' && composeChannel === 'WHATSAPP' && !composeDraftPhone
          ? t(
              'Add a WhatsApp phone number before sending.',
              'Ajoutez un numero WhatsApp avant l envoi.',
              'Fugen Sie vor dem Senden eine WhatsApp-Nummer hinzu.',
              'Agrega un numero de WhatsApp antes de enviar.',
              'Adicione um numero de WhatsApp antes de enviar.'
            )
      : !composeChannelReady
        ? getChannelReconnectReason(composeChannelLabel)
      : composeChannel === 'EMAIL' && !composeSubject.trim()
        ? t(
            'Add a subject before sending.',
            'Ajoutez un objet avant l envoi.',
            'Fugen Sie vor dem Senden einen Betreff hinzu.',
            'Agrega un asunto antes de enviar.',
            'Adicione um assunto antes de enviar.'
          )
      : composeChannel === 'EMAIL' && !composeDraftEmail
        ? t(
            'This contact does not have an email address on file.',
            'Ce contact n a pas d adresse e-mail enregistree.',
            'Fur diesen Kontakt ist keine E-Mail-Adresse hinterlegt.',
            'Este contacto no tiene una direccion de correo registrada.',
            'Este contacto nao tem um endereco de email registado.'
          )
        : composeChannel === 'WHATSAPP' && !composeDraftPhone
          ? t(
              'This contact does not have a phone number on file for WhatsApp.',
              'Ce contact n a pas de numero de telephone enregistre pour WhatsApp.',
              'Fur diesen Kontakt ist keine Telefonnummer fur WhatsApp hinterlegt.',
              'Este contacto no tiene un numero de telefono registrado para WhatsApp.',
              'Este contacto nao tem um numero de telefone registado para o WhatsApp.'
            )
          : !composeMessage.trim()
            ? t(
                'Write a message before sending.',
                'Ecrivez un message avant l envoi.',
                'Schreiben Sie vor dem Senden eine Nachricht.',
                'Escribe un mensaje antes de enviar.',
                'Escreva uma mensagem antes de enviar.'
              )
            : null;

  const createConversationFromCompose = async () => {
    if (composeDisabledReason) return;
    setComposeSending(true);
    setFlash(null);

    const inboxId =
      composeChannel === 'EMAIL'
        ? selectedComposeEmailInbox?.id || undefined
        : whatsappSetup?.id || undefined;
    const outboundContent = composeMessage.trim();

    try {
      const conversationResponse = await fetch('/api/inbox/unified/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel: composeChannel,
          inboxId,
          ...(composeTargetMode === 'EXISTING' && composeSelectedCustomer
            ? { contactId: composeSelectedCustomer.id }
            : {
                contact: {
                  name: composeDraftName || undefined,
                  email: composeDraftEmail || undefined,
                  phone: composeDraftPhone || undefined,
                },
              }),
        }),
      });
      const conversationData = await conversationResponse.json().catch(() => ({}));
      if (!conversationResponse.ok) {
        throw new Error(
          localizeInboxError(
            conversationData?.error,
            t(
              'Unable to create conversation.',
              'Impossible de creer la conversation.',
              'Konversation kann nicht erstellt werden.',
              'No se puede crear la conversacion.',
              'Nao foi possivel criar a conversa.'
            )
          )
        );
      }

      const conversationId = String(conversationData?.id || '').trim();
      if (!conversationId) {
        throw new Error(
          t(
            'Conversation creation returned an invalid response.',
            'La creation de conversation a renvoye une reponse invalide.',
            'Die Konversationserstellung hat eine unguItige Antwort zuruckgegeben.',
            'La creacion de la conversacion devolvio una respuesta invalida.',
            'A criacao da conversa devolveu uma resposta invalida.'
          )
        );
      }

      const messageResponse = await fetch(
        `/api/inbox/unified/conversations/${conversationId}/messages`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content: outboundContent,
            direction: 'OUTBOUND',
            channel: composeChannel,
            subject: composeChannel === 'EMAIL' ? composeSubject.trim() : undefined,
          }),
        }
      );
      const messageData = await messageResponse.json().catch(() => ({}));

      setActiveId(conversationId);

      if (!messageResponse.ok) {
        setMessageDraft(outboundContent);
        await mutateConversations();
        resetComposeState();
        setFlash({
          kind: 'error',
          message: localizeInboxError(
            messageData?.error,
            t(
              'Conversation created, but the first message could not be sent. Review the thread and send it again.',
              'La conversation a ete creee, mais le premier message n a pas pu etre envoye. Ouvrez le fil et renvoyez-le.',
              'Die Konversation wurde erstellt, aber die erste Nachricht konnte nicht gesendet werden. Offnen Sie den Thread und senden Sie sie erneut.',
              'La conversacion se creo, pero no se pudo enviar el primer mensaje. Revisa el hilo y vuelvelo a enviar.',
              'A conversa foi criada, mas a primeira mensagem nao foi enviada. Reveja a conversa e envie-a novamente.'
            )
          ),
        });
        return;
      }

      await mutateConversations();
      resetComposeState();
      setFlash({
        kind: 'success',
        message: t(
          'Conversation started successfully.',
          'Conversation demarree avec succes.',
          'Konversation erfolgreich gestartet.',
          'Conversacion iniciada correctamente.',
          'Conversa iniciada com sucesso.'
        ),
      });
    } catch (error: any) {
      setFlash({
        kind: 'error',
        message: localizeInboxError(
          error?.message,
          t(
            'Unable to start this conversation.',
            'Impossible de demarrer cette conversation.',
            'Diese Konversation kann nicht gestartet werden.',
            'No se puede iniciar esta conversacion.',
            'Nao foi possivel iniciar esta conversa.'
          )
        ),
      });
    } finally {
      setComposeSending(false);
    }
  };

  const applyAiReply = async () => {
    if (!detail) return;
    setAiLoading(true);
    setFlash(null);
    try {
      const contextWindow = detail.messages
        .slice(-8)
        .map((message) => `${message.direction}: ${message.content}`)
        .join('\n');
      const response = await fetch('/api/ai/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'assistant',
          prompt: `Draft a concise support reply for this conversation. Reply in the same language as the latest customer message. If the conversation mixes languages, match the latest customer-facing language.\n${contextWindow}`,
          style: 'brief',
          tone: 'direct',
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(
          localizeInboxError(
            data?.error,
            t(
              'AI suggestion failed.',
              'La suggestion IA a echoue.',
              'Der KI-Vorschlag ist fehlgeschlagen.',
              'La sugerencia de IA fallo.',
              'A sugestao da IA falhou.'
            )
          )
        );
      const suggestion = String(data?.answer || '').trim();
      if (!suggestion)
        throw new Error(
          t(
            'AI returned an empty suggestion.',
            'L IA a renvoye une suggestion vide.',
            'Die KI hat einen leeren Vorschlag zuruckgegeben.',
            'La IA devolvio una sugerencia vacia.',
            'A IA devolveu uma sugestao vazia.'
          )
        );
      setMessageDraft(suggestion);
    } catch (error: any) {
      setFlash({
        kind: 'error',
        message: localizeInboxError(
          error?.message,
          t(
            'AI suggestion failed.',
            'La suggestion IA a echoue.',
            'Der KI-Vorschlag ist fehlgeschlagen.',
            'La sugerencia de IA fallo.',
            'A sugestao da IA falhou.'
          )
        ),
      });
    } finally {
      setAiLoading(false);
    }
  };

  const applyTags = async () => {
    const tags = tagDraft
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean);
    await handlePatchConversation({ tags });
  };

  const ticketCounts = useMemo(
    () => ({
      all: conversations.length,
      open: conversations.filter((item) => item.status === 'OPEN').length,
      waiting: conversations.filter((item) => item.status === 'WAITING_ON_CUSTOMER').length,
      snoozed: conversations.filter((item) => item.status === 'SNOOZED').length,
      resolved: conversations.filter((item) => item.status === 'RESOLVED').length,
    }),
    [conversations]
  );

  return (
    <div className="space-y-5">
      {flash ? (
        <TransientAlert variant={flash.kind} onDismiss={() => setFlash(null)}>
          {flash.message}
        </TransientAlert>
      ) : null}
      {listError ? (
        <Alert variant="error">{localizeInboxError((listError as Error).message)}</Alert>
      ) : null}
      {detailError ? (
        <Alert variant="error">{localizeInboxError((detailError as Error).message)}</Alert>
      ) : null}

      <section className="overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-[0_20px_60px_rgba(15,23,42,0.08)] dark:border-slate-800 dark:bg-slate-950 dark:shadow-[0_24px_70px_rgba(2,6,23,0.45)]">
        <header className="border-b border-slate-200 bg-slate-50/80 px-5 py-5 backdrop-blur dark:border-slate-800 dark:bg-slate-900/80 sm:px-6">
          <div className="flex flex-col gap-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                {!showOnboardingState ? (
                  <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400 dark:text-slate-500">
                    {t('Unified Inbox', 'Boite de reception unifiee', 'Einheitlicher Posteingang', 'Bandeja de entrada unificada', 'Caixa de entrada unificada')}
                  </p>
                ) : null}
                <h1 className={`${showOnboardingState ? '' : 'mt-1 '}text-3xl font-semibold tracking-tight text-slate-950 dark:text-slate-50`}>
                  {t('Unified Inbox', 'Boite de reception unifiee', 'Einheitlicher Posteingang', 'Bandeja de entrada unificada', 'Caixa de entrada unificada')}
                </h1>
                {!showOnboardingState ? (
                  <p className="mt-2 max-w-2xl text-sm text-slate-500 dark:text-slate-400">
                    {t(
                      'Gmail, Outlook, and WhatsApp conversations in one focused workspace.',
                      'Conversations Gmail, Outlook et WhatsApp dans un seul espace de travail cible.',
                      'Gmail-, Outlook- und WhatsApp-Konversationen in einem fokussierten Workspace.',
                      'Conversaciones de Gmail, Outlook y WhatsApp en un solo espacio de trabajo enfocado.',
                      'Conversas do Gmail, Outlook e WhatsApp num unico espaco de trabalho focado.'
                    )}
                  </p>
                ) : null}
              </div>
              <div className="flex items-center gap-3">
                <div className="hidden items-center gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900 sm:flex">
                  <div
                    className={`flex h-10 w-10 items-center justify-center ${
                      showOnboardingState
                        ? 'rounded-full bg-indigo-100 text-indigo-700'
                        : 'rounded-xl bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-100'
                    } text-sm font-semibold`}
                  >
                    {userInitials}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {userDisplayName}
                    </p>
                    {!showOnboardingState ? (
                      <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                        {userDisplayEmail ||
                          t(
                            'Workspace user',
                            'Utilisateur de l espace de travail',
                            'Workspace-Benutzer',
                            'Usuario del espacio de trabajo',
                            'Utilizador do espaco de trabalho'
                          )}
                      </p>
                    ) : null}
                  </div>
                </div>
                {isConnectedState ? (
                  <Button
                    onClick={openCompose}
                    disabled={!hasConnectedChannel}
                    className="shadow-[0_16px_36px_rgba(79,70,229,0.25)]"
                  >
                    <Send className="h-4 w-4" />
                    {t('Compose', 'Rediger', 'Verfassen', 'Redactar', 'Escrever')}
                  </Button>
                ) : null}
              </div>
            </div>

            {showOnboardingState ? (
              <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_64px] xl:items-center">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-4 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
                  <input
                    disabled
                    placeholder={t('Search messages...', 'Rechercher des messages...', 'Nachrichten suchen...', 'Buscar mensajes...', 'Pesquisar mensagens...')}
                    className="h-14 w-full rounded-2xl border border-slate-200 bg-white pl-12 pr-4 text-sm text-slate-400 outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400 dark:placeholder:text-slate-500"
                  />
                </div>
                <button
                  type="button"
                  disabled
                  className="inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-500"
                >
                  <Filter className="h-5 w-5" />
                </button>
              </div>
            ) : (
              <>
                <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-4 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
                    <input
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder={t('Search messages...', 'Rechercher des messages...', 'Nachrichten suchen...', 'Buscar mensajes...', 'Pesquisar mensagens...')}
                      className="h-14 w-full rounded-2xl border border-slate-200 bg-white pl-12 pr-4 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500"
                    />
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {[
                      { id: 'ALL' as const, label: t('All', 'Tous', 'Alle', 'Todos', 'Todos'), count: ticketCounts.all },
                      {
                        id: 'OPEN' as const,
                        label: t('Needs reply', 'Reponse requise', 'Antwort erforderlich', 'Necesita respuesta', 'Precisa de resposta'),
                        count: ticketCounts.open,
                      },
                      {
                        id: 'WAITING_ON_CUSTOMER' as const,
                        label: t('Waiting', 'En attente', 'Wartend', 'En espera', 'Em espera'),
                        count: ticketCounts.waiting,
                      },
                    ].map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setStatus(item.id)}
                        className={`rounded-full px-3 py-2 text-xs font-semibold transition ${
                          status === item.id
                            ? 'border border-indigo-200 bg-indigo-50 text-indigo-700 shadow-sm dark:border-indigo-500/40 dark:bg-indigo-500/12 dark:text-indigo-300'
                            : 'border border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-slate-600 dark:hover:text-slate-100'
                        }`}
                      >
                        {item.label} ({item.count})
                      </button>
                    ))}
                  </div>
                </div>
                {connectedChannelItems.length ? (
                  <div className="flex flex-wrap items-center gap-2">
                    {connectedChannelItems.map((item) => (
                      <div
                        key={item.id}
                        className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700"
                      >
                        <ChannelGlyph brand={item.brand} className="h-3.5 w-3.5" />
                        {item.label}
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        <button
                          type="button"
                          onClick={() => disconnectInbox(item.setup)}
                          disabled={disconnectingInboxId === item.inboxId}
                          className="inline-flex items-center gap-1 rounded-full border border-emerald-300 bg-white/80 px-2 py-1 text-[11px] font-semibold text-emerald-700 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <LogOut className="h-3 w-3" />
                          {disconnectingInboxId === item.inboxId
                            ? t('Disconnecting...', 'Deconnexion...', 'Trennen...', 'Desconectando...', 'A desligar...')
                            : t('Disconnect', 'Deconnecter', 'Trennen', 'Desconectar', 'Desligar')}
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => setConnectChannelsOpen(true)}
                      className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-slate-600 dark:hover:text-white"
                    >
                      <ChevronRight className="h-3.5 w-3.5" />
                      {t(
                        'Connect another channel',
                        'Connecter un autre canal',
                        'Weiteren Kanal verbinden',
                        'Conectar otro canal',
                        'Ligar outro canal'
                      )}
                    </button>
                  </div>
                ) : null}
              </>
            )}
          </div>
        </header>

        <div
          className={`grid gap-0 ${
            showOnboardingState
              ? 'xl:grid-cols-[minmax(0,1fr)_340px]'
              : 'xl:grid-cols-[280px_minmax(0,1.55fr)_264px] 2xl:grid-cols-[300px_minmax(0,1.7fr)_288px]'
          }`}
        >
          {!showOnboardingState ? (
            <section className="border-b border-slate-200 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-900/40 xl:border-b-0 xl:border-r">
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400 dark:text-slate-500">
                  {t('Inbox', 'Boite de reception', 'Posteingang', 'Bandeja de entrada', 'Caixa de entrada')}
                </p>
                <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {ticketCounts.all}{' '}
                  {t('conversations', 'conversations', 'Konversationen', 'conversaciones', 'conversas')}
                </p>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                {totalUnreadCount} {t('unread', 'non lus', 'ungelesen', 'sin leer', 'nao lidas')}
              </span>
            </div>
            <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-800">
              <select
                value={assignee}
                onChange={(event) => setAssignee(event.target.value as AssigneeFilter)}
                className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-indigo-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              >
                <option value="all">{t('All assignments', 'Toutes les attributions', 'Alle Zuweisungen', 'Todas las asignaciones', 'Todas as atribuicoes')}</option>
                <option value="mine">{t('Assigned to me', 'Attribuees a moi', 'Mir zugewiesen', 'Asignadas a mi', 'Atribuidas a mim')}</option>
                <option value="unassigned">{t('Unassigned', 'Non attribuees', 'Nicht zugewiesen', 'Sin asignar', 'Sem atribuicao')}</option>
              </select>
            </div>
            <div className="max-h-[720px] space-y-2 overflow-y-auto p-3">
              {listLoading ? (
                <div className="rounded-3xl border border-dashed border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
                  {t('Loading conversations...', 'Chargement des conversations...', 'Konversationen werden geladen...', 'Cargando conversaciones...', 'A carregar conversas...')}
                </div>
              ) : null}
              {!listLoading && !conversations.length ? (
                <div className="rounded-3xl border border-dashed border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
                  {t('No conversations found.', 'Aucune conversation trouvee.', 'Keine Konversationen gefunden.', 'No se encontraron conversaciones.', 'Nenhuma conversa encontrada.')}
                </div>
              ) : null}
              {conversations.map((conversation) => {
                const brand = getConversationBrand(conversation.inbox.type, conversation.inbox.id);
                const isActive = activeId === conversation.id;
                const importedLegacy = isLegacyImportedEmail(conversation.contact.email);
                const conversationChannelConnected =
                  conversation.inbox.type === 'EMAIL'
                    ? isEmailChannelConnected(emailInboxById.get(conversation.inbox.id) || null)
                    : whatsappChannelConnected;
                const cardClasses = isActive
                  ? 'border-indigo-200 bg-[linear-gradient(180deg,rgba(255,255,255,1),rgba(238,242,255,0.96))] text-slate-950 shadow-[0_18px_40px_rgba(99,102,241,0.16)] ring-1 ring-indigo-100 dark:border-indigo-400/30 dark:bg-[linear-gradient(180deg,rgba(30,41,59,1),rgba(15,23,42,1))] dark:text-white dark:ring-0'
                  : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-slate-600 dark:hover:bg-slate-800';
                const avatarClasses = isActive
                  ? 'border border-indigo-100 bg-white text-slate-700 shadow-sm dark:border-white/10 dark:bg-white/12 dark:text-white'
                  : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-100';
                const titleClasses = isActive ? 'text-slate-950 dark:text-white' : 'text-slate-900 dark:text-slate-100';
                const secondaryTextClasses = isActive
                  ? 'text-slate-600 dark:text-slate-200'
                  : 'text-slate-500 dark:text-slate-400';
                const previewClasses = isActive
                  ? 'text-slate-700 dark:text-slate-100'
                  : 'text-slate-600 dark:text-slate-300';
                const brandPillClasses = isActive
                  ? 'border border-indigo-100 bg-white text-slate-700 dark:border-white/10 dark:bg-white/12 dark:text-slate-50'
                  : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300';
                const historyPillClasses = isActive
                  ? 'bg-sky-100 text-sky-800 dark:bg-sky-400/20 dark:text-sky-100'
                  : 'bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300';
                const importedPillClasses = isActive
                  ? 'bg-slate-200 text-slate-700 dark:bg-white/12 dark:text-slate-100'
                  : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300';
                const unreadPillClasses = isActive
                  ? 'bg-indigo-600 text-white dark:bg-white/10 dark:text-white'
                  : 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300';

                return (
                  <button
                    key={conversation.id}
                    type="button"
                    onClick={() => setActiveId(conversation.id)}
                    className={`w-full rounded-[24px] border p-4 text-left transition ${cardClasses}`}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-xs font-semibold ${avatarClasses}`}
                      >
                        {getConversationInitials(conversation.contact)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <p
                                className={`truncate text-sm ${conversation.unreadCount > 0 ? 'font-semibold' : 'font-medium'} ${titleClasses}`}
                              >
                                {getPrimaryLabel(conversation.contact)}
                              </p>
                              {conversation.unreadCount > 0 ? (
                                <span className="h-2 w-2 rounded-full bg-indigo-400" />
                              ) : null}
                            </div>
                            <p
                              className={`mt-1 truncate text-xs ${secondaryTextClasses}`}
                            >
                              {getSecondaryLabel(conversation.contact)}
                            </p>
                          </div>
                          <span
                            className={`shrink-0 text-xs font-medium ${secondaryTextClasses}`}
                          >
                            {formatConversationListTime(
                              conversation.lastMessageAt || conversation.lastMessage?.createdAt
                            )}
                          </span>
                        </div>
                        <p
                          className={`mt-3 truncate text-sm ${previewClasses}`}
                        >
                          {conversation.lastMessage?.content ||
                            t('No messages yet.', 'Aucun message pour le moment.', 'Noch keine Nachrichten.', 'Aun no hay mensajes.', 'Ainda nao ha mensagens.')}
                        </p>
                        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={`inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-[11px] font-medium ${brandPillClasses}`}
                            >
                              <ChannelGlyph brand={brand} className="h-3.5 w-3.5" />
                              {getBrandLabel(brand)}
                            </span>
                            {!conversationChannelConnected ? (
                              <span
                                className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${historyPillClasses}`}
                              >
                                {t('History only', 'Historique uniquement', 'Nur Verlauf', 'Solo historial', 'Apenas historico')}
                              </span>
                            ) : null}
                            {importedLegacy ? (
                              <span
                                className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${importedPillClasses}`}
                              >
                                {t('Imported', 'Importe', 'Importiert', 'Importado', 'Importado')}
                              </span>
                            ) : null}
                          </div>
                          {conversation.unreadCount > 0 ? (
                            <span
                              className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${unreadPillClasses}`}
                            >
                              {conversation.unreadCount}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
            </section>
          ) : null}

          <section className="flex min-h-[640px] min-w-0 flex-col border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 xl:border-b-0 xl:border-r">
            {showOnboardingState ? (
              <div id="inbox-empty-state" className="flex flex-1 items-center justify-center p-6 sm:p-8">
                <div className="w-full max-w-5xl rounded-[34px] border border-slate-200 bg-[radial-gradient(circle_at_top,_rgba(99,102,241,0.08),transparent_42%),linear-gradient(180deg,_rgba(255,255,255,1),rgba(248,250,252,1))] px-6 py-8 shadow-[0_24px_64px_rgba(15,23,42,0.08)] dark:border-slate-800 dark:bg-[radial-gradient(circle_at_top,_rgba(99,102,241,0.12),transparent_38%),linear-gradient(180deg,rgba(15,23,42,0.96),rgba(2,6,23,1))] dark:shadow-[0_28px_80px_rgba(2,6,23,0.5)] sm:px-8 sm:py-10">
                  <div className="mx-auto max-w-2xl text-center">
                    <div className="mx-auto -mb-2 -mt-3 w-full max-w-[320px]">
                      <Image
                        src="/brand/unified-inbox-hero.png"
                        alt={t('Unified inbox illustration', 'Illustration de la boite de reception unifiee', 'Illustration des einheitlichen Posteingangs', 'Ilustracion de la bandeja de entrada unificada', 'Ilustracao da caixa de entrada unificada')}
                        width={629}
                        height={491}
                        sizes="320px"
                        unoptimized
                        className="mx-auto h-auto w-full"
                      />
                    </div>
                    <h2 className="mt-2 text-4xl font-semibold tracking-tight text-slate-950 dark:text-slate-50">
                      {t('Your Unified Inbox is ready', 'Votre boite de reception unifiee est prete', 'Ihr einheitlicher Posteingang ist bereit', 'Tu bandeja de entrada unificada esta lista', 'A sua caixa de entrada unificada esta pronta')}
                    </h2>
                    <p className="mt-4 text-lg leading-8 text-slate-500 dark:text-slate-400">
                      {t(
                        'Connect your email and messaging channels to see all conversations in one place.',
                        'Connectez vos canaux email et messagerie pour voir toutes les conversations au meme endroit.',
                        'Verbinden Sie Ihre E-Mail- und Messaging-Kanale, um alle Konversationen an einem Ort zu sehen.',
                        'Conecta tus canales de correo y mensajeria para ver todas las conversaciones en un solo lugar.',
                        'Ligue os seus canais de email e mensagens para ver todas as conversas num unico lugar.'
                      )}
                    </p>
                  </div>

                  <div className="mt-10 grid grid-cols-1 gap-4 xl:grid-cols-3">
                    <ChannelConnectCard
                      icon={<GmailLogo className="h-8 w-8" />}
                      title={t('Connect Gmail', 'Connecter Gmail', 'Gmail verbinden', 'Conectar Gmail', 'Ligar Gmail')}
                      description={t('Import emails from your Gmail account.', 'Importer les emails de votre compte Gmail.', 'E-Mails aus Ihrem Gmail-Konto importieren.', 'Importa correos desde tu cuenta de Gmail.', 'Importe emails da sua conta Gmail.')}
                      accentClassName="bg-red-50"
                      disabled={providerAvailabilityLoading || gmailOauthConfigured === false}
                      badge={
                        providerAvailabilityLoading
                          ? t('Loading', 'Chargement', 'Wird geladen', 'Cargando', 'A carregar')
                          : gmailOauthConfigured === false
                            ? t('Unavailable', 'Indisponible', 'Nicht verfugbar', 'No disponible', 'Indisponivel')
                            : undefined
                      }
                      onClick={() => startMailboxConnect(gmailConnectHref, Boolean(gmailOauthConfigured))}
                    />

                    <ChannelConnectCard
                      icon={<OutlookLogo className="h-8 w-8" />}
                      title={t('Connect Outlook', 'Connecter Outlook', 'Outlook verbinden', 'Conectar Outlook', 'Ligar Outlook')}
                      description={t('Import emails from your Outlook account.', 'Importer les emails de votre compte Outlook.', 'E-Mails aus Ihrem Outlook-Konto importieren.', 'Importa correos desde tu cuenta de Outlook.', 'Importe emails da sua conta Outlook.')}
                      accentClassName="bg-sky-50"
                      disabled={providerAvailabilityLoading || outlookOauthConfigured === false}
                      badge={
                        providerAvailabilityLoading
                          ? t('Loading', 'Chargement', 'Wird geladen', 'Cargando', 'A carregar')
                          : outlookOauthConfigured === false
                            ? t('Unavailable', 'Indisponible', 'Nicht verfugbar', 'No disponible', 'Indisponivel')
                            : undefined
                      }
                      onClick={() =>
                        startMailboxConnect(outlookConnectHref, Boolean(outlookOauthConfigured))
                      }
                    />

                    <ChannelConnectCard
                      icon={<WhatsAppLogo className="h-8 w-8" />}
                      title={t('Connect WhatsApp', 'Connecter WhatsApp', 'WhatsApp verbinden', 'Conectar WhatsApp', 'Ligar WhatsApp')}
                      description={
                        whatsappConnectAvailable
                          ? t('Connect to your WhatsApp number.', 'Connectez votre numero WhatsApp.', 'Verbinden Sie Ihre WhatsApp-Nummer.', 'Conecta tu numero de WhatsApp.', 'Ligue o seu numero do WhatsApp.')
                          : t('WhatsApp is not available on this deployment yet.', 'WhatsApp n est pas encore disponible sur ce deploiement.', 'WhatsApp ist auf dieser Bereitstellung noch nicht verfugbar.', 'WhatsApp todavia no esta disponible en este despliegue.', 'O WhatsApp ainda nao esta disponivel nesta implementacao.')
                      }
                      accentClassName="bg-emerald-50"
                      disabled={!whatsappConnectAvailable}
                      badge={
                        !whatsappConnectAvailable
                          ? t('Unavailable', 'Indisponible', 'Nicht verfugbar', 'No disponible', 'Indisponivel')
                          : undefined
                      }
                    >
                      {whatsappConnectAvailable ? (
                        <WhatsAppEmbeddedSignupCard
                          compact
                          hideUnavailableDetails
                          containerClassName="absolute inset-0 z-10 flex items-center justify-center"
                          buttonClassName="h-full w-full rounded-[22px] !bg-transparent !text-transparent !shadow-none hover:!bg-transparent focus-visible:outline-none"
                          connection={
                            whatsappSetup?.connection.mode === 'whatsapp_api'
                              ? whatsappSetup.connection
                              : { mode: 'none', configured: false }
                          }
                          onConnected={() => mutateInboxes()}
                        />
                      ) : null}
                    </ChannelConnectCard>
                  </div>

                  <div className="mt-8 flex items-center justify-center gap-2 border-t border-slate-200 pt-6 text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">
                    <ShieldCheck className="h-4 w-4 text-emerald-500" />
                    <span>{t('Your data is secure and encrypted.', 'Vos donnees sont securisees et chiffrees.', 'Ihre Daten sind sicher und verschlusselt.', 'Tus datos son seguros y estan cifrados.', 'Os seus dados estao seguros e encriptados.')}</span>
                  </div>
                </div>
              </div>
            ) : detail ? (
              <>
                <header className="border-b border-slate-200 bg-slate-50/80 px-5 py-4 dark:border-slate-800 dark:bg-slate-900/80 sm:px-6">
                  <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
                    <div>
                      <div className="flex items-center gap-3">
                        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-100">
                          {getConversationInitials(detail.contact)}
                        </div>
                        <div>
                          <p className="text-lg font-semibold text-slate-950 dark:text-slate-50">
                            {getPrimaryLabel(detail.contact)}
                          </p>
                          <p className="text-sm text-slate-500 dark:text-slate-400">
                            {getSecondaryLabel(detail.contact)}
                          </p>
                        </div>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                        <span className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                          <ChannelGlyph
                            brand={getConversationBrand(detail.inbox.type, detail.inbox.id)}
                            className="h-3.5 w-3.5"
                          />
                          {getBrandLabel(getConversationBrand(detail.inbox.type, detail.inbox.id))}
                        </span>
                        <span
                          className={`rounded-full border px-3 py-1 font-medium ${statusPillClasses[detail.status]}`}
                        >
                          {localizeInboxStatus(detail.status)}
                        </span>
                        {formatConversationStatusDetail(detail) ? (
                          <span className="rounded-full bg-slate-100 px-3 py-1 font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                            {formatConversationStatusDetail(detail)}
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <div className="grid w-full gap-2 sm:w-auto sm:grid-cols-2 sm:justify-end">
                      <select
                        value={detail.status}
                        onChange={(event) =>
                          handlePatchConversation(
                            event.target.value === 'SNOOZED'
                              ? {
                                  status: 'SNOOZED',
                                  snoozedUntil: new Date(
                                    Date.now() + 24 * 60 * 60 * 1000
                                  ).toISOString(),
                                }
                              : { status: event.target.value }
                          )
                        }
                        disabled={saving}
                        className="h-10 w-full min-w-0 rounded-2xl border border-slate-200 bg-white/90 px-3 text-sm font-medium text-slate-700 outline-none transition focus:border-indigo-300 focus:bg-white sm:min-w-[170px] sm:max-w-[200px] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:bg-slate-900"
                      >
                        <option value="OPEN">{t('Needs reply', 'Reponse requise', 'Antwort erforderlich', 'Necesita respuesta', 'Precisa de resposta')}</option>
                        <option value="WAITING_ON_CUSTOMER">{t('Waiting on customer', 'En attente du client', 'Wartet auf Kunden', 'Esperando al cliente', 'A aguardar o cliente')}</option>
                        <option value="SNOOZED">{t('Snoozed', 'Reporte', 'Zuruckgestellt', 'Pospuesto', 'Adiado')}</option>
                        <option value="RESOLVED">{t('Resolved', 'Resolue', 'Gelost', 'Resuelto', 'Resolvido')}</option>
                      </select>
                      <select
                        value={detail.assignedUser?.id || ''}
                        onChange={(event) =>
                          handlePatchConversation({ assignedUserId: event.target.value || null })
                        }
                        disabled={saving}
                        className="h-10 w-full min-w-0 rounded-2xl border border-slate-200 bg-white/90 px-3 text-sm font-medium text-slate-700 outline-none transition focus:border-indigo-300 focus:bg-white sm:min-w-[210px] sm:max-w-[240px] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:bg-slate-900"
                      >
                        <option value="">{t('Unassigned', 'Non attribue', 'Nicht zugewiesen', 'Sin asignar', 'Sem atribuicao')}</option>
                        {agents.map((agent) => (
                          <option key={agent.id} value={agent.id}>
                            {agent.name || agent.email}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </header>
                <div className="flex-1 space-y-3 overflow-y-auto bg-white px-4 py-5 dark:bg-[radial-gradient(circle_at_top,rgba(99,102,241,0.08),transparent_36%),linear-gradient(180deg,rgba(15,23,42,0.96),rgba(2,6,23,0.94))] sm:px-6 xl:px-7 2xl:px-8">
                  {detailLoading ? (
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      {t('Loading thread...', 'Chargement du fil...', 'Thread wird geladen...', 'Cargando hilo...', 'A carregar conversa...')}
                    </p>
                  ) : null}
                  {!detailLoading && !detail.messages.length ? (
                    <div className="rounded-[28px] border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
                      {t('No messages yet.', 'Aucun message pour le moment.', 'Noch keine Nachrichten.', 'Aun no hay mensajes.', 'Ainda nao ha mensagens.')}
                    </div>
                  ) : null}
                  {detail.messages.map((message) => (
                    <div
                      key={message.id}
                      className={`flex ${message.direction === 'OUTBOUND' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`w-fit max-w-[92%] rounded-[16px] px-4 py-3 text-sm md:max-w-[88%] 2xl:max-w-[860px] ${directionBubble[message.direction] ?? directionBubble.SYSTEM}`}
                      >
                        {message.channel === 'EMAIL' && message.subject ? (
                          <p className="mb-2 text-sm font-semibold leading-6 text-slate-950/90 dark:text-slate-100">
                            {message.subject}
                          </p>
                        ) : null}
                        <p className="whitespace-pre-wrap break-words leading-[1.7]">
                          {formatConversationMessageContent(message.content)}
                        </p>
                        {Array.isArray(message.attachments) && message.attachments.length > 0 ? (
                          <div className="mt-3 space-y-1 text-xs opacity-80">
                            {message.attachments.map((attachment, index) => (
                              <p key={`${message.id}-${index}`}>
                                {t('Attachment:', 'Piece jointe :', 'Anhang:', 'Adjunto:', 'Anexo:')} {attachment.name || t('file', 'fichier', 'Datei', 'archivo', 'ficheiro')}
                              </p>
                            ))}
                          </div>
                        ) : null}
                        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] opacity-65">
                          <span>
                            {formatInboxDateTime(message.createdAt)} |{' '}
                            {getChannelLabel(message.channel, detail.inbox.id)} |{' '}
                            {getDeliveryStatusLabel(message.deliveryStatus)}
                          </span>
                          {message.direction === 'OUTBOUND' && message.deliveryStatus === 'FAILED' ? (
                            <button
                              type="button"
                              onClick={() => retryFailedMessage(message.id)}
                              disabled={retryingMessageId === message.id}
                              className="font-semibold text-indigo-600 opacity-100 transition hover:text-indigo-700 disabled:cursor-not-allowed disabled:opacity-50 dark:text-indigo-300 dark:hover:text-indigo-200"
                            >
                              {retryingMessageId === message.id
                                ? t('Retrying...', 'Nouvel envoi...', 'Erneut senden...', 'Reintentando...', 'A reenviar...')
                                : t('Retry', 'Renvoyer', 'Erneut senden', 'Reintentar', 'Reenviar')}
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="border-t border-slate-200 bg-slate-50/80 px-4 py-4 dark:border-slate-800 dark:bg-slate-900/80 sm:px-6 xl:px-7 2xl:px-8">
                  {activeReplyDisabledReason ? (
                    <Alert variant="warning">{activeReplyDisabledReason}</Alert>
                  ) : null}
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span className="inline-flex h-10 items-center rounded-2xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                      {t('Replying on', 'Reponse sur', 'Antwort uber', 'Respondiendo por', 'A responder em')} {getBrandLabel(getConversationBrand(detail.inbox.type, detail.inbox.id))}
                    </span>
                    <select
                      onChange={(event) => {
                        const id = event.target.value;
                        if (!id) return;
                        const selected = cannedReplies.find((reply) => reply.id === id);
                        if (selected) setMessageDraft(selected.content);
                        event.currentTarget.value = '';
                      }}
                      className="h-10 min-w-[180px] rounded-2xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 outline-none transition focus:border-indigo-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                      defaultValue=""
                    >
                      <option value="">{t('Saved replies', 'Reponses enregistrees', 'Gespeicherte Antworten', 'Respuestas guardadas', 'Respostas guardadas')}</option>
                      {cannedReplies.map((reply) => (
                        <option key={reply.id} value={reply.id}>
                          {reply.title}
                        </option>
                      ))}
                    </select>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={applyAiReply}
                      disabled={aiLoading}
                    >
                      <Sparkles className="h-4 w-4" />
                      {aiLoading
                        ? t('Generating...', 'Generation...', 'Wird erstellt...', 'Generando...', 'A gerar...')
                        : t('AI reply', 'Reponse IA', 'KI-Antwort', 'Respuesta IA', 'Resposta IA')}
                    </Button>
                    <label
                      className={`inline-flex items-center gap-2 rounded-2xl border px-3 py-2 text-xs font-semibold ${activeReplyDisabledReason ? 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-500' : 'cursor-pointer border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-slate-600 dark:hover:bg-slate-800'}`}
                    >
                      <Paperclip className="h-4 w-4" />
                      {t('Attach', 'Joindre', 'Anhangen', 'Adjuntar', 'Anexar')}
                      <input
                        type="file"
                        multiple
                        className="hidden"
                        disabled={Boolean(activeReplyDisabledReason)}
                        onChange={(event) => handleFileAttach(event.target.files)}
                      />
                    </label>
                  </div>
                  {attachments.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {attachments.map((attachment, index) => (
                        <span
                          key={`${attachment.name}-${index}`}
                          className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                        >
                          {attachment.name}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  <div className="mt-3 grid items-end gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
                    <Textarea
                      className="min-h-[124px] w-full rounded-[22px] border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900"
                      value={messageDraft}
                      onChange={(event) => setMessageDraft(event.target.value)}
                      disabled={Boolean(activeReplyDisabledReason)}
                      placeholder={
                        activeReplyDisabledReason ||
                        t('Type your reply...', 'Saisissez votre reponse...', 'Antwort eingeben...', 'Escribe tu respuesta...', 'Escreva a sua resposta...')
                      }
                    />
                    <Button
                      onClick={sendMessage}
                      disabled={sending || Boolean(activeReplyDisabledReason)}
                      className="h-12 px-6 md:self-end"
                    >
                      <Send className="h-4 w-4" />
                      {sending
                        ? t('Sending...', 'Envoi...', 'Wird gesendet...', 'Enviando...', 'A enviar...')
                        : t('Send', 'Envoyer', 'Senden', 'Enviar', 'Enviar')}
                    </Button>
                  </div>
                </div>
              </>
            ) : listLoading ? (
              <div className="flex flex-1 items-center justify-center p-8">
                <div className="max-w-md rounded-[30px] border border-slate-200 bg-slate-50 px-8 py-10 text-center dark:border-slate-800 dark:bg-slate-900">
                  <div className="mx-auto h-16 w-32 animate-pulse rounded-full bg-slate-200 dark:bg-slate-800" />
                  <p className="mt-5 text-sm leading-6 text-slate-500 dark:text-slate-400">
                    {t('Loading your inbox...', 'Chargement de votre boite de reception...', 'Ihr Posteingang wird geladen...', 'Cargando tu bandeja de entrada...', 'A carregar a sua caixa de entrada...')}
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex flex-1 items-center justify-center p-8">
                <div className="max-w-md rounded-[30px] border border-slate-200 bg-slate-50 px-8 py-10 text-center dark:border-slate-800 dark:bg-slate-900">
                  <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-white text-slate-700 dark:bg-slate-800 dark:text-slate-100">
                    <Inbox className="h-7 w-7" />
                  </div>
                  <h2 className="mt-5 text-2xl font-semibold text-slate-950 dark:text-slate-50">
                    {t('No conversations yet', 'Aucune conversation pour le moment', 'Noch keine Konversationen', 'Aun no hay conversaciones', 'Ainda nao ha conversas')}
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
                    {t(
                      'Start a conversation now or wait for incoming messages to land here automatically.',
                      'Demarrez une conversation maintenant ou attendez que les messages entrants arrivent ici automatiquement.',
                      'Starten Sie jetzt eine Konversation oder warten Sie, bis eingehende Nachrichten hier automatisch erscheinen.',
                      'Inicia una conversacion ahora o espera a que los mensajes entrantes aparezcan aqui automaticamente.',
                      'Inicie uma conversa agora ou espere que as mensagens recebidas aparecam aqui automaticamente.'
                    )}
                  </p>
                  <div className="mt-6 flex justify-center">
                    <Button onClick={openCompose} className="shadow-[0_16px_36px_rgba(79,70,229,0.25)]">
                      <Send className="h-4 w-4" />
                      {t(
                        'Start conversation',
                        'Demarrer une conversation',
                        'Konversation starten',
                        'Iniciar conversacion',
                        'Iniciar conversa'
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </section>

          <aside className="bg-slate-50/70 p-4 dark:bg-slate-900/50 xl:border-l xl:border-slate-200 dark:xl:border-slate-800 2xl:p-5">
            <div className="space-y-4">
              {showOnboardingState ? (
                <OnboardingRightPanel />
              ) : (
                <RecentActivityPanel
                  items={connectedRecentActivityItems}
                  emptyMessage={t(
                    'No activity yet. New inbox events will appear here.',
                    'Aucune activite pour le moment. Les nouveaux evenements de boite de reception apparaitront ici.',
                    'Noch keine Aktivitat. Neue Posteingangsereignisse erscheinen hier.',
                    'Aun no hay actividad. Los nuevos eventos de la bandeja de entrada apareceran aqui.',
                    'Ainda nao ha atividade. Novos eventos da caixa de entrada aparecerao aqui.'
                  )}
                />
              )}
              {!showOnboardingState ? (
                <WorkspaceStatsCard
                  channelsConnected={liveChannelCount}
                  messageCount={ticketCounts.all}
                />
              ) : null}
              {!showOnboardingState ? (
                <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_12px_28px_rgba(15,23,42,0.06)] dark:border-slate-800 dark:bg-slate-950">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-100">
                    <UserCircle2 className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400 dark:text-slate-500">
                      {t('Context', 'Contexte', 'Kontext', 'Contexto', 'Contexto')}
                    </p>
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {detail
                        ? getPrimaryLabel(detail.contact)
                        : t('Select a conversation', 'Selectionnez une conversation', 'Wahlen Sie eine Konversation aus', 'Selecciona una conversacion', 'Selecione uma conversa')}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {detail
                        ? getSecondaryLabel(detail.contact)
                        : t('Customer details will appear here.', 'Les details du client apparaitront ici.', 'Kundendetails erscheinen hier.', 'Los detalles del cliente apareceran aqui.', 'Os detalhes do cliente aparecerao aqui.')}
                    </p>
                  </div>
                </div>
                {detail ? (
                  <div className="mt-4 grid gap-3 text-sm">
                    <div className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-900">
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">
                        {t('Assignment', 'Attribution', 'Zuweisung', 'Asignacion', 'Atribuicao')}
                      </p>
                      <p className="mt-2 text-sm font-medium text-slate-900 dark:text-slate-100">
                        {detail.assignedUser?.name ||
                          detail.assignedUser?.email ||
                          t('Unassigned', 'Non attribue', 'Nicht zugewiesen', 'Sin asignar', 'Sem atribuicao')}
                      </p>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        {detail.unreadCount}{' '}
                        {t('unread in this thread', 'non lus dans ce fil', 'ungelesen in diesem Thread', 'sin leer en este hilo', 'nao lidas nesta conversa')}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-900">
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">
                        {t('Tags', 'Etiquettes', 'Tags', 'Etiquetas', 'Etiquetas')}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {detail.tags.length ? (
                          detail.tags.map((tag) => (
                            <span
                              key={tag.id}
                              className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-xs font-medium text-slate-700 shadow-sm dark:bg-slate-800 dark:text-slate-200"
                            >
                              <Tag className="h-3 w-3" />
                              {tag.label}
                            </span>
                          ))
                        ) : (
                          <span className="text-xs text-slate-500 dark:text-slate-400">
                            {t('No tags', 'Aucune etiquette', 'Keine Tags', 'Sin etiquetas', 'Sem etiquetas')}
                          </span>
                        )}
                      </div>
                      <div className="mt-3 flex gap-2">
                        <Input
                          value={tagDraft}
                          onChange={(event) => setTagDraft(event.target.value)}
                          placeholder={t('tag1, tag2', 'tag1, tag2', 'tag1, tag2', 'etiqueta1, etiqueta2', 'tag1, tag2')}
                        />
                        <Button size="sm" variant="secondary" onClick={applyTags} disabled={saving}>
                          {t('Save', 'Enregistrer', 'Speichern', 'Guardar', 'Guardar')}
                        </Button>
                      </div>
                    </div>
                    <div className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-900">
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">
                        {t('Internal notes', 'Notes internes', 'Interne Notizen', 'Notas internas', 'Notas internas')}
                      </p>
                      <div className="mt-3 max-h-36 min-w-0 space-y-2 overflow-x-hidden overflow-y-auto">
                        {detail.notes.length ? (
                          detail.notes.map((note) => (
                            <div
                              key={note.id}
                              className="min-w-0 max-w-full overflow-hidden rounded-2xl bg-white px-3 py-3 shadow-sm dark:bg-slate-800"
                            >
                              <div className="flex min-w-0 items-start justify-between gap-2">
                                <p className="min-w-0 truncate text-xs font-semibold text-slate-900 dark:text-slate-100">
                                  {note.author.name || note.author.email}
                                </p>
                                {note.canDelete ? (
                                  <button
                                    type="button"
                                    onClick={() => deleteNote(note.id)}
                                    disabled={deletingNoteId === note.id}
                                    className="text-[11px] font-semibold text-slate-500 transition hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-50 dark:text-slate-400 dark:hover:text-rose-300"
                                  >
                                    {deletingNoteId === note.id
                                      ? t('Deleting...', 'Suppression...', 'Loschen...', 'Eliminando...', 'A eliminar...')
                                      : t('Delete', 'Supprimer', 'Loschen', 'Eliminar', 'Eliminar')}
                                  </button>
                                ) : null}
                              </div>
                              <p className="mt-1 min-w-0 max-w-full whitespace-pre-wrap break-all text-xs leading-5 text-slate-600 dark:text-slate-300">
                                {note.content}
                              </p>
                            </div>
                          ))
                        ) : (
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            {t('No notes yet.', 'Aucune note pour le moment.', 'Noch keine Notizen.', 'Aun no hay notas.', 'Ainda nao ha notas.')}
                          </p>
                        )}
                      </div>
                      <Textarea
                        className="mt-3 min-h-[84px] rounded-2xl border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900"
                        value={noteDraft}
                        onChange={(event) => setNoteDraft(event.target.value)}
                        placeholder={t('Add private note...', 'Ajouter une note privee...', 'Private Notiz hinzufugen...', 'Agregar nota privada...', 'Adicionar nota privada...')}
                      />
                      <Button
                        className="mt-3 w-full"
                        variant="secondary"
                        onClick={addNote}
                        disabled={!detail}
                      >
                        {t('Save note', 'Enregistrer la note', 'Notiz speichern', 'Guardar nota', 'Guardar nota')}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 rounded-2xl bg-slate-50 px-4 py-5 text-sm leading-6 text-slate-500 dark:bg-slate-900 dark:text-slate-400">
                    {t(
                      'Recent activity and workspace stats stay visible here even before channels are connected. Customer context appears when you select a conversation.',
                      'L activite recente et les statistiques de l espace de travail restent visibles ici meme avant la connexion des canaux. Le contexte client apparait lorsque vous selectionnez une conversation.',
                      'Neueste Aktivitat und Workspace-Statistiken bleiben hier sichtbar, auch bevor Kanale verbunden sind. Der Kundenkontext erscheint, sobald Sie eine Konversation auswahlen.',
                      'La actividad reciente y las estadisticas del espacio de trabajo siguen visibles aqui incluso antes de conectar canales. El contexto del cliente aparece cuando seleccionas una conversacion.',
                      'A atividade recente e as estatisticas do espaco de trabalho permanecem visiveis aqui mesmo antes de ligar canais. O contexto do cliente aparece quando seleciona uma conversa.'
                    )}
                  </div>
                )}
                </div>
              ) : null}
            </div>
          </aside>
        </div>
      </section>
      <Modal
        open={connectChannelsOpen}
        onClose={() => setConnectChannelsOpen(false)}
        title={t(
          'Connect channels',
          'Connecter des canaux',
          'Kanale verbinden',
          'Conectar canales',
          'Ligar canais'
        )}
        className="max-w-5xl"
      >
        <div className="space-y-5">
          <div className="space-y-2">
            <p className="text-sm text-slate-600 dark:text-slate-300">
              {t(
                'Connect multiple email inboxes here. Gmail, Outlook, and WhatsApp can all live in the same unified inbox.',
                'Connectez ici plusieurs boites email. Gmail, Outlook et WhatsApp peuvent coexister dans la meme boite de reception unifiee.',
                'Verbinden Sie hier mehrere E-Mail-Postfacher. Gmail, Outlook und WhatsApp konnen im selben einheitlichen Posteingang zusammenlaufen.',
                'Conecta aqui varios buzones de correo. Gmail, Outlook y WhatsApp pueden convivir en la misma bandeja unificada.',
                'Ligue aqui varias caixas de email. Gmail, Outlook e WhatsApp podem coexistir na mesma caixa de entrada unificada.'
              )}
            </p>
            {activeEmailSetups.length > 0 ? (
              <Alert variant="success">
                {t(
                  'Connected email inboxes stay available side by side. New connections are added as separate inboxes.',
                  'Les boites email connectees restent disponibles cote a cote. Les nouvelles connexions sont ajoutees comme boites separees.',
                  'Verbundene E-Mail-Postfacher bleiben parallel verfugbar. Neue Verbindungen werden als eigene Postfacher hinzugefugt.',
                  'Los buzones conectados siguen disponibles uno al lado del otro. Las nuevas conexiones se agregan como buzones separados.',
                  'As caixas de email ligadas continuam disponiveis lado a lado. Novas ligacoes sao adicionadas como caixas separadas.'
                )}
              </Alert>
            ) : null}
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <ChannelConnectCard
              icon={<GmailLogo className="h-8 w-8" />}
              title={t('Connect Gmail', 'Connecter Gmail', 'Gmail verbinden', 'Conectar Gmail', 'Ligar Gmail')}
              description={t('Add a Gmail mailbox to this unified inbox.', 'Ajoutez une boite Gmail a cette boite de reception unifiee.', 'Fugen Sie diesem einheitlichen Posteingang ein Gmail-Postfach hinzu.', 'Agrega un buzon de Gmail a esta bandeja unificada.', 'Adicione uma caixa Gmail a esta caixa de entrada unificada.')}
              accentClassName="bg-red-50"
              disabled={providerAvailabilityLoading || gmailOauthConfigured === false}
              badge={
                providerAvailabilityLoading
                  ? t('Loading', 'Chargement', 'Wird geladen', 'Cargando', 'A carregar')
                  : gmailOauthConfigured === false
                    ? t('Unavailable', 'Indisponible', 'Nicht verfugbar', 'No disponible', 'Indisponivel')
                    : undefined
              }
              onClick={() => startMailboxConnect(gmailConnectHref, Boolean(gmailOauthConfigured))}
            />

            <ChannelConnectCard
              icon={<OutlookLogo className="h-8 w-8" />}
              title={t('Connect Outlook', 'Connecter Outlook', 'Outlook verbinden', 'Conectar Outlook', 'Ligar Outlook')}
              description={t('Add an Outlook mailbox to this unified inbox.', 'Ajoutez une boite Outlook a cette boite de reception unifiee.', 'Fugen Sie diesem einheitlichen Posteingang ein Outlook-Postfach hinzu.', 'Agrega un buzon de Outlook a esta bandeja unificada.', 'Adicione uma caixa Outlook a esta caixa de entrada unificada.')}
              accentClassName="bg-sky-50"
              disabled={providerAvailabilityLoading || outlookOauthConfigured === false}
              badge={
                providerAvailabilityLoading
                  ? t('Loading', 'Chargement', 'Wird geladen', 'Cargando', 'A carregar')
                  : outlookOauthConfigured === false
                    ? t('Unavailable', 'Indisponible', 'Nicht verfugbar', 'No disponible', 'Indisponivel')
                    : undefined
              }
              onClick={() =>
                startMailboxConnect(outlookConnectHref, Boolean(outlookOauthConfigured))
              }
            />

            {!whatsappChannelConnected ? (
              <ChannelConnectCard
                icon={<WhatsAppLogo className="h-8 w-8" />}
                title={t('Connect WhatsApp', 'Connecter WhatsApp', 'WhatsApp verbinden', 'Conectar WhatsApp', 'Ligar WhatsApp')}
                description={
                  whatsappConnectAvailable
                    ? t('Connect to your WhatsApp number.', 'Connectez votre numero WhatsApp.', 'Verbinden Sie Ihre WhatsApp-Nummer.', 'Conecta tu numero de WhatsApp.', 'Ligue o seu numero do WhatsApp.')
                    : t('WhatsApp is not available on this deployment yet.', 'WhatsApp n est pas encore disponible sur ce deploiement.', 'WhatsApp ist auf dieser Bereitstellung noch nicht verfugbar.', 'WhatsApp todavia no esta disponible en este despliegue.', 'O WhatsApp ainda nao esta disponivel nesta implementacao.')
                }
                accentClassName="bg-emerald-50"
                disabled={!whatsappConnectAvailable}
                badge={
                  !whatsappConnectAvailable
                    ? t('Unavailable', 'Indisponible', 'Nicht verfugbar', 'No disponible', 'Indisponivel')
                    : undefined
                }
              >
                {whatsappConnectAvailable ? (
                  <WhatsAppEmbeddedSignupCard
                    compact
                    hideUnavailableDetails
                    containerClassName="absolute inset-0 z-10 flex items-center justify-center"
                    buttonClassName="h-full w-full rounded-[22px] !bg-transparent !text-transparent !shadow-none hover:!bg-transparent focus-visible:outline-none"
                    connection={
                      whatsappSetup?.connection.mode === 'whatsapp_api'
                        ? whatsappSetup.connection
                        : { mode: 'none', configured: false }
                    }
                    onConnected={() => {
                      setConnectChannelsOpen(false);
                      mutateInboxes();
                    }}
                  />
                ) : null}
              </ChannelConnectCard>
            ) : null}
          </div>
        </div>
      </Modal>

      <Modal
        open={composeOpen}
        onClose={() => {
          if (!composeSending) resetComposeState();
        }}
        title={t(
          'Start conversation',
          'Demarrer une conversation',
          'Konversation starten',
          'Iniciar conversacion',
          'Iniciar conversa'
        )}
        className="max-w-2xl"
      >
        <div className="space-y-5">
          <div className="grid gap-4 md:grid-cols-[minmax(0,1.1fr)_minmax(220px,0.9fr)]">
            <div className="min-w-0 space-y-3">
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {t('Recipient', 'Destinataire', 'Empfanger', 'Destinatario', 'Destinatario')}
                </p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {t(
                    'Choose an existing customer or enter a new contact to start a new inbox thread.',
                    'Choisissez un client existant ou saisissez un nouveau contact pour demarrer un nouveau fil de boite de reception.',
                    'Wahlen Sie einen bestehenden Kunden oder geben Sie einen neuen Kontakt ein, um einen neuen Inbox-Thread zu starten.',
                    'Elige un cliente existente o introduce un nuevo contacto para iniciar un nuevo hilo en la bandeja de entrada.',
                    'Escolha um cliente existente ou introduza um novo contacto para iniciar uma nova conversa na caixa de entrada.'
                  )}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setComposeTargetMode('EXISTING')}
                  className={`rounded-full px-3 py-2 text-xs font-semibold transition ${
                    composeTargetMode === 'EXISTING'
                      ? 'border border-indigo-300 bg-indigo-50 text-indigo-700 shadow-sm dark:border-indigo-500/50 dark:bg-indigo-500/10 dark:text-indigo-300'
                      : 'border border-slate-200 bg-white text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300'
                  }`}
                >
                  {t('Existing customer', 'Client existant', 'Bestehender Kunde', 'Cliente existente', 'Cliente existente')}
                </button>
                <button
                  type="button"
                  onClick={() => setComposeTargetMode('NEW')}
                  className={`rounded-full px-3 py-2 text-xs font-semibold transition ${
                    composeTargetMode === 'NEW'
                      ? 'border border-indigo-300 bg-indigo-50 text-indigo-700 shadow-sm dark:border-indigo-500/50 dark:bg-indigo-500/10 dark:text-indigo-300'
                      : 'border border-slate-200 bg-white text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300'
                  }`}
                >
                  {t('New contact', 'Nouveau contact', 'Neuer Kontakt', 'Nuevo contacto', 'Novo contacto')}
                </button>
              </div>

              {composeTargetMode === 'EXISTING' ? (
                <>
                  <Input
                    value={composeCustomerQuery}
                    onChange={(event) => setComposeCustomerQuery(event.target.value)}
                    placeholder={t(
                      'Search by name, email, or phone',
                      'Rechercher par nom, e-mail ou telephone',
                      'Nach Name, E-Mail oder Telefon suchen',
                      'Buscar por nombre, correo o telefono',
                      'Pesquisar por nome, email ou telefone'
                    )}
                  />
                  <div className="max-h-64 space-y-2 overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50 p-2 dark:border-slate-800 dark:bg-slate-900">
                    {composeCustomersError ? (
                      <p className="px-3 py-4 text-sm text-rose-600 dark:text-rose-400">
                        {localizeInboxError(
                          (composeCustomersError as Error).message,
                          t(
                            'Unable to load customers right now.',
                            'Impossible de charger les clients pour le moment.',
                            'Kunden konnen derzeit nicht geladen werden.',
                            'No se pueden cargar los clientes en este momento.',
                            'Nao foi possivel carregar os clientes agora.'
                          )
                        )}
                      </p>
                    ) : composeCustomers.length ? (
                      composeCustomers.map((customer) => {
                        const isSelected = composeSelectedCustomer?.id === customer.id;
                        const secondaryLabel =
                          getConversationDisplayPhone(customer.phone) ||
                          getConversationDisplayEmail(customer.email) ||
                          '';
                        return (
                          <button
                            key={customer.id}
                            type="button"
                            onClick={() => setComposeSelectedCustomer(customer)}
                            className={`w-full rounded-2xl border px-3 py-3 text-left transition ${
                              isSelected
                                ? 'border-indigo-300 bg-white shadow-sm dark:border-indigo-500 dark:bg-slate-950'
                                : 'border-transparent bg-transparent hover:border-slate-200 hover:bg-white dark:hover:border-slate-700 dark:hover:bg-slate-950'
                            }`}
                          >
                            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                              {customer.name ||
                                getConversationDisplayEmail(customer.email) ||
                                getConversationDisplayPhone(customer.phone)}
                            </p>
                            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                              {secondaryLabel ||
                                t(
                                  'No contact details on file.',
                                  'Aucune coordonnee enregistree.',
                                  'Keine Kontaktdaten hinterlegt.',
                                  'No hay datos de contacto registrados.',
                                  'Sem dados de contacto registados.'
                                )}
                            </p>
                          </button>
                        );
                      })
                    ) : (
                      <div className="space-y-3 px-3 py-4 text-sm text-slate-500 dark:text-slate-400">
                        <p>
                          {t(
                            'No customers found for this search yet.',
                            'Aucun client trouve pour cette recherche pour le moment.',
                            'Fur diese Suche wurden noch keine Kunden gefunden.',
                            'Aun no se encontraron clientes para esta busqueda.',
                            'Ainda nao foram encontrados clientes para esta pesquisa.'
                          )}
                        </p>
                        <Link
                          href="/dashboard/customers"
                          className="inline-flex rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:border-slate-600 dark:hover:text-white"
                        >
                          {t(
                            'Open customers',
                            'Ouvrir les clients',
                            'Kunden offnen',
                            'Abrir clientes',
                            'Abrir clientes'
                          )}
                        </Link>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900">
                  <Input
                    value={composeNewContactName}
                    onChange={(event) => setComposeNewContactName(event.target.value)}
                    placeholder={t(
                      'Contact name (optional)',
                      'Nom du contact (optionnel)',
                      'Kontaktname (optional)',
                      'Nombre del contacto (opcional)',
                      'Nome do contacto (opcional)'
                    )}
                  />
                  <Input
                    value={composeNewContactEmail}
                    onChange={(event) => setComposeNewContactEmail(event.target.value)}
                    placeholder={t(
                      'Email address',
                      'Adresse e-mail',
                      'E-Mail-Adresse',
                      'Direccion de correo',
                      'Endereco de email'
                    )}
                  />
                  <PhoneInput
                    label={t(
                      'WhatsApp phone number',
                      'Numero WhatsApp',
                      'WhatsApp-Telefonnummer',
                      'Numero de WhatsApp',
                      'Numero de WhatsApp'
                    )}
                    value={composeNewContactPhone}
                    onChange={setComposeNewContactPhone}
                    locale={language}
                    defaultCountry="DE"
                    fieldClassName="rounded-2xl border-slate-200 bg-white px-2 py-2 dark:border-slate-700 dark:bg-slate-950"
                    inputClassName="py-2"
                  />
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {t(
                      'A customer record will be created automatically from the contact details you enter here.',
                      'Un enregistrement client sera cree automatiquement a partir des coordonnees saisies ici.',
                      'Aus den hier eingegebenen Kontaktdaten wird automatisch ein Kundendatensatz erstellt.',
                      'Se creara automaticamente un registro de cliente con los datos de contacto introducidos aqui.',
                      'Sera criado automaticamente um registo de cliente a partir dos dados de contacto introduzidos aqui.'
                    )}
                  </p>
                </div>
              )}
            </div>

            <div className="min-w-0 space-y-4 rounded-[24px] border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900">
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {t('Send on', 'Envoyer sur', 'Senden uber', 'Enviar por', 'Enviar em')}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setComposeChannel('EMAIL');
                      if (!composeInboxId && activeEmailSetups[0]) {
                        setComposeInboxId(activeEmailSetups[0].id);
                      }
                    }}
                    disabled={!emailChannelConnected}
                    className={`rounded-full px-3 py-2 text-xs font-semibold transition ${
                      composeChannel === 'EMAIL'
                        ? 'border border-indigo-300 bg-indigo-50 text-indigo-700 shadow-sm dark:border-indigo-500/50 dark:bg-indigo-500/10 dark:text-indigo-300'
                        : 'border border-slate-200 bg-white text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300'
                    } ${!emailChannelConnected ? 'cursor-not-allowed opacity-50' : ''}`}
                  >
                    {t('Email', 'Email', 'E-Mail', 'Correo', 'Email')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setComposeChannel('WHATSAPP')}
                    disabled={!whatsappChannelConnected}
                    className={`rounded-full px-3 py-2 text-xs font-semibold transition ${
                      composeChannel === 'WHATSAPP'
                        ? 'border border-indigo-300 bg-indigo-50 text-indigo-700 shadow-sm dark:border-indigo-500/50 dark:bg-indigo-500/10 dark:text-indigo-300'
                        : 'border border-slate-200 bg-white text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300'
                    } ${!whatsappChannelConnected ? 'cursor-not-allowed opacity-50' : ''}`}
                  >
                    WhatsApp
                  </button>
                </div>
                {composeChannel === 'EMAIL' && activeEmailSetups.length > 0 ? (
                  <select
                    value={selectedComposeEmailInbox?.id || ''}
                    onChange={(event) => setComposeInboxId(event.target.value)}
                    className="mt-3 h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-indigo-300 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  >
                    {activeEmailSetups.map((setup) => {
                      const brand = getBrandLabel(getEmailProviderBrand(setup));
                      const address =
                        setup.connection.mode === 'oauth'
                          ? setup.connection.emailAddress
                          : setup.connection.mode === 'smtp'
                            ? setup.connection.from
                            : setup.name;
                      return (
                        <option key={setup.id} value={setup.id}>
                          {`${brand} | ${address || setup.name}`}
                        </option>
                      );
                    })}
                  </select>
                ) : null}
              </div>

              <div className="rounded-2xl bg-white p-4 shadow-sm dark:bg-slate-950">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">
                  {t('Selected contact', 'Contact selectionne', 'Ausgewahlter Kontakt', 'Contacto seleccionado', 'Contacto selecionado')}
                </p>
                {composeTargetMode === 'EXISTING' && composeSelectedCustomer ? (
                  <div className="mt-3 min-w-0 space-y-1">
                    <p className="min-w-0 break-all text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {composeSelectedCustomer.name ||
                        getConversationDisplayEmail(composeSelectedCustomer.email) ||
                        getConversationDisplayPhone(composeSelectedCustomer.phone)}
                    </p>
                    <p className="min-w-0 break-all text-xs text-slate-500 dark:text-slate-400">
                      {composeChannel === 'EMAIL'
                        ? composeDraftEmail ||
                          t(
                            'No email address on file.',
                            'Aucune adresse e-mail enregistree.',
                            'Keine E-Mail-Adresse hinterlegt.',
                            'No hay direccion de correo registrada.',
                            'Sem endereco de email registado.'
                          )
                        : composeDisplayPhone ||
                          t(
                            'No WhatsApp phone number on file.',
                            'Aucun numero WhatsApp enregistre.',
                            'Keine WhatsApp-Telefonnummer hinterlegt.',
                            'No hay numero de WhatsApp registrado.',
                            'Sem numero de WhatsApp registado.'
                          )}
                    </p>
                    {composeChannel === 'EMAIL' && selectedComposeEmailInbox ? (
                      <p className="min-w-0 break-all text-xs text-slate-500 dark:text-slate-400">
                        {t('Sending from', 'Envoi depuis', 'Senden von', 'Enviando desde', 'A enviar de')}{' '}
                        {getBrandLabel(getEmailProviderBrand(selectedComposeEmailInbox))}
                        {' | '}
                        {selectedComposeEmailInbox.connection.mode === 'oauth'
                          ? selectedComposeEmailInbox.connection.emailAddress
                          : selectedComposeEmailInbox.connection.mode === 'smtp'
                            ? selectedComposeEmailInbox.connection.from
                            : selectedComposeEmailInbox.name}
                      </p>
                    ) : null}
                  </div>
                ) : composeTargetMode === 'NEW' && (composeDraftName || composeDraftEmail || composeDraftPhone) ? (
                  <div className="mt-3 min-w-0 space-y-1">
                    <p className="min-w-0 break-all text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {composeNewPrimaryLabel}
                    </p>
                    {composeNewSecondaryLabel ? (
                      <p className="min-w-0 break-all text-xs text-slate-500 dark:text-slate-400">
                        {composeNewSecondaryLabel}
                      </p>
                    ) : null}
                    {composeChannel === 'EMAIL' && selectedComposeEmailInbox ? (
                      <p className="min-w-0 break-all text-xs text-slate-500 dark:text-slate-400">
                        {t('Sending from', 'Envoi depuis', 'Senden von', 'Enviando desde', 'A enviar de')}{' '}
                        {getBrandLabel(getEmailProviderBrand(selectedComposeEmailInbox))}
                        {' | '}
                        {selectedComposeEmailInbox.connection.mode === 'oauth'
                          ? selectedComposeEmailInbox.connection.emailAddress
                          : selectedComposeEmailInbox.connection.mode === 'smtp'
                            ? selectedComposeEmailInbox.connection.from
                            : selectedComposeEmailInbox.name}
                      </p>
                    ) : null}
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
                    {t(
                      composeTargetMode === 'EXISTING'
                        ? 'Choose a customer to continue.'
                        : 'Enter contact details to continue.',
                      composeTargetMode === 'EXISTING'
                        ? 'Choisissez un client pour continuer.'
                        : 'Saisissez les coordonnees du contact pour continuer.',
                      composeTargetMode === 'EXISTING'
                        ? 'Wahlen Sie einen Kunden aus, um fortzufahren.'
                        : 'Geben Sie Kontaktdaten ein, um fortzufahren.',
                      composeTargetMode === 'EXISTING'
                        ? 'Elige un cliente para continuar.'
                        : 'Introduce los datos del contacto para continuar.',
                      composeTargetMode === 'EXISTING'
                        ? 'Escolha um cliente para continuar.'
                        : 'Introduza os dados do contacto para continuar.'
                    )}
                  </p>
                )}
              </div>

              {composeDisabledReason ? (
                <Alert variant="warning">{composeDisabledReason}</Alert>
              ) : (
                <Alert variant="success">
                  {t(
                    'The first message will be sent immediately and open a new thread in this inbox.',
                    'Le premier message sera envoye immediatement et ouvrira un nouveau fil dans cette boite de reception.',
                    'Die erste Nachricht wird sofort gesendet und offnet einen neuen Thread in diesem Posteingang.',
                    'El primer mensaje se enviara de inmediato y abrira un nuevo hilo en esta bandeja de entrada.',
                    'A primeira mensagem sera enviada de imediato e abrira uma nova conversa nesta caixa de entrada.'
                  )}
                </Alert>
              )}
            </div>
          </div>

          <div className="space-y-2">
            {composeChannel === 'EMAIL' ? (
              <div className="space-y-2">
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {t('Subject', 'Objet', 'Betreff', 'Asunto', 'Assunto')}
                </p>
                <Input
                  className="h-12 rounded-[24px] border-slate-200 bg-white px-4 dark:border-slate-700 dark:bg-slate-900"
                  value={composeSubject}
                  onChange={(event) => setComposeSubject(event.target.value)}
                  placeholder={t(
                    'Write the email subject...',
                    'Ecrivez l objet de l email...',
                    'Schreiben Sie den E-Mail-Betreff...',
                    'Escribe el asunto del correo...',
                    'Escreva o assunto do email...'
                  )}
                />
              </div>
            ) : null}
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {t('Message', 'Message', 'Nachricht', 'Mensaje', 'Mensagem')}
            </p>
            <Textarea
              className="min-h-[180px] rounded-[24px] border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900"
              value={composeMessage}
              onChange={(event) => setComposeMessage(event.target.value)}
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                  event.preventDefault();
                  if (!composeSending && !composeDisabledReason) {
                    createConversationFromCompose();
                  }
                }
              }}
              placeholder={t(
                'Write the first message...',
                'Ecrivez le premier message...',
                'Schreiben Sie die erste Nachricht...',
                'Escribe el primer mensaje...',
                'Escreva a primeira mensagem...'
              )}
            />
          </div>

          <div className="flex flex-wrap items-center justify-end gap-3">
            <Button
              type="button"
              variant="secondary"
              onClick={resetComposeState}
              disabled={composeSending}
            >
              {t('Cancel', 'Annuler', 'Abbrechen', 'Cancelar', 'Cancelar')}
            </Button>
            <Button
              type="button"
              onClick={createConversationFromCompose}
              disabled={composeSending || Boolean(composeDisabledReason)}
            >
              <Send className="h-4 w-4" />
              {composeSending
                ? t('Starting...', 'Demarrage...', 'Wird gestartet...', 'Iniciando...', 'A iniciar...')
                : t('Start conversation', 'Demarrer la conversation', 'Konversation starten', 'Iniciar conversacion', 'Iniciar conversa')}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

