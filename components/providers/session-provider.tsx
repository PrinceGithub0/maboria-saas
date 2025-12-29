"use client";

import { SessionProvider } from "next-auth/react";
import { SWRConfig } from "swr";

export function SessionProviderWrapper({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SessionProvider>
      <SWRConfig
        value={{
          dedupingInterval: 10_000,
          revalidateOnFocus: false,
          revalidateIfStale: false,
          refreshInterval: 0,
          keepPreviousData: true,
          errorRetryCount: 0,
        }}
      >
        {children}
      </SWRConfig>
    </SessionProvider>
  );
}
