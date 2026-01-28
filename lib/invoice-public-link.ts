import "server-only";

import crypto from "crypto";
import { prisma } from "./prisma";
import { log } from "./logger";

const generateToken = () => crypto.randomBytes(24).toString("base64url");
const isMissingTableError = (error: unknown) => {
  if (typeof error !== "object" || error === null) return false;
  const code = (error as any).code as string | undefined;
  const message = (error as any).message as string | undefined;
  return (
    code === "42P01" ||
    code === "P2021" ||
    (typeof message === "string" &&
      (message.includes('relation "InvoicePublicLink" does not exist') ||
        message.includes('relation "invoicepubliclink" does not exist') ||
        message.includes("42P01")))
  );
};

const ensureInvoicePublicLinkTable = async () => {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "InvoicePublicLink" (
      "id" text PRIMARY KEY,
      "invoiceId" text NOT NULL REFERENCES "Invoice"("id") ON DELETE CASCADE,
      "token" text NOT NULL UNIQUE,
      "createdAt" timestamptz NOT NULL DEFAULT now(),
      "usedAt" timestamptz,
      "expiresAt" timestamptz
    )
  `);
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "InvoicePublicLink_invoiceId_idx" ON "InvoicePublicLink"("invoiceId")`
  );
};

export async function getOrCreateInvoicePublicLink(invoiceId: string) {
  const delegate = (prisma as any).invoicePublicLink;
  if (delegate?.findFirst) {
    try {
      const existing = await delegate.findFirst({
        where: { invoiceId, usedAt: null },
        orderBy: { createdAt: "desc" },
      });
      if (existing) return existing;

      const token = generateToken();
      const created = await delegate.create({ data: { invoiceId, token } });
      log("info", "invoice_public_link_created", { invoiceId });
      return created;
    } catch (error) {
      if (isMissingTableError(error)) {
        await ensureInvoicePublicLinkTable();
      } else {
        throw error;
      }
    }
  }

  let existing: Array<{
    id: string;
    invoiceId: string;
    token: string;
    createdAt: Date;
    usedAt: Date | null;
    expiresAt: Date | null;
  }> = [];
  try {
    existing = await prisma.$queryRaw<
      Array<{
        id: string;
        invoiceId: string;
        token: string;
        createdAt: Date;
        usedAt: Date | null;
        expiresAt: Date | null;
      }>
    >`SELECT "id","invoiceId","token","createdAt","usedAt","expiresAt"
      FROM "InvoicePublicLink"
      WHERE "invoiceId"=${invoiceId} AND "usedAt" IS NULL
      ORDER BY "createdAt" DESC
      LIMIT 1`;
  } catch (error) {
    if (isMissingTableError(error)) {
      await ensureInvoicePublicLinkTable();
      existing = await prisma.$queryRaw<
        Array<{
          id: string;
          invoiceId: string;
          token: string;
          createdAt: Date;
          usedAt: Date | null;
          expiresAt: Date | null;
        }>
      >`SELECT "id","invoiceId","token","createdAt","usedAt","expiresAt"
        FROM "InvoicePublicLink"
        WHERE "invoiceId"=${invoiceId} AND "usedAt" IS NULL
        ORDER BY "createdAt" DESC
        LIMIT 1`;
    } else {
      throw error;
    }
  }
  if (existing.length > 0) return existing[0];

  const token = generateToken();
  const id = crypto.randomUUID();
  try {
    await prisma.$executeRaw`INSERT INTO "InvoicePublicLink" ("id","invoiceId","token","createdAt")
      VALUES (${id}, ${invoiceId}, ${token}, NOW())`;
  } catch (error) {
    if (isMissingTableError(error)) {
      await ensureInvoicePublicLinkTable();
      await prisma.$executeRaw`INSERT INTO "InvoicePublicLink" ("id","invoiceId","token","createdAt")
        VALUES (${id}, ${invoiceId}, ${token}, NOW())`;
    } else {
      throw error;
    }
  }
  log("info", "invoice_public_link_created", { invoiceId });
  return { id, invoiceId, token, createdAt: new Date(), usedAt: null, expiresAt: null };
}

export async function resolveInvoicePublicLink(token: string) {
  const delegate = (prisma as any).invoicePublicLink;
  if (delegate?.findUnique) {
    try {
      return delegate.findUnique({
        where: { token },
        include: { invoice: true },
      });
    } catch (error) {
      if (isMissingTableError(error)) {
        await ensureInvoicePublicLinkTable();
        return delegate.findUnique({
          where: { token },
          include: { invoice: true },
        });
      }
      throw error;
    }
  }

  let rows: Array<{
    id: string;
    invoiceId: string;
    token: string;
    createdAt: Date;
    usedAt: Date | null;
    expiresAt: Date | null;
  }> = [];
  try {
    rows = await prisma.$queryRaw<
      Array<{
        id: string;
        invoiceId: string;
        token: string;
        createdAt: Date;
        usedAt: Date | null;
        expiresAt: Date | null;
      }>
    >`SELECT "id","invoiceId","token","createdAt","usedAt","expiresAt"
      FROM "InvoicePublicLink"
      WHERE "token"=${token}
      LIMIT 1`;
  } catch (error) {
    if (isMissingTableError(error)) {
      return null;
    }
    throw error;
  }
  if (rows.length === 0) return null;
  const invoice = await prisma.invoice.findUnique({ where: { id: rows[0].invoiceId } });
  return { ...rows[0], invoice };
}

export async function markInvoicePublicLinksUsed(invoiceId: string) {
  const delegate = (prisma as any).invoicePublicLink;
  if (delegate?.updateMany) {
    try {
      await delegate.updateMany({
        where: { invoiceId, usedAt: null },
        data: { usedAt: new Date() },
      });
      return;
    } catch (error) {
      if (isMissingTableError(error)) {
        await ensureInvoicePublicLinkTable();
        await delegate.updateMany({
          where: { invoiceId, usedAt: null },
          data: { usedAt: new Date() },
        });
        return;
      }
      throw error;
    }
  }
  try {
    await prisma.$executeRaw`UPDATE "InvoicePublicLink" SET "usedAt"=NOW()
      WHERE "invoiceId"=${invoiceId} AND "usedAt" IS NULL`;
  } catch (error) {
    if (isMissingTableError(error)) {
      return;
    }
    throw error;
  }
}
