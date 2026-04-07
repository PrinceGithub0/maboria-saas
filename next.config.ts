import type { NextConfig } from "next";

function safeOrigin(value?: string | null) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return null;
  try {
    return new URL(trimmed).origin;
  } catch {
    return null;
  }
}

const allowedDevOrigins = Array.from(
  new Set(
    [
      safeOrigin(process.env.APP_URL),
      safeOrigin(process.env.NEXT_PUBLIC_APP_URL),
      safeOrigin(process.env.APP_ENDPOINT),
    ].filter((value): value is string => Boolean(value))
  )
);

const nextConfig: NextConfig = {
  reactStrictMode: true,
  compress: true,
  poweredByHeader: false,
  distDir: process.env.NODE_ENV === "development" ? "node_modules/.cache/next-dev" : ".next",
  serverExternalPackages: ["@prisma/client", "prisma"],
  ...(allowedDevOrigins.length > 0 ? { allowedDevOrigins } : {}),
  images: {
    formats: ["image/avif", "image/webp"],
  },
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
};

export default nextConfig;
