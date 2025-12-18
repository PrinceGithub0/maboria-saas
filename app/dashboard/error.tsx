"use client";

export default function Error({
  reset,
}: {
  reset?: () => void;
}) {
  return (
    <div className="rounded-2xl border border-rose-500/50 bg-rose-500/10 p-4 text-rose-100">
      <p className="font-semibold">Something went wrong loading the dashboard.</p>
      <p className="text-sm text-rose-200">Please retry.</p>
      {reset && (
        <button
          onClick={reset}
          className="mt-3 rounded-lg border border-rose-400/50 bg-rose-500/20 px-3 py-1 text-sm text-rose-50 hover:bg-rose-500/30"
        >
          Retry
        </button>
      )}
    </div>
  );
}
