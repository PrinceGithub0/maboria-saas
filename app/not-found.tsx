import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-950 text-slate-100">
      <div className="rounded-2xl border border-slate-900 bg-slate-900/70 px-8 py-10 text-center">
        <p className="text-sm uppercase tracking-[0.3em] text-indigo-300">404</p>
        <h1 className="text-3xl font-semibold text-white">Page not found</h1>
        <p className="text-slate-400">The page you’re looking for doesn’t exist.</p>
        <div className="mt-4 flex justify-center gap-3">
          <Link href="/dashboard">
            <Button>Go to dashboard</Button>
          </Link>
          <Link href="/support">
            <Button variant="secondary">Contact support</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
