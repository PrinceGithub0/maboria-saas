import PDFDocument from "pdfkit";
import crypto from "crypto";
import fs from "fs/promises";
import { existsSync, readFileSync, readdirSync } from "fs";
import path from "path";
import { prisma } from "./prisma";
import { sendEmail } from "./email";
import { log } from "./logger";
import { formatCurrency } from "./currency";
import { isAllowedCurrency, normalizeCurrency } from "./payments/currency-allowlist";
import { notifyInvoiceCreated } from "./whatsapp";
import { formatDateDMY } from "./date";
import { ensureInvoicePaymentLink } from "./invoice-payments";
import { getOrCreateInvoicePublicLink } from "./invoice-public-link";
import { env } from "./env";
import { triggerInvoiceStatusAutomations } from "./automation/events";
import { enforceEntitlement, enforceUsageLimit } from "./entitlements";
import { calculateVatFromAmount, normalizeVatSettings, VatSettings } from "./vat";
import {
  INVOICE_TOTALS_GAP,
  INVOICE_TOTALS_LABEL_WIDTH,
  INVOICE_TOTALS_VALUE_WIDTH,
} from "./invoice-totals-layout";

export type InvoiceItem = {
  name: string;
  quantity: number;
  price: number;
  description?: string;
};

const interFontPath = path.join(process.cwd(), "assets", "fonts", "Inter.ttf");
const businessLogoDir = path.join(process.cwd(), "uploads", "business-logos");
const paystackLogoPath = path.join(process.cwd(), "public", "announcements", "paystack.png");
const flutterwaveLogoPath = path.join(process.cwd(), "public", "payment-logos", "flutterwave.png");
const INVOICE_PDF_VERSION = "inv24-v7";
const ensureInvoiceFont = () => {
  if (!existsSync(interFontPath)) {
    throw new Error("Invoice font missing at assets/fonts/Inter.ttf");
  }
  return interFontPath;
};
const getPdfFontPath = () => "Inter";
type BusinessLogoInfo = {
  buffer: Buffer;
  mime: string;
  ext: string;
};

const readBusinessLogoInfo = (userId: string): BusinessLogoInfo | null => {
  try {
    if (!existsSync(businessLogoDir)) return null;
    const files = readdirSync(businessLogoDir);
    const match = files.find((file) => file.startsWith(`${userId}.`));
    if (!match) return null;
    const ext = path.extname(match).toLowerCase();
    const filePath = path.join(businessLogoDir, match);
    const buffer = readFileSync(filePath);
    const mime =
      ext === ".png"
        ? "image/png"
        : ext === ".jpg" || ext === ".jpeg"
          ? "image/jpeg"
          : ext === ".svg"
            ? "image/svg+xml"
            : "application/octet-stream";
    return { buffer, mime, ext };
  } catch {
    return null;
  }
};

export const getBusinessLogoBuffer = (userId: string) => {
  const info = readBusinessLogoInfo(userId);
  if (!info) return null;
  if (info.ext === ".svg") return null;
  return info.buffer;
};

export const getBusinessLogoDataUrl = (userId: string) => {
  const info = readBusinessLogoInfo(userId);
  if (!info) return null;
  return `data:${info.mime};base64,${info.buffer.toString("base64")}`;
};

type BusinessProfileSnapshot = {
  businessName: string;
  country: string;
  defaultCurrency: string;
  businessAddress?: string | null;
  businessEmail?: string | null;
  businessPhone?: string | null;
  taxId?: string | null;
  vatEnabled?: boolean | null;
  vatRate?: number | null;
  vatPricingMode?: string | null;
};

type CustomerSnapshot = {
  name?: string | null;
  email?: string | null;
  address?: string | null;
  type?: "INDIVIDUAL" | "BUSINESS" | null;
  companyName?: string | null;
  taxId?: string | null;
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
  const type = (raw.type ?? metadata?.customerType ?? "").toString().toUpperCase();
  const companyName = raw.companyName ?? raw.company ?? metadata?.customerCompany;
  const taxId = raw.taxId ?? metadata?.customerTaxId;
  if (!name && !email && !address && !companyName && !taxId) return null;
  return {
    name,
    email,
    address,
    type: type === "BUSINESS" ? "BUSINESS" : type === "INDIVIDUAL" ? "INDIVIDUAL" : undefined,
    companyName,
    taxId,
  };
}

