"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-950 text-slate-100">
      <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-8 py-10 text-center">
        <p className="text-sm uppercase tracking-[0.3em] text-rose-200">500</p>
        <h1 className="text-3xl font-semibold text-white">Unexpected error</h1>
        <p className="text-slate-200">Something went wrong. Please retry.</p>
        <div className="mt-4 flex justify-center gap-3">
          <Button onClick={reset}>Retry</Button>
          <Link href="/support">
            <Button variant="secondary">Contact support</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
