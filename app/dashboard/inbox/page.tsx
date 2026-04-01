import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { decryptInboxCredentials } from '@/lib/inbox/channels';
import { ensureDefaultUnifiedInboxes, requireUnifiedInboxAccess } from '@/lib/inbox/unified';
import { prisma } from '@/lib/prisma';
import InboxPageClient from './inbox-client';

async function getInitialHasConnectedChannel(userId: string) {
  const context = await requireUnifiedInboxAccess(userId);
  await ensureDefaultUnifiedInboxes(context.orgId);

  const inboxes = await prisma.unifiedInbox.findMany({
    where: { tenantId: context.orgId },
    orderBy: [{ type: 'asc' }, { createdAt: 'asc' }],
    select: {
      id: true,
      type: true,
      status: true,
      credentialsEncrypted: true,
    },
  });

  const connectedMailboxIds = inboxes
    .map((inbox) => decryptInboxCredentials(inbox.credentialsEncrypted).emailOAuth?.connectedMailboxId || null)
    .filter((value): value is string => Boolean(value));

  const connectedMailboxes = connectedMailboxIds.length
    ? await prisma.connectedMailbox.findMany({
        where: {
          id: { in: connectedMailboxIds },
          workspaceId: context.orgId,
        },
        select: { id: true, status: true },
      })
    : [];

  const mailboxStatusById = new Map(connectedMailboxes.map((mailbox) => [mailbox.id, mailbox.status]));

  const emailChannelConnected = inboxes.some((inbox) => {
    if (inbox.type !== 'EMAIL' || inbox.status !== 'ACTIVE') return false;
    const credentials = decryptInboxCredentials(inbox.credentialsEncrypted);
    const connectedMailboxId = String(credentials.emailOAuth?.connectedMailboxId || '').trim();
    if (connectedMailboxId) {
      return mailboxStatusById.get(connectedMailboxId) === 'ACTIVE';
    }
    return Boolean(credentials.email?.host && credentials.email?.username && credentials.email?.password);
  });

  const whatsappChannelConnected = inboxes.some((inbox) => {
    if (inbox.type !== 'WHATSAPP' || inbox.status !== 'ACTIVE') return false;
    const credentials = decryptInboxCredentials(inbox.credentialsEncrypted);
    return Boolean(credentials.whatsapp?.phoneNumberId && credentials.whatsapp?.accessToken);
  });

  return emailChannelConnected || whatsappChannelConnected;
}

export default async function InboxPage() {
  const session = await getServerSession(authOptions);
  const initialHasConnectedChannel = session?.user?.id
    ? await getInitialHasConnectedChannel(session.user.id)
    : null;

  return <InboxPageClient initialHasConnectedChannel={initialHasConnectedChannel} />;
}
