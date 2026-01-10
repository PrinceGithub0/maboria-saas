import PDFDocument from "pdfkit";
import crypto from "crypto";
import fs from "fs/promises";
import { existsSync, readFileSync } from "fs";
import path from "path";
import { prisma } from "./prisma";
import { sendEmail } from "./email";
import { log } from "./logger";
import { formatCurrencyCode } from "./currency";
import { isAllowedCurrency, normalizeCurrency } from "./payments/currency-allowlist";
import { notifyInvoiceCreated } from "./whatsapp";
import { getTaxIdLabel } from "./tax-labels";
import { formatDateDMY } from "./date";
import { ensureInvoicePaymentLink } from "./invoice-payments";
import { triggerInvoiceStatusAutomations } from "./automation/events";

export type InvoiceItem = {
  name: string;
  quantity: number;
  price: number;
  description?: string;
};

const interFontPath = path.join(process.cwd(), "assets", "fonts", "Inter.ttf");
const INVOICE_PDF_VERSION = "inv24-v7";
const ensureInvoiceFont = () => {
  if (!existsSync(interFontPath)) {
    throw new Error("Invoice font missing at assets/fonts/Inter.ttf");
  }
  return interFontPath;
};
const getPdfFontPath = () => "Inter";

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

export function resolveInvoiceCustomer(metadata: any): CustomerSnapshot | null {
  const raw = (metadata?.customer ?? {}) as Record<string, any>;
  const name = raw.name ?? raw.customerName ?? metadata?.customerName;
  const email = raw.email ?? raw.customerEmail ?? metadata?.customerEmail;
  const address =
    raw.address ??
    raw.customerAddress ??
    raw.addressLine1 ??
    metadata?.customerAddress ??
    metadata?.customer_address;
  if (!name && !email && !address) return null;
  return { name, email, address };
}

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

const normalizeInvoiceItems = (value: unknown): InvoiceItem[] => {
  let items: unknown = value;
  if (typeof items === "string") {
    try {
      items = JSON.parse(items);
    } catch {
      items = [];
    }
  }
  if (!Array.isArray(items)) return [];
  return items.map((item: any) => ({
    name: typeof item?.name === "string" && item.name.trim() ? item.name.trim() : "Item",
    quantity: Number(item?.quantity || 0),
    price: Number(item?.price || 0),
    description: typeof item?.description === "string" ? item.description : undefined,
  }));
};

