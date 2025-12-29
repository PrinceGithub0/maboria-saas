import PDFDocument from "pdfkit";
import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import { prisma } from "./prisma";
import { sendEmail } from "./email";
import { log } from "./logger";
import { formatCurrency, formatCurrencyWithCode } from "./currency";
import { isAllowedCurrency, normalizeCurrency } from "./payments/currency-allowlist";

export type InvoiceItem = {
  name: string;
  quantity: number;
  price: number;
  description?: string;
};

type BusinessProfileSnapshot = {
  businessName: string;
  country: string;
  defaultCurrency: string;
  businessAddress?: string | null;
  businessEmail?: string | null;
  businessPhone?: string | null;
  taxId?: string | null;
};

type CustomerSnapshot = {
  name?: string | null;
  email?: string | null;
  address?: string | null;
};

export function calculateTotals(items: InvoiceItem[], tax = 0, discount = 0) {
  const subtotal = items.reduce((sum, item) => sum + item.quantity * item.price, 0);
  const taxAmount = (subtotal * tax) / 100;
  const discountAmount = (subtotal * discount) / 100;
  const total = subtotal + taxAmount - discountAmount;
  return { subtotal, taxAmount, discountAmount, total };
}

export function calculateTotalsFromAmounts(
  items: InvoiceItem[],
  taxAmount = 0,
  discountAmount = 0
) {
  const subtotal = items.reduce((sum, item) => sum + item.quantity * item.price, 0);
  const total = subtotal + taxAmount - discountAmount;
  return { subtotal, taxAmount, discountAmount, total };
}

export async function createInvoiceRecord({
  userId,
  invoiceNumber,
  currency,
  items,
  status,
  tax,
  discount,
  customer,
}: {
  userId: string;
  invoiceNumber: string;
  currency: string;
  items: InvoiceItem[];
  status: string;
  tax?: number;
  discount?: number;
  customer?: CustomerSnapshot | null;
}) {
  const profile = await prisma.businessProfile.findUnique({
    where: { userId },
    select: {
      businessName: true,
      country: true,
      defaultCurrency: true,
      businessAddress: true,
      businessEmail: true,
      businessPhone: true,
      taxId: true,
    },
  });
  if (!profile) {
    const error = new Error("Business profile required before creating invoices");
    (error as any).status = 400;
    throw error;
  }

  const normalizedCurrency = normalizeCurrency(currency || "USD");
  if (!isAllowedCurrency(normalizedCurrency)) {
    const error = new Error("Unsupported currency");
    (error as any).status = 400;
    throw error;
  }

  const businessSnapshot: BusinessProfileSnapshot = {
    businessName: profile.businessName,
    country: profile.country,
    defaultCurrency: profile.defaultCurrency,
    businessAddress: profile.businessAddress ?? null,
    businessEmail: profile.businessEmail ?? null,
    businessPhone: profile.businessPhone ?? null,
    taxId: profile.taxId ?? null,
  };
  const totals = calculateTotals(items, tax, discount);
  const base = invoiceNumber;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = attempt === 0 ? base : `${base}-${crypto.randomInt(1000, 10000)}`;
    try {
      const created = await prisma.invoice.create({
        data: {
          userId,
          invoiceNumber: candidate,
          currency: normalizedCurrency,
          status: status as any,
          items,
          tax: totals.taxAmount,
          discount: totals.discountAmount,
          total: totals.total,
          metadata: { businessProfile: businessSnapshot, customer },
        },
      });
      try {
        const { pdfBuffer } = await generateAndStoreInvoicePdf(created, businessSnapshot, customer);
        await sendInvoiceEmailToCustomer(created, businessSnapshot, customer, pdfBuffer);
      } catch (error) {
        log("error", "invoice_pdf_or_email_failed", { invoiceId: created.id, error });
      }
      return created;
    } catch (error: any) {
      if (error?.code === "P2002") {
        const targets = Array.isArray(error?.meta?.target) ? error.meta.target : [];
        if (targets.includes("invoiceNumber")) {
          continue;
        }
      }
      throw error;
    }
  }
  throw new Error("Invoice number already exists. Please choose another.");
}

export type InvoicePdfInput = {
  invoiceNumber: string;
  status: string;
  issuedAt: Date;
  dueDate?: Date | null;
  currency: string;
  items: InvoiceItem[];
  totals: ReturnType<typeof calculateTotals>;
  business: BusinessProfileSnapshot;
  billTo?: { name?: string | null; email?: string | null; address?: string | null } | null;
};

function sanitizeFilename(value: string) {
  return String(value || "invoice").replace(/[^a-zA-Z0-9-_]/g, "_");
}

async function persistInvoicePdf(
  invoiceId: string,
  invoiceNumber: string,
  pdfBuffer: Buffer
) {
  const safeNumber = sanitizeFilename(invoiceNumber);
  const fileName = `Invoice_${safeNumber}_${invoiceId}.pdf`;
  const dir = path.join(process.cwd(), "public", "invoices");
  await fs.mkdir(dir, { recursive: true });
  const filePath = path.join(dir, fileName);
  await fs.writeFile(filePath, pdfBuffer);
  return `/invoices/${fileName}`;
}

