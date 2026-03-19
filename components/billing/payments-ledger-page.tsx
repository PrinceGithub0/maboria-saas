"use client";

import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import clsx from "clsx";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Download, Search, X } from "lucide-react";

import { formatCurrency } from "@/lib/currency";
import { rangeToQuery, type GlobalDateRange } from "@/lib/shared/date-range";
import type { PaymentsLedgerResult, LedgerRow } from "@/lib/billing/payments-ledger";

const fetcher = async (url: string) => {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error("ledger_fetch_failed");
  return (await response.json()) as PaymentsLedgerResult;
};

function statusBadge(status: string) {
  const normalized = status.toUpperCase();
  if (normalized === "SUCCEEDED") return "border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-300";
  if (normalized === "FAILED") return "border border-red-200 bg-red-50 text-red-700 dark:border-red-400/30 dark:bg-red-400/10 dark:text-red-300";
  if (normalized === "REFUNDED") return "border border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-300";
  return "border border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200";
}

function rangePreset(key: GlobalDateRange["key"], current: GlobalDateRange): GlobalDateRange {
  if (key === "today") {
    const day = new Date().toISOString().slice(0, 10);
    return { key: "today", from: day, to: day, label: "Today" };
  }
  if (key === "last30") {
    const to = new Date();
    const from = new Date(to.getTime() - 29 * 24 * 60 * 60 * 1000);
    return {
      key: "last30",
      from: from.toISOString().slice(0, 10),
      to: to.toISOString().slice(0, 10),
      label: "Last 30 Days",
    };
  }
  if (key === "custom") {
    return { key: "custom", from: current.from, to: current.to, label: "Custom" };
  }
  const to = new Date();
  const from = new Date(to.getTime() - 6 * 24 * 60 * 60 * 1000);
  return {
    key: "last7",
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
    label: "Last 7 Days",
  };
}

