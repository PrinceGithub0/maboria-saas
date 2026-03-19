import { redirect } from "next/navigation";

type LegacyAdminSupportTicketPageProps = {
  params: { id: string };
  searchParams?: Record<string, string | string[] | undefined>;
};

function buildQueryString(searchParams?: Record<string, string | string[] | undefined>) {
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(searchParams || {})) {
    if (Array.isArray(value)) {
      for (const entry of value) {
        if (entry) query.append(key, entry);
      }
      continue;
    }
    if (value) query.set(key, value);
  }

  const serialized = query.toString();
  return serialized ? `?${serialized}` : "";
}

export default function LegacyAdminSupportTicketPage({
  params,
  searchParams,
}: LegacyAdminSupportTicketPageProps) {
  const ticketId = encodeURIComponent(String(params?.id || "").trim());
  redirect(`/admin/support/tickets/${ticketId}${buildQueryString(searchParams)}`);
}
