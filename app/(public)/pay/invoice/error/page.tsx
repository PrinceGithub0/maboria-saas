import Link from "next/link";

const reasonCopy: Record<string, { title: string; body: string }> = {
  invalid_token: {
    title: "Invalid payment link",
    body: "This payment link is invalid. Please use the latest invoice link from the sender.",
  },
  invoice_not_found: {
    title: "Invoice not found",
    body: "This invoice could not be found. Please contact the sender for a new payment link.",
  },
};

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function InvoicePaymentErrorPage({ searchParams }: PageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const rawReason = resolvedSearchParams?.reason;
  const reason = typeof rawReason === "string" ? rawReason : Array.isArray(rawReason) ? rawReason[0] : "";
  const copy = reasonCopy[reason] || {
    title: "Payment unavailable",
    body: "This payment link is not available right now. Please request a fresh invoice link from the sender.",
  };

  return (
    <div className="mx-auto max-w-2xl px-6 py-16">
      <div className="rounded-3xl border border-border bg-card p-8 text-center shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-indigo-600">Invoice Payment</p>
        <h1 className="mt-4 text-3xl font-semibold text-foreground">{copy.title}</h1>
        <p className="mt-3 text-sm leading-7 text-muted-foreground">{copy.body}</p>
        <div className="mt-8">
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-full bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500"
          >
            Return Home
          </Link>
        </div>
      </div>
    </div>
  );
}