export async function createInvoiceRecord({
  userId,
  invoiceNumber,
  currency,
  items,
  status,
  tax,
  discount,
  customer,
  issueDate,
  dueDate,
}: {
  userId: string;
  invoiceNumber: string;
  currency: string;
  items: InvoiceItem[];
  status: string;
  tax?: number;
  discount?: number;
  customer?: CustomerSnapshot | null;
  issueDate?: Date;
  dueDate?: Date;
}) {
  const normalizedStatus = String(status || "DRAFT").toUpperCase();
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
          status: normalizedStatus as any,
          items,
          tax: totals.taxAmount,
          discount: totals.discountAmount,
          total: totals.total,
          generatedAt: issueDate,
          metadata: {
            businessProfile: businessSnapshot,
            customer,
            dueDate: dueDate ? dueDate.toISOString() : undefined,
            organizationId: userId,
          },
        },
      });
      try {
        await notifyInvoiceCreated({
          userId,
          invoiceNumber: created.invoiceNumber,
          customerName: customer?.name,
          total: totals.total,
          currency: normalizedCurrency,
        });
      } catch (error) {
        log("warn", "invoice_whatsapp_failed", { invoiceId: created.id, error });
      }
      if (normalizedStatus === "SENT") {
        try {
          const { pdfBuffer } = await generateAndStoreInvoicePdf(created, businessSnapshot, customer);
          await sendInvoiceEmailToCustomer(created, businessSnapshot, customer, pdfBuffer);
        } catch (error) {
          await prisma.invoice.update({
            where: { id: created.id },
            data: { status: "DRAFT" },
          });
          log("error", "invoice_pdf_or_email_failed", { invoiceId: created.id, error });
          throw error;
        }
      }
      if (normalizedStatus !== "DRAFT") {
        triggerInvoiceStatusAutomations({
          userId,
          invoiceId: created.id,
          invoiceNumber: created.invoiceNumber,
          status: normalizedStatus,
        }).catch((error) => {
          log("error", "invoice_status_trigger_failed", { invoiceId: created.id, error });
        });
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
  hideStatus?: boolean;
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
    const fontPath = ensureInvoiceFont();
    const fontBuffer = readFileSync(fontPath);
    const doc = new PDFDocument({ margin: 48, size: "A4", font: fontBuffer });
    const chunks: Buffer[] = [];

    doc.on("data", (chunk) => chunks.push(chunk as Buffer));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", (err) => reject(err));

    const fontName = getPdfFontPath();
    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const startX = doc.page.margins.left;
    let y = doc.page.margins.top;

    doc.registerFont("Inter", fontBuffer);
    doc.font(fontName);

    const colors = {
      text: "#0b1220",
      muted: "#475569",
      line: "#d1d5db",
      lightLine: "#e5e7eb",
      headerBg: "#111827",
      headerText: "#f9fafb",
    };

    const text = (
      value: string,
      x: number,
      yPos: number,
      options: PDFKit.Mixins.TextOptions = {},
      size = 9,
      color = colors.text
    ) => {
      doc.font(fontName).fontSize(size).fillColor(color).text(value, x, yPos, options);
    };
    const textBold = (
      value: string,
      x: number,
      yPos: number,
      options: PDFKit.Mixins.TextOptions = {},
      size = 9
    ) => {
      doc.font(fontName).fontSize(size).fillColor(colors.text).text(value, x, yPos, options);
      doc.font(fontName).fontSize(size).fillColor(colors.text).text(value, x + 0.4, yPos, options);
    };
    const setSpacing = (value: number) => {
      const fn = (doc as PDFKit.PDFDocument & { characterSpacing?: (v: number) => void }).characterSpacing;
      if (typeof fn === "function") {
        fn.call(doc, value);
      }
    };

    const lineHeight = 14;
    const rightColumnWidth = pageWidth * 0.38;
    const leftColumnWidth = pageWidth - rightColumnWidth;
    const rightX = startX + leftColumnWidth;

    const headerTop = y;
    textBold(input.business.businessName, startX, headerTop, { width: leftColumnWidth }, 24);

    setSpacing(1.4);
    textBold("INVOICE", rightX, headerTop + 2, { width: rightColumnWidth, align: "right" }, 18);
    setSpacing(0);

    const metaStartY = headerTop + 32;
    const statusLabel = String(input.status || "DRAFT").toUpperCase();
    const metaItems: { label: string; value: string }[] = [];
    if (!input.hideStatus) {
      metaItems.push({ label: "Status", value: statusLabel });
    }
    metaItems.push({ label: "Invoice Number", value: input.invoiceNumber });
    metaItems.push({ label: "Invoice Date", value: formatDateDMY(input.issuedAt) });
    if (input.dueDate) {
      metaItems.push({ label: "Due Date", value: formatDateDMY(input.dueDate) });
    }
    const metaRows = metaItems.length;
    const metaLabelWidth = rightColumnWidth * 0.5;
    const metaValue = (label: string, value: string, row: number) => {
      const rowY = metaStartY + row * lineHeight;
      text(label, rightX, rowY, { width: metaLabelWidth }, 8, colors.muted);
      text(value, rightX, rowY, { width: rightColumnWidth, align: "right" }, 9, colors.text);
    };
    metaItems.forEach((item, index) => metaValue(item.label, item.value, index));

    const leftBlockHeight = doc.heightOfString(input.business.businessName, {
      width: leftColumnWidth,
    });
    const rightBlockEnd = metaStartY + metaRows * lineHeight;
    const headerBottom = Math.max(headerTop + leftBlockHeight, rightBlockEnd);
    y = headerBottom + 22;
    doc
      .moveTo(startX, y)
      .lineTo(startX + pageWidth, y)
      .strokeColor(colors.line)
      .lineWidth(0.9)
      .stroke();
    y += 12;

    const columnGap = 20;
    const columnWidth = (pageWidth - columnGap * 2) / 3;
    const taxLabel = getTaxIdLabel(input.business.country);
    const sellerLines = [
      input.business.businessName,
      input.business.businessAddress,
      input.business.businessEmail,
      input.business.businessPhone,
      input.business.taxId ? `${taxLabel.long}: ${input.business.taxId}` : null,
    ].filter(Boolean) as string[];
    const billToLines = [
      input.billTo?.name || "Customer",
      input.billTo?.address || null,
      input.billTo?.email || null,
    ].filter(Boolean) as string[];
    const paymentDetails = [] as string[];
    const paymentMeta = (input as any)?.paymentDetails;
    if (Array.isArray(paymentMeta)) {
      paymentDetails.push(...paymentMeta.filter(Boolean));
    } else if (typeof paymentMeta === "string") {
      paymentDetails.push(...paymentMeta.split("\n").map((line: string) => line.trim()).filter(Boolean));
    }
    if (paymentDetails.length === 0) {
      paymentDetails.push("Provided via checkout or bank transfer.");
    }

    const columnTop = y;
    setSpacing(0.8);
    textBold("SELLER", startX, columnTop, {}, 9);
    textBold("BILL TO", startX + columnWidth + columnGap, columnTop, {}, 9);
    textBold("PAYMENT DETAILS", startX + (columnWidth + columnGap) * 2, columnTop, {}, 9);
    setSpacing(0);

    const columnStartY = columnTop + 14;
    const renderColumn = (
      x: number,
      lines: string[],
      options: { boldFirst?: boolean; width?: number } = {}
    ) => {
      const width = options.width ?? columnWidth;
      let cursor = columnStartY;
      lines.forEach((line, idx) => {
        const isFirst = idx === 0 && options.boldFirst;
        const size = isFirst ? 10 : 9;
        const color = isFirst ? colors.text : colors.muted;
        doc.font(fontName).fontSize(size).fillColor(color);
        doc.text(line, x, cursor, { width, lineGap: 2 });
        const height = doc.heightOfString(line, { width, lineGap: 2 });
        cursor += height + 2;
      });
      return cursor;
    };

    const sellerEnd = renderColumn(startX, sellerLines, { boldFirst: true });
    const billToEnd = renderColumn(startX + columnWidth + columnGap, billToLines, { boldFirst: true });
    const paymentEnd = renderColumn(
      startX + (columnWidth + columnGap) * 2,
      paymentDetails,
      { boldFirst: false }
    );

    y = Math.max(sellerEnd, billToEnd, paymentEnd) + 12;

    const tableTop = y;
    const tableInnerX = startX;
    const tableInnerWidth = pageWidth;
    const tableRadius = 10;
    const colWidths = [
      tableInnerWidth * 0.34,
      tableInnerWidth * 0.1,
      tableInnerWidth * 0.21,
      tableInnerWidth * 0.21,
      tableInnerWidth * 0.14,
    ];
    const colAlignments: PDFKit.Mixins.TextOptions["align"][] = [
      "left",
      "center",
      "right",
      "right",
      "center",
    ];
    const headers = ["DESCRIPTION", "QTY", "UNIT PRICE", "SUBTOTAL", "VAT"];
    const headerHeight = 24;
    const drawTableHeader = (headerY: number) => {
      doc.save();
      doc.roundedRect(tableInnerX, headerY, tableInnerWidth, headerHeight, tableRadius).clip();
      doc.rect(tableInnerX, headerY, tableInnerWidth, headerHeight).fill(colors.headerBg);
      doc.restore();
      doc.fontSize(9).fillColor(colors.headerText);
      headers.reduce((x, header, idx) => {
        doc.text(header, x + 6, headerY + 6, {
          width: colWidths[idx] - 12,
          align: colAlignments[idx] || "left",
        });
        return x + colWidths[idx];
      }, tableInnerX);
    };
    drawTableHeader(tableTop);
    y = tableTop + headerHeight + 6;
    let tableSectionStart = tableTop;
    const drawTableBox = (startY: number, endY: number) => {
      if (endY <= startY) return;
      doc
        .roundedRect(tableInnerX, startY, tableInnerWidth, endY - startY, tableRadius)
        .strokeColor(colors.line)
        .lineWidth(0.8)
        .stroke();
    };

    doc.fontSize(9).fillColor(colors.text);
    const subtotal = input.totals.subtotal || 0;
    const vatRate = subtotal > 0 ? input.totals.taxAmount / subtotal : 0;
    const rowLineColor = colors.lightLine;

    const renderRow = (values: string[]) => {
      const description = values[0] || "";
      const descriptionHeight = doc.heightOfString(description, {
        width: colWidths[0] - 12,
        lineGap: 2,
      });
      const rowHeight = Math.max(24, descriptionHeight + 10);
      if (y + rowHeight + 120 > doc.page.height - doc.page.margins.bottom) {
        drawTableBox(tableSectionStart, y);
        doc.addPage();
        y = doc.page.margins.top;
        doc.font(fontName);
        tableSectionStart = y;
        drawTableHeader(y);
        y += headerHeight + 6;
        doc.fontSize(9).fillColor(colors.text);
      }
      values.reduce((x, value, idx) => {
        const isDescription = idx === 0;
        doc.fontSize(isDescription ? 9 : 8).fillColor(colors.text);
        doc.text(value, x + 6, y + 6, {
          width: colWidths[idx] - 12,
          align: colAlignments[idx] || (isDescription ? "left" : "right"),
          lineBreak: true,
        });
        return x + colWidths[idx];
      }, tableInnerX);
      y += rowHeight;
      doc
        .moveTo(tableInnerX, y)
        .lineTo(tableInnerX + tableInnerWidth, y)
        .strokeColor(rowLineColor)
        .lineWidth(0.5)
        .stroke();
    };

    input.items.forEach((item) => {
      const itemSubtotal = item.quantity * item.price;
      const vatAmount = vatRate > 0 ? itemSubtotal * vatRate : 0;
      renderRow([
        item.name,
        String(item.quantity),
        formatCurrencyCode(item.price, normalizedCurrency),
        formatCurrencyCode(itemSubtotal, normalizedCurrency),
        vatAmount ? formatCurrencyCode(vatAmount, normalizedCurrency) : "-",
      ]);
    });

    if (input.totals.discountAmount > 0) {
      renderRow([
        "Discount",
        "-",
        "-",
        formatCurrencyCode(-input.totals.discountAmount, normalizedCurrency),
        "-",
      ]);
    }

    drawTableBox(tableSectionStart, y);
    y += 18;
    const totalsX = startX + pageWidth * 0.6;
    const totalsWidth = pageWidth * 0.4;
    const totalsLabelWidth = totalsWidth * 0.45;
    const totalsValueWidth = totalsWidth - totalsLabelWidth;
    const totalsRowHeight = 16;
    doc.fontSize(9).fillColor(colors.text);
    const fitValueSize = (value: string, maxWidth: number, baseSize = 14, minSize = 10) => {
      let size = baseSize;
      doc.font(fontName).fontSize(size);
      while (size > minSize && doc.widthOfString(value) > maxWidth) {
        size -= 0.5;
        doc.fontSize(size);
      }
      return size;
    };
    const drawValue = (value: string, yPos: number, size: number) => {
      doc.font(fontName).fontSize(size).fillColor(colors.text);
      const valueWidth = doc.widthOfString(value);
      const maxX = totalsX + totalsWidth;
      const minX = totalsX + totalsLabelWidth;
      const x = Math.max(minX, maxX - valueWidth);
      doc.text(value, x, yPos, { lineBreak: false });
    };
    text("Subtotal", totalsX, y, { width: totalsLabelWidth }, 9, colors.muted);
    const subtotalValue = formatCurrencyCode(input.totals.subtotal, normalizedCurrency);
    drawValue(
      subtotalValue,
      y,
      fitValueSize(subtotalValue, totalsValueWidth, 12, 9)
    );
    y += totalsRowHeight;
    if (input.totals.taxAmount > 0) {
      const vatPercent = vatRate > 0 ? Math.round(vatRate * 100) : 0;
      text(`VAT (${vatPercent || ""}%)`, totalsX, y, { width: totalsLabelWidth }, 9, colors.muted);
      const taxValue = formatCurrencyCode(input.totals.taxAmount, normalizedCurrency);
      drawValue(taxValue, y, fitValueSize(taxValue, totalsValueWidth, 12, 9));
      y += totalsRowHeight;
    }
    y += 6;
    textBold("Total to Pay", totalsX, y, { width: totalsLabelWidth }, 14);
    const totalValue = formatCurrencyCode(input.totals.total, normalizedCurrency);
    const totalSize = fitValueSize(totalValue, totalsValueWidth, 14, 9);
    doc.font(fontName).fontSize(totalSize).fillColor(colors.text);
    const totalWidth = doc.widthOfString(totalValue);
    const totalMaxX = totalsX + totalsWidth;
    const totalMinX = totalsX + totalsLabelWidth;
    const totalX = Math.max(totalMinX, totalMaxX - totalWidth);
    doc.text(totalValue, totalX, y, { lineBreak: false });
    doc.text(totalValue, totalX + 0.4, y, { lineBreak: false });

    y += 10;
    const amountInWords = (input as any)?.amountInWords as string | undefined;
    if (amountInWords) {
      text(amountInWords, startX, y, { width: pageWidth }, 8, colors.muted);
      y += 14;
    }
    const notes = (input as any)?.notes as string | undefined;
    if (notes) {
      doc.moveTo(startX, y).lineTo(startX + pageWidth, y).strokeColor(colors.line).lineWidth(0.5).stroke();
      y += 12;
      text(notes, startX, y, { width: pageWidth, align: "center" }, 8, colors.muted);
      y += 8;
    }

    const footerY = doc.page.height - doc.page.margins.bottom - 14;
    doc
      .moveTo(startX, footerY - 10)
      .lineTo(startX + pageWidth, footerY - 10)
      .strokeColor(colors.lightLine)
      .lineWidth(0.5)
      .stroke();
    text(
      "Generated with Maboria",
      startX,
      footerY,
      { width: pageWidth, align: "center" },
      7,
      colors.muted
    );

    doc.end();
  });
}

