import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import {
  appendInvoiceNumberAlias,
  buildInvoiceIssuerCode,
  formatSequentialInvoiceNumber,
  getInvoiceNumberYear,
  isInvoiceNumberDraft,
  isLegacyAutoInvoiceNumber,
  isPreviousGeneratedInvoiceNumber,
} from "../lib/invoice-number";

type InvoiceRow = {
  id: string;
  userId: string;
  invoiceNumber: string;
  generatedAt: Date;
  metadata: unknown;
};

const parseArgs = () => {
  const args = new Set(process.argv.slice(2));
  return {
    apply: args.has("--apply"),
  };
};

const parseSequenceForPrefix = (invoiceNumber: string, prefix: string) => {
  const normalized = String(invoiceNumber || "").trim().toUpperCase();
  if (!normalized.startsWith(prefix)) return null;
  const sequence = Number(normalized.slice(prefix.length));
  return Number.isInteger(sequence) && sequence > 0 ? sequence : null;
};

async function main() {
  const { apply } = parseArgs();
  const invoices = (await prisma.invoice.findMany({
    select: {
      id: true,
      userId: true,
      invoiceNumber: true,
      generatedAt: true,
      metadata: true,
    },
    orderBy: [{ userId: "asc" }, { generatedAt: "asc" }, { id: "asc" }],
  })) as InvoiceRow[];

  const businessProfiles = await prisma.businessProfile.findMany({
    select: { userId: true, businessName: true },
  });
  const businessByUser = new Map(businessProfiles.map((profile) => [profile.userId, profile.businessName]));

  const byGroup = new Map<string, { issuerCode: string; prefix: string; rows: InvoiceRow[]; used: Set<number> }>();
  for (const invoice of invoices) {
    const year = getInvoiceNumberYear(invoice.generatedAt);
    const issuerCode = buildInvoiceIssuerCode(businessByUser.get(invoice.userId), invoice.userId);
    const prefix = `${issuerCode}-${String(year).slice(-2)}-`;
    const key = `${invoice.userId}:${year}:${issuerCode}`;
    const existing = byGroup.get(key) || { issuerCode, prefix, rows: [], used: new Set<number>() };
    existing.rows.push(invoice);
    const usedSequence = parseSequenceForPrefix(invoice.invoiceNumber, prefix);
    if (usedSequence) existing.used.add(usedSequence);
    byGroup.set(key, existing);
  }

  const updates: Array<{
    id: string;
    from: string;
    to: string;
    metadata: Record<string, unknown>;
  }> = [];

  for (const group of byGroup.values()) {
    let nextSequence = group.used.size > 0 ? Math.max(...group.used) + 1 : 1;
    for (const invoice of group.rows) {
      const legacy =
        isLegacyAutoInvoiceNumber(invoice.invoiceNumber) ||
        isPreviousGeneratedInvoiceNumber(invoice.invoiceNumber) ||
        isInvoiceNumberDraft(invoice.invoiceNumber);
      if (!legacy) continue;

      while (group.used.has(nextSequence)) {
        nextSequence += 1;
      }
      const nextNumber = formatSequentialInvoiceNumber(
        getInvoiceNumberYear(invoice.generatedAt),
        nextSequence,
        group.issuerCode
      );
      group.used.add(nextSequence);
      nextSequence += 1;

      if (nextNumber === invoice.invoiceNumber) continue;

      updates.push({
        id: invoice.id,
        from: invoice.invoiceNumber,
        to: nextNumber,
        metadata: {
          ...appendInvoiceNumberAlias(invoice.metadata, invoice.invoiceNumber),
          invoiceNumberRenumberedAt: new Date().toISOString(),
        },
      });
    }
  }

  console.log(
    JSON.stringify(
      {
        mode: apply ? "apply" : "dry-run",
        totalInvoices: invoices.length,
        updates: updates.length,
        sample: updates.slice(0, 20),
      },
      null,
      2
    )
  );

  if (!apply || updates.length === 0) {
    await prisma.$disconnect();
    return;
  }

  for (const update of updates) {
    await prisma.invoice.update({
      where: { id: update.id },
      data: {
        invoiceNumber: update.to,
        pdfUrl: null,
        metadata: update.metadata as Prisma.InputJsonValue,
      },
    });
  }

  console.log(`Applied ${updates.length} invoice number updates.`);
  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
