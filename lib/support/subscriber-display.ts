export type SubscriberSupportTicketDisplay = {
  createdAt: string;
  metadata?: {
    lastActivityAt?: string | null;
    [key: string]: unknown;
  } | null;
};

export function getSubscriberSupportLastActivityAt(ticket: SubscriberSupportTicketDisplay) {
  const lastActivityAt = String(ticket.metadata?.lastActivityAt || "").trim();
  return lastActivityAt || String(ticket.createdAt || "");
}

export function sortSubscriberSupportTicketsByRecentActivity<T extends SubscriberSupportTicketDisplay>(tickets: T[]) {
  return [...tickets].sort(
    (left, right) =>
      new Date(getSubscriberSupportLastActivityAt(right)).getTime() -
      new Date(getSubscriberSupportLastActivityAt(left)).getTime()
  );
}