export async function ensureInvoicePdf({
  invoice,
  business,
  billTo,
  forceRegenerate,
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
    metadata?: any;
  };
  business: BusinessProfileSnapshot;
  billTo?: CustomerSnapshot | null;
  forceRegenerate?: boolean;
}) {
  const normalizedCurrency = normalizeCurrency(invoice.currency || "USD");
  if (!isAllowedCurrency(normalizedCurrency)) {
    throw new Error("Unsupported invoice currency");
  }

  const metadata = (invoice as any).metadata || {};
  const currentPdfVersion = metadata?.pdfVersion || null;
  const normalizedStatus = String(invoice.status || "DRAFT").toUpperCase();
  const currentPdfStatus = String(metadata?.pdfStatus || "").toUpperCase();
  const shouldRegenerate =
    currentPdfVersion !== INVOICE_PDF_VERSION || currentPdfStatus !== normalizedStatus;
  const dueDateValue = metadata?.dueDate ? new Date(metadata.dueDate) : undefined;
  const dueDate = dueDateValue && !Number.isNaN(dueDateValue.getTime()) ? dueDateValue : undefined;

  if (invoice.pdfUrl && !shouldRegenerate && !forceRegenerate) {
    try {
      const existingBuffer = await readStoredPdf(invoice.pdfUrl);
      if (existingBuffer) {
        return { pdfUrl: invoice.pdfUrl, pdfBuffer: existingBuffer };
      }
    } catch (error) {
      log("warn", "invoice_pdf_read_failed", { invoiceId: invoice.id, error });
    }
  }

  const normalizedItems = normalizeInvoiceItems(invoice.items);
  const totals = calculateTotalsFromAmounts(
    normalizedItems,
    Number(invoice.tax || 0),
    Number(invoice.discount || 0)
  );
  const pdfBuffer = await buildInvoicePdfBuffer({
    invoiceNumber: invoice.invoiceNumber,
    status: invoice.status,
    issuedAt: invoice.generatedAt,
    dueDate,
    currency: normalizedCurrency,
    items: normalizedItems,
    totals,
    business,
    billTo,
  });
  const pdfUrl = await persistInvoicePdf(invoice.id, invoice.invoiceNumber, pdfBuffer);
  await prisma.invoice.update({
    where: { id: invoice.id },
    data: {
      pdfUrl,
      metadata: {
        ...metadata,
        pdfVersion: INVOICE_PDF_VERSION,
        pdfStatus: normalizedStatus,
      },
    },
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
  paymentLink,
}: {
  to: string;
  invoiceNumber: string;
  pdfBuffer: Buffer;
  businessName: string;
  paymentLink?: string;
}) {
  const linkHtml = paymentLink
    ? `<p style="margin-top:12px">Pay this invoice: <a href="${paymentLink}">${paymentLink}</a></p>`
    : "";
  await sendEmail({
    to,
    subject: `Invoice from ${businessName}`,
    html: `<p>Please find attached invoice <strong>${invoiceNumber}</strong>.</p>${linkHtml}`,
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
    metadata?: any;
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
  const paymentLink = await ensureInvoicePaymentLink({
    invoice,
    customerName: customer?.name ?? null,
  });
  let resolvedBuffer: Buffer;
  try {
    const metadata = (invoice as any).metadata || {};
    const dueDateValue = metadata?.dueDate ? new Date(metadata.dueDate) : undefined;
    const dueDate = dueDateValue && !Number.isNaN(dueDateValue.getTime()) ? dueDateValue : undefined;
    const normalizedItems = normalizeInvoiceItems(invoice.items);
    const totals = calculateTotalsFromAmounts(
      normalizedItems,
      Number(invoice.tax || 0),
      Number(invoice.discount || 0)
    );
    const normalizedCurrency = normalizeCurrency(
      invoice.currency || business.defaultCurrency || "USD"
    );
    resolvedBuffer = await buildInvoicePdfBuffer({
      invoiceNumber: invoice.invoiceNumber,
      status: invoice.status,
      issuedAt: invoice.generatedAt,
      dueDate,
      currency: normalizedCurrency,
      items: normalizedItems,
      totals,
      business,
      billTo: customer,
      hideStatus: true,
    });
  } catch (error) {
    log("warn", "invoice_email_pdf_fallback", { invoiceId: invoice.id, error });
    resolvedBuffer =
      pdfBuffer ||
      (await ensureInvoicePdf({
        invoice: invoice as any,
        business,
        billTo: customer,
      })).pdfBuffer;
  }
  await emailInvoice({
    to: recipient,
    invoiceNumber: invoice.invoiceNumber,
    pdfBuffer: resolvedBuffer,
    businessName: business.businessName,
    paymentLink: paymentLink.paymentUrl,
  });
}
