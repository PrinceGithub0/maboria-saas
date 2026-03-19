"use client";

import { useEffect } from "react";
import { signOut } from "next-auth/react";

export default function LogoutPage() {
  useEffect(() => {
    const run = async () => {
      try {
        await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
      } catch {}

      signOut({ callbackUrl: "/" }).catch(() => {
        if (typeof window !== "undefined") {
          window.location.href = "/";
        }
      });
    };

    run();
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
      <p className="text-sm text-muted-foreground">Signing out…</p>
    </div>
  );
}
