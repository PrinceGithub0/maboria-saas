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
} from "./invoice-totals-layout";
import { recordAnalyticsEvent } from "./analytics";
import { parseBusinessAddress } from "./address";
import { getCountryName } from "./countries";

export type InvoiceItem = {
  name: string;
  quantity: number;
  price: number;
  description?: string;
};

const formatCountryName = (value?: string | null) => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (raw.length === 2) return getCountryName(raw.toUpperCase(), "en");
  return raw;
};

const interFontPath = path.join(process.cwd(), "assets", "fonts", "Inter.ttf");
const businessLogoDir = path.join(process.cwd(), "uploads", "business-logos");
const visaLogoPath = path.join(process.cwd(), "public", "payment-logos", "VBM_bluRGB_2025.png");
const mastercardLogoPath = path.join(process.cwd(), "public", "payment-logos", "mc_symbol_opt_73_3x.png");
const INVOICE_PDF_VERSION = "inv24-v43";
const ensureInvoiceFont = () => {
  if (!existsSync(interFontPath)) {
    throw new Error("Invoice font missing at assets/fonts/Inter.ttf");
  }
  return interFontPath;
};
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
  streetAddress?: string | null;
  city?: string | null;
  postalCode?: string | null;
  country?: string | null;
  type?: "INDIVIDUAL" | "BUSINESS" | null;
  companyName?: string | null;
  taxId?: string | null;
};

