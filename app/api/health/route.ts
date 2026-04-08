import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import os from "os";
import { env } from "@/lib/env";

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    const uptime = process.uptime();
    return NextResponse.json({
      status: "ok",
      db: "connected",
      payments: env.flutterwaveSecret && env.paystackSecret ? "available" : "degraded",
      ai: env.openaiKey ? "available" : "degraded",
      uptime,
      loadAverage: os.loadavg(),
    });
  } catch {
    return NextResponse.json({ status: "error", db: "unavailable" }, { status: 500 });
  }
}
