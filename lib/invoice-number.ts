const normalizeInvoiceCodeSource = (value?: string | null) =>
  String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");

const shortHash = (value: string) => {
  let hash = 7;
  for (const char of value) {
    hash = (hash * 31 + char.charCodeAt(0)) % 1296;
  }
  return hash.toString(36).toUpperCase().padStart(2, "0");
};

export const buildInvoiceIssuerCode = (seed?: string | null, fallback?: string | null) => {
  const primary = normalizeInvoiceCodeSource(seed);
  const secondary = normalizeInvoiceCodeSource(fallback);
  const readable = `${primary}${secondary}`.slice(0, 2).padEnd(2, "X");
  const hash = shortHash(`${primary}:${secondary || fallback || seed || "INV"}`);
  return `${readable}${hash}`.slice(0, 4);
};

export const formatSequentialInvoiceNumber = (
  year: number,
  sequence: number,
  issuerCode = "MB00"
) => `${issuerCode}-${String(year).slice(-2)}-${String(Math.max(1, sequence)).padStart(4, "0")}`;

export const getInvoiceNumberYear = (date?: Date | null) => {
  const candidate = date instanceof Date && !Number.isNaN(date.getTime()) ? date : new Date();
  return candidate.getUTCFullYear();
};

export const buildInvoiceNumberDraft = (date?: Date | null, issuerCode?: string | null) =>
  formatSequentialInvoiceNumber(getInvoiceNumberYear(date), 1, issuerCode || "MB00");

export const isInvoiceNumberDraft = (value?: string | null) =>
  /^[A-Z0-9]{4}-\d{2}-0001$/i.test(String(value || "").trim());

export const isLegacyAutoInvoiceNumber = (value?: string | null) =>
  /^INV-\d{13}(?:-[A-Z0-9]+)?$/i.test(String(value || "").trim());

export const isPreviousGeneratedInvoiceNumber = (value?: string | null) =>
  /^INV-[A-Z0-9]{4,5}-\d{2}-\d{4}$/i.test(String(value || "").trim());

export const shouldAutoGenerateInvoiceNumber = (value?: string | null) => {
  const trimmed = String(value || "").trim();
  return (
    !trimmed ||
    isInvoiceNumberDraft(trimmed) ||
    isLegacyAutoInvoiceNumber(trimmed) ||
    isPreviousGeneratedInvoiceNumber(trimmed)
  );
};

export const getInvoiceNumberAliases = (metadata: unknown) => {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return [] as string[];
  const raw = (metadata as Record<string, unknown>).invoiceNumberAliases;
  if (!Array.isArray(raw)) return [] as string[];
  return raw
    .map((value) => String(value || "").trim())
    .filter(Boolean);
};

export const appendInvoiceNumberAlias = (metadata: unknown, invoiceNumber: string) => {
  const normalized = String(invoiceNumber || "").trim();
  if (!normalized) {
    return metadata && typeof metadata === "object" && !Array.isArray(metadata) ? metadata : {};
  }
  const base =
    metadata && typeof metadata === "object" && !Array.isArray(metadata)
      ? { ...(metadata as Record<string, unknown>) }
      : {};
  const aliases = Array.from(new Set([...getInvoiceNumberAliases(base), normalized]));
  return {
    ...base,
    legacyInvoiceNumber: base.legacyInvoiceNumber || normalized,
    invoiceNumberAliases: aliases,
  };
};

export const suggestNextInvoiceNumber = (
  existingValues: Array<string | null | undefined>,
  date?: Date | null,
  issuerCode?: string | null
) => {
  const year = getInvoiceNumberYear(date);
  const resolvedIssuerCode = issuerCode || "MB00";
  const prefix = `${resolvedIssuerCode}-${String(year).slice(-2)}-`;
  let maxSequence = 0;

  existingValues.forEach((value) => {
    const trimmed = String(value || "").trim().toUpperCase();
    if (!trimmed.startsWith(prefix)) return;
    const sequence = Number(trimmed.slice(prefix.length));
    if (Number.isInteger(sequence) && sequence > maxSequence) {
      maxSequence = sequence;
    }
  });

  return formatSequentialInvoiceNumber(year, maxSequence + 1, resolvedIssuerCode);
};