export function calculateTotals(
  items: InvoiceItem[],
  vatSettings: VatSettings,
  discount = 0
) {
  const subtotal = items.reduce((sum, item) => sum + item.quantity * item.price, 0);
  const discountAmount = (subtotal * discount) / 100;
  const baseAmount = subtotal - discountAmount;
  const vatTotals = calculateVatFromAmount(baseAmount, vatSettings);
  return {
    subtotal: vatTotals.subtotal,
    taxAmount: vatTotals.vatAmount,
    discountAmount,
    total: vatTotals.total,
    vatRate: vatTotals.rate,
    vatMode: vatSettings.mode,
    vatEnabled: vatSettings.enabled,
  };
}

export function calculateTotalsFromAmounts(
  items: InvoiceItem[],
  vatSettings: VatSettings,
  discountAmount = 0
) {
  const subtotal = items.reduce((sum, item) => sum + item.quantity * item.price, 0);
  const baseAmount = subtotal - discountAmount;
  const vatTotals = calculateVatFromAmount(baseAmount, vatSettings);
  return {
    subtotal: vatTotals.subtotal,
    taxAmount: vatTotals.vatAmount,
    discountAmount,
    total: vatTotals.total,
    vatRate: vatTotals.rate,
    vatMode: vatSettings.mode,
    vatEnabled: vatSettings.enabled,
  };
}

export const normalizeInvoiceItems = (value: unknown): InvoiceItem[] => {
  let items: unknown = value;
  if (typeof items === "string") {
    try {
      items = JSON.parse(items);
    } catch {
      items = [];
    }
  }
  if (!Array.isArray(items)) return [];
  return items.map((item: any) => {
    const rawName =
      typeof item?.name === "string" && item.name.trim()
        ? item.name.trim()
        : typeof item?.description === "string" && item.description.trim()
          ? item.description.trim()
          : "Item";
    const quantity = Number(item?.quantity ?? item?.qty ?? 0);
    const priceCandidate = item?.price ?? item?.unitPrice ?? item?.unit_price;
    const price =
      Number(priceCandidate ?? 0) ||
      (quantity > 0 && Number(item?.total ?? item?.lineTotal ?? 0) / quantity) ||
      0;
    return {
      name: rawName,
      quantity,
      price,
      description: typeof item?.description === "string" ? item.description : undefined,
    };
  });
};