async function readStoredPdf(pdfUrl?: string | null) {
  if (!pdfUrl) return null;
  const filePath = path.join(process.cwd(), "public", pdfUrl.replace(/^\//, ""));
  return fs.readFile(filePath);
}

export function buildInvoicePdfBuffer(input: InvoicePdfInput) {
  return new Promise<Buffer>((resolve, reject) => {
    const normalizedCurrency = normalizeCurrency(input.currency || "USD");
    if (!isAllowedCurrency(normalizedCurrency)) {
      reject(new Error("Unsupported invoice currency"));
      return;
    }
    const doc = new PDFDocument({ margin: 50, size: "A4" });
    const chunks: Buffer[] = [];

    doc.on("data", (chunk) => chunks.push(chunk as Buffer));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", (err) => reject(err));

    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const startX = doc.page.margins.left;
    let y = doc.y;

    doc.fontSize(26).font("Helvetica-Bold").text("INVOICE", startX, y);
    doc.fontSize(10).font("Helvetica").text(input.status, startX + pageWidth - 120, y + 4, {
      width: 120,
      align: "right",
    });
    y += 28;

    doc.fontSize(10).font("Helvetica").fillColor("#475569");
    doc.text(`Invoice #: ${input.invoiceNumber}`, startX, y);
    doc.text(`Issue date: ${input.issuedAt.toDateString()}`, startX, y + 14);
    if (input.dueDate) {
      doc.text(`Due date: ${input.dueDate.toDateString()}`, startX, y + 28);
    }
    y += input.dueDate ? 48 : 34;

    doc.fillColor("#0f172a");
    doc.fontSize(11).font("Helvetica-Bold").text("From", startX, y);
    doc.font("Helvetica").text(input.business.businessName, startX, y + 14);
    if (input.business.businessAddress) {
      doc.text(input.business.businessAddress, startX, y + 28);
    }
    if (input.business.businessEmail) {
      doc.text(input.business.businessEmail, startX, y + 42);
    }
    if (input.business.businessPhone) {
      doc.text(input.business.businessPhone, startX, y + 56);
    }

    const billToX = startX + pageWidth / 2 + 10;
    doc.font("Helvetica-Bold").text("Bill To", billToX, y);
    doc.font("Helvetica").text(input.billTo?.name || "Customer", billToX, y + 14);
    if (input.billTo?.address) {
      doc.text(input.billTo.address, billToX, y + 28);
    }
    if (input.billTo?.email) {
      doc.text(input.billTo.email, billToX, y + 42);
    }

    y += 80;

    const tableTop = y;
    const colWidths = [pageWidth * 0.46, pageWidth * 0.12, pageWidth * 0.2, pageWidth * 0.22];
    const headers = ["Description", "Qty", "Unit price", "Amount"];
    doc.fillColor("#0f172a").font("Helvetica-Bold").fontSize(10);
    headers.reduce((x, header, idx) => {
      doc.text(header, x, tableTop, { width: colWidths[idx], align: idx === 0 ? "left" : "right" });
      return x + colWidths[idx];
    }, startX);
    doc.moveTo(startX, tableTop + 18).lineTo(startX + pageWidth, tableTop + 18).strokeColor("#e2e8f0").stroke();
    y = tableTop + 26;

    doc.font("Helvetica").fontSize(10).fillColor("#0f172a");
    input.items.forEach((item) => {
      const rowHeight = Math.max(
        doc.heightOfString(item.name, { width: colWidths[0] }),
        doc.heightOfString(String(item.quantity), { width: colWidths[1] })
      );
      if (y + rowHeight + 60 > doc.page.height - doc.page.margins.bottom) {
        doc.addPage();
        y = doc.page.margins.top;
      }
      doc.text(item.name, startX, y, { width: colWidths[0] });
      doc.text(String(item.quantity), startX + colWidths[0], y, { width: colWidths[1], align: "right" });
      doc.text(formatCurrencyWithCode(item.price, normalizedCurrency), startX + colWidths[0] + colWidths[1], y, {
        width: colWidths[2],
        align: "right",
      });
      doc.text(formatCurrencyWithCode(item.quantity * item.price, normalizedCurrency), startX + colWidths[0] + colWidths[1] + colWidths[2], y, {
        width: colWidths[3],
        align: "right",
      });
      y += rowHeight + 10;
      doc
        .moveTo(startX, y - 4)
        .lineTo(startX + pageWidth, y - 4)
        .strokeColor("#f1f5f9")
        .stroke();
    });

    y += 6;
    const totalsX = startX + pageWidth * 0.55;
    const totalsWidth = pageWidth * 0.45;
    const totalsLines: Array<[string, number]> = [
      ["Subtotal", input.totals.subtotal],
    ];
    if (input.totals.discountAmount > 0) totalsLines.push(["Discount", -input.totals.discountAmount]);
    if (input.totals.taxAmount > 0) totalsLines.push(["Tax", input.totals.taxAmount]);
    totalsLines.push(["Total", input.totals.total]);

    totalsLines.forEach(([label, value], idx) => {
      const isTotal = idx === totalsLines.length - 1;
      doc.font(isTotal ? "Helvetica-Bold" : "Helvetica").fontSize(isTotal ? 12 : 10);
      doc.text(label, totalsX, y, { width: totalsWidth * 0.5 });
      doc.text(formatCurrencyWithCode(value, normalizedCurrency), totalsX, y, { width: totalsWidth, align: "right" });
      y += isTotal ? 18 : 14;
    });

    doc.moveDown(2);
    doc.font("Helvetica").fontSize(9).fillColor("#64748b");
    doc.text("Generated by Maboria", startX, doc.page.height - doc.page.margins.bottom - 20, { align: "left" });
    doc.text(`Page ${doc.page.number}`, startX + pageWidth - 60, doc.page.height - doc.page.margins.bottom - 20, {
      align: "right",
    });

    doc.end();
  });
}

export async function ensureInvoicePdf({
  invoice,
  business,
  billTo,
}: {
  invoice: {
    id: string;
    invoiceNumber: string;
    status: string;
    generatedAt: Date;
    currency: string;
    items: InvoiceItem[];
    tax?: any;
    discount?: any;
    pdfUrl?: string | null;
  };
  business: BusinessProfileSnapshot;
  billTo?: CustomerSnapshot | null;
}) {
  const normalizedCurrency = normalizeCurrency(invoice.currency || "USD");
  if (!isAllowedCurrency(normalizedCurrency)) {
    throw new Error("Unsupported invoice currency");
  }

  if (invoice.pdfUrl) {
    try {
      const existingBuffer = await readStoredPdf(invoice.pdfUrl);
      if (existingBuffer) {
        return { pdfUrl: invoice.pdfUrl, pdfBuffer: existingBuffer };
      }
    } catch (error) {
      log("warn", "invoice_pdf_read_failed", { invoiceId: invoice.id, error });
    }
  }

  const totals = calculateTotalsFromAmounts(
    invoice.items,
    Number(invoice.tax || 0),
    Number(invoice.discount || 0)
  );
  const pdfBuffer = await buildInvoicePdfBuffer({
    invoiceNumber: invoice.invoiceNumber,
    status: invoice.status,
    issuedAt: invoice.generatedAt,
    currency: normalizedCurrency,
    items: invoice.items,
    totals,
    business,
    billTo,
  });
  const pdfUrl = await persistInvoicePdf(invoice.id, invoice.invoiceNumber, pdfBuffer);
  await prisma.invoice.update({
    where: { id: invoice.id },
    data: { pdfUrl },
  });
  return { pdfUrl, pdfBuffer };
}

export async function generateAndStoreInvoicePdf(
  invoice: {
    id: string;
    invoiceNumber: string;
    status: string;
    generatedAt: Date;
    currency: string;
    items: InvoiceItem[];
    tax?: any;
    discount?: any;
    pdfUrl?: string | null;
  },
  business: BusinessProfileSnapshot,
  billTo?: CustomerSnapshot | null
) {
  return ensureInvoicePdf({ invoice, business, billTo });
}

export async function emailInvoice({
  to,
  invoiceNumber,
  pdfBuffer,
  businessName,
}: {
  to: string;
  invoiceNumber: string;
  pdfBuffer: Buffer;
  businessName: string;
}) {
  await sendEmail({
    to,
    subject: `Invoice from ${businessName}`,
    html: `<p>Please find attached invoice <strong>${invoiceNumber}</strong>.</p>`,
    attachments: [
      {
        filename: `Invoice_${sanitizeFilename(invoiceNumber)}.pdf`,
        content: pdfBuffer,
        contentType: "application/pdf",
      },
    ],
  });
  log("info", "Invoice email prepared", { to, invoiceNumber, size: pdfBuffer.length });
}

export async function sendInvoiceEmailToCustomer(
  invoice: {
    id: string;
    invoiceNumber: string;
    status: string;
    generatedAt: Date;
    currency: string;
    items: InvoiceItem[];
    tax?: any;
    discount?: any;
    pdfUrl?: string | null;
  },
  business: BusinessProfileSnapshot,
  customer?: CustomerSnapshot | null,
  pdfBuffer?: Buffer
) {
  const recipient = customer?.email;
  if (!recipient) {
    log("info", "invoice_email_skipped_missing_customer", { invoiceNumber: invoice.invoiceNumber });
    return;
  }
  const resolvedBuffer =
    pdfBuffer ||
    (await ensureInvoicePdf({
      invoice: invoice as any,
      business,
      billTo: customer,
    })).pdfBuffer;
  await emailInvoice({
    to: recipient,
    invoiceNumber: invoice.invoiceNumber,
    pdfBuffer: resolvedBuffer,
    businessName: business.businessName,
  });
}
