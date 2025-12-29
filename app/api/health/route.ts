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
      flutterwave: env.flutterwaveSecret ? "configured" : "missing",
      paystack: env.paystackSecret ? "configured" : "missing",
      uptime,
      load: os.loadavg(),
    });
  } catch (error: any) {
    return NextResponse.json({ status: "error", message: error.message }, { status: 500 });
  }
}
