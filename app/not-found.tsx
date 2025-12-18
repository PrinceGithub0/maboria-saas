import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background text-foreground">
      <div className="rounded-2xl border border-border bg-card px-8 py-10 text-center shadow-sm">
        <p className="text-sm uppercase tracking-[0.3em] text-indigo-600 dark:text-indigo-300">404</p>
        <h1 className="text-3xl font-semibold">Page not found</h1>
        <p className="text-muted-foreground">The page you&#39;re looking for doesn&#39;t exist.</p>
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