export function resolveInvoiceCustomer(metadata: any): CustomerSnapshot | null {
  const raw = (metadata?.customer ?? {}) as Record<string, any>;
  const name = raw.name ?? raw.customerName ?? metadata?.customerName;
  const email = raw.email ?? raw.customerEmail ?? metadata?.customerEmail;
  const rawAddress =
    raw.address ??
    raw.customerAddress ??
    raw.addressLine1 ??
    metadata?.customerAddress ??
    metadata?.customer_address;
  const parsedAddress = parseBusinessAddress(rawAddress);
  const streetAddress =
    raw.streetAddress ?? raw.street ?? raw.addressLine1 ?? parsedAddress.streetAddress;
  const city = raw.city ?? parsedAddress.city;
  const postalCode = raw.postalCode ?? raw.zip ?? parsedAddress.postalCode;
  const country = formatCountryName(raw.country ?? raw.region ?? parsedAddress.region);
  const composedAddress = [streetAddress, city, postalCode, country]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .join("\n");
  const address = composedAddress || rawAddress;
  const type = (raw.type ?? metadata?.customerType ?? "").toString().toUpperCase();
  const companyName = raw.companyName ?? raw.company ?? metadata?.customerCompany;
  const taxId = raw.taxId ?? metadata?.customerTaxId;
  if (!name && !email && !address && !companyName && !taxId) return null;
  return {
    name,
    email,
    address,
    streetAddress,
    city,
    postalCode,
    country,
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
      if (normalizedStatus === "SENT") {
        await recordAnalyticsEvent({
          userId,
          workspaceId: userId,
          orgId: userId,
          type: "INVOICE_SENT",
          count: 1,
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
    streetAddress?: string | null;
    city?: string | null;
    postalCode?: string | null;
    country?: string | null;
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
    const gridGap = 28;
    const leftColWidth = Math.round(pageWidth * 0.62);
    const rightColWidth = pageWidth - leftColWidth - gridGap;
    const rightColX = left + leftColWidth + gridGap;
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
    const visaLogo = null;
    const mastercardLogo = null;
    const verveLogo = null;

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

    const logoSize = 86;
    const logoX = Math.max(0, left - 6);
    if (input.logoBuffer) {
      try {
        doc.image(input.logoBuffer, logoX, y, { width: logoSize, height: logoSize });
      } catch (error) {
        log("warn", "invoice_logo_failed", { error });
      }
    }

    const headerX = input.logoBuffer ? logoX + logoSize + 14 : left;
    const metaGap = 6;
    const metaLabels = ["Invoice No:", "Date:", "Due Date:"];
    const metaLabelWidths = metaLabels.map((label) =>
      doc.font("Inter").fontSize(10).widthOfString(label)
    );
    const metaLabelWidth = Math.max(...metaLabelWidths);
    const metaValues = [
      input.invoiceNumber,
      formatDateDMY(input.issuedAt),
      ...(input.dueDate ? [formatDateDMY(input.dueDate)] : []),
    ];
    const metaValueWidths = metaValues.map((value) =>
      doc.font("Inter").fontSize(10.5).widthOfString(value)
    );
    const maxValueWidth = Math.max(...metaValueWidths);
    const metaValueWidth = Math.max(100, maxValueWidth);
    const metaBlockWidth = metaLabelWidth + metaGap + metaValueWidth;
    const metaX = right - metaBlockWidth;
    const companyBlockWidth = Math.max(180, metaX - headerX - 16);

    drawBold(input.business.businessName, headerX, y + 2, 28, {
      width: companyBlockWidth,
      align: "left",
    });
    const nameHeight = doc.heightOfString(input.business.businessName, {
      width: companyBlockWidth,
    });
    let headerInfoY = y + 2 + nameHeight + 6;
    if (input.business.businessEmail) {
      drawLabel(input.business.businessEmail, headerX, headerInfoY, 10, colors.muted, {
        width: companyBlockWidth,
      });
      const emailHeight = doc.heightOfString(input.business.businessEmail, {
        width: companyBlockWidth,
      });
      headerInfoY += emailHeight + 4;
    }
    const splitAddressLines = (value?: string | null) => {
      if (!value) return [];
      return String(value)
        .split(/\n|,/)
        .map((part) => part.trim())
        .filter((part) => part.length > 0);
    };
    const compactAddress = (value?: string | null, country?: string | null) => {
      const parts = splitAddressLines(value);
      const normalizedCountry = country ? formatCountryName(country) : "";
      if (
        normalizedCountry &&
        !parts.some((part) => part.toLowerCase() === normalizedCountry.toLowerCase())
      ) {
        parts.push(normalizedCountry);
      }
      return parts.join(", ");
    };
    const rawBusinessAddress = String(input.business.businessAddress || "").trim();
    const businessCountry = formatCountryName(input.business.country);
    const addressHasCountry =
      rawBusinessAddress && businessCountry
        ? rawBusinessAddress.toLowerCase().includes(businessCountry.toLowerCase())
        : false;
    const businessAddressLines = [
      ...splitAddressLines(rawBusinessAddress),
      addressHasCountry ? "" : businessCountry,
    ].filter((line) => line && String(line).trim().length > 0);
    const businessAddressText = businessAddressLines.join(", ");
    if (businessAddressLines.length > 0) {
      drawLabel(businessAddressText, headerX, headerInfoY, 10, colors.muted, {
        width: companyBlockWidth,
      });
      const addressHeight = doc.heightOfString(businessAddressText, {
        width: companyBlockWidth,
      });
      headerInfoY += addressHeight + 4;
    }
    const metaInline = (label: string, value: string, yPos: number) => {
      drawBold(`${label}:`, metaX, yPos, 10, {
        width: metaLabelWidth,
        align: "right",
        lineBreak: false,
      });
      drawText(value, metaX + metaLabelWidth + metaGap, yPos, 10.5, colors.text, {
        width: metaValueWidth,
        align: "right",
        lineBreak: false,
      });
      return yPos + 16;
    };
    let headerMetaY = y + 2;
    headerMetaY = metaInline("Invoice No", input.invoiceNumber, headerMetaY);
    headerMetaY = metaInline("Date", formatDateDMY(input.issuedAt), headerMetaY);
    if (input.dueDate) {
      headerMetaY = metaInline("Due Date", formatDateDMY(input.dueDate), headerMetaY);
    }

    const badgeWidth = 56;
    const badgeHeight = 18;
    const badgeX = metaX + (metaBlockWidth - badgeWidth) / 2;
    const badgeY = headerMetaY + 6;
    doc
      .roundedRect(badgeX, badgeY, badgeWidth, badgeHeight, 9)
      .fill(statusLabel === "PAID" ? "#DCFCE7" : "#FDE7CC");
    doc.font("Inter").fontSize(9).fillColor(statusLabel === "PAID" ? "#15803D" : "#B45309").text(
      statusLabel,
      badgeX,
      badgeY + 4,
      {
      width: badgeWidth,
      align: "center",
      }
    );

    const headerContentHeight = Math.max(logoSize, headerInfoY - y, headerMetaY - y + badgeHeight + 10);
    const headerBottom = y + Math.max(96, headerContentHeight) + 12;
    y = headerBottom + 20;
    drawBold("Invoice", left, y, 22, { width: pageWidth, align: "center" });
    y += 32;
    doc.moveTo(left, y).lineTo(right, y).strokeColor(colors.line).lineWidth(1).stroke();
    y += 20;

    const columnWidth = leftColWidth;
    drawBold("Billed To", left, y, 11);
    drawBold("Invoiced By", rightColX, y, 11);
    doc.moveTo(left, y + 16).lineTo(left + columnWidth, y + 16).strokeColor(colors.line).lineWidth(1).stroke();
    doc
      .moveTo(rightColX, y + 16)
      .lineTo(rightColX + rightColWidth, y + 16)
      .strokeColor(colors.line)
      .lineWidth(1)
      .stroke();

    const billAddress =
      [
        input.billTo?.streetAddress,
        input.billTo?.city,
        input.billTo?.postalCode,
        formatCountryName(input.billTo?.country),
      ]
        .filter((line) => line && String(line).trim().length > 0)
        .join(", ") || compactAddress(input.billTo?.address, input.billTo?.country);
    const billLines = [
      input.billTo?.name || "Customer",
      input.billTo?.email || "",
      input.billTo?.companyName || "",
      billAddress,
      input.billTo?.taxId ? `Tax ID: ${input.billTo.taxId}` : "",
    ].filter((line) => line && String(line).trim().length > 0);
    const businessLines = [
      input.business.businessName,
      input.business.businessEmail || "",
      businessAddressText,
      input.business.taxId ? `Tax ID: ${input.business.taxId}` : "",
    ].filter((line) => line && String(line).trim().length > 0);

    const drawLineBlock = (lines: string[], startX: number, startY: number, width: number) => {
      let cursorY = startY;
      lines.forEach((line) => {
        const text = String(line);
        const height = doc.heightOfString(text, { width });
        drawText(text, startX, cursorY, 10, colors.text, { width });
        cursorY += height + 4;
      });
      return cursorY - startY;
    };

    const blockTop = y + 26;
    const billTextWidth = rightColWidth;
    const billHeight = drawLineBlock(billLines, left, blockTop, billTextWidth);
    const businessHeight = drawLineBlock(businessLines, rightColX, blockTop, rightColWidth);

    y += 24 + Math.max(billHeight, businessHeight) + 22;

    const cardWidth = leftColWidth;
    const cardHeight = 128;
    const cardY = y;
    doc.roundedRect(left, cardY, cardWidth, cardHeight, 10).fill(colors.card).strokeColor(colors.line).stroke();
    doc
      .roundedRect(rightColX, cardY, rightColWidth, cardHeight, 10)
      .fill(colors.card)
      .strokeColor(colors.line)
      .stroke();

    drawBold("Invoice Details", left + 16, cardY + 16, 11);
    const descriptionSummary =
      input.items.length === 1 ? input.items[0].name : `${input.items.length} items`;
    drawLabel("Description", left + 16, cardY + 38, 9);
    drawText(descriptionSummary, left + 16, cardY + 52, 10, colors.text, {
      width: cardWidth - 16 - 144,
    });
    // Payment providers are shown in the footer section.

    const showTax =
      Boolean((input.totals as any).vatEnabled) && Number((input.totals as any).vatRate || 0) > 0;
    const taxRate = Number((input.totals as any).vatRate || 0);
    if (showTax) {
      const taxBoxWidth = 120;
      const taxBoxHeight = 46;
      const taxBoxX = left + cardWidth - taxBoxWidth - 14;
      const taxBoxY = cardY + 78;
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

    drawBold("Amount Due", rightColX + 16, cardY + 18, 11);
    drawBold(formatMoney(input.totals.total), rightColX + 16, cardY + 54, 20);
    const buttonWidth = 176;
    const buttonHeight = 34;
    const buttonX = rightColX + (rightColWidth - buttonWidth) / 2;
    const buttonY = cardY + 100;
    doc.roundedRect(buttonX, buttonY, buttonWidth, buttonHeight, 6).fill(colors.primary);
    doc.font("Inter").fontSize(10).fillColor("#FFFFFF").text("Pay Now", buttonX, buttonY + 9, {
      width: buttonWidth,
      align: "center",
    });
    if (input.paymentLink) {
      doc.link(buttonX, buttonY, buttonWidth, buttonHeight, input.paymentLink);
    }

    y = cardY + cardHeight + 12;

    const tableTop = y;
    const tableHeaderHeight = 26;
    const qtyWidth = 56;
    const unitWidth = 120;
    const totalWidth = 120;
    const tableWidth = pageWidth;
    const descWidth = Math.max(240, tableWidth - (qtyWidth + unitWidth + totalWidth));
    const columnWidths = [descWidth, qtyWidth, unitWidth, totalWidth];
    const headerLabels = ["Description", "Qty", "Unit Price", "Total"];
    const drawTableHeader = (yPos: number) => {
      doc.rect(left, yPos, tableWidth, tableHeaderHeight).fill("#f1f5f9");
      headerLabels.reduce((x, label, idx) => {
        const width = columnWidths[idx];
        const align = idx === 0 ? "left" : idx === 1 ? "center" : "right";
        drawBold(label, x + 8, yPos + 8, 9, { width: width - 16, align, lineBreak: false });
        return x + width;
      }, left);
    };
    drawTableHeader(tableTop);
    let yTable = tableTop + tableHeaderHeight;

    const footerNoteText = "Please make the payment by the due date. Thank you for your business.";
    const noteText = input.note ? String(input.note).trim() : "";
    const noteHeight = noteText
      ? doc.font("Inter").fontSize(9.5).heightOfString(noteText, { width: pageWidth - 28 })
      : 0;
    const footerNoteHeight = doc
      .font("Inter")
      .fontSize(10)
      .heightOfString(footerNoteText, { width: pageWidth - 28 });
    const cardBoxPaddingX = 6;
    const cardBoxPaddingY = 4;
    const visaBox = { w: 66, h: 24 };
    const masterBox = { w: 44, h: 16 };
    const verveBox = { w: 0, h: 0 };
    const hasCardLogos = Boolean(visaLogo || mastercardLogo || verveLogo);
    const cardBoxHeight = Math.max(visaBox.h, masterBox.h, verveBox.h) + cardBoxPaddingY * 2;
    const noteBlockHeight = noteText ? 12 + 4 + noteHeight + 8 : 0;
    const footerIntroHeight = noteText ? 14 + noteHeight + 8 : 0;
    const footerNoteBlockHeight = 10 + footerNoteHeight;
    const footerSeparation = noteText ? 10 : 0;
    const footerLogoBlockHeight = hasCardLogos
      ? Math.max(footerNoteBlockHeight, 32 + cardBoxHeight - cardBoxPaddingY)
      : footerNoteBlockHeight;
    const footerBottomPadding = 8;
    const footerBlockHeight =
      footerIntroHeight + footerLogoBlockHeight + footerBottomPadding + footerSeparation;
    const totalsBlockHeight = (showTax ? 3 : 2) * 16 + 8;
    const tableToTotalsGap = 12;
    const minTableToTotalsGap = 4;
    const totalsToFooterGap = 18;
    const minTotalsToFooterGap = 8;
    const paginationEpsilon = 10;
    const requiredAfterTable = totalsBlockHeight + footerBlockHeight + minTotalsToFooterGap;
    const requiredAfterTotals = requiredAfterTable + minTableToTotalsGap;
    const compactRequired =
      totalsBlockHeight + footerBlockHeight + minTotalsToFooterGap + minTableToTotalsGap;
    const pageBottom = doc.page.height - doc.page.margins.bottom;
    const rowMeta = input.items.map((item) => {
      const descText = item.description ? `${item.name}\n${item.description}` : item.name;
      const rowHeight = Math.max(
        30,
        doc.heightOfString(descText, { width: columnWidths[0] - 16 }) + 14
      );
      return { item, descText, rowHeight };
    });
    const rowPrefix = rowMeta.reduce((acc, row) => {
      acc.push((acc[acc.length - 1] || 0) + row.rowHeight);
      return acc;
    }, [] as number[]);
    const remainingRowsHeight = (index: number) =>
      rowPrefix.length === 0
        ? 0
        : rowPrefix[rowPrefix.length - 1] - (index > 0 ? rowPrefix[index - 1] : 0);
    const tableRowsHeight = rowPrefix.length > 0 ? rowPrefix[rowPrefix.length - 1] : 0;
    const fitsSinglePage =
      yTable +
        tableRowsHeight +
        minTableToTotalsGap +
        totalsBlockHeight +
        minTotalsToFooterGap +
        footerBlockHeight <=
      pageBottom + paginationEpsilon;
    const forceSinglePage = true;
    const forceSinglePageForShortList =
      forceSinglePage || fitsSinglePage || (rowMeta.length <= 5 && noteHeight <= 140);
    const allowPagination = !forceSinglePage;

    let rowIndex = 0;
    while (rowIndex < rowMeta.length) {
      const remainingHeight = pageBottom - yTable;
      const remainingHeightNeeded = remainingRowsHeight(rowIndex);
      const enforcedAfterTotals = forceSinglePageForShortList
        ? totalsBlockHeight + footerBlockHeight + minTotalsToFooterGap + minTableToTotalsGap
        : requiredAfterTotals;
      const isFinalPage =
        forceSinglePageForShortList ||
        remainingHeightNeeded + enforcedAfterTotals <= remainingHeight + paginationEpsilon;
      const maxTableY = isFinalPage ? pageBottom - enforcedAfterTotals : pageBottom - 12;
      const startIndex = rowIndex;

      while (rowIndex < rowMeta.length && yTable + rowMeta[rowIndex].rowHeight <= maxTableY) {
        const { item, descText, rowHeight } = rowMeta[rowIndex];
        drawText(descText, left + 8, yTable + 6, 10, colors.text, {
          width: columnWidths[0] - 16,
        });
        drawText(String(item.quantity), left + columnWidths[0] + 8, yTable + 6, 10, colors.text, {
          width: columnWidths[1] - 16,
          align: "center",
          lineBreak: false,
        });
        drawText(
          formatMoney(item.price),
          left + columnWidths[0] + columnWidths[1] + 8,
          yTable + 6,
          10,
          colors.text,
          { width: columnWidths[2] - 16, align: "right", lineBreak: false }
        );
        drawText(
          formatMoney(item.price * item.quantity),
          left + columnWidths[0] + columnWidths[1] + columnWidths[2] + 8,
          yTable + 6,
          10,
          colors.text,
          { width: columnWidths[3] - 16, align: "right", lineBreak: false }
        );
        yTable += rowHeight;
        doc
          .moveTo(left, yTable)
          .lineTo(left + tableWidth, yTable)
          .strokeColor(colors.line)
          .lineWidth(0.8)
          .stroke();
        rowIndex += 1;
      }

      if (rowIndex < rowMeta.length) {
        if (rowIndex === startIndex) {
          const { item, descText, rowHeight } = rowMeta[rowIndex];
          drawText(descText, left + 8, yTable + 6, 10, colors.text, {
            width: columnWidths[0] - 16,
          });
          drawText(String(item.quantity), left + columnWidths[0] + 8, yTable + 6, 10, colors.text, {
            width: columnWidths[1] - 16,
            align: "center",
            lineBreak: false,
          });
          drawText(
            formatMoney(item.price),
            left + columnWidths[0] + columnWidths[1] + 8,
            yTable + 6,
            10,
            colors.text,
            { width: columnWidths[2] - 16, align: "right", lineBreak: false }
          );
          drawText(
            formatMoney(item.price * item.quantity),
            left + columnWidths[0] + columnWidths[1] + columnWidths[2] + 8,
            yTable + 6,
            10,
            colors.text,
            { width: columnWidths[3] - 16, align: "right", lineBreak: false }
          );
          yTable += rowHeight;
          doc
            .moveTo(left, yTable)
            .lineTo(left + tableWidth, yTable)
            .strokeColor(colors.line)
            .lineWidth(0.8)
            .stroke();
          rowIndex += 1;
          continue;
        }
        if (allowPagination) {
          doc.addPage();
          yTable = doc.page.margins.top;
          drawTableHeader(yTable);
          yTable += tableHeaderHeight;
        }
      }
    }

    // Totals aligned to the right, below the table.
    const remainingHeightAfterTable = pageBottom - yTable;
    const relaxedRequired =
      totalsBlockHeight + footerBlockHeight + totalsToFooterGap + tableToTotalsGap;
    const useCompactSpacing = remainingHeightAfterTable + paginationEpsilon < relaxedRequired;
    const activeTableToTotalsGap = useCompactSpacing ? minTableToTotalsGap : tableToTotalsGap;
    const activeTotalsToFooterGap = useCompactSpacing ? minTotalsToFooterGap : totalsToFooterGap;
    const reservedForTotals =
      forceSinglePageForShortList ||
      remainingHeightAfterTable + paginationEpsilon >= compactRequired;
    let yTotalsStart = yTable + activeTableToTotalsGap;
    if (forceSinglePageForShortList) {
      const packedStart =
        pageBottom - (footerBlockHeight + totalsBlockHeight + minTotalsToFooterGap);
      yTotalsStart = Math.min(yTotalsStart, packedStart);
    }
    let yTotals = yTotalsStart;
    if (
      allowPagination &&
      !forceSinglePageForShortList &&
      !reservedForTotals &&
      yTotalsStart + totalsBlockHeight + footerBlockHeight + activeTotalsToFooterGap >
        pageBottom + paginationEpsilon
    ) {
      doc.addPage();
      yTotals = doc.page.margins.top;
    }
    const totalsGap = 1;
    const totalsValueWidth = columnWidths[3] - 16;
    const totalsValueX =
      left + columnWidths[0] + columnWidths[1] + columnWidths[2] + 8;
    const totalsLabelWidth = Math.min(
      76,
      Math.max(70, totalsValueX - left - 12 - totalsGap)
    );
    const totalsLabelX = totalsValueX - totalsGap - totalsLabelWidth;
    // Totals always render on the same (final) page; table pagination reserves space above.
    const totalRow = (label: string, value: string, bold = false) => {
      if (bold) {
        drawBold(label, totalsLabelX, yTotals, 11, {
          width: totalsLabelWidth,
          align: "left",
          lineBreak: false,
        });
        drawBold(value, totalsValueX, yTotals, 12, {
          width: totalsValueWidth,
          align: "right",
          lineBreak: false,
          ellipsis: true,
        });
      } else {
        drawLabel(label, totalsLabelX, yTotals, 10, colors.muted, {
          width: totalsLabelWidth,
          align: "left",
          lineBreak: false,
        });
        doc.font("Inter").fontSize(10).fillColor(colors.text).text(
          value,
          totalsValueX,
          yTotals,
          {
            width: totalsValueWidth,
            align: "right",
            lineBreak: false,
            ellipsis: true,
          }
        );
      }
      yTotals += 16;
    };
    totalRow("Subtotal", formatMoney(input.totals.subtotal));
    if (showTax) {
      totalRow(
        `VAT (${taxRate ? taxRate.toFixed(1).replace(/\\.0$/, "") : "0"}%)`,
        formatMoney(input.totals.taxAmount)
      );
    }
    totalRow("Total Due", formatMoney(input.totals.total), true);

    let footerStart = yTotals + activeTotalsToFooterGap;
    if (forceSinglePageForShortList) {
      footerStart = Math.min(footerStart, pageBottom - footerBlockHeight);
    }
    const footerOverflows = footerStart + footerBlockHeight > pageBottom + paginationEpsilon;
    if (allowPagination && footerOverflows && !reservedForTotals && !forceSinglePageForShortList) {
      doc.addPage();
      footerStart = doc.page.margins.top;
    }
    y = footerStart;
    let footerCursorY = footerStart;
    if (noteText) {
      drawBold("Note", left + 14, footerCursorY, 10);
      footerCursorY += 14;
      drawText(noteText, left + 14, footerCursorY, 9.5, colors.muted, { width: pageWidth - 28 });
      footerCursorY += noteHeight + 8;
    }
    const logoRowY = footerCursorY + footerSeparation;
    drawLabel(footerNoteText, left + 14, logoRowY + 10, 10, colors.muted, {
      width: pageWidth - 28,
      align: "center",
    });
    if (hasCardLogos) {
      const cardRowY = logoRowY + 32;
      const gap = 10;
      const logosWidth =
        (visaLogo ? visaBox.w : 0) +
        (mastercardLogo ? masterBox.w : 0) +
        (verveLogo ? verveBox.w : 0) +
        gap * ([visaLogo, mastercardLogo, verveLogo].filter(Boolean).length - 1);
      const cardBoxWidth = logosWidth + cardBoxPaddingX * 2;
      const cardBoxHeight = Math.max(visaBox.h, masterBox.h, verveBox.h) + cardBoxPaddingY * 2;
      const cardBoxX = left + (pageWidth - cardBoxWidth) / 2;
      doc
        .roundedRect(cardBoxX, cardRowY - cardBoxPaddingY, cardBoxWidth, cardBoxHeight, 6)
        .strokeColor(colors.line)
        .lineWidth(1)
        .stroke();
      let logoX = cardBoxX + cardBoxPaddingX;
      if (visaLogo) {
        doc.image(visaLogo, logoX, cardRowY - 2, { fit: [visaBox.w, visaBox.h] });
        logoX += visaBox.w + gap;
      }
      if (mastercardLogo) {
        doc.image(mastercardLogo, logoX, cardRowY + 1, { fit: [masterBox.w, masterBox.h] });
        logoX += masterBox.w + gap;
      }
      if (verveLogo) {
        doc.image(verveLogo, logoX, cardRowY + 1, { fit: [verveBox.w, verveBox.h] });
      }
    }
    // Payment links are delivered via email, not printed on the PDF.

    // Note is rendered in the footer block.

    const footerY = doc.page.height - doc.page.margins.bottom - 10;
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