export async function createInvoiceRecord({
  userId,
  invoiceNumber,
  currency,
  items,
  status,
  discount,
  customer,
  issueDate,
  dueDate,
  note,
}: {
  userId: string;
  invoiceNumber: string;
  currency: string;
  items: InvoiceItem[];
  status: string;
  discount?: number;
  customer?: CustomerSnapshot | null;
  issueDate?: Date;
  dueDate?: Date;
  note?: string;
}) {
  const entitlement = await enforceEntitlement(userId, {
    feature: "invoices",
    requiredPlan: "starter",
    allowTrial: false,
  });
  if (!entitlement.ok) {
    const error = new Error(entitlement.reason || "Access denied");
    (error as any).status = 403;
    throw error;
  }

  const usage = await enforceUsageLimit(userId, "invoices");
  if (!usage.ok) {
    const error = new Error("Invoice limit reached for this month");
    (error as any).status = usage.code === "payment_required" ? 403 : 402;
    (error as any).code = "limit_reached";
    throw error;
  }

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
      vatEnabled: true,
      vatRate: true,
      vatPricingMode: true,
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
    vatEnabled: profile.vatEnabled ?? false,
    vatRate: profile.vatRate ? Number(profile.vatRate) : 0,
    vatPricingMode: profile.vatPricingMode ?? "EXCLUSIVE",
  };
  const vatSettings = normalizeVatSettings({
    enabled: businessSnapshot.vatEnabled ?? false,
    rate: businessSnapshot.vatRate ?? 0,
    mode:
      String(businessSnapshot.vatPricingMode || "EXCLUSIVE").toLowerCase() === "inclusive"
        ? "inclusive"
        : "exclusive",
  });
  const totals = calculateTotals(items, vatSettings, discount);
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
            note: note ? String(note).trim() : undefined,
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
  billTo?: {
    name?: string | null;
    email?: string | null;
    address?: string | null;
    type?: "INDIVIDUAL" | "BUSINESS" | null;
    companyName?: string | null;
    taxId?: string | null;
  } | null;
  paymentLink?: string;
  logoBuffer?: Buffer | null;
  note?: string | null;
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
    const doc = new PDFDocument({ margin: 48, size: "A4", font: fontPath });
    const chunks: Buffer[] = [];

    doc.on("data", (chunk) => chunks.push(chunk as Buffer));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", (err) => reject(err));

    doc.registerFont("Inter", fontPath);
    doc.font("Inter");

    const left = doc.page.margins.left;
    const right = doc.page.width - doc.page.margins.right;
    const pageWidth = right - left;
    let y = doc.page.margins.top;

    const colors = {
      text: "#0f172a",
      muted: "#64748b",
      line: "#e2e8f0",
      card: "#f8fafc",
      primary: "#2563eb",
      due: "#d97706",
      paid: "#16a34a",
    };

    const formatMoney = (value: number) => formatCurrency(value, normalizedCurrency);
    const statusLabel = String(input.status || "DUE").toUpperCase() === "PAID" ? "PAID" : "DUE";
    const loadPaymentLogo = (logoPath: string) => {
      try {
        return existsSync(logoPath) ? readFileSync(logoPath) : null;
      } catch {
        return null;
      }
    };
    const paystackLogo = loadPaymentLogo(paystackLogoPath);
    const flutterwaveLogo = loadPaymentLogo(flutterwaveLogoPath);

    const drawLabel = (
      textValue: string,
      x: number,
      yPos: number,
      size = 9,
      color = colors.muted,
      options: PDFKit.Mixins.TextOptions = {}
    ) => {
      doc.font("Inter").fontSize(size).fillColor(color).text(textValue, x, yPos, options);
    };
    const drawText = (
      textValue: string,
      x: number,
      yPos: number,
      size = 10,
      color = colors.text,
      options: PDFKit.Mixins.TextOptions = {}
    ) => {
      doc.font("Inter").fontSize(size).fillColor(color).text(textValue, x, yPos, options);
    };
    const drawBold = (
      textValue: string,
      x: number,
      yPos: number,
      size = 11,
      options: PDFKit.Mixins.TextOptions = {}
    ) => {
      doc.font("Inter").fontSize(size).fillColor(colors.text).text(textValue, x, yPos, options);
      doc.font("Inter").fontSize(size).fillColor(colors.text).text(textValue, x + 0.4, yPos, options);
    };

    const logoSize = 68;
    if (input.logoBuffer) {
      try {
        doc.image(input.logoBuffer, left, y, { width: logoSize, height: logoSize });
      } catch (error) {
        log("warn", "invoice_logo_failed", { error });
      }
    }

    const headerX = input.logoBuffer ? left + logoSize + 12 : left;
    drawBold(input.business.businessName, headerX, y + 2, 24);
    if (input.business.businessEmail) {
      drawLabel(input.business.businessEmail, headerX, y + 26, 10);
    }
    if (input.business.businessAddress) {
      drawLabel(input.business.businessAddress, headerX, y + 42, 10);
    }

    const metaLabelWidth = 92;
    const metaValueWidth = 140;
    const metaX = right - (metaLabelWidth + metaValueWidth);
    const metaRow = (label: string, value: string, yPos: number) => {
      drawLabel(label, metaX, yPos, 9, colors.muted, { width: metaLabelWidth, align: "left" });
      drawText(value, metaX + metaLabelWidth, yPos, 9.5, colors.text, {
        width: metaValueWidth,
        align: "right",
      });
    };
    const headerMetaY = y + 2;
    metaRow("Invoice No:", input.invoiceNumber, headerMetaY);
    metaRow("Date:", formatDateDMY(input.issuedAt), headerMetaY + 18);
    if (input.dueDate) {
      metaRow("Due Date:", formatDateDMY(input.dueDate), headerMetaY + 36);
    }

    const badgeWidth = 56;
    const badgeHeight = 18;
    const badgeX = right - badgeWidth;
    const badgeY = headerMetaY + 56;
    doc
      .roundedRect(badgeX, badgeY, badgeWidth, badgeHeight, 5)
      .fill(statusLabel === "PAID" ? colors.paid : colors.due);
    doc.font("Inter").fontSize(9).fillColor("#FFFFFF").text(statusLabel, badgeX, badgeY + 4, {
      width: badgeWidth,
      align: "center",
    });

    const headerBottom = y + Math.max(logoSize, 68) + 12;
    y = headerBottom + 28;
    drawBold("Invoice", left, y, 22, { width: pageWidth, align: "center" });
    y += 26;
    doc.moveTo(left, y).lineTo(right, y).strokeColor(colors.line).lineWidth(1).stroke();
    y += 28;

    const columnGap = 48;
    const columnWidth = (pageWidth - columnGap) / 2;
    drawBold("Billed To", left, y, 11);
    drawBold("Invoiced By", left + columnWidth + columnGap, y, 11);
    doc.moveTo(left, y + 16).lineTo(left + columnWidth, y + 16).strokeColor(colors.line).lineWidth(1).stroke();
    doc
      .moveTo(left + columnWidth + columnGap, y + 16)
      .lineTo(left + columnWidth + columnGap + columnWidth, y + 16)
      .strokeColor(colors.line)
      .lineWidth(1)
      .stroke();

    const billLines = [
      input.billTo?.name || "Customer",
      input.billTo?.email || "",
      input.billTo?.companyName || "",
      input.billTo?.address || "",
      input.billTo?.taxId ? `Tax ID: ${input.billTo.taxId}` : "",
    ].filter((line) => line && String(line).trim().length > 0);
    const businessLines = [
      input.business.businessName,
      input.business.businessEmail || "",
      input.business.businessAddress || "",
    ].filter((line) => line && String(line).trim().length > 0);

    const lineGap = 14;
    billLines.forEach((line, idx) => {
      drawText(String(line), left, y + 26 + idx * lineGap, 10);
    });
    businessLines.forEach((line, idx) => {
      drawText(String(line), left + columnWidth + columnGap, y + 26 + idx * lineGap, 10);
    });

    y += 26 + Math.max(billLines.length, businessLines.length) * lineGap + 22;

    const cardGap = 24;
    const cardWidth = (pageWidth - cardGap) / 2;
    const cardHeight = 132;
    const cardY = y;
    doc.roundedRect(left, cardY, cardWidth, cardHeight, 10).fill(colors.card).strokeColor(colors.line).stroke();
    doc
      .roundedRect(left + cardWidth + cardGap, cardY, cardWidth, cardHeight, 10)
      .fill(colors.card)
      .strokeColor(colors.line)
      .stroke();

    drawBold("Invoice Details", left + 16, cardY + 14, 11);
    const descriptionSummary =
      input.items.length === 1 ? input.items[0].name : `${input.items.length} items`;
    drawLabel("Description", left + 16, cardY + 36, 9);
    drawText(descriptionSummary, left + 16, cardY + 50, 10);
    const paymentLabelY = cardY + 70;
    const paymentLabelWidth = 64;
    const paymentLogoHeight = 14;
    const paymentLogoWidth = 90;
    const flutterwaveLogoHeight = 24;
    const flutterwaveLogoWidth = 168;
    drawLabel("Payment:", left + 16, paymentLabelY, 9);
    let paymentLogoX = left + 16 + paymentLabelWidth;
    if (paystackLogo) {
      doc.opacity(0.9);
      doc.image(paystackLogo, paymentLogoX, paymentLabelY - 3, {
        fit: [paymentLogoWidth, paymentLogoHeight],
      });
      doc.opacity(1);
      paymentLogoX += paymentLogoWidth + 10;
    }
    if (flutterwaveLogo) {
      doc.opacity(0.9);
      doc.image(flutterwaveLogo, paymentLogoX, paymentLabelY - 8, {
        fit: [flutterwaveLogoWidth, flutterwaveLogoHeight],
      });
      doc.opacity(1);
    }

    const showTax =
      Boolean((input.totals as any).vatEnabled) && Number((input.totals as any).vatRate || 0) > 0;
    const taxRate = Number((input.totals as any).vatRate || 0);
    if (showTax) {
      const taxBoxWidth = 120;
      const taxBoxHeight = 46;
      const taxBoxX = left + cardWidth - taxBoxWidth - 14;
      const taxBoxY = cardY + 38;
      doc
        .roundedRect(taxBoxX, taxBoxY, taxBoxWidth, taxBoxHeight, 8)
        .strokeColor(colors.line)
        .fill("#ffffff")
        .stroke();
      drawLabel(
        `VAT (${taxRate ? taxRate.toFixed(1).replace(/\\.0$/, "") : "0"}%)`,
        taxBoxX + 8,
        taxBoxY + 8,
        8
      );
      drawBold(formatMoney(input.totals.taxAmount), taxBoxX + 8, taxBoxY + 22, 10);
    }

    drawBold("Amount Due", left + cardWidth + cardGap + 16, cardY + 14, 11);
    drawBold(formatMoney(input.totals.total), left + cardWidth + cardGap + 16, cardY + 44, 20);
    const buttonWidth = 140;
    const buttonHeight = 28;
    const buttonX = left + cardWidth + cardGap + 16;
    const buttonY = cardY + 74;
    doc.roundedRect(buttonX, buttonY, buttonWidth, buttonHeight, 6).fill(colors.primary);
    doc.font("Inter").fontSize(10).fillColor("#FFFFFF").text("Pay Now", buttonX, buttonY + 7, {
      width: buttonWidth,
      align: "center",
    });
    if (input.paymentLink) {
      doc.link(buttonX, buttonY, buttonWidth, buttonHeight, input.paymentLink);
    }

    y = cardY + cardHeight + 28;

    const tableTop = y;
    const headerHeight = 26;
    const columnWidths = [
      pageWidth * 0.5,
      pageWidth * 0.125,
      pageWidth * 0.1875,
      pageWidth * 0.1875,
    ];
    const headerLabels = ["Description", "Qty", "Unit Price", "Total"];
    const drawTableHeader = (yPos: number) => {
      doc.rect(left, yPos, pageWidth, headerHeight).fill("#f1f5f9");
      headerLabels.reduce((x, label, idx) => {
        const width = columnWidths[idx];
        const align = idx === 0 ? "left" : "center";
        drawBold(label, x + 8, yPos + 8, 9, { width: width - 16, align, lineBreak: false });
        return x + width;
      }, left);
    };
    drawTableHeader(tableTop);
    y = tableTop + headerHeight;

    const maxTableY = doc.page.height - doc.page.margins.bottom - 180;
    const renderRow = (item: InvoiceItem) => {
      const rowHeight = Math.max(24, doc.heightOfString(item.name, { width: columnWidths[0] - 16 }) + 10);
      if (y + rowHeight > maxTableY) {
        doc.addPage();
        y = doc.page.margins.top;
        drawTableHeader(y);
        y += headerHeight;
      }
      drawText(item.name, left + 8, y + 6, 10, colors.text, { width: columnWidths[0] - 16 });
      drawText(String(item.quantity), left + columnWidths[0] + 8, y + 6, 10, colors.text, {
        width: columnWidths[1] - 16,
        align: "center",
        lineBreak: false,
      });
      drawText(
        formatMoney(item.price),
        left + columnWidths[0] + columnWidths[1] + 8,
        y + 6,
        10,
        colors.text,
        { width: columnWidths[2] - 16, align: "center", lineBreak: false }
      );
      drawText(
        formatMoney(item.price * item.quantity),
        left + columnWidths[0] + columnWidths[1] + columnWidths[2] + 8,
        y + 6,
        10,
        colors.text,
        { width: columnWidths[3] - 16, align: "center", lineBreak: false }
      );
      y += rowHeight;
      doc.moveTo(left, y).lineTo(right, y).strokeColor(colors.line).lineWidth(0.8).stroke();
    };
    input.items.forEach((item) => renderRow(item));

    y += 20;
    const totalsLabelWidth = INVOICE_TOTALS_LABEL_WIDTH;
    const totalsValueWidth = INVOICE_TOTALS_VALUE_WIDTH;
    const totalsX = right - (totalsLabelWidth + INVOICE_TOTALS_GAP + totalsValueWidth);
    const totalRow = (label: string, value: string, bold = false) => {
      const size = bold ? 12 : 10;
      drawLabel(label, totalsX, y, 10, colors.muted, {
        width: totalsLabelWidth,
        align: "left",
        lineBreak: false,
      });
      doc.font("Inter").fontSize(size).fillColor(colors.text).text(
        value,
        totalsX + totalsLabelWidth + INVOICE_TOTALS_GAP,
        y,
        {
          width: totalsValueWidth,
          align: "right",
          lineBreak: false,
        }
      );
      y += 14;
    };
    totalRow("Subtotal", formatMoney(input.totals.subtotal));
    if (showTax) {
      totalRow(
        `VAT (${taxRate ? taxRate.toFixed(1).replace(/\\.0$/, "") : "0"}%)`,
        formatMoney(input.totals.taxAmount)
      );
    }
    totalRow("Total Due", formatMoney(input.totals.total), true);

    y += 18;
    const paymentLogoBox = { width: 100, height: 14 };
    drawBold("Pay Now", left, y, 11);
    y += 12;
    doc.rect(left, y, pageWidth, 54).strokeColor(colors.line).lineWidth(1).stroke();
    const logoRowY = y + 9;
    let cursorX = left + 14;
    if (paystackLogo) {
      doc.opacity(0.85);
      doc.image(paystackLogo, cursorX, logoRowY, { fit: [paymentLogoBox.width, paymentLogoBox.height] });
      doc.opacity(1);
      cursorX += paymentLogoBox.width + 12;
    }
    if (flutterwaveLogo) {
      doc.image(flutterwaveLogo, cursorX, logoRowY - 6, {
        fit: [flutterwaveLogoWidth, flutterwaveLogoHeight],
      });
    }
    drawLabel("Please make the payment by the due date. Thank you for your business.", left + 14, y + 28, 9);
    // Payment links are delivered via email, not printed on the PDF.

    if (input.note) {
      y += 72;
      drawBold("Note", left, y, 10);
      drawText(input.note, left, y + 14, 9.5, colors.muted, { width: pageWidth });
    }

    const footerY = doc.page.height - doc.page.margins.bottom - 12;
    doc.font("Inter").fontSize(8).fillColor(colors.muted).text("Generated with Maboria", 0, footerY, { align: "center" });

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
    items: unknown;
    tax?: any;
    discount?: any;
    pdfUrl?: string | null;
    metadata?: any;
    userId?: string;
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
  const shouldRegenerate = currentPdfVersion !== INVOICE_PDF_VERSION;
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
  const vatSettings = normalizeVatSettings({
    enabled: business.vatEnabled ?? false,
    rate: business.vatRate ?? 0,
    mode:
      String(business.vatPricingMode || "EXCLUSIVE").toLowerCase() === "inclusive"
        ? "inclusive"
        : "exclusive",
  });
  const totals = calculateTotalsFromAmounts(normalizedItems, vatSettings, Number(invoice.discount || 0));
  const publicLink = await getOrCreateInvoicePublicLink(invoice.id);
  const paymentLink = `${env.appUrl}/pay/invoice/${encodeURIComponent(publicLink.token)}`;
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
    paymentLink,
    logoBuffer: getBusinessLogoBuffer(invoice.userId || ""),
    note: metadata?.note ?? null,
  });
  const pdfUrl = await persistInvoicePdf(invoice.id, invoice.invoiceNumber, pdfBuffer);
  await prisma.invoice.update({
    where: { id: invoice.id },
    data: {
      pdfUrl,
      metadata: {
        ...metadata,
        pdfVersion: INVOICE_PDF_VERSION,
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
    items: unknown;
    tax?: any;
    discount?: any;
    pdfUrl?: string | null;
    userId?: string;
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
    items: unknown;
    tax?: any;
    discount?: any;
    pdfUrl?: string | null;
    metadata?: any;
    userId?: string;
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
  const publicLink = await getOrCreateInvoicePublicLink(invoice.id);
  await ensureInvoicePaymentLink({
    invoice,
    customerName: customer?.name ?? null,
    returnUrl: `${env.appUrl}/api/invoice/confirm/${encodeURIComponent(publicLink.token)}`,
  });
  const paymentLink = `${env.appUrl}/pay/invoice/${encodeURIComponent(publicLink.token)}`;
  let resolvedBuffer: Buffer;
  try {
    const metadata = (invoice as any).metadata || {};
    const dueDateValue = metadata?.dueDate ? new Date(metadata.dueDate) : undefined;
    const dueDate = dueDateValue && !Number.isNaN(dueDateValue.getTime()) ? dueDateValue : undefined;
    const normalizedItems = normalizeInvoiceItems(invoice.items);
    const vatSettings = normalizeVatSettings({
      enabled: business.vatEnabled ?? false,
      rate: business.vatRate ?? 0,
      mode:
        String(business.vatPricingMode || "EXCLUSIVE").toLowerCase() === "inclusive"
          ? "inclusive"
          : "exclusive",
    });
    const totals = calculateTotalsFromAmounts(normalizedItems, vatSettings, Number(invoice.discount || 0));
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
      paymentLink,
      logoBuffer: getBusinessLogoBuffer(invoice.userId || ""),
      note: metadata?.note ?? null,
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
    paymentLink,
  });
}