export function PaymentsLedgerPage({
  initialData,
  initialStatus,
  initialQuery,
}: {
  initialData: PaymentsLedgerResult;
  initialStatus: string;
  initialQuery: string;
}) {
  const router = useRouter();
  const [range, setRange] = useState<GlobalDateRange>(initialData.dateRange);
  const [status, setStatus] = useState(initialStatus || "all");
  const [searchInput, setSearchInput] = useState(initialQuery || "");
  const [search, setSearch] = useState(initialQuery || "");
  const [page, setPage] = useState(initialData.page || 1);
  const [selectedRow, setSelectedRow] = useState<LedgerRow | null>(null);
  const [refundReason, setRefundReason] = useState("");
  const [refundLoading, setRefundLoading] = useState(false);
  const [refundStatus, setRefundStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const endpoint = useMemo(() => {
    const query = rangeToQuery(range, {
      status,
      q: search,
      page: String(page),
      pageSize: "20",
    });
    return `/api/billing/payments/ledger?${query.toString()}`;
  }, [range, status, search, page]);

  const { data, error, isLoading, mutate } = useSWR<PaymentsLedgerResult>(endpoint, fetcher, {
    fallbackData: initialData,
    revalidateOnFocus: false,
    keepPreviousData: true,
  });

  useEffect(() => {
    if (!selectedRow) return;
    const next = (data?.rows || []).find((row) => row.paymentId === selectedRow.paymentId);
    if (next) {
      setSelectedRow(next);
    }
  }, [data?.rows, selectedRow]);

  useEffect(() => {
    setRefundReason("");
    setRefundStatus(null);
  }, [selectedRow?.paymentId]);

  useEffect(() => {
    const query = rangeToQuery(range, {
      status: status === "all" ? undefined : status,
      q: search || undefined,
      page: String(page),
    });
    router.replace(`/billing/payments?${query.toString()}`, { scroll: false });
  }, [range, status, search, page, router]);

  const rows = data?.rows || [];
  const summary = data?.summary || initialData.summary;
  const summaryCurrency = data?.summaryCurrency || initialData.summaryCurrency;
  const hasConnectedSubaccount = data?.hasConnectedSubaccount ?? initialData.hasConnectedSubaccount;
  const totalPages = data?.totalPages || 1;
  const canPrev = page > 1;
  const canNext = page < totalPages;

  const hasFilters = status !== "all" || Boolean(search);

  const exportHref = useMemo(() => {
    const query = rangeToQuery(range, {
      status: status === "all" ? undefined : status,
      q: search || undefined,
    });
    return `/api/billing/payments/export?${query.toString()}`;
  }, [range, status, search]);

  const requestRefund = async () => {
    if (!selectedRow?.canRefund || refundLoading) return;
    setRefundLoading(true);
    setRefundStatus(null);
    try {
      const response = await fetch(`/api/billing/payments/${encodeURIComponent(selectedRow.paymentId)}/refund`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: refundReason }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof payload?.error === "string" ? payload.error : "Refund request failed.");
      }
      setRefundStatus({
        type: "success",
        message:
          typeof payload?.message === "string"
            ? payload.message
            : "Refund requested. The payment will update after provider confirmation.",
      });
      setRefundReason("");
      await mutate();
      setSelectedRow((prev) =>
        prev
          ? {
              ...prev,
              canRefund: false,
              refundState: "pending",
            }
          : prev
      );
    } catch (error) {
      setRefundStatus({
        type: "error",
        message: error instanceof Error ? error.message : "Refund request failed.",
      });
    } finally {
      setRefundLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <section className="border border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-50">Payments</h1>
            <p className="text-sm text-slate-600 dark:text-slate-300">All customer payments for selected period</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={range.key}
              onChange={(event) => {
                setRange(rangePreset(event.target.value as GlobalDateRange["key"], range));
                setPage(1);
              }}
              className="h-9 rounded border border-slate-300 bg-white px-3 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            >
              <option value="today">Today</option>
              <option value="last7">Last 7 Days</option>
              <option value="last30">Last 30 Days</option>
              <option value="custom">Custom</option>
            </select>
            {range.key === "custom" ? (
              <div className="inline-flex items-center gap-2">
                <input
                  type="date"
                  value={range.from}
                  onChange={(event) => {
                    setRange((prev) => ({ ...prev, from: event.target.value }));
                    setPage(1);
                  }}
                  className="h-9 rounded border border-slate-300 px-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:[color-scheme:dark]"
                />
                <input
                  type="date"
                  value={range.to}
                  onChange={(event) => {
                    setRange((prev) => ({ ...prev, to: event.target.value }));
                    setPage(1);
                  }}
                  className="h-9 rounded border border-slate-300 px-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:[color-scheme:dark]"
                />
              </div>
            ) : null}
            <label className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-2 h-4 w-4 text-slate-400 dark:text-slate-500" />
              <input
                value={searchInput}
                onChange={(event) => {
                  setSearchInput(event.target.value);
                  setPage(1);
                }}
                placeholder="Search customer or invoice"
                className="h-9 w-56 rounded border border-slate-300 bg-white pl-8 pr-3 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500"
              />
            </label>
            <a
              href={exportHref}
              className="inline-flex h-9 items-center gap-2 rounded border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            >
              <Download className="h-4 w-4" />
              Export CSV
            </a>
          </div>
        </div>
      </section>

      {!hasConnectedSubaccount ? (
        <section className="border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-800 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-300">
          Payment subaccount not connected. Confirm payout setup in Settings to collect new invoice payments.
        </section>
      ) : null}

      <section className="grid gap-3 md:grid-cols-4">
        <article className="border border-slate-200 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-900">
          <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Total Collected</p>
          <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-50">{formatCurrency(summary.totalCollected, summaryCurrency)}</p>
        </article>
        <article className="border border-slate-200 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-900">
          <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Successful</p>
          <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-50">{summary.successfulCount}</p>
        </article>
        <article className="border border-slate-200 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-900">
          <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Failed</p>
          <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-50">{summary.failedCount}</p>
        </article>
        <article className="border border-slate-200 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-900">
          <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Refunded</p>
          <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-50">{summary.refundedCount}</p>
        </article>
      </section>

      <section className="border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-700">
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Status</label>
            <select
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(1);
              }}
              className="h-8 rounded border border-slate-300 bg-white px-2 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            >
              <option value="all">All</option>
              <option value="paid">Paid</option>
              <option value="failed">Failed</option>
              <option value="refunded">Refunded</option>
              <option value="pending">Pending</option>
            </select>
          </div>
          <span className="text-xs text-slate-500 dark:text-slate-400">Newest first</span>
        </div>

        {error ? (
          <div className="px-4 py-6 text-sm text-amber-700 dark:text-amber-300">
            Live data temporarily unavailable. Showing last updated state.
          </div>
        ) : null}

        <div className="overflow-x-auto">
          <table className="min-w-full text-center">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-400">
              <tr>
                <th className="px-4 py-3 text-center">Date</th>
                <th className="px-4 py-3 text-center">Customer</th>
                <th className="px-4 py-3 text-center">Contact</th>
                <th className="px-4 py-3 text-center">Invoice #</th>
                <th className="px-4 py-3 text-center">Amount</th>
                <th className="px-4 py-3 text-center">Method</th>
                <th className="px-4 py-3 text-center">Status</th>
                <th className="px-4 py-3 text-center">Reference ID</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && rows.length === 0
                ? Array.from({ length: 6 }).map((_, idx) => (
                    <tr key={`skeleton-${idx}`} className="border-b border-slate-100 dark:border-slate-800">
                      {Array.from({ length: 8 }).map((__, cellIdx) => (
                        <td key={cellIdx} className="px-4 py-3">
                          <div className="mx-auto h-4 w-20 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
                        </td>
                      ))}
                    </tr>
                  ))
                : null}
              {!isLoading && rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-sm text-slate-500 dark:text-slate-400">
                    {hasFilters ? (
                      <div className="space-y-2">
                        <p>No payments match your filters.</p>
                        <button
                          type="button"
                          className="inline-flex rounded border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-200"
                          onClick={() => {
                            setStatus("all");
                            setSearchInput("");
                            setSearch("");
                            setPage(1);
                          }}
                        >
                          Clear filters
                        </button>
                      </div>
                    ) : (
                      "No billing activity yet."
                    )}
                  </td>
                </tr>
              ) : null}
              {rows.map((row) => (
                <tr
                  key={row.paymentId}
                  onClick={() => setSelectedRow(row)}
                  className="cursor-pointer border-b border-slate-100 text-sm text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-200 dark:hover:bg-slate-950/80"
                >
                  <td className="px-4 py-3 text-center">{new Date(row.createdAt).toLocaleDateString("en-GB")}</td>
                  <td className="px-4 py-3 text-center">{row.customerName}</td>
                  <td className="px-4 py-3 text-center">{row.customerContact}</td>
                  <td className="px-4 py-3 text-center">{row.invoiceNumber}</td>
                  <td className="px-4 py-3 text-center font-semibold text-slate-900 dark:text-slate-50">{formatCurrency(row.amount, row.currency)}</td>
                  <td className="px-4 py-3 text-center">{row.method}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={clsx("rounded-full px-2 py-1 text-xs font-semibold", statusBadge(row.status))}>
                      {row.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center font-mono text-xs">{row.maskedReference}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 dark:border-slate-700">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Page {page} of {totalPages}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => canPrev && setPage((current) => current - 1)}
              disabled={!canPrev}
              className="inline-flex h-8 w-8 items-center justify-center rounded border border-slate-300 text-slate-600 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => canNext && setPage((current) => current + 1)}
              disabled={!canNext}
              className="inline-flex h-8 w-8 items-center justify-center rounded border border-slate-300 text-slate-600 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </section>

      {selectedRow ? (
        <div className="fixed inset-0 z-40">
          <button type="button" className="absolute inset-0 bg-slate-900/35" onClick={() => setSelectedRow(null)} />
          <aside className="absolute inset-y-0 right-0 w-full max-w-md border-l border-slate-200 bg-white p-4 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-50">Payment Details</h3>
              <button type="button" onClick={() => setSelectedRow(null)} className="rounded border border-slate-300 p-1.5 text-slate-600 dark:border-slate-700 dark:text-slate-300">
                <X className="h-4 w-4" />
              </button>
            </div>
            <dl className="mt-4 space-y-3 text-sm">
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Customer</dt>
                <dd className="mt-1 font-medium text-slate-900 dark:text-slate-50">{selectedRow.customerName}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Contact</dt>
                <dd className="mt-1 text-slate-700 dark:text-slate-200">{selectedRow.customerContact}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Invoice</dt>
                <dd className="mt-1 text-slate-700 dark:text-slate-200">{selectedRow.invoiceNumber}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Amount</dt>
                <dd className="mt-1 text-slate-700 dark:text-slate-200">{formatCurrency(selectedRow.amount, selectedRow.currency)}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Method</dt>
                <dd className="mt-1 text-slate-700 dark:text-slate-200">{selectedRow.method}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Status</dt>
                <dd className="mt-1 text-slate-700 dark:text-slate-200">{selectedRow.status}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Refund status</dt>
                <dd className="mt-1 text-slate-700 dark:text-slate-200">
                  {selectedRow.refundState === "completed"
                    ? "Refunded"
                    : selectedRow.refundState === "pending"
                      ? "Refund in progress"
                      : "Not refunded"}
                </dd>
              </div>
              {selectedRow.refundedAmount > 0 ? (
                <div>
                  <dt className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Refunded amount</dt>
                  <dd className="mt-1 text-slate-700 dark:text-slate-200">
                    {formatCurrency(selectedRow.refundedAmount, selectedRow.currency)}
                  </dd>
                </div>
              ) : null}
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Timestamp</dt>
                <dd className="mt-1 text-slate-700 dark:text-slate-200">{new Date(selectedRow.createdAt).toLocaleString("en-GB")}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Reference ID</dt>
                <dd className="mt-1 font-mono text-xs text-slate-700 dark:text-slate-200">{selectedRow.reference}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Receipt</dt>
                <dd className="mt-1">
                  {selectedRow.receiptUrl ? (
                    <Link href={selectedRow.receiptUrl} className="text-sm font-semibold text-blue-700 hover:underline dark:text-blue-400">
                      Open receipt
                    </Link>
                  ) : (
                    <span className="text-slate-500 dark:text-slate-400">Not available</span>
                  )}
                </dd>
              </div>
            </dl>
            {selectedRow.canRefund || selectedRow.refundState === "pending" || refundStatus ? (
              <div className="mt-6 space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-950">
                <div>
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-50">Refund customer</p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    Full refund only. Money is returned by the payment provider and the ledger updates after confirmation.
                  </p>
                </div>
                {selectedRow.canRefund ? (
                  <>
                    <textarea
                      value={refundReason}
                      onChange={(event) => setRefundReason(event.target.value)}
                      rows={3}
                      placeholder="Optional reason shown in refund metadata"
                      className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    />
                    <button
                      type="button"
                      onClick={() => void requestRefund()}
                      disabled={refundLoading}
                      className="inline-flex h-10 items-center justify-center rounded bg-rose-600 px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {refundLoading ? "Requesting refund..." : "Issue full refund"}
                    </button>
                  </>
                ) : null}
                {selectedRow.refundState === "pending" ? (
                  <p className="text-sm text-amber-700 dark:text-amber-300">
                    Refund requested. Waiting for provider confirmation.
                  </p>
                ) : null}
                {refundStatus ? (
                  <p
                    className={clsx(
                      "text-sm",
                      refundStatus.type === "success"
                        ? "text-emerald-700 dark:text-emerald-300"
                        : "text-rose-700 dark:text-rose-300"
                    )}
                  >
                    {refundStatus.message}
                  </p>
                ) : null}
              </div>
            ) : null}
          </aside>
        </div>
      ) : null}
    </div>
  );
}

