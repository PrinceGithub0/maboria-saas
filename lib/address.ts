export type BusinessAddressFields = {
  streetAddress: string;
  city: string;
  region: string;
  postalCode: string;
};

const normalize = (value: string) => value.trim();

export function parseBusinessAddress(value: string | null | undefined): BusinessAddressFields {
  const raw = String(value || "").trim();
  if (!raw) {
    return { streetAddress: "", city: "", region: "", postalCode: "" };
  }
  let parts: string[] = [];
  if (raw.includes("\n")) {
    parts = raw.split("\n");
  } else if (raw.includes("|")) {
    parts = raw.split("|");
  } else if (raw.includes(",")) {
    parts = raw.split(",");
  } else {
    parts = [raw];
  }
  const normalized = parts.map(normalize);
  let streetAddress = normalized[0] || "";
  let city = normalized[1] || "";
  let region = normalized[2] || "";
  let postalCode = normalized[3] || "";
  if (normalized.length === 3) {
    region = "";
    postalCode = normalized[2] || "";
  }
  return {
    streetAddress,
    city,
    region,
    postalCode,
  };
}

export function formatBusinessAddress(fields: BusinessAddressFields) {
  const lines = [
    normalize(fields.streetAddress || ""),
    normalize(fields.city || ""),
    normalize(fields.postalCode || ""),
  ].filter(Boolean);
  return lines.join("\n");
}

export function hasRequiredAddress(fields: BusinessAddressFields) {
  return Boolean(fields.streetAddress.trim() && fields.city.trim());
}
